"""Casa Brasa — servidor do celular virtual (Android no VPS + Mobilerun).

Só aceita pedidos com o token do painel (o mesmo que o app usa com o
Convex, ES256, verificado pelo JWKS do app). Ouve apenas em 127.0.0.1; o
Caddy publica em https://phone.reinert1996.duckdns.org.
"""

import asyncio
import io
import json
import os
import re
import shlex
import subprocess
import time
import uuid
from pathlib import Path

import jwt
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from PIL import Image
from pydantic import BaseModel, Field

APP_URL = os.environ.get("PANEL_APP_URL", "https://casa-brasa.casabrasa.workers.dev")
DEVICE = os.environ.get("PHONE_DEVICE", "127.0.0.1:5555")
CONFIG = Path(os.environ.get("PHONE_CONFIG", "/root/.secrets/phone-agent.json"))
HISTORY = Path("/opt/phone-agent/history.json")
MOBILERUN = "/opt/phone-agent/.venv/bin/mobilerun"

PROVIDERS = {
    # provider: (mobilerun name, env var with the key, default model)
    "gemini": ("GoogleGenAI", "GOOGLE_API_KEY", "gemini-2.5-flash"),
    "anthropic": ("Anthropic", "ANTHROPIC_API_KEY", "claude-sonnet-5-5"),
    "openai": ("OpenAI", "OPENAI_API_KEY", "gpt-5-mini"),
    "openrouter": ("OpenAI", "OPENAI_API_KEY", "google/gemini-2.5-flash"),
}
OPENROUTER = "https://openrouter.ai/api/v1"
ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")

jwks = jwt.PyJWKClient(f"{APP_URL}/api/convex/jwks/", cache_keys=True, lifespan=3600)
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[APP_URL, "http://localhost:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["authorization", "content-type"],
)


def panel(authorization: str = Header(default="")):
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(401, "locked")
    try:
        key = jwks.get_signing_key_from_jwt(token)
        jwt.decode(token, key.key, algorithms=["ES256"], audience="casa-brasa", issuer=APP_URL)
    except Exception:
        raise HTTPException(401, "locked") from None
    return True


def adb(*args: str, timeout=20, binary=False):
    out = subprocess.run(["adb", "-s", DEVICE, *args], capture_output=True, timeout=timeout)
    if out.returncode != 0:
        subprocess.run(["adb", "connect", DEVICE], capture_output=True, timeout=10)
        out = subprocess.run(["adb", "-s", DEVICE, *args], capture_output=True, timeout=timeout)
    if out.returncode != 0:
        raise HTTPException(503, "phone_offline")
    return out.stdout if binary else out.stdout.decode(errors="replace")


def read_config():
    try:
        return json.loads(CONFIG.read_text())
    except Exception:
        return {}


# ------------------------------- screen ---------------------------------


@app.get("/status")
def status(_=Depends(panel)):
    try:
        booted = adb("shell", "getprop", "sys.boot_completed", timeout=8).strip() == "1"
        size = adb("shell", "wm", "size", timeout=8).split()[-1]
    except HTTPException:
        booted, size = False, None
    cfg = read_config()
    return {
        "online": booted,
        "size": size,
        "provider": cfg.get("provider"),
        "model": cfg.get("model"),
        "hasKey": bool(cfg.get("apiKey")),
        "running": next((t["id"] for t in TASKS.values() if t["state"] == "running"), None),
    }


@app.get("/screen")
def screen(w: int = 540, _=Depends(panel)):
    png = adb("exec-out", "screencap", "-p", binary=True, timeout=15)
    img = Image.open(io.BytesIO(png)).convert("RGB")
    w = max(240, min(w, img.width))
    img = img.resize((w, round(img.height * w / img.width)))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=70)
    return Response(buf.getvalue(), media_type="image/jpeg", headers={"Cache-Control": "no-store"})


class Tap(BaseModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)


class Swipe(BaseModel):
    x1: float = Field(ge=0, le=1)
    y1: float = Field(ge=0, le=1)
    x2: float = Field(ge=0, le=1)
    y2: float = Field(ge=0, le=1)
    ms: int = Field(default=300, ge=50, le=3000)


class Text(BaseModel):
    text: str = Field(max_length=500)


def screen_size():
    w, h = adb("shell", "wm", "size").split()[-1].split("x")
    return int(w), int(h)


@app.post("/tap")
def tap(body: Tap, _=Depends(panel)):
    w, h = screen_size()
    adb("shell", "input", "tap", str(round(body.x * w)), str(round(body.y * h)))
    return {"ok": True}


@app.post("/swipe")
def swipe(body: Swipe, _=Depends(panel)):
    w, h = screen_size()
    pts = [round(body.x1 * w), round(body.y1 * h), round(body.x2 * w), round(body.y2 * h)]
    adb("shell", "input", "swipe", *map(str, pts), str(body.ms))
    return {"ok": True}


KEYS = {"back": "4", "home": "3", "recents": "187", "enter": "66", "delete": "67", "power": "26"}


@app.post("/key/{name}")
def key(name: str, _=Depends(panel)):
    if name not in KEYS:
        raise HTTPException(400, "invalid")
    adb("shell", "input", "keyevent", KEYS[name])
    return {"ok": True}


@app.post("/text")
def text(body: Text, _=Depends(panel)):
    # adb's input text: spaces as %s, the rest quoted for the device shell
    adb("shell", "input text " + shlex.quote(body.text.replace(" ", "%s")))
    return {"ok": True}


# ------------------------------- config ---------------------------------


class Config(BaseModel):
    provider: str
    model: str | None = Field(default=None, max_length=100)
    apiKey: str | None = Field(default=None, max_length=300)


@app.get("/config")
def get_config(_=Depends(panel)):
    cfg = read_config()
    return {
        "provider": cfg.get("provider"),
        "model": cfg.get("model"),
        "hasKey": bool(cfg.get("apiKey")),
        "providers": {k: v[2] for k, v in PROVIDERS.items()},
    }


@app.post("/config")
def set_config(body: Config, _=Depends(panel)):
    if body.provider not in PROVIDERS:
        raise HTTPException(400, "invalid")
    cfg = read_config()
    cfg["provider"] = body.provider
    cfg["model"] = (body.model or "").strip() or PROVIDERS[body.provider][2]
    if body.apiKey and body.apiKey.strip():
        cfg["apiKey"] = body.apiKey.strip()
    CONFIG.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    tmp = CONFIG.with_suffix(".tmp")
    tmp.write_text(json.dumps(cfg))
    tmp.chmod(0o600)
    tmp.replace(CONFIG)
    return get_config()


# -------------------------------- tasks ---------------------------------

TASKS: dict[str, dict] = {}


def load_history():
    try:
        for t in json.loads(HISTORY.read_text()):
            TASKS[t["id"]] = {**t, "state": t["state"] if t["state"] != "running" else "stopped"}
    except Exception:
        pass


def save_history():
    done = sorted(TASKS.values(), key=lambda t: t["started"])[-50:]
    HISTORY.write_text(json.dumps([{k: v for k, v in t.items() if k != "proc"} for t in done]))


load_history()


class Task(BaseModel):
    goal: str = Field(min_length=2, max_length=2000)
    steps: int = Field(default=30, ge=5, le=80)
    reasoning: bool = False
    vision: bool = True


async def run_task(task: dict, body: Task, cfg: dict):
    name, env_key, _ = PROVIDERS[cfg["provider"]]
    env = {**os.environ, env_key: cfg["apiKey"], "NO_COLOR": "1", "TERM": "dumb"}
    cmd = [MOBILERUN, "run", body.goal, "--device", DEVICE, "-p", name, "-m", cfg["model"],
           "--steps", str(body.steps), "--save-trajectory", "none", "--no-stream",
           "--vision" if body.vision else "--no-vision",
           "--reasoning" if body.reasoning else "--no-reasoning"]
    if cfg["provider"] == "openrouter":
        cmd += ["--api_base", OPENROUTER]
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT, env=env, cwd="/opt/phone-agent")
    task["proc"] = proc
    assert proc.stdout
    async for raw in proc.stdout:
        line = ANSI.sub("", raw.decode(errors="replace")).rstrip()
        if line.strip():
            task["log"].append(line.replace(cfg["apiKey"], "•••")[:600])
            del task["log"][:-400]
    code = await proc.wait()
    if task["state"] == "running":
        task["state"] = "done" if code == 0 else "failed"
    task["ended"] = time.time()
    task.pop("proc", None)
    save_history()


@app.post("/tasks")
async def start_task(body: Task, _=Depends(panel)):
    cfg = read_config()
    if not cfg.get("apiKey"):
        raise HTTPException(400, "no_key")
    if any(t["state"] == "running" for t in TASKS.values()):
        raise HTTPException(409, "busy")
    tid = uuid.uuid4().hex[:10]
    task = {"id": tid, "goal": body.goal, "state": "running", "started": time.time(), "ended": None, "log": []}
    TASKS[tid] = task
    asyncio.create_task(run_task(task, body, cfg))
    return {"id": tid}


def public(t: dict, full=False):
    out = {k: v for k, v in t.items() if k not in ("proc", "log")}
    out["log"] = t["log"] if full else t["log"][-3:]
    return out


@app.get("/tasks")
def list_tasks(_=Depends(panel)):
    return [public(t) for t in sorted(TASKS.values(), key=lambda t: -t["started"])[:30]]


@app.get("/tasks/{tid}")
def get_task(tid: str, _=Depends(panel)):
    if tid not in TASKS:
        raise HTTPException(404, "not_found")
    return public(TASKS[tid], full=True)


@app.post("/tasks/{tid}/stop")
async def stop_task(tid: str, _=Depends(panel)):
    t = TASKS.get(tid)
    if not t:
        raise HTTPException(404, "not_found")
    if t["state"] == "running" and t.get("proc"):
        t["state"] = "stopped"
        t["proc"].terminate()
    return public(t)
