"""PitchDeckForge — Seed demo data"""
import os
from dotenv import load_dotenv
load_dotenv()
from sqlalchemy.orm import sessionmaker
from app.models import User, Project, Brief, init_db, get_engine
from app.auth import hash_password

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./pitchdeckforge.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

def seed():
    engine = get_engine(DATABASE_URL)
    init_db(DATABASE_URL)
    Session = sessionmaker(bind=engine)
    db = Session()
    if db.query(User).count() > 0:
        print(f"DB already seeded — skipping"); db.close(); return

    user = User(email="demo@pitchdeckforge.dev", name="Demo User", password_hash=hash_password("demo123"))
    db.add(user); db.flush()

    # Sample project
    project = Project(user_id=user.id, name="AcmeTech", industry="SaaS", stage="seed")
    db.add(project); db.flush()

    brief = Brief(
        project_id=project.id,
        company_description="AcmeTech builds AI-powered developer tools that reduce code review time by 80%.",
        problem="Code reviews are the #1 bottleneck in shipping software. Teams spend 15+ hours/week waiting for reviews.",
        solution="AI assistant that pre-reviews PRs, flags issues, suggests fixes, and auto-approves safe changes.",
        traction="500 beta users, 12 paying teams, $8K MRR, 40% week-over-week growth",
        team="2 ex-Google engineers, 1 ex-Stripe PM. Combined 25 years in dev tools.",
        raise_amount="$2M",
        audience="seed",
    )
    db.add(brief)
    db.commit()
    print("Seeded 1 demo user + 1 sample project with brief")
    db.close()

if __name__ == "__main__":
    seed()
