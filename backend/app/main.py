"""PitchDeckForge — FastAPI Backend"""

import os
from dotenv import load_dotenv
load_dotenv()
import json
from datetime import datetime, timezone
from typing import Optional
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import sessionmaker, joinedload
from openai import OpenAI

from app.models import User, Project, Brief, Deck, AnalyticsEvent, init_db, get_engine
from app.auth import hash_password, verify_password, create_token, decode_token

AI_MODEL = os.getenv("AI_MODEL", "gpt-5-mini")

def get_openai_client():
    """Lazy-load OpenAI client so deploy doesn't fail without API key."""
    return OpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))

app = FastAPI(title="PitchDeckForge", version="1.0.0")
_origins_env = os.getenv("ALLOWED_ORIGINS", "")
ALLOWED_ORIGINS = [o.strip() for o in _origins_env.split(",") if o.strip()] if _origins_env else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./pitchdeckforge.db")
# Render PostgreSQL URLs use postgres:// but SQLAlchemy needs postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
engine = get_engine(DATABASE_URL)
init_db(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)


# ── Schemas ────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: str; password: str; name: str

class LoginRequest(BaseModel):
    email: str; password: str

class ProjectCreate(BaseModel):
    name: str; industry: str = ""; stage: str = "seed"

class BriefCreate(BaseModel):
    company_description: str
    problem: str = ""; solution: str = ""; traction: str = ""
    team: str = ""; raise_amount: str = ""; audience: str = "seed"

class GenerateDeckRequest(BaseModel):
    template: str = "clean"

class RegenerateSlideRequest(BaseModel):
    slide_index: int
    instruction: str = ""

class UpdateSlideRequest(BaseModel):
    slide_index: int
    title: Optional[str] = None
    bullets: Optional[list[str]] = None
    notes: Optional[str] = None

class BonusSlideRequest(BaseModel):
    slide_type: str  # "market_context", "vc_objections", "competitive_landscape"


# ── Health ─────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "healthy", "service": "PitchDeckForge"}


def _track(event_type: str, user_id: str = None, resource_id: str = None, metadata: dict = None):
    db = SessionLocal()
    try:
        evt = AnalyticsEvent(event_type=event_type, user_id=user_id, resource_id=resource_id, metadata_=metadata or {})
        db.add(evt); db.commit()
    except Exception:
        pass
    finally:
        db.close()


@app.get("/api/events")
def list_events(event_type: Optional[str] = None, limit: int = 100, payload: dict = Depends(decode_token)):
    db = SessionLocal()
    try:
        q = db.query(AnalyticsEvent).order_by(AnalyticsEvent.created_at.desc())
        if event_type:
            q = q.filter(AnalyticsEvent.event_type == event_type)
        events = q.limit(limit).all()
        return {"events": [
            {"id": e.id, "event_type": e.event_type, "user_id": e.user_id,
             "resource_id": e.resource_id, "metadata": e.metadata_, "created_at": e.created_at.isoformat()}
            for e in events
        ]}
    finally:
        db.close()


@app.get("/api/events/summary")
def events_summary(payload: dict = Depends(decode_token)):
    db = SessionLocal()
    try:
        from collections import Counter
        events = db.query(AnalyticsEvent.event_type).all()
        counts = Counter(e[0] for e in events)
        return {"total_events": sum(counts.values()), "by_type": dict(counts)}
    finally:
        db.close()


# ── Auth ───────────────────────────────────────────────────────────────────

@app.post("/api/auth/register")
def register(req: RegisterRequest):
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == req.email).first()
        if existing:
            # Update password hash (handles secret key migration)
            existing.password_hash = hash_password(req.password)
            existing.name = req.name
            db.commit()
            return {"token": create_token(existing.id, existing.email), "user": {"id": existing.id, "email": existing.email, "name": existing.name}}
        user = User(email=req.email, name=req.name, password_hash=hash_password(req.password))
        db.add(user); db.commit(); db.refresh(user)
        return {"token": create_token(user.id, user.email), "user": {"id": user.id, "email": user.email, "name": user.name}}
    finally:
        db.close()


@app.post("/api/auth/login")
def login(req: LoginRequest):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == req.email).first()
        if not user or not verify_password(req.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        return {"token": create_token(user.id, user.email), "user": {"id": user.id, "email": user.email, "name": user.name}}
    finally:
        db.close()


@app.get("/api/users/me")
def get_me(payload: dict = Depends(decode_token)):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == payload["sub"]).first()
        if not user:
            raise HTTPException(status_code=404)
        return {"id": user.id, "email": user.email, "name": user.name}
    finally:
        db.close()


# ── Projects ──────────────────────────────────────────────────────────────

@app.post("/api/projects")
def create_project(data: ProjectCreate, payload: dict = Depends(decode_token)):
    db = SessionLocal()
    try:
        project = Project(user_id=payload["sub"], name=data.name, industry=data.industry, stage=data.stage)
        db.add(project); db.commit(); db.refresh(project)
        return _project_dict(project)
    finally:
        db.close()


@app.get("/api/projects")
def list_projects(payload: dict = Depends(decode_token)):
    db = SessionLocal()
    try:
        projects = db.query(Project).filter(Project.user_id == payload["sub"]).order_by(Project.created_at.desc()).all()
        return {"projects": [_project_dict(p) for p in projects]}
    finally:
        db.close()


@app.get("/api/projects/{project_id}")
def get_project(project_id: str, payload: dict = Depends(decode_token)):
    db = SessionLocal()
    try:
        project = (
            db.query(Project)
            .options(joinedload(Project.briefs).joinedload(Brief.decks))
            .filter(Project.id == project_id, Project.user_id == payload["sub"])
            .first()
        )
        if not project:
            raise HTTPException(status_code=404)
        result = _project_dict(project)
        result["briefs"] = [
            {**_brief_dict(b), "decks": [_deck_dict(d) for d in b.decks]}
            for b in project.briefs
        ]
        return result
    finally:
        db.close()


# ── Briefs ────────────────────────────────────────────────────────────────

@app.post("/api/projects/{project_id}/briefs")
def create_brief(project_id: str, data: BriefCreate, payload: dict = Depends(decode_token)):
    db = SessionLocal()
    try:
        project = db.query(Project).filter(Project.id == project_id, Project.user_id == payload["sub"]).first()
        if not project:
            raise HTTPException(status_code=404)
        brief = Brief(
            project_id=project_id,
            company_description=data.company_description, problem=data.problem,
            solution=data.solution, traction=data.traction, team=data.team,
            raise_amount=data.raise_amount, audience=data.audience,
        )
        db.add(brief); db.commit(); db.refresh(brief)
        return _brief_dict(brief)
    finally:
        db.close()


# ── Deck Generation ───────────────────────────────────────────────────────

@app.post("/api/briefs/{brief_id}/generate")
def generate_deck(brief_id: str, data: GenerateDeckRequest, payload: dict = Depends(decode_token)):
    db = SessionLocal()
    try:
        brief = (
            db.query(Brief)
            .options(joinedload(Brief.project))
            .filter(Brief.id == brief_id)
            .first()
        )
        if not brief or brief.project.user_id != payload["sub"]:
            raise HTTPException(status_code=404)

        slides, tl_dr, script = _generate_deck_content(brief, data.template)

        deck = Deck(
            brief_id=brief.id,
            title=f"{brief.project.name} — Pitch Deck",
            template=data.template,
            slides=slides,
            tl_dr=tl_dr,
            script=script,
        )
        db.add(deck); db.commit(); db.refresh(deck)
        _track("deck_generated", payload["sub"], deck.id, {"template": data.template, "slide_count": len(slides)})
        return _deck_dict(deck)
    finally:
        db.close()


@app.get("/api/decks/{deck_id}")
def get_deck(deck_id: str, payload: dict = Depends(decode_token)):
    db = SessionLocal()
    try:
        deck = (
            db.query(Deck)
            .options(joinedload(Deck.brief).joinedload(Brief.project))
            .filter(Deck.id == deck_id)
            .first()
        )
        if not deck or deck.brief.project.user_id != payload["sub"]:
            raise HTTPException(status_code=404)
        return _deck_dict(deck)
    finally:
        db.close()


@app.post("/api/decks/{deck_id}/regenerate-slide")
def regenerate_slide(deck_id: str, data: RegenerateSlideRequest, payload: dict = Depends(decode_token)):
    db = SessionLocal()
    try:
        deck = (
            db.query(Deck)
            .options(joinedload(Deck.brief).joinedload(Brief.project))
            .filter(Deck.id == deck_id)
            .first()
        )
        if not deck or deck.brief.project.user_id != payload["sub"]:
            raise HTTPException(status_code=404)
        if data.slide_index < 0 or data.slide_index >= len(deck.slides):
            raise HTTPException(status_code=400, detail="Invalid slide index")

        new_slide = _regenerate_single_slide(deck, data.slide_index, data.instruction)
        slides = list(deck.slides)
        slides[data.slide_index] = new_slide
        deck.slides = slides
        db.commit()
        _track("slide_regenerated", payload["sub"], deck_id, {"slide_index": data.slide_index})
        return {"slide": new_slide, "index": data.slide_index}
    finally:
        db.close()


# ── Slide Edit ────────────────────────────────────────────────────────────

@app.patch("/api/decks/{deck_id}/slides")
def update_slide(deck_id: str, data: UpdateSlideRequest, payload: dict = Depends(decode_token)):
    db = SessionLocal()
    try:
        deck = (
            db.query(Deck)
            .options(joinedload(Deck.brief).joinedload(Brief.project))
            .filter(Deck.id == deck_id)
            .first()
        )
        if not deck or deck.brief.project.user_id != payload["sub"]:
            raise HTTPException(status_code=404)
        if data.slide_index < 0 or data.slide_index >= len(deck.slides):
            raise HTTPException(status_code=400, detail="Invalid slide index")

        slides = list(deck.slides)
        slide = dict(slides[data.slide_index])
        if data.title is not None:
            slide["title"] = data.title
        if data.bullets is not None:
            slide["bullets"] = data.bullets
        if data.notes is not None:
            slide["notes"] = data.notes
        slides[data.slide_index] = slide
        deck.slides = slides
        db.commit()
        return {"slide": slide, "index": data.slide_index}
    finally:
        db.close()


# ── Finalize & Share ──────────────────────────────────────────────────────

@app.post("/api/decks/{deck_id}/finalize")
def finalize_deck(deck_id: str, payload: dict = Depends(decode_token)):
    db = SessionLocal()
    try:
        deck = (
            db.query(Deck)
            .options(joinedload(Deck.brief).joinedload(Brief.project))
            .filter(Deck.id == deck_id)
            .first()
        )
        if not deck or deck.brief.project.user_id != payload["sub"]:
            raise HTTPException(status_code=404)

        import secrets
        deck.status = "final"
        if not deck.share_token:
            deck.share_token = secrets.token_urlsafe(16)
        db.commit()
        _track("deck_finalized", payload["sub"], deck_id, {"share_token": deck.share_token})
        return {"status": "final", "share_token": deck.share_token}
    finally:
        db.close()


@app.get("/api/shared/{share_token}")
def get_shared_deck(share_token: str):
    """Public endpoint — no auth required"""
    db = SessionLocal()
    try:
        deck = db.query(Deck).filter(Deck.share_token == share_token, Deck.status == "final").first()
        if not deck:
            raise HTTPException(status_code=404, detail="Deck not found or not finalized")
        _track("deck_viewed_shared", resource_id=deck.id, metadata={"share_token": share_token})
        return {
            "title": deck.title, "template": deck.template,
            "slides": deck.slides or [], "tl_dr": deck.tl_dr, "script": deck.script,
            "slide_count": len(deck.slides or []),
        }
    finally:
        db.close()


# ── Bonus Slides ─────────────────────────────────────────────────────────

@app.post("/api/decks/{deck_id}/bonus-slide")
def add_bonus_slide(deck_id: str, data: BonusSlideRequest, payload: dict = Depends(decode_token)):
    db = SessionLocal()
    try:
        deck = (
            db.query(Deck)
            .options(joinedload(Deck.brief).joinedload(Brief.project))
            .filter(Deck.id == deck_id)
            .first()
        )
        if not deck or deck.brief.project.user_id != payload["sub"]:
            raise HTTPException(status_code=404)

        brief = deck.brief
        new_slide = _generate_bonus_slide(brief, deck, data.slide_type)

        slides = list(deck.slides)
        # Insert before the last slide (Thank You)
        insert_pos = max(len(slides) - 1, 0)
        slides.insert(insert_pos, new_slide)
        deck.slides = slides
        db.commit()
        _track("bonus_slide_added", payload["sub"], deck_id, {"slide_type": data.slide_type})
        return {"slide": new_slide, "index": insert_pos, "total_slides": len(slides)}
    finally:
        db.close()


@app.delete("/api/decks/{deck_id}/slides/{slide_index}")
def delete_slide(deck_id: str, slide_index: int, payload: dict = Depends(decode_token)):
    """Delete a slide by index from a deck."""
    db = SessionLocal()
    try:
        deck = (
            db.query(Deck)
            .options(joinedload(Deck.brief).joinedload(Brief.project))
            .filter(Deck.id == deck_id)
            .first()
        )
        if not deck or deck.brief.project.user_id != payload["sub"]:
            raise HTTPException(status_code=404)
        slides = list(deck.slides)
        if slide_index < 0 or slide_index >= len(slides):
            raise HTTPException(status_code=400, detail="Invalid slide index")
        removed = slides.pop(slide_index)
        deck.slides = slides
        db.commit()
        return {"removed": removed, "total_slides": len(slides)}
    finally:
        db.close()


@app.get("/api/stats")
def get_stats():
    db = SessionLocal()
    try:
        return {
            "total_users": db.query(User).count(),
            "total_projects": db.query(Project).count(),
            "total_decks": db.query(Deck).count(),
            "total_briefs": db.query(Brief).count(),
        }
    finally:
        db.close()


# ── AI Generation ─────────────────────────────────────────────────────────

SLIDE_STRUCTURE = [
    "Title Slide", "Problem", "Solution", "Market Opportunity",
    "Product / How It Works", "Traction & Metrics", "Business Model",
    "Team", "The Ask", "Thank You / Contact",
]

TEMPLATE_CONFIGS = {
    "clean": {
        "system": "You are a pitch deck consultant who creates clean, minimal decks. Use short sentences, strong whitespace, and let the data speak. Avoid jargon. Every bullet should be one crisp line.",
        "slide_guidance": "Keep bullets to 3 per slide max. Favor clarity over detail. Use numbers where possible.",
        "tone": "Professional, concise, modern",
    },
    "investor": {
        "system": "You are a pitch deck consultant specializing in institutional investor decks. Lead with market size, defensibility, and financial metrics. Investors scan decks in under 4 minutes — front-load the numbers.",
        "slide_guidance": "Emphasize TAM/SAM/SOM on market slide. Traction slide must lead with MRR/ARR/growth rate. Include unit economics if data exists. The Ask slide should specify use of funds breakdown.",
        "tone": "Data-driven, authoritative, financially rigorous",
    },
    "growth": {
        "system": "You are a pitch deck consultant who crafts compelling growth narratives. Build momentum slide by slide — start with the pain, escalate through traction proof points, and crescendo with the vision. Make the investor feel the trajectory.",
        "slide_guidance": "Use storytelling arc: hook → conflict → proof → vision. Traction slide should show a growth curve narrative (month-over-month or milestone progression). End with an ambitious but credible 3-year vision.",
        "tone": "Narrative-driven, ambitious, momentum-focused",
    },
    "product": {
        "system": "You are a pitch deck consultant for product-led companies. Lead with what the product does and why users love it. Screenshots and user quotes matter more than TAM charts. Show the product experience.",
        "slide_guidance": "Problem slide should include a real user scenario. Solution slide should describe the product experience step-by-step. Include a 'Why Now' slide about the technology or market shift enabling this product. Traction should emphasize user engagement metrics (DAU, retention, NPS).",
        "tone": "User-centric, demo-oriented, experience-focused",
    },
}


def _generate_deck_content(brief: Brief, template: str) -> tuple[list, str, str]:
    config = TEMPLATE_CONFIGS.get(template, TEMPLATE_CONFIGS["clean"])

    prompt = f"""Generate a pitch deck for this company.

Company: {brief.company_description}
Problem: {brief.problem or 'Not specified'}
Solution: {brief.solution or 'Not specified'}
Traction: {brief.traction or 'Not specified'}
Team: {brief.team or 'Not specified'}
Raise: {brief.raise_amount or 'Not specified'}
Audience: {brief.audience} investors
Tone: {config['tone']}

{config['slide_guidance']}

Generate exactly 10 slides. For each slide return:
- title: slide title
- bullets: array of 3-5 bullet points
- notes: speaker notes (2-3 sentences)

Also generate:
- tl_dr: A one-paragraph executive summary (4-5 sentences)
- script: A 90-second spoken pitch script

Return valid JSON with this structure:
{{"slides": [...], "tl_dr": "...", "script": "..."}}"""

    if not os.getenv("OPENAI_API_KEY"):
        return _dev_mode_deck(brief), _dev_mode_tldr(brief), _dev_mode_script(brief)

    try:
        response = get_openai_client().chat.completions.create(
            model=AI_MODEL,
            messages=[{"role": "system", "content": config["system"] + " Return only valid JSON."}, {"role": "user", "content": prompt}],
            max_completion_tokens=4000,
        )
        content = response.choices[0].message.content
        # Try to extract JSON
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]
        data = json.loads(content)
        return data.get("slides", []), data.get("tl_dr", ""), data.get("script", "")
    except Exception:
        return _dev_mode_deck(brief), _dev_mode_tldr(brief), _dev_mode_script(brief)


def _regenerate_single_slide(deck: Deck, index: int, instruction: str) -> dict:
    current = deck.slides[index]
    if not os.getenv("OPENAI_API_KEY"):
        return {**current, "notes": f"[Regenerated] {current.get('notes', '')}"}

    prompt = f"""Regenerate this pitch deck slide. Keep the same tone as the rest of the deck.

Current slide: {json.dumps(current)}
Deck context: {deck.title}
{f'Instruction: {instruction}' if instruction else ''}

Return valid JSON: {{"title": "...", "bullets": [...], "notes": "..."}}"""

    try:
        response = get_openai_client().chat.completions.create(
            model=AI_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_completion_tokens=500,
        )
        content = response.choices[0].message.content
        if "```" in content:
            content = content.split("```json")[-1].split("```")[0] if "```json" in content else content.split("```")[1].split("```")[0]
        return json.loads(content)
    except Exception:
        return {**current, "notes": f"[Regenerated] {current.get('notes', '')}"}


BONUS_SLIDE_PROMPTS = {
    "market_context": {
        "system": "You are a market research analyst who provides concise, data-backed market context for pitch decks. Focus on verifiable trends, market sizing, and timing signals.",
        "prompt": """Based on this company, generate a "Market Context" slide for their pitch deck.

Company: {company}
Industry: {industry}
Problem: {problem}
Solution: {solution}

Create a slide with:
- title: A compelling market context title (e.g. "Why Now: The $X Market Opportunity")
- bullets: 4-5 bullets covering: market size (TAM/SAM), key trends driving demand, regulatory or technology tailwinds, timing signals (why this moment matters)
- notes: Speaker notes explaining how to present this data confidently (2-3 sentences)

Return valid JSON: {{"title": "...", "bullets": [...], "notes": "..."}}""",
    },
    "vc_objections": {
        "system": "You are a veteran Series A VC partner who has seen 10,000+ pitch decks. You are direct, skeptical but fair, and focused on de-risking investments. Generate realistic objections and smart rebuttals.",
        "prompt": """Based on this pitch deck, generate an "Investor Q&A" slide with the top objections a VC would raise.

Company: {company}
Problem: {problem}
Solution: {solution}
Traction: {traction}
Raise: {raise_amount}
Stage: {stage}

Create a slide with:
- title: "Anticipated Investor Questions"
- bullets: 5 bullets, each formatted as "Q: [objection] → A: [rebuttal]"
- notes: Speaker notes on how to handle tough questions with confidence (2-3 sentences)

Return valid JSON: {{"title": "...", "bullets": [...], "notes": "..."}}""",
    },
    "competitive_landscape": {
        "system": "You are a competitive intelligence analyst. Provide clear, honest competitive positioning that acknowledges competitors while highlighting genuine differentiation.",
        "prompt": """Based on this company, generate a "Competitive Landscape" slide.

Company: {company}
Industry: {industry}
Problem: {problem}
Solution: {solution}

Create a slide with:
- title: "Competitive Landscape" or a more specific variant
- bullets: 5 bullets covering: 2-3 key competitors with their strengths and weaknesses, how this company is uniquely positioned, the key moat or defensibility angle, what would need to be true for this company to win
- notes: Speaker notes on presenting competitive analysis without badmouthing competitors (2-3 sentences)

Return valid JSON: {{"title": "...", "bullets": [...], "notes": "..."}}""",
    },
}


def _generate_bonus_slide(brief: Brief, deck: Deck, slide_type: str) -> dict:
    config = BONUS_SLIDE_PROMPTS.get(slide_type)
    if not config:
        return {"title": f"Bonus: {slide_type}", "bullets": ["Unknown slide type"], "notes": ""}

    if not os.getenv("OPENAI_API_KEY"):
        return {"title": f"[Dev Mode] {slide_type.replace('_', ' ').title()}", "bullets": [f"Bonus slide for {brief.project.name}", "Set OPENAI_API_KEY for real generation"], "notes": "Dev mode placeholder"}

    prompt = config["prompt"].format(
        company=brief.company_description,
        industry=brief.project.industry or "Not specified",
        problem=brief.problem or "Not specified",
        solution=brief.solution or "Not specified",
        traction=brief.traction or "Not specified",
        raise_amount=brief.raise_amount or "Not specified",
        stage=brief.project.stage or "seed",
    )

    try:
        response = get_openai_client().chat.completions.create(
            model=AI_MODEL,
            messages=[
                {"role": "system", "content": config["system"] + " Return only valid JSON."},
                {"role": "user", "content": prompt},
            ],
            max_completion_tokens=2000,
        )
        content = response.choices[0].message.content or ""
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]
        try:
            return json.loads(content.strip())
        except json.JSONDecodeError:
            # Fallback: extract what we can from the raw text
            lines = [l.strip() for l in content.strip().split("\n") if l.strip() and not l.strip().startswith("{") and not l.strip().startswith("}")]
            bullets = [l.lstrip("- ").lstrip("* ") for l in lines if len(l) > 10][:6]
            return {
                "title": f"{slide_type.replace('_', ' ').title()}",
                "bullets": bullets if bullets else ["AI-generated content — see speaker notes for details"],
                "notes": content[:500],
            }
    except Exception as e:
        print(f"[BONUS SLIDE ERROR] {slide_type}: {e}")
        return {"title": f"{slide_type.replace('_', ' ').title()}", "bullets": [f"Generation failed — try again ({type(e).__name__})"], "notes": ""}


def _dev_mode_deck(brief: Brief) -> list:
    return [
        {"title": s, "bullets": [f"Key point about {s.lower()} for {brief.project.name}", "Supporting detail with metrics", "Compelling evidence or story"], "notes": f"Spend 60-90 seconds on this slide. Emphasize the {s.lower()} angle."}
        for s in SLIDE_STRUCTURE
    ]


def _dev_mode_tldr(brief: Brief) -> str:
    return f"[Dev Mode] {brief.project.name} is solving {brief.problem or 'a key problem'} with {brief.solution or 'an innovative solution'}. Set OPENAI_API_KEY for real generation."


def _dev_mode_script(brief: Brief) -> str:
    return f"[Dev Mode] Hi, I'm from {brief.project.name}. We're raising {brief.raise_amount or '$X'} to {brief.solution or 'solve this problem'}. Set OPENAI_API_KEY for real generation."


# ── Serializers ───────────────────────────────────────────────────────────

def _project_dict(p: Project) -> dict:
    return {"id": p.id, "name": p.name, "industry": p.industry, "stage": p.stage, "created_at": p.created_at.isoformat() if p.created_at else None}

def _brief_dict(b: Brief) -> dict:
    return {"id": b.id, "project_id": b.project_id, "company_description": b.company_description[:100], "audience": b.audience, "raise_amount": b.raise_amount, "created_at": b.created_at.isoformat() if b.created_at else None}

def _deck_dict(d: Deck) -> dict:
    return {"id": d.id, "brief_id": d.brief_id, "title": d.title, "template": d.template, "slides": d.slides or [], "tl_dr": d.tl_dr, "script": d.script, "status": d.status, "share_token": d.share_token, "slide_count": len(d.slides or []), "created_at": d.created_at.isoformat() if d.created_at else None}
