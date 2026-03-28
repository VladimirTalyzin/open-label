import sqlite3
import hashlib
import secrets
from os import path
from datetime import datetime


def get_db_path():
    return path.join(path.dirname(path.abspath(__file__)), "openlabel.db").replace("\\", "/")


def get_connection():
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            group_id INTEGER NOT NULL,
            FOREIGN KEY (group_id) REFERENCES groups(id)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS project_groups (
            project_id INTEGER NOT NULL,
            group_id INTEGER NOT NULL,
            PRIMARY KEY (project_id, group_id),
            FOREIGN KEY (group_id) REFERENCES groups(id)
        )
    """)

    conn.commit()
    conn.close()


def hash_password(password):
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


# --- Groups ---

def create_group(name):
    conn = get_connection()
    try:
        conn.execute("INSERT INTO groups (name) VALUES (?)", (name,))
        conn.commit()
        return conn.execute("SELECT * FROM groups WHERE name = ?", (name,)).fetchone()
    finally:
        conn.close()


def get_all_groups():
    conn = get_connection()
    try:
        return conn.execute("SELECT * FROM groups ORDER BY id").fetchall()
    finally:
        conn.close()


def delete_group(group_id):
    conn = get_connection()
    try:
        users = conn.execute("SELECT id FROM users WHERE group_id = ?", (group_id,)).fetchall()
        if users:
            return False
        conn.execute("DELETE FROM project_groups WHERE group_id = ?", (group_id,))
        conn.execute("DELETE FROM groups WHERE id = ?", (group_id,))
        conn.commit()
        return True
    finally:
        conn.close()


# --- Users ---

def create_user(username, password, group_id):
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO users (username, password_hash, group_id) VALUES (?, ?, ?)",
            (username, hash_password(password), group_id)
        )
        conn.commit()
        return conn.execute("SELECT id, username, group_id FROM users WHERE username = ?", (username,)).fetchone()
    finally:
        conn.close()


def get_all_users():
    conn = get_connection()
    try:
        return conn.execute("""
            SELECT users.id, users.username, users.group_id, groups.name as group_name
            FROM users
            LEFT JOIN groups ON users.group_id = groups.id
            ORDER BY users.id
        """).fetchall()
    finally:
        conn.close()


def delete_user(user_id):
    conn = get_connection()
    try:
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
    finally:
        conn.close()


def update_user_password(user_id, new_password):
    conn = get_connection()
    try:
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (hash_password(new_password), user_id)
        )
        conn.commit()
    finally:
        conn.close()


def update_user_group(user_id, group_id):
    conn = get_connection()
    try:
        conn.execute(
            "UPDATE users SET group_id = ? WHERE id = ?",
            (group_id, user_id)
        )
        conn.commit()
    finally:
        conn.close()


# --- Sessions ---

def create_session(username, password):
    conn = get_connection()
    try:
        user = conn.execute(
            "SELECT id, username, group_id FROM users WHERE username = ? AND password_hash = ?",
            (username, hash_password(password))
        ).fetchone()

        if not user:
            return None, None

        token = secrets.token_hex(32)
        conn.execute(
            "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
            (token, user["id"], datetime.now().isoformat())
        )
        conn.commit()
        return token, dict(user)
    finally:
        conn.close()


def get_user_by_session(token):
    if not token:
        return None
    conn = get_connection()
    try:
        row = conn.execute("""
            SELECT users.id, users.username, users.group_id, groups.name as group_name
            FROM sessions
            JOIN users ON sessions.user_id = users.id
            LEFT JOIN groups ON users.group_id = groups.id
            WHERE sessions.token = ?
        """, (token,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def delete_session(token):
    conn = get_connection()
    try:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        conn.commit()
    finally:
        conn.close()


# --- Project-Group links ---

def assign_project_to_group(project_id, group_id):
    conn = get_connection()
    try:
        conn.execute(
            "INSERT OR IGNORE INTO project_groups (project_id, group_id) VALUES (?, ?)",
            (project_id, group_id)
        )
        conn.commit()
    finally:
        conn.close()


def get_project_group(project_id):
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT group_id FROM project_groups WHERE project_id = ?",
            (project_id,)
        ).fetchone()
        return row["group_id"] if row else None
    finally:
        conn.close()


def get_group_project_ids(group_id):
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT project_id FROM project_groups WHERE group_id = ?",
            (group_id,)
        ).fetchall()
        return [row["project_id"] for row in rows]
    finally:
        conn.close()


def remove_project_group(project_id):
    conn = get_connection()
    try:
        conn.execute("DELETE FROM project_groups WHERE project_id = ?", (project_id,))
        conn.commit()
    finally:
        conn.close()
