#!/bin/bash

echo "Stopping Next.js (port 3000)..."
lsof -ti:3000 | xargs kill -9 2>/dev/null
if [ $? -eq 0 ]; then
    echo "Frontend stopped."
else
    echo "No process running on port 3000."
fi

echo "Stopping Uvicorn backend (port 8000)..."
lsof -ti:8000 | xargs kill -9 2>/dev/null
if [ $? -eq 0 ]; then
    echo "Backend stopped."
else
    echo "No process running on port 8000."
fi

echo "App has been completely stopped."
