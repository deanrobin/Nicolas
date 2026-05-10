#!/usr/bin/env python3
"""
Simple weather query HTTP server.
Usage: python weather_server.py [--port 10555]
Query: GET /weather?q=北京天气怎么样
"""

import argparse
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

WEATHER_DATA = {
    "香港": "23度 晴朗",
    "北京": "18度 阴雨",
}


def query_weather(text: str) -> tuple[int, str]:
    if "天气" not in text:
        return 400, '输入必须包含关键字"天气"'

    for city, weather in WEATHER_DATA.items():
        if city in text:
            return 200, weather

    supported = "、".join(WEATHER_DATA.keys())
    return 404, f"暂不支持该城市，当前支持：{supported}"


class WeatherHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {fmt % args}")

    def _send_text(self, status: int, text: str):
        payload = text.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path != "/weather":
            self._send_text(404, "Not Found")
            return

        params = parse_qs(parsed.query)
        q_list = params.get("q", [])
        if not q_list:
            self._send_text(400, "缺少查询参数 q")
            return

        status, msg = query_weather(q_list[0])
        self._send_text(status, msg)

    def do_POST(self):
        parsed = urlparse(self.path)

        if parsed.path != "/weather":
            self._send_text(404, "Not Found")
            return

        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length).decode("utf-8")

        try:
            body = json.loads(raw)
            text = body.get("q", "")
        except json.JSONDecodeError:
            text = raw

        if not text:
            self._send_text(400, "请求体为空或缺少字段 q")
            return

        status, msg = query_weather(text)
        self._send_text(status, msg)


def main():
    parser = argparse.ArgumentParser(description="Weather query HTTP server")
    parser.add_argument("--port", type=int, default=10555, help="Listening port (default: 10555)")
    parser.add_argument("--host", default="0.0.0.0", help="Bind host (default: 0.0.0.0)")
    args = parser.parse_args()

    server = HTTPServer((args.host, args.port), WeatherHandler)
    print(f"Weather server running on http://{args.host}:{args.port}")
    print("Endpoints:")
    print(f"  GET  http://localhost:{args.port}/weather?q=北京天气怎么样")
    print(f"  POST http://localhost:{args.port}/weather  body: {{\"q\": \"香港天气如何\"}}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")


if __name__ == "__main__":
    main()
