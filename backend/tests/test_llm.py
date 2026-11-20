"""Tests for backend/llm.py provider dispatch (mocked HTTP, no real calls).

The Anthropic provider is the configured one for the Sprint 3 meetup
parser; OpenAI and Ollama stay supported as fallbacks. Every test
monkeypatches llm._post_json, so the suite never touches the network.
"""

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
    assert seen["payload"]["model"] == "claude-sonnet-4-5"
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
