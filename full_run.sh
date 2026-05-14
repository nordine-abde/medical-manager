#!/bin/bash

set -e

echo "======================================"
echo " Starting Medical Manager Full Stack  "
echo "======================================"

# 1. Backend Setup
echo ""
echo "--> [1/4] Setting up Backend..."
cd backend

if [ ! -f .env ]; then
  echo "    No .env found. Copying .env.example..."
  cp .env.example .env
fi

echo "    Installing dependencies..."
bun install

echo "    Starting PostgreSQL database container..."
docker compose up -d

echo "    Waiting for database to be ready..."
bun run db:check

echo "    Running database migrations..."
bun run db:migrate

cd ..

# 2. Frontend Setup
echo ""
echo "--> [2/4] Setting up Frontend..."
cd frontend

echo "    Installing dependencies..."
bun install

cd ..

# 3. Running Services
echo ""
echo "--> [3/4] Starting Services..."

# Trap SIGINT (Ctrl+C) and SIGTERM to gracefully stop both servers
cleanup() {
    echo ""
    echo "--> [4/4] Stopping servers and database..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    echo "    Servers stopped."
    echo "    Stopping PostgreSQL database container..."
    cd backend && docker compose down
    echo "    Database stopped."
    exit 0
}

trap cleanup SIGINT SIGTERM

echo "    Starting Backend (http://localhost:3000)..."
cd backend
bun run dev &
BACKEND_PID=$!
cd ..

echo "    Starting Frontend (http://localhost:9000)..."
cd frontend
bun run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "=========================================================="
echo "🚀 Full Stack is Running!"
echo "➡️  Frontend: http://localhost:9000"
echo "➡️  Backend:  http://localhost:3000"
echo "🛑 Press Ctrl+C to stop the servers."
echo "=========================================================="

# Wait for both processes indefinitely so the script doesn't exit immediately
wait $BACKEND_PID $FRONTEND_PID
