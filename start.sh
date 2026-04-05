#!/bin/bash
echo "PitchDeckForge — Starting..."
cd "$(dirname "$0")/backend"
python -m app.seed 2>/dev/null
echo "Starting backend on :8004..."
uvicorn app.main:app --port 8004 --host 0.0.0.0 --reload &
BACKEND_PID=$!
cd "$(dirname "$0")/frontend"
echo "Starting frontend on :5176..."
npm run dev &
FRONTEND_PID=$!
echo ""
echo "PitchDeckForge running:"
echo "  Backend:  http://localhost:8004"
echo "  Frontend: http://localhost:5176"
echo "  Demo: demo@pitchdeckforge.dev / demo123"
echo ""
echo "Press Ctrl+C to stop"
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
