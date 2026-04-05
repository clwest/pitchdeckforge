"""PitchDeckForge — FastAPI Backend"""

import os
import json
from datetime import datetime, timezone
from typing import Optional
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import sessionmaker, joinedload
from openai import OpenAI

from app.models import User, Project, Brief, Deck, init_db, get_engine
from app.auth import hash_password, verify_password, create_token, decode_token

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))
AI_MODEL = os.getenv("AI_MODEL", "gpt-4o-mini")

app = FastAPI(title="PitchDeckForge", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5176", "http://localhost:3000", "http://127.0.0.1:5176"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

DATABASE_URL = "sqlite:///./pitchdeckforge.db"
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


# ── Health ─────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "healthy", "service": "PitchDeckForge"}


# ── Auth ───────────────────────────────────────────────────────────────────

@app.post("/api/auth/register")
def register(req: RegisterRequest):
    db = SessionLocal()
    try:
        if db.query(User).filter(User.email == req.email).first():
            raise HTTPException(status_code=400, detail="Email already registered")
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
        return {"slide": new_slide, "index": data.slide_index}
    finally:
        db.close()


# ── Stats ─────────────────────────────────────────────────────────────────

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


def _generate_deck_content(brief: Brief, template: str) -> tuple[list, str, str]:
    prompt = f"""Generate a pitch deck for this company.

Company: {brief.company_description}
Problem: {brief.problem or 'Not specified'}
Solution: {brief.solution or 'Not specified'}
Traction: {brief.traction or 'Not specified'}
Team: {brief.team or 'Not specified'}
Raise: {brief.raise_amount or 'Not specified'}
Audience: {brief.audience} investors
Template style: {template}

Generate exactly 10 slides. For each slide return:
- title: slide title
- bullets: array of 3-5 bullet points
- notes: speaker notes (2-3 sentences)

Also generate:
- tl_dr: A one-paragraph executive summary (4-5 sentences)
- script: A 90-second spoken pitch script

Return valid JSON with this structure:
{{"slides": [...], "tl_dr": "...", "script": "..."}}"""

    if not client.api_key:
        return _dev_mode_deck(brief), _dev_mode_tldr(brief), _dev_mode_script(brief)

    try:
        response = client.chat.completions.create(
            model=AI_MODEL,
            messages=[{"role": "system", "content": "You are an expert pitch deck consultant. Return only valid JSON."}, {"role": "user", "content": prompt}],
            max_tokens=4000,
            temperature=0.7,
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
    if not client.api_key:
        return {**current, "notes": f"[Regenerated] {current.get('notes', '')}"}

    prompt = f"""Regenerate this pitch deck slide. Keep the same tone as the rest of the deck.

Current slide: {json.dumps(current)}
Deck context: {deck.title}
{f'Instruction: {instruction}' if instruction else ''}

Return valid JSON: {{"title": "...", "bullets": [...], "notes": "..."}}"""

    try:
        response = client.chat.completions.create(
            model=AI_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=500,
        )
        content = response.choices[0].message.content
        if "```" in content:
            content = content.split("```json")[-1].split("```")[0] if "```json" in content else content.split("```")[1].split("```")[0]
        return json.loads(content)
    except Exception:
        return {**current, "notes": f"[Regenerated] {current.get('notes', '')}"}


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
    return {"id": d.id, "brief_id": d.brief_id, "title": d.title, "template": d.template, "slides": d.slides or [], "tl_dr": d.tl_dr, "script": d.script, "status": d.status, "slide_count": len(d.slides or []), "created_at": d.created_at.isoformat() if d.created_at else None}
