from http.server import HTTPServer, SimpleHTTPRequestHandler
import json
import os

class LabHandler(SimpleHTTPRequestHandler):
    def read_db(self, name):
        filename = f'{name}.json'
        if os.path.exists(filename):
            with open(filename, 'r', encoding='utf-8') as f:
                return json.load(f)
        return []

    def write_db(self, name, data):
        with open(f'{name}.json', 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=4)

    def do_GET(self):
        # 接口：获取所有日程
        if self.path == '/api/get_events':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(self.read_db('events')).encode())
        # 接口：获取所有用户（用于登录校验和管理）
        elif self.path == '/api/get_users':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(self.read_db('users')).encode())
        else:
            super().do_GET()

    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = json.loads(self.rfile.read(content_length).decode())

        if self.path == '/api/register':
            users = self.read_db('users')
            users.append(post_data)
            self.write_db('users', users)
            self.send_response(200)
        
        elif self.path == '/api/save_event':
            events = self.read_db('events')
            events.append(post_data)
            self.write_db('events', events)
            self.send_response(200)

        elif self.path == '/api/delete_event':
            events = self.read_db('events')
            events = [e for e in events if str(e['id']) != str(post_data['id'])]
            self.write_db('events', events)
            self.send_response(200)

        self.end_headers()
        self.wfile.write(b'OK')

# 自动创建初始管理员
if not os.path.exists('users.json'):
    with open('users.json', 'w') as f:
        json.dump([{"username": "admin", "pass": "admin123", "email": "admin@lab.com"}], f)

print("实验室系统运行中: http://localhost:8000")
HTTPServer(('0.0.0.0', 8000), LabHandler).serve_forever()