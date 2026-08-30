#!/bin/bash
# 完整測試：資料完整性（原文對照維基文庫來源）+ 端到端瀏覽器測試（含離線）
# 需求：python3、node、chromium、puppeteer-core
set -u
cd "$(dirname "$0")"

PORT=8128
STARTED_SERVER=0
if ! curl -s -m 2 -o /dev/null "http://localhost:$PORT/"; then
  python3 -m http.server "$PORT" --directory .. >/dev/null 2>&1 &
  SERVER_PID=$!
  STARTED_SERVER=1
  sleep 1
fi

FAIL=0
echo "===== 資料完整性 ====="
python3 test_data.py || FAIL=1
echo "===== 端到端 ====="
python3 ../scripts/parse_source.py >/dev/null && python3 ../scripts/build_data.py >/dev/null || FAIL=1
node e2e.js || FAIL=1

if [ "$STARTED_SERVER" = "1" ]; then
  kill "$SERVER_PID" 2>/dev/null
fi

if [ "$FAIL" = "0" ]; then
  echo "[O] ALL TEST SUITES PASSED"
else
  echo "[X] SOME TESTS FAILED"
fi
exit "$FAIL"
