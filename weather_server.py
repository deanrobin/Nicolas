#!/usr/bin/env python3
"""
Simple weather query HTTP server.
Usage: python weather_server.py [--port 8888]
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


def query_weather(text: str) -> dict:
    if "天气" not in text:
        return {"code": 400, "message": '输入必须包含关键字"天气"', "data": None}

    for city, weather in WEATHER_DATA.items():
        if city in text:
            return {"code": 200, "message": "ok", "data": {"city": city, "weather": weather}}

    supported = "、".join(WEATHER_DATA.keys())
    return {"code": 404, "message": f"暂不支持该城市，当前支持：{supported}", "data": None}


class WeatherHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {fmt % args}")

    def _send_json(self, status: int, body: dict):
        payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path != "/weather":
            self._send_json(404, {"code": 404, "message": "Not Found", "data": None})
            return

        params = parse_qs(parsed.query)
        q_list = params.get("q", [])
        if not q_list:
            self._send_json(400, {"code": 400, "message": "缺少查询参数 q", "data": None})
            return

        result = query_weather(q_list[0])
        http_status = result["code"] if result["code"] in (200, 400, 404) else 500
        self._send_json(http_status, result)

    def do_POST(self):
        parsed = urlparse(self.path)

        if parsed.path != "/weather":
            self._send_json(404, {"code": 404, "message": "Not Found", "data": None})
            return

        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length).decode("utf-8")

        try:
            body = json.loads(raw)
            text = body.get("q", "")
        except json.JSONDecodeError:
            text = raw  # treat plain string body as query text

        if not text:
            self._send_json(400, {"code": 400, "message": "请求体为空或缺少字段 q", "data": None})
            return

        result = query_weather(text)
        http_status = result["code"] if result["code"] in (200, 400, 404) else 500
        self._send_json(http_status, result)


def main():
    parser = argparse.ArgumentParser(description="Weather query HTTP server")
    parser.add_argument("--port", type=int, default=8888, help="Listening port (default: 8888)")
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
