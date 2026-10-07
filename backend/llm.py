"""Minimal LLM client for Jtap.

One function: generate(prompt) -> str | None.
- Provider is chosen with the LLM_PROVIDER env var (default: "ollama").
- "ollama" talks to a local Ollama server (http://localhost:11434 by default,
  override with OLLAMA_HOST). Model via LLM_MODEL (default "llama3.2:3b",
  a good CPU-friendly pick).
- "openai" uses the chat completions API with OPENAI_API_KEY.
- Any failure (server down, timeout, bad response) returns None so callers
  can fall back gracefully. No new pip dependencies: stdlib urllib only.
"""

import json
import os
import urllib.request

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
DEFAULT_MODEL = os.environ.get("LLM_MODEL", "llama3.2:3b")


def _post_json(url: str, payload: dict, headers: dict | None = None, timeout: int = 120) -> dict | None:
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", **(headers or {})},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None


def _ollama(prompt: str, system: str | None, max_tokens: int) -> str | None:
    payload = {
        "model": DEFAULT_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {"num_predict": max_tokens, "temperature": 0.9},
    }
    if system:
        payload["system"] = system
    data = _post_json(f"{OLLAMA_HOST}/api/generate", payload)
    if not data:
        return None
    text = (data.get("response") or "").strip()
    return text or None


def _openai(prompt: str, system: str | None, max_tokens: int) -> str | None:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return None
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    data = _post_json(
        "https://api.openai.com/v1/chat/completions",
        {"model": os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
         "messages": messages, "max_tokens": max_tokens, "temperature": 0.9},
        headers={"Authorization": f"Bearer {api_key}"},
    )
    try:
        text = data["choices"][0]["message"]["content"].strip()
        return text or None
    except Exception:
        return None


def generate(prompt: str, system: str | None = None, max_tokens: int = 220) -> str | None:
    """Generate text. Returns None when the LLM is unavailable or fails."""
    provider = os.environ.get("LLM_PROVIDER", "ollama").lower()
    if provider == "openai":
        return _openai(prompt, system, max_tokens)
    return _ollama(prompt, system, max_tokens)


def is_available() -> bool:
    """Cheap check: is the configured provider reachable?"""
    if os.environ.get("LLM_PROVIDER", "ollama").lower() == "openai":
        return bool(os.environ.get("OPENAI_API_KEY"))
    try:
        req = urllib.request.Request(f"{OLLAMA_HOST}/api/tags", method="GET")
        with urllib.request.urlopen(req, timeout=5):
            return True
    except Exception:
        return False
