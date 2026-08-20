#!/bin/bash
# 启动 SVG 编辑器本地服务器
# 用法: bash start-editor.sh [端口号]

PORT=${1:-3456}
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🎨 SVG 编辑器启动中..."
echo "   访问: http://localhost:${PORT}/__openclaw__/svg-editor.html"
echo "   按 Ctrl+C 停止"
echo ""

cd "$DIR/.." && python3 "$DIR/editor-server.py" "$PORT"
