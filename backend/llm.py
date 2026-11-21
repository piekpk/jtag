"""Minimal LLM client for Jtap.

One function: generate(prompt) -> str | None.
- Provider is chosen with the LLM_PROVIDER env var (default: "ollama").
- "ollama" talks to a local Ollama server (http://localhost:11434 by default,
  override with OLLAMA_HOST). Model via LLM_MODEL (default "llama3.2:3b",
  a good CPU-friendly pick).
- "openai" uses the chat completions API with OPENAI_API_KEY.
- "anthropic" uses the Claude Messages API with ANTHROPIC_API_KEY
  (model via ANTHROPIC_MODEL, default "claude-sonnet-5").
- Any failure (server down, timeout, bad response) returns None so callers
  can fall back gracefully. No new pip dependencies: stdlib urllib only.
  Failures are logged to stderr (HTTP status + provider error body) so a
  silent None in CI still leaves the cause in the log.
"""

import json
import os
import sys
import urllib.error
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
    except urllib.error.HTTPError as exc:
        # The provider answered with an error status (401/400/429/...).
        # Log status + error body: without this the caller just sees None
        # and a CI log shows nothing. The body holds the provider's error
        # message, never the API key (keys live in headers, not the body).
        try:
            detail = exc.read().decode("utf-8", "replace")
        except Exception:
            detail = ""
        print(f"LLM request failed: HTTP {exc.code} from {url}: {detail}",
              file=sys.stderr)
        return None
    except Exception as exc:
        print(f"LLM request failed: {type(exc).__name__}: {exc} ({url})",
              file=sys.stderr)
        return None


def _ollama(prompt: str, system: str | None, max_tokens: int, temperature: float) -> str | None:
    payload = {
        "model": DEFAULT_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {"num_predict": max_tokens, "temperature": temperature},
    }
    if system:
        payload["system"] = system
    data = _post_json(f"{OLLAMA_HOST}/api/generate", payload)
    if not data:
        return None
    text = (data.get("response") or "").strip()
    return text or None


def _openai(prompt: str, system: str | None, max_tokens: int, temperature: float) -> str | None:
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
         "messages": messages, "max_tokens": max_tokens, "temperature": temperature},
        headers={"Authorization": f"Bearer {api_key}"},
    )
    try:
        text = data["choices"][0]["message"]["content"].strip()
        return text or None
    except Exception:
        return None


def _anthropic(prompt: str, system: str | None, max_tokens: int, temperature: float) -> str | None:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return None
    # NOTE: do NOT send `temperature` — claude-sonnet-5 rejects it with
    # HTTP 400 "`temperature` is deprecated for this model" (CI Eval,
    # Nov 21, 2026: all 23 requests failed that way). The API defaults
    # to temperature 1.0 when omitted. Callers still pass temperature;
    # it is honoured by the OpenAI/Ollama providers.
    payload = {
        "model": os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5"),
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }
    if system:
        payload["system"] = system
    data = _post_json(
        "https://api.anthropic.com/v1/messages",
        payload,
        headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"},
    )
    if not data:
        return None  # _post_json already logged the failure.
    try:
        blocks = data["content"]
        text = "".join(
            block.get("text", "") for block in blocks
            if isinstance(block, dict) and block.get("type") == "text"
        ).strip()
        return text or None
    except Exception as exc:
        print(f"LLM request failed: unexpected Anthropic response: "
              f"{type(exc).__name__}: {exc}", file=sys.stderr)
        return None


def generate(prompt: str, system: str | None = None, max_tokens: int = 220,
             temperature: float = 0.9) -> str | None:
    """Generate text. Returns None when the LLM is unavailable or fails.

    temperature defaults to 0.9 (the historical behaviour for chat-style
    callers). Deterministic callers (structured extraction) pass 0.
    """
    provider = os.environ.get("LLM_PROVIDER", "ollama").lower()
    if provider == "openai":
        return _openai(prompt, system, max_tokens, temperature)
    if provider == "anthropic":
        return _anthropic(prompt, system, max_tokens, temperature)
    return _ollama(prompt, system, max_tokens, temperature)


def is_available() -> bool:
    """Cheap check: is the configured provider reachable?"""
    provider = os.environ.get("LLM_PROVIDER", "ollama").lower()
    if provider == "openai":
        return bool(os.environ.get("OPENAI_API_KEY"))
    if provider == "anthropic":
        return bool(os.environ.get("ANTHROPIC_API_KEY"))
    try:
        req = urllib.request.Request(f"{OLLAMA_HOST}/api/tags", method="GET")
        with urllib.request.urlopen(req, timeout=5):
            return True
    except Exception:
        return False
