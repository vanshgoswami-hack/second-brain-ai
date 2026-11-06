import React, { useEffect, useRef, useState, Component } from 'react';
import {
  Brain, LayoutDashboard, BookOpen, MessageSquareText, UsersRound, Search, Bell, Plus,
  ArrowUpRight, FileText, File, MoreHorizontal, Clock3, Sparkles, Upload, X, LoaderCircle,
  ChevronRight, Send, BookMarked, Trash2, Menu, CheckCircle2, AlertCircle, Command,
  LibraryBig, GraduationCap, Lightbulb, Paperclip, Sun, Moon, Settings, Eye, Copy, Check,
  Sliders, ShieldCheck, User, School, BookCheck
} from 'lucide-react';

const API = '/api';

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'library', label: 'My library', icon: BookOpen },
  { id: 'assistant', label: 'AI assistant', icon: MessageSquareText },
  { id: 'sharing', label: 'Shared resources', icon: UsersRound },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const dateLabel = (value) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const formatSize = (bytes = 0) => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

async function getJson(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

// React Error Boundary
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="empty-state" style={{ margin: '40px auto', maxWidth: '600px' }}>
          <span className="empty-icon"><AlertCircle size={24} /></span>
          <h3>Something unexpected happened</h3>
          <p>{this.state.error?.message || 'Please refresh the page to reload your workspace.'}</p>
          <button className="button-primary" onClick={() => window.location.reload()}>
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function Brand({ small = false }) {
  return (
    <div className={`brand ${small ? 'brand-small' : ''}`}>
      <span className="brand-icon"><Brain size={19} strokeWidth={2.3} /></span>
      <span>SECOND BRAIN<span className="brand-ai"> AI</span></span>
    </div>
  );
}

function Badge({ children, tone = 'violet' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function EmptyState({ icon: Icon = BookOpen, title, text, action }) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon size={24} /></span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}

// Simple Markdown / Formatted Text Renderer
function FormattedAnswer({ text }) {
  if (!text) return null;
  const lines = text.split('\n');
  return (
    <div className="message-content">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('### ')) {
          return <h4 key={idx} style={{ margin: '10px 0 4px', fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>{trimmed.slice(4)}</h4>;
        }
        if (trimmed.startsWith('## ')) {
          return <h3 key={idx} style={{ margin: '12px 0 6px', fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>{trimmed.slice(3)}</h3>;
        }
        if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
          const content = trimmed.slice(2);
          return (
            <div key={idx} style={{ display: 'flex', gap: '8px', margin: '3px 0', paddingLeft: '4px' }}>
              <span style={{ color: 'var(--brand-primary)' }}>•</span>
              <span>{renderBold(content)}</span>
            </div>
          );
        }
        if (trimmed === '***' || trimmed === '---') {
          return <hr key={idx} style={{ border: 0, borderTop: '1px solid var(--border-subtle)', margin: '10px 0' }} />;
        }
        if (!trimmed) {
          return <div key={idx} style={{ height: '6px' }} />;
        }
        return <p key={idx} style={{ margin: '4px 0' }}>{renderBold(line)}</p>;
      })}
    </div>
  );
}

function renderBold(str) {
  const parts = str.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [notes, setNotes] = useState([]);
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState(null);
  const [noteToDelete, setNoteToDelete] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [modelName, setModelName] = useState('gemini-3.5-flash');
  const searchInputRef = useRef(null);

  // Theme Management with localStorage
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('secondbrain_theme');
    if (saved) return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('secondbrain_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Student Profile from localStorage
  const [profile, setProfile] = useState(() => {
    try {
      const saved = localStorage.getItem('secondbrain_profile');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      name: 'Vansh',
      university: 'Tech University',
      major: 'Computer Science',
      year: 'Year 2, Semester 4'
    };
  });

  const saveProfile = (newProfile) => {
    setProfile(newProfile);
    localStorage.setItem('secondbrain_profile', JSON.stringify(newProfile));
    showToast('Profile updated successfully.');
  };

  const refreshNotes = async () => {
    const items = await getJson(`${API}/notes`);
    setNotes(items);
  };

  useEffect(() => {
    Promise.all([
      getJson(`${API}/notes`),
      getJson(`${API}/resources`),
      getJson(`${API}/health`)
    ]).then(([n, r, h]) => {
      setNotes(n);
      setResources(r);
      setAiConfigured(Boolean(h.aiConfigured));
      if (h.model) setModelName(h.model);
    }).catch(e => {
      showToast(e.message, 'error');
    }).finally(() => setLoading(false));
  }, []);

  // Global ⌘K / Ctrl+K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPage('library');
        setTimeout(() => {
          searchInputRef.current?.focus();
        }, 80);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Toast Auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  function showToast(message, type = 'success') {
    setToast({ message, type });
  }

  async function runSearch(value = query) {
    setQuery(value);
    if (!value.trim()) {
      setResults(null);
      return;
    }
    setPage('library');
    setSearchLoading(true);
    try {
      setResults(await getJson(`${API}/search?q=${encodeURIComponent(value)}`));
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSearchLoading(false);
    }
  }

  const onUploaded = async () => {
    await refreshNotes();
    setResults(null);
    showToast('Study material successfully added to your library.');
  };

  const confirmDeleteNote = async () => {
    if (!noteToDelete) return;
    try {
      await getJson(`${API}/notes/${noteToDelete.id}`, { method: 'DELETE' });
      await refreshNotes();
      if (results) runSearch();
      showToast('Study material removed from library.');
      if (selectedNote?.id === noteToDelete.id) {
        setSelectedNote(null);
      }
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setNoteToDelete(null);
    }
  };

  const goTo = (id) => {
    setPage(id);
    setMenuOpen(false);
    if (id !== 'library') {
      setQuery('');
      setResults(null);
    }
  };

  const viewNoteDetail = async (note) => {
    try {
      const fullNote = await getJson(`${API}/notes/${note.id}`);
      setSelectedNote(fullNote);
    } catch {
      setSelectedNote(note);
    }
  };

  const askAboutNote = (note) => {
    setSelectedNote(null);
    setPage('assistant');
  };

  const avatarInitial = (profile.name || 'S').charAt(0).toUpperCase();

  return (
    <ErrorBoundary>
      <div className="app-shell">
        <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
          <div className="side-top">
            <Brand />
            <button className="mobile-close icon-button" onClick={() => setMenuOpen(false)} aria-label="Close menu">
              <X size={18} />
            </button>
          </div>

          <div className="workspace-label">WORKSPACE</div>
          <nav className="main-nav">
            {navItems.map(item => (
              <button
                key={item.id}
                className={`nav-link ${page === item.id ? 'active' : ''}`}
                onClick={() => goTo(item.id)}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
                {item.id === 'library' && notes.length > 0 && <span className="nav-count">{notes.length}</span>}
              </button>
            ))}
          </nav>

          <div className="side-divider" />
          <div className="side-collection-label">
            <span>YOUR SPACE</span>
            <button className="side-add" onClick={() => setUploadOpen(true)} title="Add study material">
              <Plus size={16} />
            </button>
          </div>

          <div className="side-tip">
            <span className="tip-icon"><Lightbulb size={16} /></span>
            <div>
              <b>Study Smart</b>
              <p>Upload lecture PDFs or notes to ask Gemini AI questions grounded strictly in your syllabus.</p>
            </div>
          </div>

          <div className="sidebar-bottom">
            <div className="profile-avatar" onClick={() => goTo('settings')}>{avatarInitial}</div>
            <div className="profile-copy" onClick={() => goTo('settings')}>
              <b>{profile.name}</b>
              <span>{profile.major}</span>
            </div>
            <button className="icon-button profile-more" onClick={() => goTo('settings')} title="Settings">
              <Settings size={18} />
            </button>
          </div>
        </aside>

        {menuOpen && <button className="mobile-backdrop" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />}

        <main className="main-area">
          <header className="topbar">
            <button className="mobile-menu icon-button" onClick={() => setMenuOpen(true)} aria-label="Open menu">
              <Menu size={20} />
            </button>
            <div className="breadcrumb">
              <span>Workspace</span>
              <ChevronRight size={14} />
              <b>{navItems.find(x => x.id === page)?.label || 'Overview'}</b>
            </div>

            <div className="top-actions">
              <button
                className="theme-toggle-btn"
                onClick={toggleTheme}
                title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
              >
                {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
              </button>

              <button className="top-ai-pill" onClick={() => goTo('assistant')}>
                <span className={`status-dot ${aiConfigured ? 'online' : ''}`} />
                {aiConfigured ? 'AI ready' : 'AI setup needed'}
              </button>

              <button className="icon-button notif-button" aria-label="Notifications" onClick={() => showToast('You’re all caught up with your notes!')}>
                <Bell size={18} />
                <i />
              </button>

              <span className="top-avatar" onClick={() => goTo('settings')}>{avatarInitial}</span>
            </div>
          </header>

          <div className="content-wrap">
            {page === 'dashboard' && (
              <Dashboard
                notes={notes}
                loading={loading}
                query={query}
                setQuery={setQuery}
                runSearch={runSearch}
                onUpload={() => setUploadOpen(true)}
                goTo={goTo}
                onViewNote={viewNoteDetail}
                onDeleteNote={n => setNoteToDelete(n)}
              />
            )}
            {page === 'library' && (
              <Library
                notes={notes}
                loading={loading}
                query={query}
                setQuery={setQuery}
                runSearch={runSearch}
                results={results}
                searchLoading={searchLoading}
                onUpload={() => setUploadOpen(true)}
                onDeleteNote={n => setNoteToDelete(n)}
                onViewNote={viewNoteDetail}
                clearSearch={() => { setQuery(''); setResults(null); }}
                searchInputRef={searchInputRef}
              />
            )}
            {page === 'assistant' && (
              <Assistant
                notes={notes}
                aiConfigured={aiConfigured}
                modelName={modelName}
                onSetupRefresh={() => getJson(`${API}/health`).then(x => setAiConfigured(Boolean(x.aiConfigured)))}
                onUploadPrompt={() => setUploadOpen(true)}
              />
            )}
            {page === 'sharing' && <Sharing resources={resources} showToast={showToast} />}
            {page === 'settings' && (
              <SettingsPage
                theme={theme}
                setTheme={setTheme}
                profile={profile}
                saveProfile={saveProfile}
                aiConfigured={aiConfigured}
                modelName={modelName}
                notesCount={notes.length}
              />
            )}
          </div>

          <footer className="footer">
            <span>Built with precision for students & curious minds <span className="heart">♥</span></span>
            <span>SECOND BRAIN AI <i /> Powered by Google Gemini</span>
          </footer>
        </main>

        {/* Upload Modal */}
        {uploadOpen && <UploadModal onClose={() => setUploadOpen(false)} onUploaded={onUploaded} />}

        {/* Note Detail Reader Modal */}
        {selectedNote && (
          <NoteDetailModal
            note={selectedNote}
            onClose={() => setSelectedNote(null)}
            onAskAi={() => askAboutNote(selectedNote)}
            onDelete={() => {
              setNoteToDelete(selectedNote);
            }}
            showToast={showToast}
          />
        )}

        {/* Custom Delete Confirmation Modal */}
        {noteToDelete && (
          <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setNoteToDelete(null)}>
            <div className="confirm-modal" role="dialog" aria-modal="true">
              <div className="modal-head">
                <div>
                  <span className="modal-kicker" style={{ color: '#ef4444' }}>CONFIRM REMOVAL</span>
                  <h2>Delete study material?</h2>
                  <p>Are you sure you want to remove "<b>{noteToDelete.title}</b>" from your library?</p>
                </div>
                <button className="icon-button" onClick={() => setNoteToDelete(null)} aria-label="Close">
                  <X size={19} />
                </button>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '10px 0 20px', lineHeight: '1.5' }}>
                This action cannot be undone. Extracted text and indexed knowledge will be removed from your Second Brain search and AI assistant.
              </p>
              <div className="modal-actions">
                <button type="button" className="button-secondary" onClick={() => setNoteToDelete(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="button-primary"
                  style={{ background: '#ef4444', borderColor: '#ef4444' }}
                  onClick={confirmDeleteNote}
                >
                  <Trash2 size={15} /> Yes, Delete Material
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast Notifications */}
        {toast && (
          <div className={`toast ${toast.type}`}>
            <span>{toast.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}</span>
            {toast.message}
            <button onClick={() => setToast(null)} aria-label="Dismiss">
              <X size={15} />
            </button>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

function Dashboard({ notes, loading, query, setQuery, runSearch, onUpload, goTo, onViewNote, onDeleteNote }) {
  const [focus, setFocus] = useState(false);
  return (
    <>
      <section className="welcome-row">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-spark"><Sparkles size={13} /></span> YOUR CAMPUS KNOWLEDGE, ORGANIZED
          </div>
          <h1>Welcome to your <span>Second Brain</span></h1>
          <p className="welcome-sub">A structured, AI-powered knowledge repository for everything you learn.</p>
        </div>
        <button className="button-primary" onClick={onUpload}>
          <Plus size={17} /> Add study material
        </button>
      </section>

      <section className="hero-card">
        <div className="hero-copy">
          <span className="hero-overline">
            <Sparkles size={14} /> YOUR COLLEGE KNOWLEDGE, ONE SMART SEARCH AWAY.
          </span>
          <h2>Make your notes<br />work <em>smarter.</em></h2>
          <p>Search across your study documents or ask your assistant questions grounded directly in your uploaded materials.</p>
          <button className="hero-link" onClick={() => goTo('assistant')}>
            Meet your AI study assistant <ArrowUpRight size={16} />
          </button>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="hero-paper paper-back"><span /><span /><span /></div>
          <div className="hero-paper paper-mid"><BookOpen size={20} /><span /><span /><span /></div>
          <div className="hero-brain">
            <Brain size={48} strokeWidth={1.55} />
            <Sparkles className="brain-spark" size={17} />
          </div>
          <div className="float-tag"><Search size={13} /> Find anything</div>
          <div className="float-dot dot-a" />
          <div className="float-dot dot-b" />
        </div>
        <div className="hero-glow" />
      </section>

      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-icon purple"><BookMarked size={18} /></span>
            <span className="stat-caption">YOUR LIBRARY</span>
          </div>
          <div className="stat-value">{loading ? <span className="skeleton-number" /> : notes.length}</div>
          <div className="stat-foot">Study materials saved <span className="stat-foot-mark">↗</span></div>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-icon blue"><Search size={18} /></span>
            <span className="stat-caption">SEARCHABLE</span>
          </div>
          <div className="stat-value">{loading ? <span className="skeleton-number" /> : (notes.length ? 'Indexed' : '0')}</div>
          <div className="stat-foot">Every word instantly searchable</div>
        </div>

        <div className="stat-card stat-ai">
          <div className="stat-top">
            <span className="stat-icon mint"><Sparkles size={18} /></span>
            <span className="stat-caption">AI POWERED</span>
          </div>
          <div className="stat-value stat-word">Gemini <span>Study Bot</span></div>
          <div className="stat-foot">Zero hallucinations · Grounded answers</div>
        </div>
      </section>

      <section className="search-panel">
        <div className="search-heading">
          <div>
            <h2>Find it in your brain</h2>
            <p>Search your uploaded notes by title, keywords, or extracted text content.</p>
          </div>
          <span className="keyboard-shortcut"><Command size={12} /> K</span>
        </div>
        <form
          className={`big-search ${focus ? 'search-focus' : ''}`}
          onSubmit={e => { e.preventDefault(); runSearch(); }}
        >
          <Search size={19} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            placeholder="Try searching “photosynthesis”, “algorithm”, or “lecture 4”…"
          />
          <button type="submit">Search notes <ArrowUpRight size={15} /></button>
        </form>
      </section>

      <section className="recent-section">
        <div className="section-heading">
          <div>
            <h2>Recently added</h2>
            <p>Pick up right where you left off.</p>
          </div>
          <button className="text-link" onClick={() => goTo('library')}>
            View all ({notes.length}) <ArrowUpRight size={15} />
          </button>
        </div>

        {loading ? (
          <div className="notes-grid">
            {[1, 2, 3].map(n => <div className="note-skeleton" key={n} />)}
          </div>
        ) : notes.length ? (
          <div className="notes-grid">
            {notes.slice(0, 3).map(note => (
              <NoteCard
                key={note.id}
                note={note}
                onClick={() => onViewNote(note)}
                onDelete={() => onDeleteNote(note)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={FileText}
            title="Your knowledge base is ready"
            text="Upload class notes, lecture PDFs, or exam study guides to begin."
            action={
              <button className="button-primary button-small" onClick={onUpload}>
                <Upload size={15} /> Upload your first note
              </button>
            }
          />
        )}
      </section>
    </>
  );
}

function NoteCard({ note, onClick, onDelete }) {
  return (
    <article
      className={`note-card ${onClick ? 'clickable' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={e => e.key === 'Enter' && onClick?.()}
    >
      <div className="note-card-top">
        <span className={`file-icon ${note.fileType === 'PDF' ? 'pdf' : 'txt'}`}>
          {note.fileType === 'PDF' ? <FileText size={20} /> : <File size={20} />}
        </span>
        <div className="note-card-actions">
          {onClick && (
            <button
              className="icon-button"
              onClick={e => { e.stopPropagation(); onClick(); }}
              title="Read note"
            >
              <Eye size={16} />
            </button>
          )}
          {onDelete && (
            <button
              className="icon-button delete-button"
              onClick={e => { e.stopPropagation(); onDelete(); }}
              title="Delete note"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
      <h3>{note.title}</h3>
      <p className="note-desc">{note.description || note.preview || 'No description provided.'}</p>
      <div className="note-card-foot">
        <span><Clock3 size={13} /> {dateLabel(note.createdAt)}</span>
        <span>{note.fileType || 'DOC'} <i /> {formatSize(note.size)}</span>
      </div>
    </article>
  );
}

function Library({
  notes, loading, query, setQuery, runSearch, results, searchLoading,
  onUpload, onDeleteNote, onViewNote, clearSearch, searchInputRef
}) {
  const shown = results !== null ? results : notes;
  return (
    <div className="page-content">
      <div className="page-title-row">
        <div>
          <div className="eyebrow">YOUR PERSONAL KNOWLEDGE BASE</div>
          <h1>My library</h1>
          <p>All your course readings and study materials indexed in one place.</p>
        </div>
        <button className="button-primary" onClick={onUpload}>
          <Plus size={17} /> Add material
        </button>
      </div>

      <form className="library-search" onSubmit={e => { e.preventDefault(); runSearch(); }}>
        <Search size={18} />
        <input
          ref={searchInputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search note titles and extracted text (Press ⌘K or Ctrl+K to jump here)…"
        />
        <button type="submit">Search</button>
        {results !== null && (
          <button type="button" className="clear-search" onClick={clearSearch}>
            Clear
          </button>
        )}
      </form>

      <div className="library-meta">
        <span>{results !== null ? `Search results for “${query}”` : 'All study materials'}</span>
        <span>{shown.length} {shown.length === 1 ? 'item' : 'items'}</span>
      </div>

      {loading || searchLoading ? (
        <div className="notes-grid">
          {[1, 2, 3].map(n => <div className="note-skeleton" key={n} />)}
        </div>
      ) : shown.length ? (
        <div className="notes-grid">
          {shown.map(note => (
            <NoteCard
              key={note.id}
              note={note}
              onClick={() => onViewNote(note)}
              onDelete={() => onDeleteNote(note)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={results !== null ? Search : LibraryBig}
          title={results !== null ? 'No matching materials found' : 'Your library is empty'}
          text={
            results !== null
              ? 'Try searching with another keyword or term from your notes.'
              : 'Upload a lecture PDF or TXT notes file to make it instantly searchable.'
          }
          action={
            results !== null ? (
              <button className="text-link" onClick={clearSearch}>
                Clear search <X size={14} />
              </button>
            ) : (
              <button className="button-primary button-small" onClick={onUpload}>
                <Upload size={15} /> Upload a note
              </button>
            )
          }
        />
      )}
    </div>
  );
}

function UploadModal({ onClose, onUploaded }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const chooseFile = (f) => {
    if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    if (!['pdf', 'txt'].includes(ext)) {
      setError('Unsupported file type. Please choose a valid PDF or TXT document.');
      setFile(null);
      return;
    }
    if (f.size > 15 * 1024 * 1024) {
      setError('File is too large. Maximum file size allowed is 15 MB.');
      setFile(null);
      return;
    }
    setError('');
    setFile(f);
    if (!title) {
      setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Please choose a PDF or TXT file to continue.');
      return;
    }
    if (!title.trim()) {
      setError('Please provide a title for your note.');
      return;
    }
    setBusy(true);
    setError('');

    const form = new FormData();
    form.append('file', file);
    form.append('title', title);
    form.append('description', description);

    try {
      await getJson(`${API}/notes`, { method: 'POST', body: form });
      await onUploaded();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="upload-modal" role="dialog" aria-modal="true" aria-labelledby="upload-title">
        <div className="modal-head">
          <div>
            <span className="modal-kicker">GROW YOUR KNOWLEDGE BASE</span>
            <h2 id="upload-title">Add study material</h2>
            <p>Upload a document to make it searchable and accessible to your AI assistant.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={19} />
          </button>
        </div>

        <form onSubmit={submit}>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.txt,application/pdf,text/plain"
            hidden
            onChange={e => chooseFile(e.target.files?.[0])}
          />
          <button
            type="button"
            className={`dropzone ${file ? 'has-file' : ''}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              chooseFile(e.dataTransfer.files?.[0]);
            }}
          >
            <span className="upload-icon-wrap">
              {file ? <CheckCircle2 size={24} /> : <Upload size={22} />}
            </span>
            <b>{file ? file.name : 'Drop your file here, or click to browse'}</b>
            <span>{file ? `${formatSize(file.size)} · ${file.name.split('.').pop().toUpperCase()}` : 'PDF or TXT · Maximum 15 MB'}</span>
            {file && <span className="change-file">Choose a different document</span>}
          </button>

          <label className="field-label">
            Title <span>Required</span>
            <input
              className="form-input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Operating Systems — Process Synchronization"
              maxLength={120}
            />
          </label>

          <label className="field-label">
            Description <span>Optional</span>
            <textarea
              className="form-input form-textarea"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Brief summary or lecture notes context…"
              rows="3"
              maxLength={400}
            />
          </label>

          <div className="privacy-note">
            <span className="lock-mini">●</span> Your files stay stored locally in this app. Extracted text is used strictly to answer your queries.
          </div>

          {error && <div className="form-error"><AlertCircle size={16} />{error}</div>}

          <div className="modal-actions">
            <button type="button" className="button-secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="button-primary" disabled={busy}>
              {busy ? (
                <><LoaderCircle size={16} className="spin" /> Parsing & Extracting…</>
              ) : (
                <><Upload size={16} /> Add to my library</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NoteDetailModal({ note, onClose, onAskAi, onDelete, showToast }) {
  const [copied, setCopied] = useState(false);

  const copyContent = () => {
    if (note.content) {
      navigator.clipboard.writeText(note.content);
      setCopied(true);
      showToast('Document text copied to clipboard.');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="detail-modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <span className="modal-kicker">{note.fileType || 'DOCUMENT'}</span>
            <h2>{note.title}</h2>
            <p>{note.description || 'Full document preview'}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={19} />
          </button>
        </div>

        <div className="note-detail-meta">
          <span><Clock3 size={13} /> {dateLabel(note.createdAt)}</span>
          <span>Size: {formatSize(note.size)}</span>
          <span>File: {note.filename || `${note.title}.${note.fileType?.toLowerCase()}`}</span>
        </div>

        <div className="note-detail-content">
          {note.content || note.preview || 'No text extracted for this document.'}
        </div>

        <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
          <div>
            <button
              type="button"
              className="button-secondary"
              onClick={copyContent}
              style={{ marginRight: '8px' }}
            >
              {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy Text</>}
            </button>
            <button
              type="button"
              className="button-secondary"
              style={{ color: '#ef4444' }}
              onClick={onDelete}
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="button-secondary" onClick={onClose}>
              Close
            </button>
            <button type="button" className="button-primary" onClick={onAskAi}>
              <Sparkles size={15} /> Ask AI About This
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Assistant({ notes, aiConfigured, modelName, onSetupRefresh, onUploadPrompt }) {
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('all');
  const [copiedIndex, setCopiedIndex] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  const ask = async (text = question) => {
    const q = text.trim();
    if (!q || busy) return;
    setQuestion('');
    setError('');
    setMessages(m => [...m, { role: 'user', text: q }]);
    setBusy(true);

    try {
      const result = await getJson(`${API}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          noteIds: selected === 'all' ? [] : [selected]
        })
      });
      setMessages(m => [...m, { role: 'assistant', text: result.answer, sources: result.sources }]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const copyAnswer = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const suggestions = [
    'Summarize my uploaded notes',
    'What key concepts should I revise first?',
    'Create 3 quick practice questions from my materials'
  ];

  return (
    <div className="assistant-page">
      <div className="page-title-row assistant-title">
        <div>
          <div className="eyebrow">YOUR PERSONAL STUDY COMPANION</div>
          <h1>AI study assistant</h1>
          <p>Ask questions and receive instant answers grounded strictly in your course materials.</p>
        </div>
        <Badge tone={aiConfigured ? 'green' : 'amber'}>
          <span className={`badge-dot ${aiConfigured ? 'green-dot' : ''}`} />
          {aiConfigured ? `Connected (${modelName})` : 'Setup needed'}
        </Badge>
      </div>

      {!aiConfigured && (
        <div className="setup-callout">
          <span className="setup-icon"><Sparkles size={18} /></span>
          <div>
            <b>Configure your Gemini API key</b>
            <p>Add your Gemini API key to the project’s <code>.env</code> file to enable intelligent Q&A.</p>
          </div>
        </div>
      )}

      {notes.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Your assistant needs notes to learn from"
          text="Upload a PDF or TXT study document first. Second Brain AI only answers from materials you provide."
          action={
            <button className="button-primary button-small" onClick={onUploadPrompt}>
              <Upload size={15} /> Upload your first note
            </button>
          }
        />
      ) : (
        <div className="chat-card">
          <div className="chat-top">
            <div className="chat-avatar"><Sparkles size={19} /></div>
            <div>
              <b>Second Brain Assistant</b>
              <span><i className="online-dot" /> Grounded in your uploaded library</span>
            </div>
            <div className="chat-top-actions">
              <label className="source-select">
                <span>Source:</span>
                <select value={selected} onChange={e => setSelected(e.target.value)}>
                  <option value="all">All my notes ({notes.length})</option>
                  {notes.map(n => (
                    <option key={n.id} value={n.id}>{n.title}</option>
                  ))}
                </select>
              </label>

              {messages.length > 0 && (
                <button
                  className="button-secondary"
                  style={{ padding: '5px 10px', fontSize: '11px' }}
                  onClick={() => setMessages([])}
                  title="Clear chat history"
                >
                  Clear chat
                </button>
              )}
            </div>
          </div>

          <div className="chat-body">
            {messages.length === 0 ? (
              <div className="chat-welcome">
                <span className="chat-welcome-spark"><Sparkles size={20} /></span>
                <h2>Make exam preparation effortless.</h2>
                <p>Ask for quick summaries, concept explanations, or practice quizzes directly from your notes.</p>
                <div className="suggestions">
                  {suggestions.map(s => (
                    <button key={s} onClick={() => ask(s)}>
                      {s} <ArrowUpRight size={14} />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="messages">
                {messages.map((m, i) => (
                  <div className={`message-row ${m.role}`} key={i}>
                    {m.role === 'assistant' && (
                      <span className="message-avatar"><Sparkles size={16} /></span>
                    )}
                    <div className="message-bubble">
                      <div className="message-bubble-head">
                        <span className="message-label">{m.role === 'assistant' ? 'SECOND BRAIN AI' : 'YOU'}</span>
                        {m.role === 'assistant' && (
                          <button
                            className="message-copy-btn"
                            onClick={() => copyAnswer(m.text, i)}
                            title="Copy answer"
                          >
                            {copiedIndex === i ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                          </button>
                        )}
                      </div>
                      <FormattedAnswer text={m.text} />
                      {m.sources?.length > 0 && (
                        <div className="source-citation">
                          <BookMarked size={13} /> Sourced from: {m.sources.join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {busy && (
                  <div className="message-row assistant">
                    <span className="message-avatar"><Sparkles size={16} /></span>
                    <div className="message-bubble typing">
                      <span /><span /><span />
                    </div>
                  </div>
                )}
                <div ref={scrollRef} />
              </div>
            )}
          </div>

          {error && (
            <div className="chat-error">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <form className="chat-compose" onSubmit={e => { e.preventDefault(); ask(); }}>
            <input
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="Ask anything about your uploaded notes…"
              disabled={busy}
            />
            <span className="compose-hint">
              <Paperclip size={14} /> Grounded in your notes
            </span>
            <button type="submit" disabled={busy || !question.trim()} aria-label="Send question">
              {busy ? <LoaderCircle size={18} className="spin" /> : <Send size={16} />}
            </button>
          </form>

          <div className="chat-disclaimer">
            <Sparkles size={12} /> Answers reference only your selected study materials. No external hallucinations.
          </div>
        </div>
      )}

      <div className="assistant-foot">
        <Lightbulb size={15} />
        <span>
          <b>Study Tip:</b> Be specific in your prompts (e.g. "What are the 3 stages described in Lecture 2?"). The assistant will pinpoint exact definitions directly from your texts.
        </span>
      </div>
    </div>
  );
}

function Sharing({ resources, showToast }) {
  const [filter, setFilter] = useState('All resources');
  const [term, setTerm] = useState('');
  const subjects = ['All resources', 'Computer Science', 'Mathematics', 'Chemistry'];

  // Persist saved resource IDs in localStorage
  const [savedIds, setSavedIds] = useState(() => {
    try {
      const saved = localStorage.getItem('secondbrain_saved_resources');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const toggleSave = (id, title) => {
    setSavedIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem('secondbrain_saved_resources', JSON.stringify(next));
      if (!prev.includes(id)) {
        showToast(`Saved "${title}" to your offline references.`);
      } else {
        showToast(`Removed "${title}" from saved references.`);
      }
      return next;
    });
  };

  const visible = resources.filter(r =>
    (filter === 'All resources' || r.subject === filter) &&
    `${r.title} ${r.subject} ${r.description}`.toLowerCase().includes(term.toLowerCase())
  );

  return (
    <div className="page-content">
      <div className="page-title-row">
        <div>
          <div className="eyebrow">LEARN BETTER, TOGETHER</div>
          <h1>Shared resources</h1>
          <p>Curated revision guides and peer study notes.</p>
        </div>
        <Badge tone="amber">CURATED REVISION</Badge>
      </div>

      <div className="sharing-banner">
        <div className="sharing-icon"><UsersRound size={22} /></div>
        <div>
          <b>Academic Revision Pack</b>
          <p>Curated sample study guides across core STEM disciplines. Save them for quick exam reference.</p>
        </div>
        <span className="demo-mark">COMMUNITY GUIDES</span>
      </div>

      <div className="resource-controls">
        <div className="filter-pills">
          {subjects.map(x => (
            <button
              key={x}
              onClick={() => setFilter(x)}
              className={filter === x ? 'selected' : ''}
            >
              {x}
            </button>
          ))}
        </div>
        <label className="resource-search">
          <Search size={16} />
          <input
            value={term}
            onChange={e => setTerm(e.target.value)}
            placeholder="Search revision guides…"
          />
        </label>
      </div>

      {visible.length ? (
        <div className="resource-grid">
          {visible.map((r, i) => (
            <ResourceCard
              key={r.id}
              resource={r}
              index={i}
              isSaved={savedIds.includes(r.id)}
              onToggleSave={() => toggleSave(r.id, r.title)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Search}
          title="No resources found"
          text="Try adjusting your subject filter or keyword query."
          action={
            <button className="text-link" onClick={() => { setTerm(''); setFilter('All resources'); }}>
              Reset filters
            </button>
          }
        />
      )}

      <div className="sharing-note">
        <GraduationCap size={18} />
        <span>
          Save any resource to your local reference collection. Community note submission and collaborative workspaces coming in the next release!
        </span>
      </div>
    </div>
  );
}

function ResourceCard({ resource, index, isSaved, onToggleSave }) {
  const palettes = ['violet', 'mint', 'amber', 'rose'];
  const pal = palettes[index % palettes.length];
  const glyphs = [BookOpen, FileText, LibraryBig, GraduationCap];
  const Glyph = glyphs[index % glyphs.length];

  return (
    <article className={`resource-card resource-${pal}`}>
      <div className="resource-card-top">
        <span className="resource-illustration">
          <Glyph size={22} />
        </span>
        <Badge tone="light">{resource.kind || 'STUDY'}</Badge>
      </div>
      <div className="resource-subject">{resource.subject}</div>
      <h3>{resource.title}</h3>
      <p>{resource.description}</p>
      <div className="resource-card-foot">
        <span className="resource-author">
          <span className="author-avatar">{resource.author?.charAt(0) || 'S'}</span>
          {resource.author}
        </span>
        <button
          className={`save-resource ${isSaved ? 'saved' : ''}`}
          onClick={onToggleSave}
        >
          {isSaved ? <><CheckCircle2 size={14} /> Saved</> : <><Plus size={14} /> Save</>}
        </button>
      </div>
    </article>
  );
}

function SettingsPage({ theme, setTheme, profile, saveProfile, aiConfigured, modelName, notesCount }) {
  const [form, setForm] = useState({ ...profile });

  const handleSubmit = (e) => {
    e.preventDefault();
    saveProfile(form);
  };

  return (
    <div className="page-content">
      <div className="page-title-row">
        <div>
          <div className="eyebrow">PREFERENCES & CONFIGURATION</div>
          <h1>Settings</h1>
          <p>Customize your workspace theme, academic profile, and AI assistant settings.</p>
        </div>
      </div>

      {/* Theme Settings */}
      <section className="settings-section">
        <div className="settings-heading">
          <Sliders size={20} style={{ color: 'var(--brand-primary)' }} />
          <div>
            <h2>Appearance & Theme</h2>
            <p>Choose your visual theme. The dark theme is tuned for comfortable late-night study sessions.</p>
          </div>
        </div>

        <div className="settings-grid">
          <div
            className={`settings-card-option ${theme === 'light' ? 'active' : ''}`}
            onClick={() => setTheme('light')}
          >
            <Sun size={20} style={{ color: '#d97706' }} />
            <div>
              <b style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Light Mode</b>
              <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                Clean, crisp daylight palette
              </p>
            </div>
          </div>

          <div
            className={`settings-card-option ${theme === 'dark' ? 'active' : ''}`}
            onClick={() => setTheme('dark')}
          >
            <Moon size={20} style={{ color: 'var(--brand-primary)' }} />
            <div>
              <b style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Dark Mode</b>
              <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                Deep, eye-friendly contrast for long study sessions
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Student Profile Settings */}
      <section className="settings-section">
        <div className="settings-heading">
          <User size={20} style={{ color: 'var(--brand-primary)' }} />
          <div>
            <h2>Student Profile</h2>
            <p>Personalize your workspace metadata. Stored privately on your machine.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="settings-grid">
            <label className="field-label" style={{ marginTop: 0 }}>
              Your Name
              <input
                className="form-input"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Student Name"
                maxLength={60}
              />
            </label>

            <label className="field-label" style={{ marginTop: 0 }}>
              University / College
              <input
                className="form-input"
                value={form.university}
                onChange={e => setForm({ ...form, university: e.target.value })}
                placeholder="e.g. Stanford / IIT / MIT"
                maxLength={80}
              />
            </label>

            <label className="field-label" style={{ marginTop: 0 }}>
              Major / Specialization
              <input
                className="form-input"
                value={form.major}
                onChange={e => setForm({ ...form, major: e.target.value })}
                placeholder="e.g. Computer Science"
                maxLength={80}
              />
            </label>

            <label className="field-label" style={{ marginTop: 0 }}>
              Year / Semester
              <input
                className="form-input"
                value={form.year}
                onChange={e => setForm({ ...form, year: e.target.value })}
                placeholder="e.g. Year 2, Semester 4"
                maxLength={40}
              />
            </label>
          </div>

          <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="button-primary">
              <BookCheck size={16} /> Save Profile Preferences
            </button>
          </div>
        </form>
      </section>

      {/* System & AI Diagnostics */}
      <section className="settings-section">
        <div className="settings-heading">
          <ShieldCheck size={20} style={{ color: 'var(--brand-primary)' }} />
          <div>
            <h2>System & AI Diagnostics</h2>
            <p>Live health and engine status for SECOND BRAIN AI.</p>
          </div>
        </div>

        <div className="settings-status-box">
          <div>
            <b>AI Engine Status</b>
            <p>{aiConfigured ? 'Connected to Google Gemini API' : 'API Key missing or unconfigured'}</p>
          </div>
          <Badge tone={aiConfigured ? 'green' : 'amber'}>
            <span className={`badge-dot ${aiConfigured ? 'green-dot' : ''}`} />
            {aiConfigured ? 'ONLINE' : 'OFFLINE'}
          </Badge>
        </div>

        <div className="settings-status-box">
          <div>
            <b>Active Gemini Model</b>
            <p>Configured in backend .env</p>
          </div>
          <code style={{ fontSize: '11px', background: 'var(--brand-light)', color: 'var(--brand-primary)', padding: '4px 8px', borderRadius: '6px' }}>
            {modelName}
          </code>
        </div>

        <div className="settings-status-box">
          <div>
            <b>Indexed Knowledge Items</b>
            <p>Locally stored and parsed for search and Q&A</p>
          </div>
          <b style={{ fontSize: '14px', color: 'var(--brand-primary)' }}>{notesCount} materials</b>
        </div>
      </section>
    </div>
  );
}
