"""
CEMS Local Server
=================
Runs the College Exam Management System fully offline on localhost.
Database is stored as JSON in the database/ folder (auto-created).

Usage:
  pip install flask
  python server.py

Open: http://127.0.0.1:5000
"""

import os
import json
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory, send_file

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DB_DIR = os.path.join(BASE_DIR, 'database')
DB_FILE = os.path.join(DB_DIR, 'cems_data.json')
BACKUP_DIR = os.path.join(DB_DIR, 'backups')

os.makedirs(DB_DIR, exist_ok=True)
os.makedirs(BACKUP_DIR, exist_ok=True)

app = Flask(__name__, static_folder=None)


def empty_db():
    return {
        'users': [
            {
                'id': 1,
                'username': 'admin',
                'password': _hash('admin123'),
                'role': 'admin',
                'name': 'Administrator'
            }
        ],
        'departments': [],
        'classes': [],
        'students': [],
        'faculty': [],
        'subjects': [],
        'halls': [],
        'desks': [],
        'exams': [],
        'participants': [],
        'seatings': [],
        'duties': [],
        'attendance': [],
        'history': [],
        'settings': {
            'college_name': 'College Name',
            'academic_year': '2025-26',
            'default_seating_strategy': 'alternate'
        },
        'session': None,
        'admin_lock': None,
        'seeded': True
    }


def _to36(n):
    chars = '0123456789abcdefghijklmnopqrstuvwxyz'
    n = abs(int(n))
    if n == 0:
        return '0'
    s = ''
    while n:
        n, r = divmod(n, 36)
        s = chars[r] + s
    return s


def _hash(pw):
    """Must match js/db.js hash() — signed 32-bit + base36."""
    h = 0
    for ch in str(pw):
        h = ((h << 5) - h) + ord(ch)
        h = h & 0xFFFFFFFF
        if h >= 0x80000000:
            h -= 0x100000000
    return 'h' + _to36(abs(h))


def load_db():
    if not os.path.exists(DB_FILE):
        data = empty_db()
        save_db(data)
        return data
    try:
        with open(DB_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if not data.get('seeded'):
            data['seeded'] = True
        # Ensure admin always exists
        users = data.get('users') or []
        has_admin = any(
            str(u.get('username', '')).lower() == 'admin' and u.get('role') == 'admin'
            for u in users
        )
        if not has_admin:
            users.append({
                'id': 1,
                'username': 'admin',
                'password': _hash('admin123'),
                'role': 'admin',
                'name': 'Administrator'
            })
            data['users'] = users
            save_db(data)
        return data
    except Exception as e:
        print('DB load error:', e)
        data = empty_db()
        save_db(data)
        return data


def save_db(data):
    os.makedirs(DB_DIR, exist_ok=True)
    # strip session before writing
    payload = dict(data)
    payload['session'] = None
    with open(DB_FILE, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return True


def backup_db():
    if not os.path.exists(DB_FILE):
        return None
    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    dest = os.path.join(BACKUP_DIR, f'cems_backup_{ts}.json')
    with open(DB_FILE, 'r', encoding='utf-8') as src, open(dest, 'w', encoding='utf-8') as out:
        out.write(src.read())
    return dest


# ---------- API (same shape as Google Apps Script) ----------

@app.route('/api/db', methods=['GET', 'POST', 'OPTIONS'])
def api_db():
    if request.method == 'OPTIONS':
        return '', 204

    action = 'load'
    body = {}
    if request.method == 'POST':
        try:
            body = request.get_json(force=True, silent=True) or {}
        except Exception:
            body = {}
        action = (body.get('action') or request.args.get('action') or 'load')
    else:
        action = request.args.get('action') or 'load'

    action = str(action).lower().replace('-', '').replace('_', '')

    if action in ('ping', 'health'):
        return jsonify({
            'success': True,
            'message': 'CEMS local API online',
            'version': 1,
            'mode': 'localhost',
            'db_file': DB_FILE
        })

    if action in ('load', 'get'):
        data = load_db()
        return jsonify({'success': True, 'data': data})

    if action in ('save', 'put'):
        data = body.get('data')
        if data is None:
            return jsonify({'success': False, 'message': 'No data provided'}), 400
        save_db(data)
        return jsonify({'success': True, 'message': 'Saved to database/cems_data.json'})

    if action in ('backup',):
        path = backup_db()
        return jsonify({'success': True, 'path': path})

    if action in ('reset', 'clear'):
        data = empty_db()
        save_db(data)
        return jsonify({'success': True, 'message': 'Database cleared', 'data': data})

    return jsonify({'success': False, 'message': 'Unknown action: ' + action}), 400


@app.route('/api/backup', methods=['POST'])
def api_backup():
    path = backup_db()
    return jsonify({'success': True, 'path': path})


# ---------- Static files ----------

@app.route('/')
def index():
    return send_file(os.path.join(BASE_DIR, 'index.html'))


@app.route('/<path:filename>')
def static_files(filename):
    # prevent path escape
    safe = os.path.normpath(filename).replace('\\', '/')
    if safe.startswith('..'):
        return 'Not found', 404
    full = os.path.join(BASE_DIR, safe)
    if os.path.isfile(full):
        return send_from_directory(BASE_DIR, safe)
    return 'Not found', 404


if __name__ == '__main__':
    # Ensure DB exists on startup
    load_db()
    print('=' * 50)
    print('  CEMS Local Server')
    print('  http://127.0.0.1:5000')
    print('  Database:', DB_FILE)
    print('  Login: admin / admin123')
    print('=' * 50)
    app.run(host='127.0.0.1', port=5000, debug=True)
