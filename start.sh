#!/bin/bash

echo "Starting backend on port 8000..."
if [ -d ".venv-backend" ]; then
    source .venv-backend/bin/activate
elif [ -d ".venv" ]; then
    source .venv/bin/activate
else
    echo "Warning: No virtual environment found. Using system Python."
fi

nohup uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000 > backend_dev.log 2>&1 &

echo "Starting frontend on port 3000..."
cd frontend
nohup npm run dev > frontend_dev.log 2>&1 &
cd ..

echo "========================================="
echo "App is starting in the background!"
echo "Backend URL: http://localhost:8000"
echo "Frontend URL: http://localhost:3000"
echo "Backend log: backend_dev.log"
echo "Frontend log: frontend/frontend_dev.log"
echo "To stop the servers, run: ./kill.sh"
echo "========================================="
