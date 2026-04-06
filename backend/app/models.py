"""PitchDeckForge — Data Models"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Text, Integer, DateTime,
    ForeignKey, JSON, create_engine,
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


def gen_uuid():
    return str(uuid.uuid4())


def utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=gen_uuid)
    email = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    password_hash = Column(String, nullable=True)
    subscription_plan = Column(String, default="free")  # free, pro_monthly, team_monthly
    stripe_subscription_id = Column(String, nullable=True)
    stripe_customer_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    projects = relationship("Project", back_populates="user", order_by="Project.created_at.desc()")


class Project(Base):
    __tablename__ = "projects"
    id = Column(String, primary_key=True, default=gen_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    industry = Column(String, nullable=True)
    stage = Column(String, default="seed")  # seed, series_a, series_b, growth
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    user = relationship("User", back_populates="projects")
    briefs = relationship("Brief", back_populates="project", order_by="Brief.created_at.desc()")


class Brief(Base):
    __tablename__ = "briefs"
    id = Column(String, primary_key=True, default=gen_uuid)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    company_description = Column(Text, nullable=False)
    problem = Column(Text, nullable=True)
    solution = Column(Text, nullable=True)
    traction = Column(Text, nullable=True)
    team = Column(Text, nullable=True)
    raise_amount = Column(String, nullable=True)
    audience = Column(String, default="seed")  # seed, series_a, growth
    created_at = Column(DateTime, default=utcnow)
    project = relationship("Project", back_populates="briefs")
    decks = relationship("Deck", back_populates="brief", order_by="Deck.created_at.desc()")


class Deck(Base):
    __tablename__ = "decks"
    id = Column(String, primary_key=True, default=gen_uuid)
    brief_id = Column(String, ForeignKey("briefs.id"), nullable=False)
    title = Column(String, nullable=False)
    template = Column(String, default="clean")  # clean, investor, growth, product
    slides = Column(JSON, default=list)  # [{title, bullets[], notes}]
    tl_dr = Column(Text, nullable=True)
    script = Column(Text, nullable=True)
    status = Column(String, default="draft")  # draft, final
    share_token = Column(String, nullable=True, unique=True)
    created_at = Column(DateTime, default=utcnow)
    brief = relationship("Brief", back_populates="decks")


class AnalyticsEvent(Base):
    __tablename__ = "analytics_events"
    id = Column(String, primary_key=True, default=gen_uuid)
    event_type = Column(String, nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    resource_id = Column(String, nullable=True)  # deck_id, project_id, etc
    metadata_ = Column("metadata", JSON, default=dict)
    created_at = Column(DateTime, default=utcnow)


def get_engine(url="sqlite:///./pitchdeckforge.db"):
    return create_engine(url, echo=False)


def init_db(url="sqlite:///./pitchdeckforge.db"):
    engine = get_engine(url)
    Base.metadata.create_all(engine)
    # Add missing columns for shared DB compatibility
    from sqlalchemy import inspect as sa_inspect, text
    inspector = sa_inspect(engine)
    if inspector.has_table("users"):
        existing = {c["name"] for c in inspector.get_columns("users")}
        with engine.begin() as conn:
            if "subscription_plan" not in existing:
                conn.execute(text("ALTER TABLE users ADD COLUMN subscription_plan VARCHAR DEFAULT 'free'"))
            if "stripe_subscription_id" not in existing:
                conn.execute(text("ALTER TABLE users ADD COLUMN stripe_subscription_id VARCHAR"))
            if "stripe_customer_id" not in existing:
                conn.execute(text("ALTER TABLE users ADD COLUMN stripe_customer_id VARCHAR"))
    return engine
