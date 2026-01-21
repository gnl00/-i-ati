#!/usr/bin/env python3
import argparse
import json
import os
import sqlite3
from typing import Optional, List


def find_default_db_path() -> Optional[str]:
    home = os.path.expanduser('~')
    candidates: List[str] = [
        os.path.join(home, 'Library', 'Application Support', 'at-i', 'chat.db'),
        os.path.join(home, 'Library', 'Application Support', 'at-i-app', 'chat.db'),
        os.path.join(home, 'Library', 'Application Support', 'at-i-app-dev', 'chat.db'),
        os.path.join(home, 'Library', 'Application Support', 'at-i-dev', 'chat.db'),
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return None


def count_chat_messages(conn: sqlite3.Connection, chat_id: int) -> int:
    cur = conn.execute('SELECT body FROM messages WHERE chat_id = ?', (chat_id,))
    count = 0
    for (body,) in cur.fetchall():
        try:
            parsed = json.loads(body)
        except Exception:
            continue
        role = parsed.get('role')
        if role in ('user', 'assistant'):
            count += 1
    return count


def main() -> int:
    parser = argparse.ArgumentParser(description='Recount chats.msg_count based on messages table.')
    parser.add_argument('--db', dest='db_path', help='Path to chat.db')
    parser.add_argument('--dry-run', action='store_true', help='Print counts without writing')
    args = parser.parse_args()

    db_path = args.db_path or find_default_db_path()
    if not db_path:
        print('chat.db not found. Please pass --db /path/to/chat.db')
        return 1

    if not os.path.exists(db_path):
        print(f'chat.db not found at: {db_path}')
        return 1

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    try:
        chats = conn.execute('SELECT id, msg_count FROM chats ORDER BY id ASC').fetchall()
        updated = 0
        for row in chats:
            chat_id = row['id']
            new_count = count_chat_messages(conn, chat_id)
            old_count = row['msg_count']
            if new_count != old_count:
                updated += 1
                if not args.dry_run:
                    conn.execute('UPDATE chats SET msg_count = ? WHERE id = ?', (new_count, chat_id))
        if not args.dry_run:
            conn.commit()
        print(f'Updated chats: {updated}/{len(chats)}')
    finally:
        conn.close()

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
