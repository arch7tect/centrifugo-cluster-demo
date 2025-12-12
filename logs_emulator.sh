#!/bin/bash

SERVICE=${1:-all}

if [ "$SERVICE" = "all" ]; then
    echo "=========================================="
    echo "Following logs for all services"
    echo "Press Ctrl+C to stop"
    echo "=========================================="
    echo ""
    docker-compose logs -f
else
    echo "=========================================="
    echo "Following logs for: $SERVICE"
    echo "Press Ctrl+C to stop"
    echo "=========================================="
    echo ""
    docker-compose logs -f "$SERVICE"
fi
