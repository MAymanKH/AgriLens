"""Local fixture transport only; does not fetch NASA or run comparison logic."""
import argparse
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qsl, urlsplit

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / 'fixtures'


def path_key(path):
    parsed = urlsplit(path)
    return parsed.path, sorted(parse_qsl(parsed.query, keep_blank_values=True))


def make_server(service, host, port, profile='normal'):
    cases = json.loads((FIXTURES / 'cases.json').read_text())['cases']
    candidates = [c for c in cases if c['service'] == service]
    profiles = {c['profile'] for c in candidates}
    if profile not in profiles:
        raise ValueError(f'{service} profiles: {", ".join(sorted(profiles))}')
    selected = [c for c in candidates if c['profile'] == profile]
    fallback = [c for c in candidates if c['profile'] == 'normal'] if profile != 'normal' else []

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def respond(self, status, body):
            data = json.dumps(body, allow_nan=False).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-AgriLens-Data-Mode', 'fixture')
            self.send_header('Access-Control-Expose-Headers', 'X-AgriLens-Data-Mode')
            origin = self.headers.get('Origin')
            allowed = {os.environ.get('APP_ORIGIN', 'http://localhost:5173'), 'http://127.0.0.1:5173'}
            if origin in allowed:
                self.send_header('Access-Control-Allow-Origin', origin)
                self.send_header('Vary', 'Origin')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.end_headers()
            self.wfile.write(data)

        def do_OPTIONS(self):
            self.respond(200, {})

        def handle_request(self):
            self.connection.settimeout(5)
            body = None
            if self.command == 'POST':
                try:
                    length = int(self.headers.get('Content-Length', '0'))
                    if not 0 < length <= 65536:
                        raise ValueError('Invalid body size')
                    body = json.loads(self.rfile.read(length))
                except (ValueError, TimeoutError):
                    self.respond(400, {'error': {'code': 'INVALID_INPUT', 'message': 'Provide a JSON request body under 64 KiB.'}})
                    return
            for case in selected + fallback:
                req = case['request']
                if req['method'] == self.command and path_key(req['path']) == path_key(self.path) and req.get('body') == body:
                    self.respond(case['status'], json.loads((FIXTURES / case['response_file']).read_text()))
                    return
            known = urlsplit(self.path).path in {'/api/compare', '/api/config', '/internal/crops', '/internal/climate', '/health'}
            self.respond(400 if known else 404, {'error': {'code': 'INVALID_INPUT', 'message': 'No matching fixture case. Use a request from fixtures/cases.json.'}})

        do_GET = handle_request
        do_POST = handle_request

    return ThreadingHTTPServer((host, port), Handler)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('service', choices=['comparison', 'climate', 'crops'])
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, required=True)
    parser.add_argument('--profile', default='normal')
    args = parser.parse_args()
    if os.environ.get('DATA_MODE') != 'fixture':
        parser.error('Fixture server requires explicit DATA_MODE=fixture; never use as a live fallback.')
    server = make_server(args.service, args.host, args.port, args.profile)
    print(f'SYNTHETIC FIXTURES ONLY: {args.service} on {args.host}:{server.server_port} [{args.profile}]', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
