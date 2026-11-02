#!/usr/bin/env python3
"""glitch~nhance: a small self-hosted live code editor in the spirit of Glitch, with AI help.

Standard library only (Python 3.10+).

    python3 server.py adduser dunc     # prints a login link
    python3 server.py users            # list users
    python3 server.py serve            # run the server (default 127.0.0.1:8090)
"""
import argparse
import hashlib
import http.cookies
import http.server
import io
import json
import mimetypes
import os
import random
import re
import secrets
import shutil
import sqlite3
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def load_env(path):
    """Read KEY=VALUE lines from a gitignored .env so secrets stay out of the code and the unit file."""
    if not path.is_file():
        return
    for line in path.read_text().splitlines():
        k, sep, v = line.strip().partition("=")
        if sep and k and not k.startswith("#"):
            os.environ.setdefault(k.strip(), v.strip().strip("'\""))


load_env(ROOT / ".env")
STATIC = ROOT / "static"
DATA = Path(os.environ.get("GLITCH_DATA", ROOT / "data")).resolve()
PROJECTS = DATA / "projects"
TRASH = DATA / "trash"
# Optional: serve previews from <project>.<PREVIEW_HOST> (needs wildcard DNS + TLS).
PREVIEW_HOST = os.environ.get("GLITCH_PREVIEW_HOST", "").lower().strip(".")
PUBLIC_URL = os.environ.get("GLITCH_URL", "http://localhost:8090").rstrip("/")

# The AI goes through OpenRouter, so any model it lists works (e.g. "openai/gpt-4o").
AI_KEY = os.environ.get("OPENROUTER_API_KEY", "").strip()
AI_MODEL = os.environ.get("GLITCH_AI_MODEL", "openai/gpt-4o")
# "Suggestions for you!" uses a quicker, cheaper model so the modal opens fast.
IDEAS_MODEL = os.environ.get("GLITCH_IDEAS_MODEL", "openai/gpt-4o-mini")
# Who may use the AI (it costs money per request): names separated by commas or spaces, in .env.
# Unset or "*" means everyone, which suits a local checkout; set it on a shared server.
AI_USERS = {u for u in re.split(r"[,\s]+", os.environ.get("GLITCH_AI_USERS", "*")) if u}
AI_CONTEXT_CHARS = 300_000  # how much of the project's text we send along with each request

MAX_BODY = 20 * 1024 * 1024
COALESCE_SECONDS = 90  # saves by the same person within this window merge into one rewind step
NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$")
BINARY_EXT = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".avif",
    ".mp3", ".wav", ".ogg", ".m4a", ".mp4", ".webm", ".mov",
    ".woff", ".woff2", ".ttf", ".otf", ".zip", ".pdf", ".wasm",
}
BRIDGE_TAG = '<script src="/_glitch/bridge.js"></script>'

for _ext, _type in {
    ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
    ".svg": "image/svg+xml", ".json": "application/json", ".wasm": "application/wasm",
    ".md": "text/markdown", ".webp": "image/webp", ".py": "text/x-python",
    ".ts": "text/plain", ".txt": "text/plain",
}.items():
    mimetypes.add_type(_type, _ext)

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL,
    key_hash TEXT UNIQUE NOT NULL, created REAL NOT NULL);
CREATE TABLE IF NOT EXISTS projects (
    name TEXT PRIMARY KEY, owner INTEGER NOT NULL, description TEXT DEFAULT '',
    created REAL NOT NULL, updated REAL NOT NULL, remixed_from TEXT,
    kind TEXT DEFAULT 'static');
CREATE TABLE IF NOT EXISTS blobs (hash TEXT PRIMARY KEY, data BLOB NOT NULL);
CREATE TABLE IF NOT EXISTS versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, project TEXT NOT NULL,
    created REAL NOT NULL, updated REAL NOT NULL, author INTEGER,
    kind TEXT NOT NULL, label TEXT, ref INTEGER,
    manifest TEXT NOT NULL, changes TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS versions_project ON versions(project, id);
"""

LOCK = threading.RLock()
CONN: sqlite3.Connection


def init_db():
    global CONN
    for d in (DATA, PROJECTS, TRASH):
        d.mkdir(parents=True, exist_ok=True)
    CONN = sqlite3.connect(DATA / "glitch.db", check_same_thread=False)
    CONN.row_factory = sqlite3.Row
    CONN.execute("PRAGMA journal_mode=WAL")
    CONN.executescript(SCHEMA)


def q(sql, args=()):
    with LOCK:
        return CONN.execute(sql, args).fetchall()


def q1(sql, args=()):
    rows = q(sql, args)
    return rows[0] if rows else None


def x(sql, args=()):
    with LOCK:
        cur = CONN.execute(sql, args)
        CONN.commit()
        return cur.lastrowid


class HTTPError(Exception):
    def __init__(self, code, message=""):
        super().__init__(message)
        self.code = code
        self.message = message


# ---------------------------------------------------------------- users

def hash_key(key):
    return hashlib.sha256(key.encode()).hexdigest()


def find_user(key):
    if not key:
        return None
    return q1("SELECT id, name FROM users WHERE key_hash=?", (hash_key(key),))


def add_user(name):
    key = secrets.token_urlsafe(18)
    x("INSERT INTO users(name, key_hash, created) VALUES(?,?,?)", (name, hash_key(key), time.time()))
    return key


# ---------------------------------------------------------------- projects & files

ADJECTIVES = """amber bouncy brave breezy bright bubbly calm cheeky cosmic cozy crispy dapper
dizzy fluffy frosty fuzzy giddy glossy golden happy jazzy jolly lucky mellow merry minty
nimble peppy plucky quirky rapid rosy shiny silly sleepy snappy sparkly speedy spicy sunny
swift tidy wiggly witty zany zesty""".split()
NOUNS = """badger banana biscuit cactus comet cookie dolphin donut falcon fern gecko koala
lemon llama mango meadow moose nebula noodle otter panda pebble pickle pixel puffin quokka
rocket sloth sprout squid tiger toast tulip turtle waffle walrus yeti zebra""".split()


def random_name():
    while True:
        name = f"{random.choice(ADJECTIVES)}-{random.choice(ADJECTIVES)}-{random.choice(NOUNS)}"
        if not (PROJECTS / name).exists():
            return name


def project_dir(name):
    return PROJECTS / name


def get_project(name):
    row = q1("SELECT p.*, u.name AS owner_name FROM projects p LEFT JOIN users u ON u.id=p.owner "
             "WHERE p.name=?", (name,))
    if not row:
        raise HTTPError(404, "Project not found")
    return row


def safe_path(pdir, rel):
    """Resolve a project-relative path, refusing anything that escapes the project."""
    if not isinstance(rel, str) or not rel or "\\" in rel or "\0" in rel or rel.startswith("/"):
        raise HTTPError(400, "Bad file path")
    parts = rel.split("/")
    if any(p in ("", ".", "..") for p in parts):
        raise HTTPError(400, "Bad file path")
    full = (pdir / rel).resolve()
    if pdir.resolve() not in full.parents:
        raise HTTPError(400, "Bad file path")
    return full


def make_parents(pdir, full):
    """Create full's folders, refusing when a file already sits where a folder needs to go."""
    for d in reversed(full.parents):
        if d == pdir or pdir not in d.parents:
            continue
        if d.exists() and not d.is_dir():
            raise HTTPError(409, f"{d.relative_to(pdir).as_posix()} is a file, so it can't hold other files")
    full.parent.mkdir(parents=True, exist_ok=True)


def list_files(pdir):
    out = []
    for p in sorted(pdir.rglob("*")):
        if p.is_file() and not p.is_symlink():
            out.append(p.relative_to(pdir).as_posix())
    return out


def is_binary(path):
    return os.path.splitext(path)[1].lower() in BINARY_EXT


def remove_empty_dirs(pdir, start):
    d = start.parent
    while d != pdir and pdir in d.parents:
        try:
            d.rmdir()
        except OSError:
            break
        d = d.parent


def file_info(pdir):
    return [{"path": rel, "size": (pdir / rel).stat().st_size, "binary": is_binary(rel)}
            for rel in list_files(pdir)]


TEMPLATES = {
    "hello": {
        "title": "Hello webpage",
        "description": "HTML, CSS and JavaScript, ready to go",
        "files": {
            "index.html": """<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Hello!</title>
    <link rel="stylesheet" href="style.css">
    <script src="script.js" defer></script>
  </head>
  <body>
    <main>
      <h1>Hi there! 👋</h1>
      <p>Edit <code>index.html</code>, <code>style.css</code> or <code>script.js</code>
        and this page updates as you type.</p>
      <button id="btn">Click me</button>
      <p id="count"></p>
    </main>
  </body>
</html>
""",
            "style.css": """body {
  font-family: system-ui, sans-serif;
  background: #fdf6ec;
  color: #2b2b2b;
  display: grid;
  place-items: center;
  min-height: 100vh;
  margin: 0;
}

main {
  max-width: 32rem;
  padding: 2rem;
  text-align: center;
}

button {
  font: inherit;
  padding: 0.6rem 1.2rem;
  border: 0;
  border-radius: 999px;
  background: #ff7a59;
  color: white;
  cursor: pointer;
}
""",
            "script.js": """const btn = document.querySelector("#btn");
const count = document.querySelector("#count");
let clicks = 0;

btn.addEventListener("click", () => {
  clicks++;
  count.textContent = `Clicked ${clicks} time${clicks === 1 ? "" : "s"}`;
  console.log("click!", clicks);
});
""",
        },
    },
    "game": {
        "title": "Canvas game",
        "description": "A tiny arrow-key game on a <canvas>",
        "files": {
            "index.html": """<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Dot muncher</title>
    <style>
      body { margin: 0; background: #111; display: grid; place-items: center; height: 100vh; }
      canvas { background: #1d1f2b; border-radius: 12px; max-width: 100%; }
    </style>
  </head>
  <body>
    <canvas id="game" width="480" height="360"></canvas>
    <script src="game.js"></script>
  </body>
</html>
""",
            "game.js": """const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const keys = {};
const player = { x: 240, y: 180, size: 20, speed: 3 };
let dot = newDot();
let score = 0;

addEventListener("keydown", (e) => (keys[e.key] = true));
addEventListener("keyup", (e) => (keys[e.key] = false));

function newDot() {
  return { x: 20 + Math.random() * 440, y: 20 + Math.random() * 320 };
}

function update() {
  if (keys.ArrowLeft) player.x -= player.speed;
  if (keys.ArrowRight) player.x += player.speed;
  if (keys.ArrowUp) player.y -= player.speed;
  if (keys.ArrowDown) player.y += player.speed;
  player.x = Math.max(0, Math.min(canvas.width - player.size, player.x));
  player.y = Math.max(0, Math.min(canvas.height - player.size, player.y));

  const dx = player.x + player.size / 2 - dot.x;
  const dy = player.y + player.size / 2 - dot.y;
  if (Math.hypot(dx, dy) < player.size) {
    score++;
    dot = newDot();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffd166";
  ctx.beginPath();
  ctx.arc(dot.x, dot.y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#06d6a0";
  ctx.fillRect(player.x, player.y, player.size, player.size);
  ctx.fillStyle = "white";
  ctx.font = "16px system-ui";
  ctx.fillText(`Score: ${score}  (use the arrow keys)`, 12, 24);
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}
loop();
""",
        },
    },
    "blank": {
        "title": "Blank page",
        "description": "Just an index.html",
        "files": {
            "index.html": """<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>New project</title>
  </head>
  <body>

  </body>
</html>
""",
        },
    },
}


def create_project(owner, template="hello", remix=None):
    name = random_name()
    pdir = project_dir(name)
    now = time.time()
    if remix:
        shutil.copytree(project_dir(remix), pdir, symlinks=False)
        label = f"Remixed from {remix}"
    else:
        tpl = TEMPLATES.get(template) or TEMPLATES["hello"]
        pdir.mkdir(parents=True)
        for rel, text in tpl["files"].items():
            (pdir / rel).write_text(text)
        label = "Project created"
    x("INSERT INTO projects(name, owner, created, updated, remixed_from) VALUES(?,?,?,?,?)",
      (name, owner, now, now, remix))
    snapshot(name, owner, kind="create", label=label)
    return name


# ---------------------------------------------------------------- history ("rewind")

def diff_manifests(a, b):
    return {
        "added": sorted(k for k in b if k not in a),
        "modified": sorted(k for k in b if k in a and a[k] != b[k]),
        "deleted": sorted(k for k in a if k not in b),
    }


def store_blob(data):
    h = hashlib.sha256(data).hexdigest()
    if not CONN.execute("SELECT 1 FROM blobs WHERE hash=?", (h,)).fetchone():
        CONN.execute("INSERT INTO blobs(hash, data) VALUES(?,?)", (h, data))
    return h


def snapshot(name, author, kind="auto", label=None, ref=None):
    """Record the project's current files as a rewind step.

    Quick successive saves by one person are merged into a single "auto" step so the
    timeline reads as moments of work rather than every keystroke.
    """
    pdir = project_dir(name)
    with LOCK:
        manifest = {rel: store_blob((pdir / rel).read_bytes()) for rel in list_files(pdir)}
        rows = CONN.execute("SELECT * FROM versions WHERE project=? ORDER BY id DESC LIMIT 2",
                            (name,)).fetchall()
        prev = rows[0] if rows else None
        now = time.time()
        CONN.execute("UPDATE projects SET updated=? WHERE name=?", (now, name))

        unchanged = prev is not None and json.loads(prev["manifest"]) == manifest
        if unchanged and kind == "auto":
            CONN.commit()
            return prev["id"]
        if unchanged and kind == "checkpoint":
            # Nothing new since the last step: mark that step instead of adding an empty one.
            CONN.execute("UPDATE versions SET kind='checkpoint', label=? WHERE id=?", (label, prev["id"]))
            CONN.commit()
            return prev["id"]

        coalesce = (kind == "auto" and prev is not None and prev["kind"] == "auto"
                    and prev["author"] == author and len(rows) == 2
                    and now - prev["updated"] < COALESCE_SECONDS)
        if coalesce:
            changes = diff_manifests(json.loads(rows[1]["manifest"]), manifest)
            if any(changes.values()):
                CONN.execute("UPDATE versions SET updated=?, manifest=?, changes=? WHERE id=?",
                             (now, json.dumps(manifest), json.dumps(changes), prev["id"]))
                vid = prev["id"]
            else:  # edits were undone back to the previous step
                CONN.execute("DELETE FROM versions WHERE id=?", (prev["id"],))
                vid = rows[1]["id"]
            CONN.commit()
            return vid

        base = json.loads(prev["manifest"]) if prev else {}
        cur = CONN.execute(
            "INSERT INTO versions(project, created, updated, author, kind, label, ref, manifest, changes) "
            "VALUES(?,?,?,?,?,?,?,?,?)",
            (name, now, now, author, kind, label, ref, json.dumps(manifest),
             json.dumps(diff_manifests(base, manifest))))
        CONN.commit()
        return cur.lastrowid


def get_version(name, vid):
    row = q1("SELECT * FROM versions WHERE project=? AND id=?", (name, vid))
    if not row:
        raise HTTPError(404, "Version not found")
    return row


def blob(h):
    row = q1("SELECT data FROM blobs WHERE hash=?", (h,))
    return row["data"] if row else b""


def restore(name, vid, author, path=None):
    manifest = json.loads(get_version(name, vid)["manifest"])
    pdir = project_dir(name)
    with LOCK:
        targets = [path] if path else sorted(set(list_files(pdir)) | set(manifest))
        for rel in targets:
            full = safe_path(pdir, rel)
            if rel in manifest:
                make_parents(pdir.resolve(), full)
                full.write_bytes(blob(manifest[rel]))
            elif full.is_file():
                full.unlink()
                remove_empty_dirs(pdir, full)
        return snapshot(name, author, kind="restore", label=path, ref=vid)


# ---------------------------------------------------------------- HTTP

def content_type(path):
    t = mimetypes.guess_type(path)[0] or "application/octet-stream"
    if t.startswith("text/") or t in ("application/json", "image/svg+xml"):
        t += "; charset=utf-8"
    return t


def inject_bridge(html: bytes) -> bytes:
    m = re.search(rb"<head[^>]*>", html, re.I)
    tag = BRIDGE_TAG.encode()
    if m:
        return html[:m.end()] + tag + html[m.end():]
    return tag + html


AI_SYSTEM = """You are a coding assistant inside glitch~nhance, a small live web editor like Glitch.
A project is a folder of static files (HTML, CSS, JavaScript, images) served as-is: there is no build
step, no npm and no server code, so use plain browser JavaScript and CDN links where a library is needed.
index.html is the page shown in the preview.

You will be given the project's text files and the person's request. Answer with JSON:
- "reply": a short, friendly explanation of what you did or your answer (plain text, no code blocks).
- "files": the files you want to create or change, each with its project-relative "path" and the
  COMPLETE new "content" of that file. Never send partial files, placeholders or "..." elisions.
  Leave out files you are not changing. Use an empty list when the request is only a question.
- "renames": files to rename or move, as {"from": old path, "to": new path}. To also change a renamed
  file's contents, put it in "files" under its NEW path. Remember to update references to it (links,
  <script src>, imports) in the other files.
- "deletes": paths of files to delete. Only delete when the request calls for it, and never delete
  index.html unless asked to by name.
The person reviews your changes as a diff before applying them, so keep edits focused on the request
and keep the existing code style."""


def ai_context(pdir, current, selection):
    parts, used = [], 0
    files = list_files(pdir)
    # The file being edited goes first so it is never the one cut off by the size budget.
    for rel in sorted(files, key=lambda r: r != current):
        if is_binary(rel):
            parts.append(f"=== {rel} (binary file, {(pdir / rel).stat().st_size} bytes) ===")
            continue
        try:
            text = (pdir / rel).read_text()
        except (UnicodeDecodeError, OSError):
            continue
        if used + len(text) > AI_CONTEXT_CHARS:
            parts.append(f"=== {rel} (left out: project too large) ===")
            continue
        used += len(text)
        parts.append(f"=== {rel} ===\n{text}")
    head = f"Project files ({len(files)}):\n\n" + "\n\n".join(parts)
    if current:
        head += f"\n\nThe person currently has {current} open in the editor."
    if selection:
        head += f"\nThey have this part of {current} selected:\n{selection[:20000]}"
    return head


def json_schema(node):
    """The schemas below use upper-case type names (OBJECT, STRING); JSON Schema wants lower-case, and strict
    mode wants every property required and no extras."""
    if isinstance(node, dict):
        out = {k: json_schema(v) for k, v in node.items()}
        if isinstance(out.get("type"), str):
            out["type"] = out["type"].lower()
        if out.get("type") == "object":
            out["additionalProperties"] = False
            out["required"] = list(out.get("properties", {}))
        return out
    if isinstance(node, list):
        return [json_schema(v) for v in node]
    return node


def call_ai(system, messages, schema, model=None):
    """One OpenRouter chat call that must answer with JSON matching schema; returns the parsed object, plus
    "_model": the model that actually served it, as OpenRouter reports it (models are unreliable about naming
    themselves). messages are [{"role": "user" | "assistant", "content": str}]."""
    payload = {
        "model": model or AI_MODEL,
        "messages": [{"role": "system", "content": system}] + messages,
        "response_format": {"type": "json_schema", "json_schema": {
            "name": "answer", "strict": True, "schema": json_schema(schema)}},
    }
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {AI_KEY}",
                 "HTTP-Referer": PUBLIC_URL, "X-Title": "glitch"},
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as res:
            data = json.load(res)
    except urllib.error.HTTPError as e:
        try:
            err = json.load(e).get("error", {})
            msg = err.get("message", "") if isinstance(err, dict) else str(err)
        except ValueError:
            msg = ""
        raise HTTPError(502, f"The AI service said no ({e.code}). {msg}".strip())
    except (urllib.error.URLError, TimeoutError) as e:
        raise HTTPError(502, f"Couldn't reach the AI service: {e}")

    cand = (data.get("choices") or [{}])[0]
    text = (cand.get("message") or {}).get("content") or ""
    try:
        out = json.loads(text)
    except ValueError:
        reason = cand.get("finish_reason") or "no answer"
        raise HTTPError(502, f"The AI's answer was cut off or malformed ({reason}). Try a smaller request.")
    if not isinstance(out, dict):
        raise HTTPError(502, "The AI answered in an unexpected shape. Try again.")
    out["_model"] = data.get("model") or model or AI_MODEL
    return out


def ask_ai(pdir, messages, current, selection):
    """Send the conversation to the AI; returns its reply and the changed files (diffable against disk)."""
    msgs = [m for m in messages if m.get("role") in ("user", "model") and str(m.get("text", "")).strip()][-20:]
    if not msgs or msgs[-1]["role"] != "user":
        raise HTTPError(400, "Nothing to ask")
    contents = [{"role": "assistant" if m["role"] == "model" else "user", "content": str(m["text"])[:20000]}
                for m in msgs[:-1]]
    contents.append({"role": "user", "content":
                     ai_context(pdir, current, selection) + "\n\nRequest: " + str(msgs[-1]["text"])[:20000]})
    out = call_ai(AI_SYSTEM, contents, {
        "type": "OBJECT",
        "properties": {
            "reply": {"type": "STRING"},
            "files": {"type": "ARRAY", "items": {
                "type": "OBJECT",
                "properties": {"path": {"type": "STRING"}, "content": {"type": "STRING"}},
                "required": ["path", "content"]}},
            "renames": {"type": "ARRAY", "items": {
                "type": "OBJECT",
                "properties": {"from": {"type": "STRING"}, "to": {"type": "STRING"}},
                "required": ["from", "to"]}},
            "deletes": {"type": "ARRAY", "items": {"type": "STRING"}},
        },
        "required": ["reply", "files"],
    })
    return {"reply": str(out.get("reply", "")).strip(), "changes": ai_changes(pdir, out), "model": out["_model"]}


AI_MAX_CHANGES = 50


def ai_changes(pdir, out):
    """Turn the model's proposal into a list of reviewable changes, keeping only ones that are safe to apply.

    Nothing here touches the disk: the person applies changes through the normal file API, which checks
    everything again. Anything odd (paths outside the project, folders, missing sources, clashes) is dropped."""
    def clean(p):
        if not isinstance(p, str):
            return None
        rel = p.strip().lstrip("/")
        try:
            return rel, safe_path(pdir, rel)
        except HTTPError:
            return None

    def text_of(full, rel):
        return None if is_binary(rel) else full.read_text(errors="replace")

    changes, claimed = [], set()  # claimed: paths some change already uses, so two can't fight over one

    for r in (out.get("renames") or [])[:AI_MAX_CHANGES]:
        if not isinstance(r, dict):
            continue
        a, b = clean(r.get("from")), clean(r.get("to"))
        if not a or not b or a[0] == b[0] or a[0] in claimed or b[0] in claimed:
            continue
        if not a[1].is_file() or b[1].exists() or is_binary(a[0]) != is_binary(b[0]):
            continue
        before = text_of(a[1], a[0])
        changes.append({"kind": "rename", "from": a[0], "path": b[0], "before": before, "after": before,
                        "binary": is_binary(a[0])})
        claimed |= {a[0], b[0]}

    renamed_to = {c["path"]: c for c in changes}
    for f in out.get("files") or []:
        if not isinstance(f, dict) or not isinstance(f.get("content"), str):
            continue
        p = clean(f.get("path"))
        if not p or is_binary(p[0]) or p[1].is_dir():
            continue
        rel, full = p
        if rel in renamed_to:
            if not renamed_to[rel]["binary"]:
                renamed_to[rel]["after"] = f["content"]
            continue
        if rel in claimed:
            continue
        before = full.read_text(errors="replace") if full.is_file() else None
        if before != f["content"]:
            changes.append({"kind": "edit" if before is not None else "add", "path": rel,
                            "before": before, "after": f["content"]})
            claimed.add(rel)

    for d in out.get("deletes") or []:
        p = clean(d)
        if not p or p[0] in claimed or not p[1].is_file():
            continue
        changes.append({"kind": "delete", "path": p[0], "before": text_of(p[1], p[0]), "after": None,
                        "binary": is_binary(p[0])})
        claimed.add(p[0])

    return changes[:AI_MAX_CHANGES]


IDEA_KINDS = ["resilience", "security", "speed", "minimalism", "ux", "gorgeousness"]
IDEAS_SYSTEM = """You review one file from a small static web project (HTML, CSS and browser JavaScript, no build
step) and suggest improvements. Give exactly one idea for each of these themes, in this order:
- resilience: handling errors, missing data, slow networks, odd inputs or old browsers gracefully
- security: XSS, unsafe innerHTML, leaked secrets, risky third-party scripts, missing rel=noopener, etc.
- speed: faster loading and running (fewer requests, lazy loading, defer, smaller assets, less layout work)
- minimalism: removing code, dependencies or clutter that isn't pulling its weight
- ux: clearer, friendlier, more accessible interaction (labels, focus, feedback, mobile, keyboard)
- gorgeousness: making it look delightful (typography, spacing, colour, motion, polish)
Each idea must be specific to THIS file's actual code, naming the elements, functions or rules involved; never
generic advice. If a theme genuinely has nothing to improve, suggest the best small polish for it anyway.
For each idea give: "kind" (the theme), "title" (at most 8 words), "why" (1-2 plain sentences a beginner
understands), and "prompt" (an instruction another AI coding assistant could follow to make the change)."""


def ai_ideas(pdir, current):
    rel = current or "index.html"
    full = safe_path(pdir, rel)
    if not full.is_file() or is_binary(rel):
        raise HTTPError(400, "Open a code file first, then ask for suggestions")
    text = full.read_text(errors="replace")[:AI_CONTEXT_CHARS]
    others = ", ".join(r for r in list_files(pdir) if r != rel) or "none"
    out = call_ai(IDEAS_SYSTEM, [{"role": "user", "content":
        f"Other files in the project: {others}\n\n=== {rel} ===\n{text}"}], {
        "type": "OBJECT",
        "properties": {"ideas": {"type": "ARRAY", "items": {
            "type": "OBJECT",
            "properties": {
                "kind": {"type": "STRING", "enum": IDEA_KINDS},
                "title": {"type": "STRING"}, "why": {"type": "STRING"}, "prompt": {"type": "STRING"}},
            "required": ["kind", "title", "why", "prompt"]}}},
        "required": ["ideas"],
    }, model=IDEAS_MODEL)
    ideas = [i for i in out.get("ideas") or [] if i.get("kind") in IDEA_KINDS and i.get("prompt")]
    ideas.sort(key=lambda i: IDEA_KINDS.index(i["kind"]))
    return {"file": rel, "ideas": ideas[:6], "model": out["_model"]}


def ai_allowed(user):
    return bool(AI_KEY) and user is not None and ("*" in AI_USERS or user["name"] in AI_USERS)


def build_info():
    """What deploy/deploy.sh stamped into build.json (commit and times), or None when run from a checkout."""
    try:
        return json.loads((ROOT / "build.json").read_text())
    except (OSError, ValueError):
        return None


NOT_FOUND_PAGE ="""<!doctype html><meta charset="utf-8"><title>Not found</title>
<body style="font-family:system-ui;padding:2rem;color:#555">
<h2>404 — nothing here</h2><p>There's no file called <code>{}</code> in this project.</p>"""


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "glitch-nhance/1"
    sys_version = ""  # don't advertise the Python version

    def log_request(self, code="-", size="-"):
        if isinstance(code, int) and code >= 400:
            super().log_request(code, size)

    # -- plumbing

    def do_GET(self): self.handle_any("GET")
    def do_HEAD(self): self.handle_any("GET")
    def do_POST(self): self.handle_any("POST")
    def do_PUT(self): self.handle_any("PUT")
    def do_PATCH(self): self.handle_any("PATCH")
    def do_DELETE(self): self.handle_any("DELETE")

    def handle_any(self, method):
        # The handler object lives for the whole keep-alive connection, so reset per-request state.
        self.extra_headers = []
        self.__dict__.pop("_user", None)
        self.body_read = False
        if self.headers.get("Transfer-Encoding"):
            self.close_connection = True  # we only understand Content-Length bodies
        try:
            self.route(method)
        except HTTPError as e:
            self.send_json({"error": e.message or "Error"}, e.code)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:  # noqa: BLE001
            self.log_error("Unhandled error: %r", e)
            import traceback
            traceback.print_exc()
            self.send_json({"error": "Server error"}, 500)
        finally:
            self.discard_unread_body()

    def discard_unread_body(self):
        # A request turned away before its body was read (not logged in, bad path...) would leave those bytes
        # on the connection, and Caddy reuses connections, so they'd be glued onto the next person's request.
        if self.body_read or self.close_connection:
            return
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            n = -1
        if 0 <= n <= MAX_BODY:
            self.rfile.read(n)
        else:
            self.close_connection = True

    def send(self, code, body=b"", ctype="text/plain; charset=utf-8", headers=()):
        if isinstance(body, str):
            body = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in list(headers) + self.extra_headers:
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def send_json(self, obj, code=200):
        self.send(code, json.dumps(obj), "application/json", [("Cache-Control", "no-store")])

    def redirect(self, location):
        self.send(302, "", headers=[("Location", location)])

    def body(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            self.close_connection = True
            raise HTTPError(400, "Bad Content-Length")
        if n < 0 or n > MAX_BODY:
            self.close_connection = True
            raise HTTPError(413, "File too big (20 MB max)")
        self.body_read = True
        return self.rfile.read(n) if n else b""

    def json_body(self):
        raw = self.body()
        try:
            return json.loads(raw or b"{}")
        except ValueError:
            raise HTTPError(400, "Bad JSON")

    @property
    def user(self):
        if not hasattr(self, "_user"):
            cookie = http.cookies.SimpleCookie(self.headers.get("Cookie") or "")
            self._user = find_user(cookie["glitch_key"].value) if "glitch_key" in cookie else None
        return self._user

    def set_key_cookie(self, key, max_age=31536000):
        secure = "; Secure" if self.headers.get("X-Forwarded-Proto") == "https" else ""
        self.extra_headers.append(
            ("Set-Cookie", f"glitch_key={key}; Path=/; Max-Age={max_age}; HttpOnly; SameSite=Lax{secure}"))

    def serve_static(self, rel):
        full = (STATIC / rel).resolve()
        if STATIC.resolve() not in full.parents or not full.is_file():
            raise HTTPError(404, "Not found")
        self.send(200, full.read_bytes(), content_type(full.name), [("Cache-Control", "no-cache")])

    # -- routing

    def route(self, method):
        url = urllib.parse.urlsplit(self.path)
        path = urllib.parse.unquote(url.path)
        qs = {k: v[0] for k, v in urllib.parse.parse_qs(url.query).items()}
        host = (self.headers.get("Host") or "").split(":")[0].lower()

        if path == "/_glitch/bridge.js":
            return self.serve_static("bridge.js")
        if PREVIEW_HOST and host.endswith("." + PREVIEW_HOST):
            return self.preview(host[: -len(PREVIEW_HOST) - 1], path[1:], "/")
        if path.startswith("/p/"):
            name, _, rest = path[3:].partition("/")
            if not _:
                return self.redirect(f"/p/{name}/")
            return self.preview(name, rest, f"/p/{name}/")
        if path.startswith("/api/"):
            return self.api(method, [p for p in path[5:].split("/") if p], qs)
        if path == "/login":
            key = qs.get("key", "")
            if find_user(key):
                self.set_key_cookie(key)
                return self.redirect("/")
            return self.redirect("/?badkey=1")
        if path in ("/", "/index.html"):
            return self.serve_static("index.html")
        if path.startswith("/edit/"):
            return self.serve_static("editor.html")
        if path.startswith("/static/"):
            return self.serve_static(path[len("/static/"):])
        if path == "/favicon.ico":
            return self.serve_static("favicon.svg")
        raise HTTPError(404, "Not found")

    def preview(self, name, rest, base):
        if not NAME_RE.match(name) or not project_dir(name).is_dir():
            return self.send(404, "No project with that name.")
        version = None
        m = re.match(r"^@(\d+)(/|$)(.*)$", rest)
        if m:
            if not m.group(2):
                return self.redirect(f"{base}@{m.group(1)}/")
            version = json.loads(get_version(name, int(m.group(1)))["manifest"])
            rest = m.group(3)
        pdir = project_dir(name)

        def lookup(rel):
            if version is not None:
                return blob(version[rel]) if rel in version else None
            try:
                full = safe_path(pdir, rel)
            except HTTPError:
                return None
            return full.read_bytes() if full.is_file() else None

        def is_dir(rel):
            if version is not None:
                return any(k.startswith(rel + "/") for k in version)
            return (pdir / rel).is_dir()

        rel = rest
        if rel == "" or rel.endswith("/"):
            rel += "index.html"
        data = lookup(rel)
        if data is None and rest and not rest.endswith("/"):
            if is_dir(rest):
                return self.redirect(self.path.split("?")[0] + "/")
            if "." not in rest.rsplit("/", 1)[-1]:
                rel = rest + ".html"
                data = lookup(rel)
        if data is None:
            body = NOT_FOUND_PAGE.format(rel.replace("<", "&lt;"))
            return self.send(404, inject_bridge(body.encode()), "text/html; charset=utf-8",
                             [("Cache-Control", "no-store")])
        ctype = content_type(rel)
        if ctype.startswith("text/html"):
            data = inject_bridge(data)
        self.send(200, data, ctype, [("Cache-Control", "no-store"), ("X-Robots-Tag", "noindex")])

    # -- JSON API

    def api(self, method, parts, qs):
        user = self.user
        if parts == ["me"]:
            return self.send_json({
                "user": dict(user) if user else None,
                "preview_host": PREVIEW_HOST or None,
                "ai": ai_allowed(user),
                "build": build_info(),
                "templates": [{"id": k, "title": v["title"], "description": v["description"]}
                              for k, v in TEMPLATES.items()],
            })
        if parts == ["login"] and method == "POST":
            key = (self.json_body().get("key") or "").strip()
            if not find_user(key):
                raise HTTPError(403, "That key doesn't match anyone")
            self.set_key_cookie(key)
            return self.send_json({"ok": True})
        if parts == ["gallery"] and method == "GET":
            # The public face for visitors who aren't logged in. Project pages under /p/ are already public;
            # owners' names are left out so nobody's name is on show.
            rows = q("SELECT name, updated FROM projects ORDER BY updated DESC LIMIT 500")
            return self.send_json([{"name": r["name"], "updated": r["updated"]} for r in rows])
        if parts == ["logout"] and method == "POST":
            self.set_key_cookie("", max_age=0)
            return self.send_json({"ok": True})
        if not user:
            raise HTTPError(401, "Not logged in")

        if parts == ["projects"]:
            if method == "GET":
                rows = q("SELECT p.name, p.owner, u.name AS owner_name, p.description, p.created, "
                         "p.updated, p.remixed_from FROM projects p LEFT JOIN users u ON u.id=p.owner "
                         "ORDER BY p.updated DESC")
                return self.send_json([dict(r) | {"mine": r["owner"] == user["id"]} for r in rows])
            if method == "POST":
                b = self.json_body()
                remix = b.get("remix")
                if remix:
                    get_project(remix)
                name = create_project(user["id"], b.get("template") or "hello", remix)
                return self.send_json({"name": name}, 201)

        if len(parts) >= 2 and parts[0] == "projects":
            return self.project_api(method, get_project(parts[1]), parts[2:], qs, user)
        raise HTTPError(404, "Not found")

    def project_api(self, method, proj, rest, qs, user):
        name = proj["name"]
        pdir = project_dir(name)
        can_edit = proj["owner"] == user["id"]

        def need_edit():
            if not can_edit:
                raise HTTPError(403, "Only the owner can change this project. Remix it to get your own copy.")

        if not rest:
            if method == "GET":
                return self.send_json({
                    "name": name, "owner": proj["owner"], "owner_name": proj["owner_name"],
                    "description": proj["description"], "remixed_from": proj["remixed_from"],
                    "can_edit": can_edit, "files": file_info(pdir)})
            if method == "PATCH":
                need_edit()
                b = self.json_body()
                if "description" in b:
                    x("UPDATE projects SET description=? WHERE name=?", (str(b["description"])[:500], name))
                new = (b.get("name") or "").strip().lower()
                if new and new != name:
                    if not NAME_RE.match(new):
                        raise HTTPError(400, "Names can use a–z, 0–9 and dashes (2–50 characters)")
                    with LOCK:
                        if project_dir(new).exists() or q1("SELECT 1 FROM projects WHERE name=?", (new,)):
                            raise HTTPError(409, "That name is taken")
                        pdir.rename(project_dir(new))
                        CONN.execute("UPDATE projects SET name=? WHERE name=?", (new, name))
                        CONN.execute("UPDATE versions SET project=? WHERE project=?", (new, name))
                        CONN.execute("UPDATE projects SET remixed_from=? WHERE remixed_from=?", (new, name))
                        CONN.commit()
                    name = new
                return self.send_json({"name": name})
            if method == "DELETE":
                need_edit()
                with LOCK:
                    shutil.move(str(pdir), str(TRASH / f"{name}-{int(time.time())}"))
                    CONN.execute("DELETE FROM projects WHERE name=?", (name,))
                    CONN.execute("DELETE FROM versions WHERE project=?", (name,))
                    CONN.commit()
                return self.send_json({"ok": True})

        if rest == ["files"]:
            rel = qs.get("path", "")
            full = safe_path(pdir, rel)
            if method == "GET":
                if not full.is_file():
                    raise HTTPError(404, "No such file")
                return self.send(200, full.read_bytes(), content_type(rel), [("Cache-Control", "no-store")])
            need_edit()
            if method == "PUT":
                data = self.body()
                with LOCK:
                    if full.is_dir():
                        raise HTTPError(409, "There's a folder with that name")
                    make_parents(pdir.resolve(), full)
                    full.write_bytes(data)
                    vid = snapshot(name, user["id"])
                return self.send_json({"ok": True, "version": vid})
            if method == "DELETE":
                with LOCK:
                    if full.is_file():
                        full.unlink()
                        remove_empty_dirs(pdir, full)
                    vid = snapshot(name, user["id"])
                return self.send_json({"ok": True, "version": vid})

        if rest == ["rename"] and method == "POST":
            need_edit()
            b = self.json_body()
            src, dst = safe_path(pdir, b.get("from", "")), safe_path(pdir, b.get("to", ""))
            with LOCK:
                if not src.is_file():
                    raise HTTPError(404, "No such file")
                if dst.exists():
                    raise HTTPError(409, "A file with that name already exists")
                make_parents(pdir.resolve(), dst)
                os.replace(src, dst)
                remove_empty_dirs(pdir, src)
                vid = snapshot(name, user["id"])
            return self.send_json({"ok": True, "version": vid})

        if rest in (["ai"], ["ideas"]) and method == "POST":
            need_edit()
            if not AI_KEY:
                raise HTTPError(503, "AI isn't set up on this server (no OPENROUTER_API_KEY)")
            if not ai_allowed(user):
                print(f"ai refused for {user['name']} (not in GLITCH_AI_USERS)", flush=True)
                raise HTTPError(403, "AI isn't switched on for your account")

        if rest == ["ai"] and method == "POST":
            b = self.json_body()
            current = b.get("current") if isinstance(b.get("current"), str) else None
            t = time.time()
            try:
                out = ask_ai(pdir, b.get("messages") or [], current, b.get("selection") or "")
            except HTTPError as e:
                print(f"ai {name} by {user['name']}: failed after {time.time() - t:.1f}s: {e.message}", flush=True)
                raise
            print(f"ai {name} by {user['name']}: {len(out['changes'])} file(s) in {time.time() - t:.1f}s"
                  f" via {out['model']}", flush=True)
            return self.send_json(out)

        if rest == ["ideas"] and method == "POST":
            current = self.json_body().get("current")
            t = time.time()
            out = ai_ideas(pdir, current if isinstance(current, str) else None)
            print(f"ideas {name}/{out['file']} by {user['name']}: {len(out['ideas'])} in {time.time() - t:.1f}s"
                  f" via {out['model']}", flush=True)
            return self.send_json(out)

        if rest == ["export"] and method == "GET":
            # Anyone who can view a project can download it, the same as remixing it.
            buf = io.BytesIO()
            with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
                for rel in list_files(pdir):  # list_files skips symlinks; safe_path re-checks each one
                    z.writestr(f"{name}/{rel}", safe_path(pdir, rel).read_bytes())
            return self.send(200, buf.getvalue(), "application/zip", [
                ("Content-Disposition", f'attachment; filename="{name}.zip"'), ("Cache-Control", "no-store")])

        if rest == ["remix"] and method == "POST":
            return self.send_json({"name": create_project(user["id"], remix=name)}, 201)

        if rest == ["history"] and method == "GET":
            rows = q("SELECT v.id, v.created, v.updated, v.author, u.name AS author_name, v.kind, "
                     "v.label, v.ref, v.changes FROM versions v LEFT JOIN users u ON u.id=v.author "
                     "WHERE v.project=? ORDER BY v.id DESC LIMIT 1000", (name,))
            return self.send_json([dict(r) | {"changes": json.loads(r["changes"])} for r in rows])

        if rest == ["checkpoint"] and method == "POST":
            need_edit()
            label = (self.json_body().get("label") or "Checkpoint").strip()[:100]
            return self.send_json({"version": snapshot(name, user["id"], kind="checkpoint", label=label)})

        if len(rest) >= 2 and rest[0] == "history" and rest[1].isdigit():
            v = get_version(name, int(rest[1]))
            manifest = json.loads(v["manifest"])
            if rest[2:] == [] and method == "GET":
                return self.send_json({"id": v["id"], "files": sorted(manifest)})
            if rest[2:] == ["file"] and method == "GET":
                rel = qs.get("path", "")
                if rel not in manifest:
                    raise HTTPError(404, "File didn't exist in that version")
                return self.send(200, blob(manifest[rel]), content_type(rel), [("Cache-Control", "no-store")])
            if rest[2:] == ["restore"] and method == "POST":
                need_edit()
                path = self.json_body().get("path") or None
                return self.send_json({"version": restore(name, v["id"], user["id"], path)})

        raise HTTPError(404, "Not found")


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd")
    s = sub.add_parser("serve", help="run the web server")
    s.add_argument("--host", default=os.environ.get("GLITCH_HOST", "127.0.0.1"))
    s.add_argument("--port", type=int, default=int(os.environ.get("GLITCH_PORT", 8090)))
    a = sub.add_parser("adduser", help="create a user and print their login link")
    a.add_argument("name")
    sub.add_parser("users", help="list users")
    args = ap.parse_args()
    init_db()

    if args.cmd == "adduser":
        try:
            key = add_user(args.name)
        except sqlite3.IntegrityError:
            sys.exit(f"A user called {args.name!r} already exists")
        print(f"Created {args.name}.\n  key:  {key}\n  link: {PUBLIC_URL}/login?key={key}")
    elif args.cmd == "users":
        for r in q("SELECT u.id, u.name, (SELECT COUNT(*) FROM projects p WHERE p.owner=u.id) n "
                   "FROM users u ORDER BY u.id"):
            print(f"{r['id']:>3}  {r['name']:<20} {r['n']} projects")
    else:
        host = getattr(args, "host", "127.0.0.1")
        port = getattr(args, "port", 8090)
        print(f"Serving on http://{host}:{port}  (data in {DATA})", flush=True)
        Server((host, port), Handler).serve_forever()


if __name__ == "__main__":
    main()
