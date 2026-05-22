# PitchDeckForge

AI-powered pitch deck builder for early-stage founders.

## Quick Start

```bash
bash start.sh
# Backend: http://localhost:8004
# Frontend: http://localhost:5176
# Demo login: demo@pitchdeckforge.dev / demo123
```

## Docker / fleet-net

PitchDeckForge ships a `docker-compose.yml` for the laptop-local fleet
network. It brings up three containers (`pitchdeckforge_postgres`,
`pitchdeckforge_api`, `pitchdeckforge_web`) and attaches them to the
shared `fleet-net` so they can reach other fleet apps' data services by
hostname (`unified-postgres:5432`, `character_os_postgres:5432`, etc.).

```bash
# One-time: ensure fleet-net exists
docker network create fleet-net 2>/dev/null || true

# Copy + fill secrets
cp .env.example .env  # edit OPENAI_API_KEY, SECRET_KEY at minimum

# Prod-like (uvicorn + nginx, mirrors Render)
docker compose up -d

# Dev mode (uvicorn --reload + Vite HMR + bind-mounted source)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Reach it at `http://localhost:8004/api/health` and
`http://localhost:5176/`. Fleet pattern reference:
[`/Users/donkeyking/development/infra/README.md`](/Users/donkeyking/development/infra/README.md).
