#!/bin/bash

echo "=========================================="
echo "LLM Emulator - Stopping All Components"
echo "=========================================="
echo ""

echo "Stopping Docker services..."
docker-compose down

echo ""
echo "=========================================="
echo "All services stopped!"
echo "=========================================="
echo ""
