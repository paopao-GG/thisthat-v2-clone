#!/bin/bash
# test-worker-pattern.sh - Test worker pattern locally

echo "Testing Worker Pattern Architecture"
echo "===================================="
echo ""

# Test 1: API mode (no jobs)
echo "Test 1: Starting API server (WORKER_MODE=false)..."
WORKER_MODE=false PORT=3001 npm run dev &
API_PID=$!
sleep 5

echo "Checking API server..."
if ps -p $API_PID > /dev/null; then
  echo "✅ API server running"
else
  echo "❌ API server failed to start"
fi

kill $API_PID 2>/dev/null
sleep 2

# Test 2: Worker mode (runs jobs)
echo ""
echo "Test 2: Starting worker (WORKER_MODE=true)..."
WORKER_MODE=true PORT=3003 npm run dev &
WORKER_PID=$!
sleep 5

echo "Checking worker..."
if ps -p $WORKER_PID > /dev/null; then
  echo "✅ Worker running"
else
  echo "❌ Worker failed to start"
fi

kill $WORKER_PID 2>/dev/null

echo ""
echo "===================================="
echo "Manual verification required:"
echo "1. Check API logs for 'Running in API mode'"
echo "2. Check worker logs for 'Running in WORKER mode'"
echo "3. Verify jobs only start in worker mode"
echo "===================================="
