import { useState, useEffect } from 'react'
import {
  Presentation, Plus, ChevronRight, ChevronLeft, ArrowLeft,
  LogIn, LogOut, FileText, Sparkles, Copy, Clock,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8004/api'

interface Project { id: string; name: string; industry: string; stage: string; briefs?: Brief[] }
interface Brief { id: string; company_description: string; audience: string; raise_amount: string; decks?: DeckSummary[] }
interface DeckSummary { id: string; title: string; template: string; slide_count: number; status: string; created_at: string }
interface Deck extends DeckSummary { slides: Slide[]; tl_dr: string; script: string }
interface Slide { title: string; bullets: string[]; notes: string }
interface AuthUser { id: string; email: string; name: string }

type View = 'home' | 'projects' | 'project-detail' | 'brief-form' | 'deck-view' | 'login' | 'register'

function authHeaders(token: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

export default function App() {
  const [view, setView] = useState<View>('home')
  const [token, setToken] = useState<string | null>(localStorage.getItem('pdf_token'))
  const [user, setUser] = useState<AuthUser | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProject, setActiveProject] = useState<Project | null>(null)
  const [activeDeck, setActiveDeck] = useState<Deck | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (token) {
      fetch(`${API}/users/me`, { headers: authHeaders(token) })
        .then(r => r.ok ? r.json() : Promise.reject()).then(setUser)
        .catch(() => { setToken(null); localStorage.removeItem('pdf_token') })
    }
  }, [token])

  useEffect(() => {
    if (view === 'projects' && token)
      fetch(`${API}/projects`, { headers: authHeaders(token) }).then(r => r.json()).then(d => setProjects(d.projects)).catch(() => {})
  }, [view, token])

  function navigate(v: View) { setView(v) }

  async function handleLogin(email: string, password: string) {
    const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
    if (!r.ok) throw new Error('Login failed')
    const d = await r.json()
    setToken(d.token); localStorage.setItem('pdf_token', d.token); setUser(d.user); setView('projects')
  }

  async function handleRegister(email: string, password: string, name: string) {
    const r = await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, name }) })
    if (!r.ok) throw new Error('Register failed')
    const d = await r.json()
    setToken(d.token); localStorage.setItem('pdf_token', d.token); setUser(d.user); setView('projects')
  }

  function logout() { setToken(null); setUser(null); localStorage.removeItem('pdf_token'); setView('home') }

  async function createProject(name: string, industry: string, stage: string) {
    if (!token) return
    await fetch(`${API}/projects`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ name, industry, stage }) })
    setView('projects')
  }

  async function openProject(id: string) {
    if (!token) return
    const r = await fetch(`${API}/projects/${id}`, { headers: authHeaders(token) })
    if (r.ok) { setActiveProject(await r.json()); setView('project-detail') }
  }

  async function createBrief(projectId: string, data: Record<string, string>) {
    if (!token) return
    const r = await fetch(`${API}/projects/${projectId}/briefs`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(data) })
    if (r.ok) { openProject(projectId) }
  }

  async function generateDeck(briefId: string, template: string) {
    if (!token) return
    setLoading(true)
    const r = await fetch(`${API}/briefs/${briefId}/generate`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ template }) })
    if (r.ok) {
      const deck = await r.json()
      setActiveDeck(deck); setView('deck-view')
    }
    setLoading(false)
  }

  async function openDeck(deckId: string) {
    if (!token) return
    const r = await fetch(`${API}/decks/${deckId}`, { headers: authHeaders(token) })
    if (r.ok) { setActiveDeck(await r.json()); setView('deck-view') }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <nav className="border-b border-gray-800 bg-[#0a0a0f]/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <button onClick={() => navigate('home')} className="flex items-center gap-2 text-lg font-semibold text-white hover:text-orange-400 transition">
            <Presentation size={20} className="text-orange-500" /> PitchDeckForge
          </button>
          <div className="flex items-center gap-4">
            {token && user ? (
              <>
                <button onClick={() => navigate('projects')} className="text-sm text-gray-400 hover:text-white transition">Projects</button>
                <span className="text-sm text-gray-500">{user.name}</span>
                <button onClick={logout} className="text-gray-500 hover:text-red-400"><LogOut size={16} /></button>
              </>
            ) : (
              <button onClick={() => navigate('login')} className="text-sm bg-orange-600 hover:bg-orange-500 px-3 py-1.5 rounded-lg text-white transition flex items-center gap-1">
                <LogIn size={14} /> Sign In
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {view === 'home' && <HomePage onNavigate={navigate} />}
        {view === 'projects' && <ProjectsPage projects={projects} onCreate={createProject} onOpen={openProject} />}
        {view === 'project-detail' && activeProject && (
          <ProjectDetailPage project={activeProject} onCreateBrief={createBrief} onGenerateDeck={generateDeck} onOpenDeck={openDeck} onBack={() => navigate('projects')} loading={loading} />
        )}
        {view === 'deck-view' && activeDeck && <DeckViewPage deck={activeDeck} onBack={() => activeProject ? openProject(activeProject.id) : navigate('projects')} />}
        {view === 'login' && <AuthPage mode="login" onLogin={handleLogin} onSwitch={() => navigate('register')} />}
        {view === 'register' && <AuthPage mode="register" onRegister={handleRegister} onSwitch={() => navigate('login')} />}
      </main>
    </div>
  )
}

// ── Home ──────────────────────────────────────────────────────────────────

function HomePage({ onNavigate }: { onNavigate: (v: View) => void }) {
  return (
    <div className="space-y-12">
      <div className="text-center py-16 space-y-6">
        <h1 className="text-5xl font-bold bg-gradient-to-r from-orange-400 via-red-400 to-pink-400 bg-clip-text text-transparent">
          Pitch Decks, Forged by AI
        </h1>
        <p className="text-xl text-gray-400 max-w-2xl mx-auto">
          Describe your startup. Get a polished 10-slide pitch deck, executive summary, and 90-second demo script in seconds.
        </p>
        <button onClick={() => onNavigate('projects')} className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-3 rounded-xl text-lg font-medium transition flex items-center gap-2 mx-auto">
          Get Started <ChevronRight size={20} />
        </button>
      </div>
      <div className="grid md:grid-cols-3 gap-6">
        {[
          { title: 'Describe Your Startup', desc: 'Fill in your problem, solution, traction, team, and raise amount.', icon: <FileText size={24} /> },
          { title: 'AI Generates Your Deck', desc: '10 slides with bullets, speaker notes, TL;DR, and pitch script.', icon: <Sparkles size={24} /> },
          { title: 'Edit & Export', desc: 'Tweak individual slides, regenerate content, and export as PDF.', icon: <Presentation size={24} /> },
        ].map(s => (
          <div key={s.title} className="bg-[#12121a] border border-gray-800 rounded-xl p-6 text-center">
            <div className="w-12 h-12 bg-orange-500/10 rounded-xl flex items-center justify-center mx-auto mb-4 text-orange-400">{s.icon}</div>
            <h3 className="font-semibold text-white mb-2">{s.title}</h3>
            <p className="text-sm text-gray-400">{s.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Projects ──────────────────────────────────────────────────────────────

function ProjectsPage({ projects, onCreate, onOpen }: {
  projects: Project[]; onCreate: (n: string, i: string, s: string) => void; onOpen: (id: string) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState(''); const [industry, setIndustry] = useState(''); const [stage, setStage] = useState('seed')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">My Projects</h1>
        <button onClick={() => setShowForm(!showForm)} className="text-sm bg-orange-600 hover:bg-orange-500 px-3 py-1.5 rounded-lg text-white transition flex items-center gap-1">
          <Plus size={14} /> New Project
        </button>
      </div>
      {showForm && (
        <form onSubmit={e => { e.preventDefault(); if (name) { onCreate(name, industry, stage); setName(''); setShowForm(false) } }} className="bg-[#12121a] border border-gray-800 rounded-xl p-4 flex gap-3">
          <input type="text" placeholder="Project name" value={name} onChange={e => setName(e.target.value)} required className="flex-1 px-3 py-2 bg-[#0a0a0f] border border-gray-800 rounded-lg text-sm text-white focus:outline-none focus:border-orange-500" />
          <input type="text" placeholder="Industry" value={industry} onChange={e => setIndustry(e.target.value)} className="w-32 px-3 py-2 bg-[#0a0a0f] border border-gray-800 rounded-lg text-sm text-white focus:outline-none focus:border-orange-500" />
          <select value={stage} onChange={e => setStage(e.target.value)} className="px-3 py-2 bg-[#0a0a0f] border border-gray-800 rounded-lg text-sm text-white focus:outline-none">
            <option value="seed">Seed</option><option value="series_a">Series A</option><option value="series_b">Series B</option><option value="growth">Growth</option>
          </select>
          <button type="submit" className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-sm">Create</button>
        </form>
      )}
      {projects.length === 0 ? (
        <div className="text-center py-16"><Presentation size={48} className="text-gray-600 mx-auto mb-4" /><p className="text-gray-400">No projects yet</p></div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {projects.map(p => (
            <button key={p.id} onClick={() => onOpen(p.id)} className="text-left bg-[#12121a] border border-gray-800 rounded-xl p-5 hover:border-orange-500/50 transition group">
              <div className="font-semibold text-white group-hover:text-orange-400 transition">{p.name}</div>
              <div className="text-sm text-gray-500 mt-1">{p.industry || 'No industry'} &middot; {p.stage}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Project Detail ────────────────────────────────────────────────────────

function ProjectDetailPage({ project, onCreateBrief, onGenerateDeck, onOpenDeck, onBack, loading }: {
  project: Project; onCreateBrief: (id: string, data: Record<string, string>) => void
  onGenerateDeck: (briefId: string, template: string) => void; onOpenDeck: (id: string) => void
  onBack: () => void; loading: boolean
}) {
  const [showBriefForm, setShowBriefForm] = useState(false)
  const [form, setForm] = useState({ company_description: '', problem: '', solution: '', traction: '', team: '', raise_amount: '', audience: 'seed' })

  const TEMPLATES = [
    { id: 'clean', label: 'Clean & Minimal', color: 'text-gray-400' },
    { id: 'investor', label: 'Investor Focus', color: 'text-green-400' },
    { id: 'growth', label: 'Growth Story', color: 'text-blue-400' },
    { id: 'product', label: 'Product-First', color: 'text-purple-400' },
  ]

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="text-sm text-gray-400 hover:text-white transition flex items-center gap-1"><ArrowLeft size={16} /> Back</button>
      <h1 className="text-2xl font-bold text-white">{project.name}</h1>

      {/* Briefs & Decks */}
      {project.briefs && project.briefs.length > 0 ? (
        <div className="space-y-4">
          {project.briefs.map(brief => (
            <div key={brief.id} className="bg-[#12121a] border border-gray-800 rounded-xl p-5">
              <div className="text-sm text-gray-400 mb-3">Brief: {brief.company_description}...</div>
              <div className="text-xs text-gray-500 mb-4">Audience: {brief.audience} &middot; Raise: {brief.raise_amount || 'N/A'}</div>

              {/* Existing decks */}
              {brief.decks && brief.decks.length > 0 && (
                <div className="space-y-2 mb-4">
                  {brief.decks.map(d => (
                    <button key={d.id} onClick={() => onOpenDeck(d.id)} className="w-full text-left bg-[#0a0a0f] rounded-lg p-3 hover:bg-orange-500/10 transition flex items-center justify-between">
                      <div>
                        <span className="text-sm text-white">{d.title}</span>
                        <span className="text-xs text-gray-500 ml-2">{d.slide_count} slides &middot; {d.template}</span>
                      </div>
                      <ChevronRight size={14} className="text-gray-600" />
                    </button>
                  ))}
                </div>
              )}

              {/* Generate new deck */}
              <div className="flex flex-wrap gap-2">
                {TEMPLATES.map(t => (
                  <button key={t.id} onClick={() => onGenerateDeck(brief.id, t.id)} disabled={loading}
                    className="text-xs px-3 py-1.5 bg-orange-600/10 border border-orange-500/20 text-orange-400 rounded-lg hover:bg-orange-600/20 transition disabled:opacity-50 flex items-center gap-1">
                    <Sparkles size={12} /> {loading ? 'Generating...' : `Generate ${t.label}`}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">No briefs yet. Create one to start generating decks.</div>
      )}

      {/* Create Brief */}
      <button onClick={() => setShowBriefForm(!showBriefForm)} className="text-sm bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg text-white transition flex items-center gap-1">
        <Plus size={14} /> {showBriefForm ? 'Cancel' : 'New Brief'}
      </button>

      {showBriefForm && (
        <form onSubmit={e => { e.preventDefault(); if (form.company_description) { onCreateBrief(project.id, form); setShowBriefForm(false) } }}
          className="bg-[#12121a] border border-gray-800 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Company Brief</h2>
          {[
            { key: 'company_description', label: 'Company Description *', type: 'textarea', placeholder: 'What does your company do? (2-3 sentences)' },
            { key: 'problem', label: 'Problem', type: 'textarea', placeholder: 'What problem are you solving?' },
            { key: 'solution', label: 'Solution', type: 'textarea', placeholder: 'How do you solve it?' },
            { key: 'traction', label: 'Traction', type: 'text', placeholder: 'Key metrics: users, revenue, growth rate' },
            { key: 'team', label: 'Team', type: 'text', placeholder: 'Key team members and backgrounds' },
            { key: 'raise_amount', label: 'Raise Amount', type: 'text', placeholder: 'e.g. $2M' },
          ].map(f => (
            <div key={f.key}>
              <label className="text-sm text-gray-400 block mb-1">{f.label}</label>
              {f.type === 'textarea' ? (
                <textarea value={(form as Record<string, string>)[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} rows={2} placeholder={f.placeholder}
                  className="w-full px-3 py-2 bg-[#0a0a0f] border border-gray-800 rounded-lg text-sm text-white focus:outline-none focus:border-orange-500 resize-y" />
              ) : (
                <input type="text" value={(form as Record<string, string>)[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} placeholder={f.placeholder}
                  className="w-full px-3 py-2 bg-[#0a0a0f] border border-gray-800 rounded-lg text-sm text-white focus:outline-none focus:border-orange-500" />
              )}
            </div>
          ))}
          <div>
            <label className="text-sm text-gray-400 block mb-1">Target Audience</label>
            <select value={form.audience} onChange={e => setForm({ ...form, audience: e.target.value })}
              className="px-3 py-2 bg-[#0a0a0f] border border-gray-800 rounded-lg text-sm text-white focus:outline-none">
              <option value="seed">Seed Investors</option><option value="series_a">Series A</option><option value="growth">Growth Investors</option>
            </select>
          </div>
          <button type="submit" className="w-full py-3 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-medium transition">Create Brief</button>
        </form>
      )}
    </div>
  )
}

// ── Deck Viewer ───────────────────────────────────────────────────────────

function DeckViewPage({ deck, onBack }: { deck: Deck; onBack: () => void }) {
  const [currentSlide, setCurrentSlide] = useState(0)
  const [activeTab, setActiveTab] = useState<'slides' | 'tldr' | 'script'>('slides')

  const slide = deck.slides[currentSlide]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-white transition flex items-center gap-1"><ArrowLeft size={16} /> Back</button>
        <div className="flex gap-2">
          {(['slides', 'tldr', 'script'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`text-xs px-3 py-1.5 rounded-lg transition ${activeTab === tab ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
              {tab === 'tldr' ? 'TL;DR' : tab === 'script' ? 'Pitch Script' : 'Slides'}
            </button>
          ))}
        </div>
      </div>

      <h1 className="text-2xl font-bold text-white">{deck.title}</h1>

      {activeTab === 'slides' && slide && (
        <div className="space-y-4">
          {/* Slide display */}
          <div className="bg-[#12121a] border border-gray-800 rounded-xl p-8 min-h-[400px] flex flex-col justify-center">
            <div className="text-xs text-orange-400 mb-2">Slide {currentSlide + 1} of {deck.slides.length}</div>
            <h2 className="text-3xl font-bold text-white mb-6">{slide.title}</h2>
            <ul className="space-y-3">
              {slide.bullets?.map((b, i) => (
                <li key={i} className="text-lg text-gray-300 flex items-start gap-3">
                  <span className="w-2 h-2 bg-orange-500 rounded-full mt-2.5 shrink-0" />
                  {b}
                </li>
              ))}
            </ul>
          </div>

          {/* Speaker notes */}
          {slide.notes && (
            <div className="bg-[#0a0a0f] border border-gray-800 rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">Speaker Notes</div>
              <p className="text-sm text-gray-400">{slide.notes}</p>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))} disabled={currentSlide === 0}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-white rounded-lg transition flex items-center gap-1">
              <ChevronLeft size={16} /> Previous
            </button>
            <div className="flex gap-1">
              {deck.slides.map((_, i) => (
                <button key={i} onClick={() => setCurrentSlide(i)}
                  className={`w-2.5 h-2.5 rounded-full transition ${i === currentSlide ? 'bg-orange-500' : 'bg-gray-700 hover:bg-gray-600'}`} />
              ))}
            </div>
            <button onClick={() => setCurrentSlide(Math.min(deck.slides.length - 1, currentSlide + 1))} disabled={currentSlide === deck.slides.length - 1}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-white rounded-lg transition flex items-center gap-1">
              Next <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {activeTab === 'tldr' && (
        <div className="bg-[#12121a] border border-gray-800 rounded-xl p-8">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><FileText size={18} className="text-orange-400" /> Executive Summary</h2>
          <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{deck.tl_dr || 'No summary generated yet.'}</p>
          <button onClick={() => navigator.clipboard.writeText(deck.tl_dr || '')} className="mt-4 text-xs text-gray-500 hover:text-white flex items-center gap-1"><Copy size={12} /> Copy</button>
        </div>
      )}

      {activeTab === 'script' && (
        <div className="bg-[#12121a] border border-gray-800 rounded-xl p-8">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><Clock size={18} className="text-orange-400" /> 90-Second Pitch Script</h2>
          <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{deck.script || 'No script generated yet.'}</p>
          <button onClick={() => navigator.clipboard.writeText(deck.script || '')} className="mt-4 text-xs text-gray-500 hover:text-white flex items-center gap-1"><Copy size={12} /> Copy</button>
        </div>
      )}
    </div>
  )
}

// ── Auth ──────────────────────────────────────────────────────────────────

function AuthPage({ mode, onLogin, onRegister, onSwitch }: {
  mode: 'login' | 'register'; onLogin?: (e: string, p: string) => Promise<void>
  onRegister?: (e: string, p: string, n: string) => Promise<void>; onSwitch: () => void
}) {
  const [email, setEmail] = useState(mode === 'login' ? 'demo@pitchdeckforge.dev' : '')
  const [password, setPassword] = useState(mode === 'login' ? 'demo123' : '')
  const [name, setName] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      if (mode === 'login' && onLogin) await onLogin(email, password)
      else if (mode === 'register' && onRegister) await onRegister(email, password, name)
    } catch { setError(mode === 'login' ? 'Invalid credentials' : 'Registration failed') }
    setLoading(false)
  }

  return (
    <div className="max-w-sm mx-auto py-16">
      <div className="bg-[#12121a] border border-gray-800 rounded-xl p-6">
        <h1 className="text-xl font-bold text-white mb-6 text-center">{mode === 'login' ? 'Sign In' : 'Create Account'}</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <input type="text" placeholder="Name" value={name} onChange={e => setName(e.target.value)} required
              className="w-full px-3 py-2 bg-[#0a0a0f] border border-gray-800 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500" />
          )}
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required
            className="w-full px-3 py-2 bg-[#0a0a0f] border border-gray-800 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500" />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required
            className="w-full px-3 py-2 bg-[#0a0a0f] border border-gray-800 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500" />
          {error && <p className="text-sm text-red-400">{error}</p>}
          {mode === 'login' && <p className="text-xs text-gray-500">Demo: demo@pitchdeckforge.dev / demo123</p>}
          <button type="submit" disabled={loading} className="w-full py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg font-medium transition disabled:opacity-50">
            {loading ? 'Loading...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
        <p className="text-sm text-gray-500 text-center mt-4">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button onClick={onSwitch} className="text-orange-400 hover:text-orange-300">{mode === 'login' ? 'Sign Up' : 'Sign In'}</button>
        </p>
      </div>
    </div>
  )
}
