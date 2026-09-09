#!/bin/bash
# 本地自测脚本：起服务→测路由→验证打分→关服务
cd "$(dirname "$0")"
echo "1) 语法检查"
.venv/bin/python -c "import ast; ast.parse(open('server.py').read()); print('  server.py 语法 OK')"
echo "2) 起服务 (PORT=5099)"
PORT=5099 .venv/bin/python server.py > /tmp/sanci_server.log 2>&1 &
SRV_PID=$!
sleep 2
for p in "/" "/one/" "/full/" "/qian/" "/full/stats" "/one/stats" "/qian/stats" "/qian/data-all.js"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:5099$p")
  echo "  $p → $code"
done
echo "3.5) 每日一签 API 测试"
curl -s -X POST "http://127.0.0.1:5099/qian/api/draw" -H "Content-Type: application/json" -d '{"chapterId": 1, "chapterText": "test", "source": "学而篇"}'
echo ""
curl -s "http://127.0.0.1:5099/qian/api/stats" | head -c 200
echo ""
echo "4) 打分算法测试"
.venv/bin/python rank_test.py 2>&1 | tail -8
echo "5) 关服务"
kill $SRV_PID 2>/dev/null
echo "完成"
