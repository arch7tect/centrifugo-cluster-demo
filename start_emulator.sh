#!/bin/bash

set -e

CLIENTS=${1:-10}
CYCLES=${2:-5}
LENGTH=${3:-100}
DELAY=${4:-0.01}

echo "=========================================="
echo "LLM Emulator - Starting All Components"
echo "=========================================="
echo ""

echo "Configuration:"
echo "  Clients: $CLIENTS"
echo "  Cycles per client: $CYCLES"
echo "  Response length: $LENGTH words"
echo "  Token delay: ${DELAY}s"
echo ""

echo "[1/5] Checking dependencies..."
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "Error: docker-compose is not installed"
    exit 1
fi

if ! command -v uv &> /dev/null; then
    echo "Error: uv is not installed"
    exit 1
fi

echo "[2/5] Installing Python dependencies..."
uv sync

echo "[3/5] Starting Docker infrastructure..."
docker-compose down 2>/dev/null || true
docker-compose up -d --build

echo "[4/5] Waiting for services to be ready..."
sleep 5

echo "Checking service health..."
# Check Redis
if ! docker-compose ps redis | grep -q "Up"; then
    echo "Error: Redis is not running"
    docker-compose logs redis
    exit 1
fi

# Check Centrifugo nodes
if ! docker-compose ps centrifugo_node1 | grep -q "Up"; then
    echo "Error: Centrifugo node 1 is not running"
    docker-compose logs centrifugo_node1
    exit 1
fi

if ! docker-compose ps centrifugo_node2 | grep -q "Up"; then
    echo "Error: Centrifugo node 2 is not running"
    docker-compose logs centrifugo_node2
    exit 1
fi

# Check Granian instances
if ! docker-compose ps granian1 | grep -q "Up"; then
    echo "Error: Granian 1 is not running"
    docker-compose logs granian1
    exit 1
fi

if ! docker-compose ps granian2 | grep -q "Up"; then
    echo "Error: Granian 2 is not running"
    docker-compose logs granian2
    exit 1
fi

# Check HAProxy
if ! docker-compose ps haproxy | grep -q "Up"; then
    echo "Error: HAProxy is not running"
    docker-compose logs haproxy
    exit 1
fi

echo ""
echo "=========================================="
echo "All services started successfully!"
echo "=========================================="
echo ""
echo "Service URLs:"
echo "  - HAProxy Stats: http://localhost:8404/stats"
echo "  - Centrifugo Admin 1: http://localhost:8100/"
echo "  - Centrifugo Admin 2: http://localhost:8200/"
echo "  - FastAPI (via HAProxy): http://localhost:9000/health"
echo ""

echo "[5/5] Running emulator load test..."
echo ""

uv run python run_emulator.py \
    --clients "$CLIENTS" \
    --cycles "$CYCLES" \
    --length "$LENGTH" \
    --delay "$DELAY"

echo ""
echo "=========================================="
echo "Emulator test completed!"
echo "=========================================="
echo ""
echo "To view service logs:"
echo "  docker-compose logs -f [service_name]"
echo ""
echo "To stop all services:"
echo "  docker-compose down"
echo ""
