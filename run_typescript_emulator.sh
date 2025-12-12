#!/bin/bash

CLIENTS=${1:-10}
CYCLES=${2:-5}
LENGTH=${3:-100}
DELAY=${4:-0.01}
MAX_CONCURRENT=${5:-50}

echo "=========================================="
echo "LLM Emulator (TypeScript) - Starting"
echo "=========================================="
echo ""
echo "Parameters:"
echo "  Clients: $CLIENTS"
echo "  Cycles per client: $CYCLES"
echo "  Response length (words): $LENGTH"
echo "  Token delay (seconds): $DELAY"
echo "  Max concurrent: $MAX_CONCURRENT"
echo ""

cd typescript-client

if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    echo ""
fi

echo "Starting load test..."
echo ""

npm start -- --clients "$CLIENTS" --cycles "$CYCLES" --length "$LENGTH" --delay "$DELAY" --max-concurrent "$MAX_CONCURRENT"
