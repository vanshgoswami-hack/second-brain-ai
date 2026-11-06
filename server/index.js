import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { PDFParse } from 'pdf-parse';
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Load environment variables from ROOT .env, fallback to server/.env if needed
dotenv.config({ path: path.join(ROOT, '.env') });
dotenv.config({ path: path.join(__dirname, '.env') });

const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'notes.json');

const app = express();

// Secure CORS configuration
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json({ limit: '2mb' }));

// In-memory rate limiting for AI queries (max 20 requests per minute per IP)
const askRateLimitMap = new Map();
function checkAskRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 20;
  const entry = askRateLimitMap.get(ip) || [];
  const validTimestamps = entry.filter(t => now - t < windowMs);
  if (validTimestamps.length >= maxRequests) return false;
  validTimestamps.push(now);
  askRateLimitMap.set(ip, validTimestamps);
  return true;
}

// Multer storage with sanitized filenames
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${randomUUID()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.pdf', '.txt'].includes(ext)) return cb(null, true);
    cb(new Error('Unsupported file type. Please upload a valid PDF or TXT file.'));
  }
});

async function ensureData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  try {
    await fs.access(DB_FILE);
  } catch {
    await fs.writeFile(DB_FILE, '[]', 'utf8');
  }
}

async function readNotes() {
  await ensureData();
  const raw = await fs.readFile(DB_FILE, 'utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function saveNotes(notes) {
  await ensureData();
  await fs.writeFile(DB_FILE, JSON.stringify(notes, null, 2), 'utf8');
}

async function extractPdfText(filePath) {
  const fileBuffer = await fs.readFile(filePath);
  const parser = new PDFParse({ data: fileBuffer });
  try {
    const parsed = await parser.getText();
    return parsed.text || '';
  } catch (error) {
    throw new Error(`PDF_PARSE_ERROR: ${error.message}`);
  } finally {
    await parser.destroy().catch(() => {});
  }
}

function publicNote(note) {
  const { content, storedFilename, ...safe } = note;
  return {
    ...safe,
    preview: content ? content.slice(0, 220) : ''
  };
}

// 1. Health check & configuration status
app.get('/api/health', async (_req, res) => {
  const notes = await readNotes();
  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  res.json({
    ok: true,
    aiConfigured: Boolean(process.env.GEMINI_API_KEY),
    model,
    notesCount: notes.length
  });
});

// 2. Get all notes (sorted newest first)
app.get('/api/notes', async (_req, res, next) => {
  try {
    const notes = await readNotes();
    const sorted = notes
      .map(publicNote)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json(sorted);
  } catch (e) {
    next(e);
  }
});

// 3. Get single note detail (including full content for in-app reader)
app.get('/api/notes/:id', async (req, res, next) => {
  try {
    const notes = await readNotes();
    const note = notes.find(n => n.id === req.params.id);
    if (!note) return res.status(404).json({ error: 'Study material not found.' });
    const { storedFilename, ...safe } = note;
    res.json(safe);
  } catch (e) {
    next(e);
  }
});

// 4. Search notes with intelligent keyword scoring
app.get('/api/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    if (!q) return res.json([]);
    const words = q.split(/\s+/).filter(Boolean);
    const notes = await readNotes();
    const results = notes.map(n => {
      const title = (n.title || '').toLowerCase();
      const desc = (n.description || '').toLowerCase();
      const content = (n.content || '').toLowerCase();
      const score = words.reduce((sum, word) => {
        return sum +
          (title.includes(word) ? 6 : 0) +
          (desc.includes(word) ? 3 : 0) +
          (content.includes(word) ? 1 : 0);
      }, 0);
      return { ...publicNote(n), score };
    }).filter(n => n.score > 0).sort((a, b) => b.score - a.score);
    res.json(results);
  } catch (e) {
    next(e);
  }
});

// 5. Upload note (PDF or TXT)
app.post('/api/notes', upload.single('file'), async (req, res, next) => {
  const uploadedPath = req.file?.path;
  try {
    if (!req.file) return res.status(400).json({ error: 'Please choose a PDF or TXT file to upload.' });
    const title = String(req.body.title || '').trim();
    if (!title) {
      if (uploadedPath) await fs.unlink(uploadedPath).catch(() => {});
      return res.status(400).json({ error: 'Please provide a title for your study material.' });
    }

    let content = '';
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (ext === '.txt') {
      content = await fs.readFile(req.file.path, 'utf8');
    } else {
      content = await extractPdfText(req.file.path);
    }

    content = content.replace(/\s+/g, ' ').trim();
    if (!content) {
      if (uploadedPath) await fs.unlink(uploadedPath).catch(() => {});
      return res.status(422).json({
        error: 'We could not find readable text in this file. Scanned/image-only PDFs are not supported yet.'
      });
    }

    if (content.length > 300000) {
      content = content.slice(0, 300000);
    }

    const note = {
      id: randomUUID(),
      title,
      description: String(req.body.description || '').trim(),
      filename: req.file.originalname,
      storedFilename: path.basename(req.file.path),
      fileType: ext.slice(1).toUpperCase(),
      size: req.file.size,
      content,
      createdAt: new Date().toISOString()
    };

    const notes = await readNotes();
    notes.push(note);
    await saveNotes(notes);

    res.status(201).json(publicNote(note));
  } catch (e) {
    if (uploadedPath) await fs.unlink(uploadedPath).catch(() => {});
    if (e.message?.includes('PDF_PARSE_ERROR') || e.message?.includes('Invalid PDF') || e.message?.includes('Failed to parse')) {
      return res.status(422).json({ error: 'This PDF could not be processed. Please check if it is password-protected or try a TXT file.' });
    }
    next(e);
  }
});

// 6. Delete note
app.delete('/api/notes/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const notes = await readNotes();
    const target = notes.find(n => n.id === id);
    if (!target) return res.status(404).json({ error: 'Study material not found.' });

    await saveNotes(notes.filter(n => n.id !== id));

    if (target.storedFilename) {
      const safeFilename = path.basename(target.storedFilename);
      const filePath = path.join(UPLOAD_DIR, safeFilename);
      if (filePath.startsWith(UPLOAD_DIR)) {
        await fs.unlink(filePath).catch(() => {});
      }
    }

    res.json({ ok: true, id });
  } catch (e) {
    next(e);
  }
});

// 7. Ask AI Study Assistant
app.post('/api/ask', async (req, res, next) => {
  try {
    const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';
    if (!checkAskRateLimit(clientIp)) {
      return res.status(429).json({ error: 'Too many requests. Please wait a moment before asking another question.' });
    }

    const question = String(req.body.question || '').trim();
    if (!question) return res.status(400).json({ error: 'Please enter a question.' });

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: 'Gemini is not configured yet. Add GEMINI_API_KEY to your .env file, then restart the server.'
      });
    }

    const notes = await readNotes();
    if (!notes.length) {
      return res.status(400).json({ error: 'Upload some notes first so your study assistant has material to reference.' });
    }

    const selected = req.body.noteIds?.length
      ? notes.filter(n => req.body.noteIds.includes(n.id))
      : notes;

    if (!selected.length) {
      return res.status(400).json({ error: 'No matching notes found for reference. Please select your notes.' });
    }

    // Build context with source headers
    const context = selected
      .map(n => `SOURCE NOTE: "${n.title}"\n${n.content.slice(0, 18000)}`)
      .join('\n\n---\n\n')
      .slice(0, 70000);

    const prompt = `SOURCE STUDY NOTES:\n${context}\n\nSTUDENT QUESTION:\n${question}`;
    const primaryModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
    const candidateModels = [
      primaryModel,
      'gemini-3.5-flash',
      'gemini-3.1-flash-lite',
      'gemini-3.5-flash-lite',
      'gemini-3.8-flash'
    ].filter((m, i, arr) => arr.indexOf(m) === i);

    let answer = '';
    let lastError = null;

    for (const model of candidateModels) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': process.env.GEMINI_API_KEY
            },
            body: JSON.stringify({
              systemInstruction: {
                parts: [{
                  text: 'You are Second Brain AI, an intelligent, encouraging academic study assistant. Answer the student question using ONLY facts and concepts present in the supplied source study notes. Format your response cleanly with clear markdown sections, bullet points, or bold highlights to aid study retention. If the source notes do not contain the answer, politely say: "I couldn\'t find that in your uploaded notes." Never hallucinate or invent outside facts. Cite the relevant note titles at the end.'
                }]
              },
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 2048
              }
            })
          }
        );

        const data = await response.json();
        if (response.ok) {
          answer = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
          if (answer) break;
        } else {
          lastError = data.error?.message || `Model ${model} returned error status ${response.status}`;
          if (response.status === 503 || response.status === 429 || response.status === 404) {
            continue;
          } else {
            break;
          }
        }
      } catch (err) {
        lastError = err.message;
      }
    }

    if (!answer) {
      return res.status(502).json({
        error: `Gemini assistant error: ${lastError || 'Empty response. Please try asking in a different way.'}`
      });
    }

    res.json({
      answer,
      sources: selected.map(n => n.title)
    });
  } catch (e) {
    next(e);
  }
});

// 8. Demo shared resources
app.get('/api/resources', (_req, res) => {
  res.json([
    {
      id: 'demo-1',
      title: 'Data Structures & Algorithms — Quick Revision',
      subject: 'Computer Science',
      kind: 'Cheat sheet',
      author: 'Second Brain team',
      color: 'violet',
      description: 'A compact refresher for arrays, trees, graphs, sorting, and Big-O complexity.',
      demo: true
    },
    {
      id: 'demo-2',
      title: 'Organic Chemistry: Reaction Mechanisms',
      subject: 'Chemistry',
      kind: 'Study guide',
      author: 'Second Brain team',
      color: 'mint',
      description: 'Key reaction patterns and memory cues for your next revision session.',
      demo: true
    },
    {
      id: 'demo-3',
      title: 'Linear Algebra — Matrix Essentials',
      subject: 'Mathematics',
      kind: 'Lecture notes',
      author: 'Second Brain team',
      color: 'amber',
      description: 'A friendly overview of matrices, determinants, eigenvalues, and transformations.',
      demo: true
    },
    {
      id: 'demo-4',
      title: 'Operating Systems: Exam Prep Pack',
      subject: 'Computer Science',
      kind: 'Exam prep',
      author: 'Second Brain team',
      color: 'rose',
      description: 'Process scheduling, memory management, and file systems in one focused revision pack.',
      demo: true
    }
  ]);
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('[SERVER ERROR]', err);
  const status = err instanceof multer.MulterError || err.message?.startsWith('Unsupported file type') ? 400 : 500;
  res.status(status).json({
    error: err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
      ? 'File is too large. The maximum allowed size is 15 MB.'
      : err.message || 'Something went wrong on the server. Please try again.'
  });
});

const PORT = Number(process.env.PORT) || 3001;
ensureData().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SECOND BRAIN AI API ready at http://localhost:${PORT}`);
  });
});
