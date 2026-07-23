"""TeumMeal development server with a small persistent vote API.

Uses only the Python standard library. It is suitable for local/LAN MVP testing;
production deployments should replace this store with a managed database.
"""

from __future__ import annotations

import argparse
import json
import os
import secrets
import threading
import time
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DATA_FILE = DATA_DIR / "votes.json"
STORE_LOCK = threading.RLock()


def load_store() -> dict:
    with STORE_LOCK:
        try:
            value = json.loads(DATA_FILE.read_text(encoding="utf-8"))
            return value if isinstance(value, dict) else {}
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            return {}


def save_store(store: dict) -> None:
    with STORE_LOCK:
        DATA_DIR.mkdir(exist_ok=True)
        temporary = DATA_FILE.with_suffix(".tmp")
        temporary.write_text(
            json.dumps(store, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        os.replace(temporary, DATA_FILE)


def public_vote(vote: dict) -> dict:
    return {
        "id": vote["id"],
        "title": vote["title"],
        "candidates": vote["candidates"],
        "participants": len(vote.get("choices", {})),
        "createdAt": vote["createdAt"],
        "updatedAt": vote["updatedAt"],
    }


class TeumMealHandler(SimpleHTTPRequestHandler):
    server_version = "TeumMeal/0.3"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def send_json(self, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 32_768:
                return {}
            value = json.loads(self.rfile.read(length).decode("utf-8"))
            return value if isinstance(value, dict) else {}
        except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
            return {}

    def vote_path(self) -> list[str]:
        path = unquote(urlparse(self.path).path).strip("/")
        return path.split("/") if path else []

    def do_GET(self) -> None:
        parts = self.vote_path()
        if parts == ["api", "health"]:
            self.send_json({"ok": True, "service": "TeumMeal vote API"})
            return
        if len(parts) == 3 and parts[:2] == ["api", "votes"]:
            store = load_store()
            vote = store.get(parts[2])
            if not vote:
                self.send_json({"error": "투표를 찾을 수 없어요"}, HTTPStatus.NOT_FOUND)
                return
            self.send_json({"vote": public_vote(vote)})
            return
        super().do_GET()

    def do_POST(self) -> None:
        parts = self.vote_path()
        payload = self.read_json()
        if parts == ["api", "votes"]:
            title = str(payload.get("title", "")).strip()[:30]
            raw_candidates = payload.get("candidates", [])
            candidates = []
            for value in raw_candidates if isinstance(raw_candidates, list) else []:
                name = str(value).strip()[:20]
                if name and name not in candidates:
                    candidates.append(name)
            if not title or len(candidates) < 2 or len(candidates) > 10:
                self.send_json({"error": "제목과 2~10개의 후보가 필요해요"}, HTTPStatus.BAD_REQUEST)
                return
            now = int(time.time() * 1000)
            vote_id = secrets.token_urlsafe(6)
            vote = {
                "id": vote_id,
                "title": title,
                "candidates": [{"name": name, "votes": 0} for name in candidates],
                "choices": {},
                "createdAt": now,
                "updatedAt": now,
            }
            store = load_store()
            store[vote_id] = vote
            save_store(store)
            self.send_json({"vote": public_vote(vote)}, HTTPStatus.CREATED)
            return

        if len(parts) == 4 and parts[:2] == ["api", "votes"]:
            vote_id, action = parts[2], parts[3]
            with STORE_LOCK:
                store = load_store()
                vote = store.get(vote_id)
                if not vote:
                    self.send_json({"error": "투표를 찾을 수 없어요"}, HTTPStatus.NOT_FOUND)
                    return
                if action == "vote":
                    voter_id = str(payload.get("voterId", "")).strip()[:64]
                    try:
                        candidate_index = int(payload.get("candidateIndex"))
                    except (TypeError, ValueError):
                        candidate_index = -1
                    if not voter_id or not 0 <= candidate_index < len(vote["candidates"]):
                        self.send_json({"error": "올바른 투표 정보가 필요해요"}, HTTPStatus.BAD_REQUEST)
                        return
                    vote.setdefault("choices", {})[voter_id] = candidate_index
                    for candidate in vote["candidates"]:
                        candidate["votes"] = 0
                    for choice in vote["choices"].values():
                        if 0 <= int(choice) < len(vote["candidates"]):
                            vote["candidates"][int(choice)]["votes"] += 1
                elif action == "candidates":
                    name = str(payload.get("name", "")).strip()[:20]
                    if not name or any(item["name"] == name for item in vote["candidates"]):
                        self.send_json({"error": "새로운 후보 이름이 필요해요"}, HTTPStatus.BAD_REQUEST)
                        return
                    if len(vote["candidates"]) >= 10:
                        self.send_json({"error": "후보는 최대 10개까지 가능해요"}, HTTPStatus.BAD_REQUEST)
                        return
                    vote["candidates"].append({"name": name, "votes": 0})
                else:
                    self.send_json({"error": "지원하지 않는 작업이에요"}, HTTPStatus.NOT_FOUND)
                    return
                vote["updatedAt"] = int(time.time() * 1000)
                store[vote_id] = vote
                save_store(store)
            self.send_json({"vote": public_vote(vote)})
            return
        self.send_json({"error": "API 경로를 찾을 수 없어요"}, HTTPStatus.NOT_FOUND)

    def do_DELETE(self) -> None:
        parts = self.vote_path()
        if len(parts) == 3 and parts[:2] == ["api", "votes"]:
            with STORE_LOCK:
                store = load_store()
                if parts[2] not in store:
                    self.send_json({"error": "투표를 찾을 수 없어요"}, HTTPStatus.NOT_FOUND)
                    return
                del store[parts[2]]
                save_store(store)
            self.send_json({"ok": True})
            return
        self.send_json({"error": "API 경로를 찾을 수 없어요"}, HTTPStatus.NOT_FOUND)

    def log_message(self, format_string: str, *args) -> None:
        print(f"[{self.log_date_time_string()}] {format_string % args}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=4187)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("0.0.0.0", args.port), TeumMealHandler)
    print(f"TeumMeal server: http://127.0.0.1:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
