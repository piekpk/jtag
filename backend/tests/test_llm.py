"""Tests for backend/llm.py provider dispatch (mocked HTTP, no real calls).

The Anthropic provider is the configured one for the Sprint 3 meetup
parser; OpenAI and Ollama stay supported as fallbacks. Every test
monkeypatches llm._post_json, so the suite never touches the network.
"""

import io
import urllib.error
import urllib.request

import llm


def _anthropic_payload(text="hello"):
    return {"content": [{"type": "text", "text": text}]}


def test_anthropic_parses_text_blocks(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
    seen = {}

    def fake_post(url, payload, headers=None, timeout=120):
        seen["url"] = url
        seen["payload"] = payload
        seen["headers"] = headers
        return _anthropic_payload('{"title": "x"}')

    monkeypatch.setattr(llm, "_post_json", fake_post)
    assert llm.generate("note", system="sys", max_tokens=220, temperature=0) == '{"title": "x"}'
    assert seen["url"] == "https://api.anthropic.com/v1/messages"
    assert seen["payload"]["model"] == "claude-sonnet-5"
    assert seen["payload"]["temperature"] == 0
    assert seen["payload"]["system"] == "sys"
    assert seen["headers"]["anthropic-version"] == "2023-06-01"


def test_anthropic_missing_key_returns_none(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert llm.generate("note") is None


def test_anthropic_non_text_blocks_ignored(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
    monkeypatch.setattr(
        llm, "_post_json",
        lambda *a, **k: {"content": [{"type": "thinking", "thinking": "..."},
                                     {"type": "text", "text": "out"}]})
    assert llm.generate("note") == "out"


def test_anthropic_bad_response_returns_none(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
    monkeypatch.setattr(llm, "_post_json", lambda *a, **k: None)
    assert llm.generate("note") is None


def test_openai_still_dispatched(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(
        llm, "_post_json",
        lambda *a, **k: {"choices": [{"message": {"content": "ok"}}]})
    assert llm.generate("note") == "ok"


def _http_error(code=401):
    body = io.BytesIO(
        b'{"type": "error", "error": {"type": "authentication_error", '
        b'"message": "invalid x-api-key"}}')
    return urllib.error.HTTPError(
        "https://api.anthropic.com/v1/messages", code, "Unauthorized",
        hdrs=None, fp=body)


def test_post_json_logs_http_error(monkeypatch, capsys):
    def boom(*a, **k):
        raise _http_error(401)

    monkeypatch.setattr(urllib.request, "urlopen", boom)
    assert llm._post_json("https://api.anthropic.com/v1/messages", {}) is None
    err = capsys.readouterr().err
    assert "HTTP 401" in err
    assert "authentication_error" in err


def test_post_json_logs_url_error(monkeypatch, capsys):
    def boom(*a, **k):
        raise urllib.error.URLError("connection refused")

    monkeypatch.setattr(urllib.request, "urlopen", boom)
    assert llm._post_json("https://example.invalid/", {}) is None
    assert "URLError" in capsys.readouterr().err


def test_anthropic_malformed_response_logs_and_returns_none(monkeypatch, capsys):
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
    monkeypatch.setattr(llm, "_post_json", lambda *a, **k: {"unexpected": 1})
    assert llm.generate("note") is None
    assert "unexpected Anthropic response" in capsys.readouterr().err
