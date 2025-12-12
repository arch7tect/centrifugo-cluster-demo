#!/bin/bash

echo "=========================================="
echo "LLM Emulator - Service Status"
echo "=========================================="
echo ""

docker-compose ps

echo ""
echo "Service Health:"
echo ""

# Check Redis
if docker-compose ps redis | grep -q "Up"; then
    echo "✓ Redis: Running"
else
    echo "✗ Redis: Stopped"
fi

# Check Centrifugo nodes
if docker-compose ps centrifugo_node1 | grep -q "Up"; then
    echo "✓ Centrifugo Node 1: Running (http://localhost:8100)"
else
    echo "✗ Centrifugo Node 1: Stopped"
fi

if docker-compose ps centrifugo_node2 | grep -q "Up"; then
    echo "✓ Centrifugo Node 2: Running (http://localhost:8200)"
else
    echo "✗ Centrifugo Node 2: Stopped"
fi

# Check Granian instances
if docker-compose ps granian1 | grep -q "Up"; then
    echo "✓ Granian 1: Running (port 8001)"
else
    echo "✗ Granian 1: Stopped"
fi

if docker-compose ps granian2 | grep -q "Up"; then
    echo "✓ Granian 2: Running (port 8002)"
else
    echo "✗ Granian 2: Stopped"
fi

# Check HAProxy
if docker-compose ps haproxy | grep -q "Up"; then
    echo "✓ HAProxy: Running (http://localhost:8404/stats)"
else
    echo "✗ HAProxy: Stopped"
fi

echo ""
echo "=========================================="
echo ""
