#!/usr/bin/env python3
"""SVG 编辑器本地服务器"""
import http.server
import socketserver
import os
import json
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 3456
DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # SVG 文件列表
        if self.path == '/__openclaw__/svg-list.json':
            diagrams = os.path.join(DIR, 'public', 'diagrams')
            files = sorted(f for f in os.listdir(diagrams) if f.endswith('.svg'))
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(files).encode())
            return

        # 编辑器页面
        if self.path == '/__openclaw__/svg-editor.html':
            editor = os.path.join(DIR, '.vitepress', 'svg-editor.html')
            with open(editor, 'r', encoding='utf-8') as f:
                content = f.read()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            self.wfile.write(content.encode())
            return

        # SVG 文件
        if self.path.startswith('/diagrams/'):
            filename = self.path[10:]  # remove /diagrams/
            filepath = os.path.join(DIR, 'public', 'diagrams', filename)
            if os.path.exists(filepath):
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                self.send_response(200)
                self.send_header('Content-Type', 'image/svg+xml; charset=utf-8')
                self.end_headers()
                self.wfile.write(content.encode())
                return

        self.send_error(404)

print(f"🎨 SVG 编辑器: http://localhost:{PORT}/__openclaw__/svg-editor.html")
with socketserver.TCPServer(('', PORT), Handler) as httpd:
    httpd.serve_forever()
