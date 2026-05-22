import { useState, useEffect } from 'react'
import {
  Presentation, Plus, ChevronRight, ChevronLeft, ArrowLeft,
  LogIn, LogOut, FileText, Sparkles, Copy, Clock,
  Download, RefreshCw, Pencil, Check, X, Loader2,
  CreditCard, Share2, Lock, Zap, Users, Star, Send,
} from 'lucide-react'
import { jsPDF } from 'jspdf'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8004/api'

interface Project { id: string; name: string; industry: string; stage: string; briefs?: Brief[] }
interface Brief { id: string; company_description: string; audience: string; raise_amount: string; decks?: DeckSummary[] }
interface DeckSummary { id: string; title: string; template: string; slide_count: number; status: string; created_at: string }
interface Deck extends DeckSummary { slides: Slide[]; tl_dr: string; script: string }
interface Slide { title: string; bullets: string[]; notes: string }
interface AuthUser { id: string; email: string; name: string }

type View = 'home' | 'projects' | 'project-detail' | 'brief-form' | 'deck-view' | 'login' | 'register' | 'pricing' | 'shared-deck' | 'brain'

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

  async function regenerateSlide(deckId: string, slideIndex: number, instruction: string = '') {
    if (!token) return null
    const r = await fetch(`${API}/decks/${deckId}/regenerate-slide`, {
      method: 'POST', headers: authHeaders(token),
      body: JSON.stringify({ slide_index: slideIndex, instruction })
    })
    if (r.ok) {
      const data = await r.json()
      if (activeDeck && activeDeck.id === deckId) {
        const newSlides = [...activeDeck.slides]
        newSlides[slideIndex] = data.slide
        setActiveDeck({ ...activeDeck, slides: newSlides })
      }
      return data.slide
    }
    return null
  }

  async function addBonusSlide(deckId: string, slideType: string) {
    if (!token) return null
    const r = await fetch(`${API}/decks/${deckId}/bonus-slide`, {
      method: 'POST', headers: authHeaders(token),
      body: JSON.stringify({ slide_type: slideType })
    })
    if (r.ok) {
      const data = await r.json()
      if (activeDeck && activeDeck.id === deckId) {
        const newSlides = [...activeDeck.slides]
        newSlides.splice(data.index, 0, data.slide)
        setActiveDeck({ ...activeDeck, slides: newSlides })
      }
      return data
    }
    return null
  }

  async function importFromFounderProject(projectId: string, template: string = 'clean') {
    if (!token) return
    setLoading(true)
    try {
      const r = await fetch(`${API}/founder-projects/import`, {
        method: 'POST', headers: authHeaders(token),
        body: JSON.stringify({ project_id: projectId, template }),
      })
      if (r.ok) {
        const data = await r.json()
        setActiveDeck(data.deck); setView('deck-view')
      } else {
        const err = await r.text().catch(() => 'Unknown error')
        console.error('Import failed:', r.status, err)
        alert(`Import failed: ${r.status}`)
      }
    } catch (e) { console.error('Import error:', e) }
    setLoading(false)
  }

  async function finalizeDeck(deckId: string) {
    if (!token) return false
    const r = await fetch(`${API}/decks/${deckId}/finalize`, {
      method: 'POST', headers: authHeaders(token),
    })
    if (r.ok) {
      const data = await r.json()
      if (activeDeck && activeDeck.id === deckId) {
        setActiveDeck({ ...activeDeck, status: 'final' })
      }
      return data.share_token || null
    }
    return false
  }

  async function updateSlide(deckId: string, slideIndex: number, updates: Partial<Slide>) {
    if (!token) return false
    const r = await fetch(`${API}/decks/${deckId}/slides`, {
      method: 'PATCH', headers: authHeaders(token),
      body: JSON.stringify({ slide_index: slideIndex, ...updates })
    })
    if (r.ok) {
      const data = await r.json()
      if (activeDeck && activeDeck.id === deckId) {
        const newSlides = [...activeDeck.slides]
        newSlides[slideIndex] = data.slide
        setActiveDeck({ ...activeDeck, slides: newSlides })
      }
      return true
    }
    return false
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Founder Toolkit cross-app nav with progress stepper */}
      <div className="bg-[#0f0f18] border-b border-gray-800/50 px-4 py-2">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <a href="https://founder-toolkit.vercel.app" className="flex items-center gap-1.5 hover:opacity-80 transition">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-[#e94560] to-[#7c3aed] flex items-center justify-center text-[9px] font-bold text-white">FT</div>
            <span className="text-[11px] font-medium text-gray-400">Founder Toolkit</span>
          </a>
          <div className="flex items-center gap-1">
            <a href="https://mentorforge.vercel.app" className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-indigo-400 transition px-1.5 py-0.5">
              <span className="w-4 h-4 rounded-full bg-gray-800 flex items-center justify-center text-[9px] text-gray-500">1</span>
              Mentor
            </a>
            <div className="w-3 h-[1px] bg-gray-700 mx-0.5" />
            <span className="flex items-center gap-1 text-[11px] text-gray-500 px-1.5 py-0.5">
              <span className="w-4 h-4 rounded-full bg-gray-800 flex items-center justify-center text-[9px] text-gray-500">2</span>
              Build
            </span>
            <div className="w-3 h-[1px] bg-gray-700 mx-0.5" />
            <span className="flex items-center gap-1 text-[11px] font-semibold text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full">
              <span className="w-4 h-4 rounded-full bg-orange-500 flex items-center justify-center text-[9px] font-bold text-white">3</span>
              Deck
            </span>
            <div className="w-3 h-[1px] bg-gray-700 mx-0.5" />
            <a href="https://dealflowtracker.vercel.app" className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-violet-400 transition px-1.5 py-0.5">
              <span className="w-4 h-4 rounded-full bg-gray-800 flex items-center justify-center text-[9px] text-gray-500">4</span>
              Pipeline
            </a>
            <div className="w-3 h-[1px] bg-gray-700 mx-0.5" />
            <a href="https://contract-concierge-pi.vercel.app" className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-emerald-400 transition px-1.5 py-0.5">
              <span className="w-4 h-4 rounded-full bg-gray-800 flex items-center justify-center text-[9px] text-gray-500">5</span>
              Contracts
            </a>
          </div>
        </div>
      </div>
      <nav className="border-b border-gray-800 bg-[#0a0a0f]/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <button onClick={() => navigate('home')} className="flex items-center gap-2 text-lg font-semibold text-white hover:text-orange-400 transition">
            <Presentation size={20} className="text-orange-500" /> PitchDeckForge
          </button>
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('brain')} className="text-sm text-gray-400 hover:text-white transition" title="Ask Rigby (u-d-b PA)">Brain</button>
            <button onClick={() => navigate('pricing')} className="text-sm text-gray-400 hover:text-white transition">Pricing</button>
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
        {view === 'projects' && <ProjectsPage projects={projects} onCreate={createProject} onOpen={openProject} onImportFromProject={importFromFounderProject} token={token} loading={loading} />}
        {view === 'project-detail' && activeProject && (
          <ProjectDetailPage project={activeProject} onCreateBrief={createBrief} onGenerateDeck={generateDeck} onOpenDeck={openDeck} onBack={() => navigate('projects')} loading={loading} />
        )}
        {view === 'deck-view' && activeDeck && <DeckViewPage deck={activeDeck} onBack={() => activeProject ? openProject(activeProject.id) : navigate('projects')} onRegenerateSlide={regenerateSlide} onUpdateSlide={updateSlide} onAddBonusSlide={addBonusSlide} onFinalize={finalizeDeck} />}
        {view === 'pricing' && <PricingPage onNavigate={navigate} />}
        {view === 'brain' && <BrainPage token={token} onLogin={() => navigate('login')} />}
        {view === 'login' && <AuthPage mode="login" onLogin={handleLogin} onSwitch={() => navigate('register')} />}
        {view === 'register' && <AuthPage mode="register" onRegister={handleRegister} onSwitch={() => navigate('login')} />}
      </main>
    </div>
  )
}

// ── Home ──────────────────────────────────────────────────────────────────

function HomePage({ onNavigate }: { onNavigate: (v: View) => void }) {
  return (
    <div className="space-y-16">
      <div className="text-center py-16 space-y-6">
        <h1 className="text-5xl font-bold bg-gradient-to-r from-orange-400 via-red-400 to-pink-400 bg-clip-text text-transparent">
          Pitch Decks, Forged by AI
        </h1>
        <p className="text-xl text-gray-400 max-w-2xl mx-auto">
          Describe your startup. Get a polished pitch deck with market research, investor Q&A, and competitive analysis — in seconds, not weeks.
        </p>
        <div className="flex gap-3 justify-center">
          <button onClick={() => onNavigate('projects')} className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-3 rounded-xl text-lg font-medium transition flex items-center gap-2">
            Start Free <ChevronRight size={20} />
          </button>
          <button onClick={() => onNavigate('pricing')} className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-3 rounded-xl text-lg font-medium transition">
            View Pricing
          </button>
        </div>
      </div>

      {/* How it works */}
      <div className="grid md:grid-cols-3 gap-6">
        {[
          { title: 'Describe Your Startup', desc: 'Fill in your problem, solution, traction, team, and raise amount.', icon: <FileText size={24} /> },
          { title: 'AI Generates Your Deck', desc: '10+ slides with speaker notes, executive summary, and pitch script.', icon: <Sparkles size={24} /> },
          { title: 'Edit, Enhance & Export', desc: 'Edit slides inline, add bonus slides, regenerate content, export as PDF.', icon: <Presentation size={24} /> },
        ].map(s => (
          <div key={s.title} className="bg-[#12121a] border border-gray-800 rounded-xl p-6 text-center">
            <div className="w-12 h-12 bg-orange-500/10 rounded-xl flex items-center justify-center mx-auto mb-4 text-orange-400">{s.icon}</div>
            <h3 className="font-semibold text-white mb-2">{s.title}</h3>
            <p className="text-sm text-gray-400">{s.desc}</p>
          </div>
        ))}
      </div>

      {/* Feature highlights */}
      <div>
        <h2 className="text-2xl font-bold text-white text-center mb-8">More Than Just Slides</h2>
        <div className="grid md:grid-cols-2 gap-4 max-w-3xl mx-auto">
          {[
            { label: '4 Template Styles', desc: 'Clean, Investor Focus, Growth Story, Product-First — each with tuned AI prompts', color: 'text-orange-400' },
            { label: 'Market Context Slide', desc: 'AI-researched TAM, trends, and timing signals injected into your deck', color: 'text-blue-400' },
            { label: 'Investor Q&A Slide', desc: 'Top VC objections with rebuttals — written by a veteran investor persona', color: 'text-amber-400' },
            { label: 'Competitive Landscape', desc: 'Key competitors, positioning analysis, and your moat — auto-generated', color: 'text-purple-400' },
            { label: 'Per-Slide Regeneration', desc: 'Don\'t like a slide? Regenerate it with custom instructions', color: 'text-green-400' },
            { label: '90-Second Pitch Script', desc: 'A spoken pitch script ready for demo day or investor calls', color: 'text-pink-400' },
          ].map(f => (
            <div key={f.label} className="flex gap-3 items-start bg-[#12121a] border border-gray-800 rounded-lg p-4">
              <Check size={16} className={`${f.color} mt-0.5 shrink-0`} />
              <div>
                <div className="text-sm font-medium text-white">{f.label}</div>
                <div className="text-xs text-gray-500">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Projects ──────────────────────────────────────────────────────────────

function ProjectsPage({ projects, onCreate, onOpen, onImportFromProject, token, loading }: {
  projects: Project[]; onCreate: (n: string, i: string, s: string) => void; onOpen: (id: string) => void
  onImportFromProject: (projectId: string, template: string) => void; token: string | null; loading: boolean
}) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState(''); const [industry, setIndustry] = useState(''); const [stage, setStage] = useState('seed')
  const [founderProjects, setFounderProjects] = useState<Array<{id: string; title: string; stage: string; mentor_notes: Record<string, string> | null}>>([])
  const [showImport, setShowImport] = useState(false)
  const [previewProject, setPreviewProject] = useState<{id: string; title: string; mentor_notes: Record<string, string> | null} | null>(null)
  const [previewTemplate, setPreviewTemplate] = useState('clean')

  useEffect(() => {
    if (showImport && token) {
      fetch(`${API}/founder-projects`, { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(d => setFounderProjects(d.projects || [])).catch(() => {})
    }
  }, [showImport, token])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">My Projects</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => { setShowImport(!showImport); setPreviewProject(null) }} className="text-sm bg-violet-600 hover:bg-violet-500 px-3 py-1.5 rounded-lg text-white transition flex items-center gap-1">
            <Download size={14} /> Import from Mentor
          </button>
          <button onClick={() => setShowForm(!showForm)} className="text-sm bg-orange-600 hover:bg-orange-500 px-3 py-1.5 rounded-lg text-white transition flex items-center gap-1">
            <Plus size={14} /> New Project
          </button>
        </div>
      </div>
      {showImport && (
        <div className="bg-[#12121a] border border-violet-500/30 rounded-xl p-4 space-y-3">
          <div className="text-sm font-medium text-violet-400">Import from Founder Project</div>
          <p className="text-xs text-gray-500">Select a project to preview mentor notes, then generate your pitch deck.</p>

          {/* Project list */}
          {!previewProject && (
            <>
              {founderProjects.length === 0 ? (
                <p className="text-xs text-gray-500">No founder projects found. Start a session in MentorForge and export it first.</p>
              ) : (
                <div className="space-y-2">
                  {founderProjects.filter(p => p.mentor_notes).map(fp => (
                    <button key={fp.id} onClick={() => setPreviewProject(fp)}
                      className="w-full text-left flex items-center justify-between bg-[#0a0a0f] border border-gray-800 rounded-lg p-3 hover:border-violet-500/40 transition">
                      <div>
                        <div className="text-sm text-white font-medium">{fp.title}</div>
                        <div className="text-xs text-gray-500">
                          Mentor: {fp.mentor_notes?.mentor_name || 'Unknown'} &middot; Stage: {fp.stage}
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-gray-600" />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Preview panel */}
          {previewProject && (
            <div className="space-y-4">
              <button onClick={() => setPreviewProject(null)} className="text-xs text-gray-400 hover:text-white flex items-center gap-1"><ArrowLeft size={12} /> Back to projects</button>

              <div className="bg-[#0a0a0f] border border-gray-800 rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-semibold text-white">{previewProject.title}</h3>

                {/* Mentor notes preview */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider">Topic / Description</label>
                    <div className="text-sm text-gray-300 mt-1 bg-[#12121a] rounded p-2 border border-gray-800">{previewProject.mentor_notes?.topic || previewProject.title}</div>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider">Mentor</label>
                    <div className="text-sm text-gray-300 mt-1 bg-[#12121a] rounded p-2 border border-gray-800">{previewProject.mentor_notes?.mentor_name || 'Unknown'}</div>
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider">Key Feedback</label>
                    <div className="text-sm text-gray-300 mt-1 bg-[#12121a] rounded p-2 border border-gray-800 max-h-24 overflow-y-auto">{previewProject.mentor_notes?.key_feedback || 'No feedback captured'}</div>
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider">Summary</label>
                    <div className="text-sm text-gray-300 mt-1 bg-[#12121a] rounded p-2 border border-gray-800">{previewProject.mentor_notes?.summary || 'No summary'}</div>
                  </div>
                </div>

                {/* Template picker */}
                <div>
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider">Deck Template</label>
                  <div className="flex gap-2 mt-1">
                    {['clean', 'investor', 'growth', 'product'].map(t => (
                      <button key={t} onClick={() => setPreviewTemplate(t)}
                        className={`text-xs px-3 py-1.5 rounded-lg transition capitalize ${previewTemplate === t ? 'bg-orange-600 text-white' : 'bg-[#12121a] border border-gray-800 text-gray-400 hover:text-white hover:border-orange-500/30'}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Generate button */}
                <div className="flex items-center justify-between pt-2 border-t border-gray-800">
                  <p className="text-xs text-gray-500">AI will generate a 10-slide deck from these notes using the {previewTemplate} template.</p>
                  <button onClick={() => { onImportFromProject(previewProject.id, previewTemplate); setShowImport(false); setPreviewProject(null) }}
                    disabled={loading}
                    className="bg-orange-600 hover:bg-orange-500 disabled:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5">
                    <Sparkles size={14} /> {loading ? 'Generating Deck...' : 'Generate Deck'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
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
  const [form, setForm] = useState({ company_description: '', problem: '', solution: '', traction: '', team: '', raise_amount: '', audience: 'seed', target_market: '', business_model: '' })

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
            { key: 'target_market', label: 'Target Market', type: 'textarea', placeholder: 'Who are your customers? Market size?' },
            { key: 'business_model', label: 'Business Model', type: 'textarea', placeholder: 'How do you make money? Pricing, revenue streams' },
            { key: 'traction', label: 'Traction', type: 'textarea', placeholder: 'Key metrics: users, revenue, growth rate' },
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

function DeckViewPage({ deck, onBack, onRegenerateSlide, onUpdateSlide, onAddBonusSlide, onFinalize }: {
  deck: Deck; onBack: () => void
  onRegenerateSlide: (deckId: string, slideIndex: number, instruction?: string) => Promise<Slide | null>
  onUpdateSlide: (deckId: string, slideIndex: number, updates: Partial<Slide>) => Promise<boolean>
  onAddBonusSlide: (deckId: string, slideType: string) => Promise<{ slide: Slide; index: number } | null>
  onFinalize: (deckId: string) => Promise<string | false>
}) {
  const [currentSlide, setCurrentSlide] = useState(0)
  const [activeTab, setActiveTab] = useState<'slides' | 'tldr' | 'script'>('slides')
  const [regenerating, setRegenerating] = useState(false)
  const [regenInstruction, setRegenInstruction] = useState('')
  const [showRegenInput, setShowRegenInput] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editBullets, setEditBullets] = useState<string[]>([])
  const [editNotes, setEditNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [addingBonus, setAddingBonus] = useState<string | null>(null)
  const [finalizing, setFinalizing] = useState(false)
  const [shareToken, setShareToken] = useState<string | null>(null)
  const [showShareToast, setShowShareToast] = useState(false)

  const slide = deck.slides[currentSlide]
  const isFinal = deck.status === 'final'

  function startEditing() {
    setEditTitle(slide.title)
    setEditBullets([...slide.bullets])
    setEditNotes(slide.notes || '')
    setEditing(true)
  }

  async function saveEdit() {
    setSaving(true)
    await onUpdateSlide(deck.id, currentSlide, { title: editTitle, bullets: editBullets, notes: editNotes })
    setSaving(false)
    setEditing(false)
  }

  async function handleRegenerate() {
    setRegenerating(true)
    await onRegenerateSlide(deck.id, currentSlide, regenInstruction)
    setRegenerating(false)
    setShowRegenInput(false)
    setRegenInstruction('')
  }

  async function handleFinalize() {
    setFinalizing(true)
    const token = await onFinalize(deck.id)
    if (token) setShareToken(token as string)
    setFinalizing(false)
  }

  function copyShareLink() {
    const link = shareToken
      ? `${window.location.origin}?share=${shareToken}`
      : `${window.location.origin}?deck=${deck.id}`
    navigator.clipboard.writeText(link)
    setShowShareToast(true)
    setTimeout(() => setShowShareToast(false), 2000)
  }

  async function handleAddBonus(slideType: string) {
    setAddingBonus(slideType)
    const result = await onAddBonusSlide(deck.id, slideType)
    if (result) setCurrentSlide(result.index)
    setAddingBonus(null)
  }

  async function exportPDF() {
    setExporting(true)
    try {
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [960, 540] })
      const slides = deck.slides

      for (let i = 0; i < slides.length; i++) {
        if (i > 0) pdf.addPage([960, 540], 'landscape')
        const s = slides[i]

        // Dark background
        pdf.setFillColor(18, 18, 26)
        pdf.rect(0, 0, 960, 540, 'F')

        // Slide number
        pdf.setTextColor(234, 88, 12)
        pdf.setFontSize(10)
        pdf.text(`Slide ${i + 1} of ${slides.length}`, 48, 40)

        // Title
        pdf.setTextColor(255, 255, 255)
        pdf.setFontSize(28)
        pdf.text(s.title || '', 48, 80)

        // Bullets — readable size, use continuation pages for overflow
        pdf.setTextColor(209, 213, 219)
        const bullets = s.bullets || []
        const fontSize = bullets.length > 6 ? 11 : 12
        const lineHeight = fontSize * 1.5
        const wrapWidth = 800
        pdf.setFontSize(fontSize)
        let y = 110
        for (const bullet of bullets) {
          if (y > 470) {
            // Overflow: add continuation page
            pdf.addPage([960, 540], 'landscape')
            pdf.setFillColor(18, 18, 26)
            pdf.rect(0, 0, 960, 540, 'F')
            pdf.setTextColor(234, 88, 12)
            pdf.setFontSize(10)
            pdf.text(`${s.title} (continued)`, 48, 40)
            pdf.setTextColor(209, 213, 219)
            pdf.setFontSize(fontSize)
            y = 65
          }
          // Clean special chars that cause wide-spacing in jsPDF
          const clean = bullet.replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ')

          // Q&A formatting: split "Q: ... -> A: ..." or "Q: ... A: ..." into separate lines
          const qaMatch = clean.match(/^(Q:\s*.+?)[\s]*(?:->|-->|—)\s*(A[:.]\s*.+)$/i)
            || clean.match(/^(Q:\s*.+?)\s+(A[:.]\s*.+)$/i)
          if (qaMatch) {
            // Render question in white, answer in gray
            const qLines = pdf.splitTextToSize(qaMatch[1].trim(), wrapWidth - 20)
            pdf.setTextColor(255, 255, 255)
            pdf.text(qLines, 58, y)
            y += qLines.length * lineHeight + 2
            const aLines = pdf.splitTextToSize(qaMatch[2].trim(), wrapWidth - 20)
            pdf.setTextColor(180, 180, 195)
            pdf.text(aLines, 58, y)
            y += aLines.length * lineHeight + 10
            pdf.setTextColor(209, 213, 219)
          } else {
            const lines = pdf.splitTextToSize(`  •  ${clean}`, wrapWidth)
            pdf.text(lines, 48, y)
            y += lines.length * lineHeight + 6
          }
        }

        // Speaker notes inline (bottom of slide, subtle)
        if (s.notes && y < 480) {
          pdf.setDrawColor(60, 60, 80)
          pdf.line(48, y + 8, 912, y + 8)
          pdf.setTextColor(120, 120, 140)
          pdf.setFontSize(9)
          pdf.text('Speaker Notes:', 48, y + 20)
          const noteLines = pdf.splitTextToSize(s.notes, 860)
          pdf.text(noteLines.slice(0, 3), 48, y + 32)
        }
      }

      // TL;DR page
      if (deck.tl_dr) {
        pdf.addPage([960, 540], 'landscape')
        pdf.setFillColor(18, 18, 26)
        pdf.rect(0, 0, 960, 540, 'F')
        pdf.setTextColor(234, 88, 12)
        pdf.setFontSize(22)
        pdf.text('Executive Summary', 48, 60)
        pdf.setTextColor(209, 213, 219)
        pdf.setFontSize(13)
        const tldrLines = pdf.splitTextToSize(deck.tl_dr, 860)
        pdf.text(tldrLines, 48, 100)
      }

      // Script page
      if (deck.script) {
        pdf.addPage([960, 540], 'landscape')
        pdf.setFillColor(18, 18, 26)
        pdf.rect(0, 0, 960, 540, 'F')
        pdf.setTextColor(234, 88, 12)
        pdf.setFontSize(22)
        pdf.text('90-Second Pitch Script', 48, 60)
        pdf.setTextColor(209, 213, 219)
        pdf.setFontSize(13)
        const scriptLines = pdf.splitTextToSize(deck.script, 860)
        pdf.text(scriptLines, 48, 100)
      }

      pdf.save(`${deck.title || 'pitch-deck'}.pdf`)
    } finally {
      setExporting(false)
    }
  }

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
          <button onClick={exportPDF} disabled={exporting}
            className="text-xs px-3 py-1.5 rounded-lg bg-green-600/20 border border-green-500/30 text-green-400 hover:bg-green-600/30 transition flex items-center gap-1 disabled:opacity-50">
            {exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            {exporting ? 'Exporting...' : 'Export PDF'}
          </button>
          <button onClick={copyShareLink}
            className="text-xs px-3 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-400 hover:bg-blue-600/30 transition flex items-center gap-1">
            <Share2 size={12} /> {showShareToast ? 'Copied!' : 'Share Link'}
          </button>
          {!isFinal && (
            <button onClick={handleFinalize} disabled={finalizing}
              className="text-xs px-3 py-1.5 rounded-lg bg-orange-600 text-white hover:bg-orange-500 transition flex items-center gap-1 disabled:opacity-50">
              {finalizing ? <Loader2 size={12} className="animate-spin" /> : <Lock size={12} />}
              {finalizing ? 'Finalizing...' : 'Finalize'}
            </button>
          )}
          {isFinal && (
            <span className="text-xs px-3 py-1.5 rounded-lg bg-green-600/20 border border-green-500/30 text-green-400 flex items-center gap-1">
              <Check size={12} /> Finalized
            </span>
          )}
        </div>
      </div>

      <h1 className="text-2xl font-bold text-white">{deck.title}</h1>

      {activeTab === 'slides' && slide && (
        <div className="space-y-4">
          {/* Slide display */}
          <div className="bg-[#12121a] border border-gray-800 rounded-xl p-8 min-h-[400px] flex flex-col justify-center">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-orange-400">Slide {currentSlide + 1} of {deck.slides.length}</div>
              <div className="flex gap-1">
                {!editing && (
                  <>
                    <button onClick={startEditing} className="text-xs px-2 py-1 text-gray-500 hover:text-white transition flex items-center gap-1">
                      <Pencil size={12} /> Edit
                    </button>
                    <button onClick={() => setShowRegenInput(!showRegenInput)} className="text-xs px-2 py-1 text-gray-500 hover:text-orange-400 transition flex items-center gap-1">
                      <RefreshCw size={12} /> Regenerate
                    </button>
                    <button onClick={async () => {
                      if (!confirm('Delete this slide?')) return
                      const r = await fetch(`${API}/decks/${deck.id}/slides/${currentSlide}`, {
                        method: 'DELETE', headers: { 'Authorization': `Bearer ${localStorage.getItem('pdf_token')}` }
                      })
                      if (r.ok) {
                        await r.json()
                        deck.slides = deck.slides.filter((_: Slide, i: number) => i !== currentSlide)
                        setCurrentSlide(Math.min(currentSlide, deck.slides.length - 1))
                      }
                    }} className="text-xs px-2 py-1 text-gray-500 hover:text-red-400 transition flex items-center gap-1">
                      <X size={12} /> Delete
                    </button>
                  </>
                )}
              </div>
            </div>

            {editing ? (
              <div className="space-y-4">
                <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)}
                  className="w-full text-3xl font-bold bg-[#0a0a0f] border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-orange-500" />
                <div className="space-y-2">
                  {editBullets.map((b, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <span className="w-2 h-2 bg-orange-500 rounded-full mt-3 shrink-0" />
                      <input type="text" value={b} onChange={e => { const nb = [...editBullets]; nb[i] = e.target.value; setEditBullets(nb) }}
                        className="flex-1 bg-[#0a0a0f] border border-gray-700 rounded-lg px-3 py-1.5 text-gray-300 text-lg focus:outline-none focus:border-orange-500" />
                      <button onClick={() => setEditBullets(editBullets.filter((_, j) => j !== i))} className="text-gray-600 hover:text-red-400 mt-1"><X size={14} /></button>
                    </div>
                  ))}
                  <button onClick={() => setEditBullets([...editBullets, ''])} className="text-xs text-gray-500 hover:text-orange-400 flex items-center gap-1"><Plus size={12} /> Add bullet</button>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Speaker Notes</div>
                  <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={3}
                    className="w-full bg-[#0a0a0f] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-400 focus:outline-none focus:border-orange-500 resize-y" />
                </div>
                <div className="flex gap-2">
                  <button onClick={saveEdit} disabled={saving}
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-sm transition flex items-center gap-1 disabled:opacity-50">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
                  </button>
                  <button onClick={() => setEditing(false)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm transition flex items-center gap-1">
                    <X size={14} /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h2 className="text-3xl font-bold text-white mb-6">{slide.title}</h2>
                <ul className="space-y-3">
                  {slide.bullets?.map((b, i) => (
                    <li key={i} className="text-lg text-gray-300 flex items-start gap-3">
                      <span className="w-2 h-2 bg-orange-500 rounded-full mt-2.5 shrink-0" />
                      {b}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {/* Regenerate input */}
          {showRegenInput && !editing && (
            <div className="bg-[#0a0a0f] border border-orange-500/30 rounded-lg p-4 flex gap-2">
              <input type="text" value={regenInstruction} onChange={e => setRegenInstruction(e.target.value)}
                placeholder="Optional: specific instructions (e.g. 'make it more data-driven')"
                className="flex-1 px-3 py-2 bg-[#12121a] border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-orange-500"
                onKeyDown={e => e.key === 'Enter' && handleRegenerate()} />
              <button onClick={handleRegenerate} disabled={regenerating}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-sm transition flex items-center gap-1 disabled:opacity-50">
                {regenerating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {regenerating ? 'Regenerating...' : 'Go'}
              </button>
            </div>
          )}

          {/* Speaker notes */}
          {!editing && slide.notes && (
            <div className="bg-[#0a0a0f] border border-gray-800 rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">Speaker Notes</div>
              <p className="text-sm text-gray-400">{slide.notes}</p>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button onClick={() => { setCurrentSlide(Math.max(0, currentSlide - 1)); setEditing(false); setShowRegenInput(false) }} disabled={currentSlide === 0}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-white rounded-lg transition flex items-center gap-1">
              <ChevronLeft size={16} /> Previous
            </button>
            <div className="flex gap-1">
              {deck.slides.map((_, i) => (
                <button key={i} onClick={() => { setCurrentSlide(i); setEditing(false); setShowRegenInput(false) }}
                  className={`w-2.5 h-2.5 rounded-full transition ${i === currentSlide ? 'bg-orange-500' : 'bg-gray-700 hover:bg-gray-600'}`} />
              ))}
            </div>
            <button onClick={() => { setCurrentSlide(Math.min(deck.slides.length - 1, currentSlide + 1)); setEditing(false); setShowRegenInput(false) }} disabled={currentSlide === deck.slides.length - 1}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-white rounded-lg transition flex items-center gap-1">
              Next <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Bonus Slides Panel */}
      {activeTab === 'slides' && (
        <div className="bg-[#12121a] border border-gray-800 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-3 font-medium uppercase tracking-wide">Add AI-Powered Slides</div>
          <div className="flex flex-wrap gap-2">
            {[
              { type: 'market_context', label: 'Market Context', desc: 'TAM, trends, timing signals', color: 'blue' },
              { type: 'vc_objections', label: 'Investor Q&A', desc: 'Top VC objections & rebuttals', color: 'amber' },
              { type: 'competitive_landscape', label: 'Competitive Landscape', desc: 'Competitors & positioning', color: 'purple' },
            ].map(bonus => (
              <button key={bonus.type} onClick={() => handleAddBonus(bonus.type)} disabled={addingBonus !== null}
                className={`flex-1 min-w-[180px] text-left px-4 py-3 rounded-lg border transition
                  ${bonus.color === 'blue' ? 'bg-blue-600/10 border-blue-500/20 hover:bg-blue-600/20' : ''}
                  ${bonus.color === 'amber' ? 'bg-amber-600/10 border-amber-500/20 hover:bg-amber-600/20' : ''}
                  ${bonus.color === 'purple' ? 'bg-purple-600/10 border-purple-500/20 hover:bg-purple-600/20' : ''}
                  disabled:opacity-50`}>
                <div className="flex items-center gap-2 mb-1">
                  {addingBonus === bonus.type ? <Loader2 size={14} className="animate-spin text-white" /> : <Plus size={14} className={
                    bonus.color === 'blue' ? 'text-blue-400' : bonus.color === 'amber' ? 'text-amber-400' : 'text-purple-400'
                  } />}
                  <span className="text-sm font-medium text-white">{bonus.label}</span>
                </div>
                <div className="text-xs text-gray-500">{addingBonus === bonus.type ? 'Generating...' : bonus.desc}</div>
              </button>
            ))}
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

// ── Pricing ──────────────────────────────────────────────────────────────

function PricingPage({ onNavigate }: { onNavigate: (v: View) => void }) {
  const plans = [
    {
      name: 'Starter',
      price: 'Free',
      period: '',
      desc: 'Try it out — 2 decks, basic templates',
      features: ['2 pitch decks', '10 slides per deck', '4 templates', 'PDF export', 'TL;DR + pitch script'],
      cta: 'Get Started',
      color: 'gray',
      popular: false,
    },
    {
      name: 'Pro',
      price: '$29',
      period: '/mo',
      desc: 'For founders actively raising',
      features: ['Unlimited decks', 'All templates', 'Bonus slides (Market, VC Q&A, Competitive)', 'Per-slide regeneration', 'Inline editing', 'Share links', 'Priority generation'],
      cta: 'Subscribe — $29/mo',
      color: 'orange',
      popular: true,
      plan: 'pro_monthly',
    },
    {
      name: 'Team',
      price: '$79',
      period: '/mo',
      desc: 'For accelerators & fundraising teams',
      features: ['Everything in Pro', 'Up to 5 team members', 'Shared deck library', 'Expert review requests', 'Custom branding', 'Analytics dashboard', 'API access'],
      cta: 'Subscribe — $79/mo',
      color: 'purple',
      popular: false,
      plan: 'team_monthly',
    },
  ]

  return (
    <div className="space-y-12 py-8">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-white">Simple Pricing</h1>
        <p className="text-lg text-gray-400 max-w-xl mx-auto">Start free. Upgrade when you're ready to raise.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
        {plans.map(plan => (
          <div key={plan.name} className={`relative bg-[#12121a] rounded-xl p-6 flex flex-col ${
            plan.popular ? 'border-2 border-orange-500 ring-1 ring-orange-500/20' : 'border border-gray-800'
          }`}>
            {plan.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-orange-600 text-white text-xs px-3 py-1 rounded-full flex items-center gap-1">
                <Star size={10} /> Most Popular
              </div>
            )}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                {plan.color === 'gray' && <Zap size={16} className="text-gray-400" />}
                {plan.color === 'orange' && <CreditCard size={16} className="text-orange-400" />}
                {plan.color === 'purple' && <Users size={16} className="text-purple-400" />}
                {plan.name}
              </h3>
              <div className="mt-2">
                <span className="text-3xl font-bold text-white">{plan.price}</span>
                {plan.period && <span className="text-gray-500 text-sm">{plan.period}</span>}
              </div>
              <p className="text-sm text-gray-400 mt-2">{plan.desc}</p>
            </div>

            <ul className="space-y-2 mb-6 flex-1">
              {plan.features.map(f => (
                <li key={f} className="text-sm text-gray-300 flex items-start gap-2">
                  <Check size={14} className={`mt-0.5 shrink-0 ${
                    plan.color === 'orange' ? 'text-orange-400' : plan.color === 'purple' ? 'text-purple-400' : 'text-gray-500'
                  }`} />
                  {f}
                </li>
              ))}
            </ul>

            <button
              onClick={async () => {
                if (plan.name === 'Starter') { onNavigate('projects'); return }
                const token = localStorage.getItem('pdf_token')
                if (!token) { onNavigate('login'); return }
                try {
                  const r = await fetch(`${API.replace('/api', '')}/api/stripe/checkout`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ plan: (plan as any).plan }),
                  })
                  const data = await r.json()
                  if (data.url) window.location.href = data.url
                  else alert(data.detail || 'Failed to start checkout')
                } catch { alert('Checkout unavailable — please try again') }
              }}
              className={`w-full py-2.5 rounded-lg font-medium transition text-sm ${
                plan.name === 'Starter'
                  ? 'bg-gray-800 hover:bg-gray-700 text-white'
                  : plan.popular
                    ? 'bg-orange-600 hover:bg-orange-500 text-white'
                    : 'bg-purple-600 hover:bg-purple-500 text-white'
              }`}>
              {plan.cta}
            </button>
          </div>
        ))}
      </div>

      <div className="text-center text-sm text-gray-500">
        Payment integration coming soon. All features available during beta.
      </div>
    </div>
  )
}

// ── Auth ──────────────────────────────────────────────────────────────────

function AuthPage({ mode, onLogin, onRegister, onSwitch }: {
  mode: 'login' | 'register'; onLogin?: (e: string, p: string) => Promise<void>
  onRegister?: (e: string, p: string, n: string) => Promise<void>; onSwitch: () => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email"
            className="w-full px-3 py-2 bg-[#0a0a0f] border border-gray-800 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500" />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            className="w-full px-3 py-2 bg-[#0a0a0f] border border-gray-800 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500" />
          {error && <p className="text-sm text-red-400">{error}</p>}
          {/* Demo hint removed for production */}
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

// ── Brain bridge page ─────────────────────────────────────────────────────
// Proxies a freeform question to unified-donkey-betz's Personal Assistant
// (Rigby) via this app's POST /api/brain/ask endpoint.

function BrainPage({ token, onLogin }: { token: string | null; onLogin: () => void }) {
  const [message, setMessage] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [traceId, setTraceId] = useState<string | null>(null)
  const [latency, setLatency] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function ask() {
    if (!token) { onLogin(); return }
    if (!message.trim()) return
    setLoading(true); setAnswer(null); setError(null); setTraceId(null); setLatency(null)
    try {
      const r = await fetch(`${API}/brain/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message }),
      })
      const d = await r.json()
      if (!r.ok) {
        setError(typeof d.detail === 'string' ? d.detail : JSON.stringify(d.detail || d))
      } else {
        setAnswer(d.answer || '(no answer field returned)')
        setTraceId(d.trace_id || null)
        setLatency(d.latency_ms ?? null)
      }
    } catch (e: any) {
      setError(e.message || 'request failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-2">Brain</h1>
      <p className="text-gray-400 mb-6">
        Ask Rigby (the u-d-b Personal Assistant) anything. PitchDeckForge proxies your question
        through the fleet brain bridge and returns her deliberated response.
      </p>
      {!token && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-900/30 border border-yellow-700/50 text-yellow-200 text-sm">
          Sign in first — the bridge requires an authenticated session.
        </div>
      )}
      <textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        placeholder="Ask anything — Rigby has u-d-b's full agent network behind her."
        className="w-full h-32 px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 resize-none focus:border-orange-500 focus:outline-none"
      />
      <button
        onClick={ask}
        disabled={loading || !message.trim()}
        className="mt-3 px-5 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-white font-medium transition flex items-center gap-2"
      >
        <Send size={16} />
        {loading ? 'Thinking...' : 'Ask Rigby'}
      </button>
      {error && (
        <div className="mt-6 p-4 rounded-lg bg-red-900/30 border border-red-700/50 text-red-200 text-sm whitespace-pre-wrap">
          <div className="font-medium text-red-300 mb-1">Brain unreachable</div>
          {error}
        </div>
      )}
      {answer && (
        <div className="mt-6">
          <div className="p-4 rounded-lg bg-gray-900 border border-gray-800 text-gray-100 whitespace-pre-wrap">{answer}</div>
          {(traceId || latency !== null) && (
            <div className="mt-2 text-xs text-gray-500 flex gap-4">
              {traceId && <span>trace: {traceId}</span>}
              {latency !== null && <span>latency: {latency}ms</span>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
