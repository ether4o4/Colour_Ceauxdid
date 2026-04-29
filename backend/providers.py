"""Unified LLM provider dispatch layer - supports OpenAI, Anthropic, Gemini, Ollama, OpenRouter.

Each provider exposes:
  - validate_key(api_key, base_url=None) -> (is_valid, error, [model_names])
  - chat(api_key, model, messages, base_url=None, temperature, max_tokens) -> str

`messages` is a list of {"role": "system"|"user"|"assistant", "content": str}.
"""

from __future__ import annotations

import asyncio
import logging
from typing import List, Optional, Tuple

import httpx
from openai import AsyncOpenAI
from anthropic import AsyncAnthropic
import google.generativeai as genai

log = logging.getLogger("providers")

Msg = dict  # {"role": str, "content": str}

# ----- Known default models (used as fallback if a provider's list endpoint fails) -----
DEFAULT_MODELS = {
    "openai": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo", "o1-mini", "o3-mini"],
    "anthropic": [
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022",
        "claude-3-opus-20240229",
        "claude-3-haiku-20240307",
    ],
    "gemini": [
        "gemini-2.0-flash",
        "gemini-1.5-pro",
        "gemini-1.5-flash",
        "gemini-1.5-flash-8b",
    ],
    "ollama": ["llama3.3", "llama3.2", "mistral", "deepseek-r1"],
    "openrouter": [
        "openai/gpt-4o",
        "openai/gpt-4o-mini",
        "anthropic/claude-3.5-sonnet",
        "anthropic/claude-3.5-haiku",
        "google/gemini-2.0-flash-exp:free",
        "google/gemini-pro-1.5",
        "meta-llama/llama-3.3-70b-instruct",
        "deepseek/deepseek-chat",
        "mistralai/mistral-large",
    ],
}

SUPPORTED_PROVIDERS = list(DEFAULT_MODELS.keys())


# ───────────────────────── OpenAI ─────────────────────────
async def _openai_validate(api_key: str, base_url: Optional[str] = None) -> Tuple[bool, str, List[str]]:
    try:
        client = AsyncOpenAI(api_key=api_key, base_url=base_url, timeout=15.0)
        models = await client.models.list()
        ids = [m.id for m in models.data]
        chat_ids = [m for m in ids if any(k in m for k in ("gpt", "o1", "o3", "chatgpt"))] or ids[:20]
        return True, "", sorted(set(chat_ids))[:50]
    except Exception as e:
        return False, f"OpenAI validation failed: {e}", []


async def _openai_chat(
    api_key: str, model: str, messages: List[Msg],
    base_url: Optional[str] = None, temperature: float = 0.7, max_tokens: Optional[int] = None,
) -> str:
    client = AsyncOpenAI(api_key=api_key, base_url=base_url, timeout=60.0)
    kwargs = {"model": model, "messages": messages}
    # o1/o3 models reject temperature + max_tokens
    is_reasoning = any(p in model for p in ("o1", "o3"))
    if not is_reasoning:
        kwargs["temperature"] = temperature
        kwargs["max_tokens"] = max_tokens or 2048
    resp = await client.chat.completions.create(**kwargs)
    return resp.choices[0].message.content or ""


# ───────────────────────── Anthropic ─────────────────────────
async def _anthropic_validate(api_key: str, base_url: Optional[str] = None) -> Tuple[bool, str, List[str]]:
    try:
        client = AsyncAnthropic(api_key=api_key, timeout=15.0)
        # Anthropic has a /models endpoint as of recent SDK versions
        try:
            models = await client.models.list()
            ids = [m.id for m in models.data]
            return True, "", sorted(set(ids))[:50]
        except Exception:
            # fallback: test call
            await client.messages.create(
                model="claude-3-haiku-20240307",
                max_tokens=5,
                messages=[{"role": "user", "content": "hi"}],
            )
            return True, "", DEFAULT_MODELS["anthropic"]
    except Exception as e:
        return False, f"Anthropic validation failed: {e}", []


async def _anthropic_chat(
    api_key: str, model: str, messages: List[Msg],
    base_url: Optional[str] = None, temperature: float = 0.7, max_tokens: Optional[int] = None,
) -> str:
    client = AsyncAnthropic(api_key=api_key, timeout=60.0)
    # Anthropic requires system messages in a separate `system` field
    system_parts = [m["content"] for m in messages if m.get("role") == "system"]
    chat_msgs = [m for m in messages if m.get("role") != "system"]
    kwargs = dict(
        model=model,
        max_tokens=max_tokens or 2048,
        temperature=temperature,
        messages=chat_msgs,
    )
    if system_parts:
        kwargs["system"] = "\n\n".join(system_parts)
    resp = await client.messages.create(**kwargs)
    # Concatenate all text blocks
    texts = [b.text for b in resp.content if getattr(b, "type", None) == "text"]
    return "\n".join(texts)


# ───────────────────────── Gemini ─────────────────────────
def _gemini_sync_validate(api_key: str) -> Tuple[bool, str, List[str]]:
    try:
        genai.configure(api_key=api_key)
        models = list(genai.list_models())
        ids = [m.name.replace("models/", "") for m in models if "generateContent" in m.supported_generation_methods]
        gemini_ids = [m for m in ids if "gemini" in m.lower()]
        return True, "", sorted(set(gemini_ids))[:50]
    except Exception as e:
        return False, f"Gemini validation failed: {e}", []


async def _gemini_validate(api_key: str, base_url: Optional[str] = None) -> Tuple[bool, str, List[str]]:
    return await asyncio.get_event_loop().run_in_executor(None, _gemini_sync_validate, api_key)


def _gemini_sync_chat(api_key: str, model: str, messages: List[Msg], temperature: float, max_tokens: Optional[int]) -> str:
    genai.configure(api_key=api_key)
    # Merge system messages into the first user message prefix (Gemini v1 has no native system role)
    sys_parts = [m["content"] for m in messages if m.get("role") == "system"]
    chat_msgs = [m for m in messages if m.get("role") != "system"]
    history = []
    for m in chat_msgs[:-1]:
        history.append({
            "role": "user" if m["role"] == "user" else "model",
            "parts": [m["content"]],
        })
    last = chat_msgs[-1]["content"] if chat_msgs else ""
    if sys_parts and chat_msgs and chat_msgs[0]["role"] == "user":
        last = "\n\n".join(sys_parts) + "\n\n" + last if not history else last
        if not history:
            # prepend system to the (only) user message
            pass
    model_obj = genai.GenerativeModel(model)
    chat = model_obj.start_chat(history=history)
    gen_cfg = genai.types.GenerationConfig(
        temperature=temperature,
        max_output_tokens=max_tokens or 2048,
    )
    # If we have system prompt, inject it into the very first message being sent
    if sys_parts and not history:
        last = "\n\n".join(sys_parts) + "\n\n" + last
    resp = chat.send_message(last, generation_config=gen_cfg)
    return resp.text or ""


async def _gemini_chat(
    api_key: str, model: str, messages: List[Msg],
    base_url: Optional[str] = None, temperature: float = 0.7, max_tokens: Optional[int] = None,
) -> str:
    return await asyncio.get_event_loop().run_in_executor(
        None, _gemini_sync_chat, api_key, model, messages, temperature, max_tokens
    )


# ───────────────────────── Ollama ─────────────────────────
# For Ollama, the "api_key" field is repurposed as the base URL (or left blank -> http://localhost:11434).
async def _ollama_validate(api_key: str, base_url: Optional[str] = None) -> Tuple[bool, str, List[str]]:
    url = (base_url or api_key or "http://localhost:11434").rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(f"{url}/api/tags")
            r.raise_for_status()
            data = r.json()
            models = [m["name"] for m in data.get("models", [])]
            return True, "", models if models else DEFAULT_MODELS["ollama"]
    except Exception as e:
        return False, f"Ollama connection failed: {e}", []


async def _ollama_chat(
    api_key: str, model: str, messages: List[Msg],
    base_url: Optional[str] = None, temperature: float = 0.7, max_tokens: Optional[int] = None,
) -> str:
    url = (base_url or api_key or "http://localhost:11434").rstrip("/")
    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "options": {"temperature": temperature, "num_predict": max_tokens or 2048},
    }
    async with httpx.AsyncClient(timeout=180.0) as client:
        r = await client.post(f"{url}/api/chat", json=payload)
        r.raise_for_status()
        data = r.json()
        return data.get("message", {}).get("content", "") or ""


# ───────────────────────── OpenRouter (OpenAI-compatible) ─────────────────────────
OPENROUTER_URL = "https://openrouter.ai/api/v1"


async def _openrouter_validate(api_key: str, base_url: Optional[str] = None) -> Tuple[bool, str, List[str]]:
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(
                f"{OPENROUTER_URL}/models",
                headers={"Authorization": f"Bearer {api_key}"},
            )
            r.raise_for_status()
            data = r.json()
            ids = [m["id"] for m in data.get("data", [])]
            # Curate a practical subset of popular models, plus everything free
            popular = [
                m for m in ids if any(
                    p in m for p in (
                        "openai/gpt-4", "openai/gpt-5", "openai/o",
                        "anthropic/claude", "google/gemini",
                        "meta-llama/llama-3", "deepseek/deepseek",
                        "mistralai/mistral", "qwen/qwen",
                    )
                )
            ]
            free = [m for m in ids if ":free" in m]
            out = sorted(set(popular + free))
            return True, "", out[:200] if out else ids[:200]
    except Exception as e:
        return False, f"OpenRouter validation failed: {e}", []


async def _openrouter_chat(
    api_key: str, model: str, messages: List[Msg],
    base_url: Optional[str] = None, temperature: float = 0.7, max_tokens: Optional[int] = None,
) -> str:
    client = AsyncOpenAI(
        api_key=api_key,
        base_url=OPENROUTER_URL,
        timeout=60.0,
        default_headers={
            "HTTP-Referer": "https://agent-hub.emergentagent.com",
            "X-Title": "Agent Hub",
        },
    )
    resp = await client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens or 2048,
    )
    return resp.choices[0].message.content or ""


# ───────────────────────── Dispatch registry ─────────────────────────
_REGISTRY = {
    "openai": (_openai_validate, _openai_chat),
    "anthropic": (_anthropic_validate, _anthropic_chat),
    "gemini": (_gemini_validate, _gemini_chat),
    "ollama": (_ollama_validate, _ollama_chat),
    "openrouter": (_openrouter_validate, _openrouter_chat),
}


async def validate_key(provider: str, api_key: str, base_url: Optional[str] = None) -> Tuple[bool, str, List[str]]:
    if provider not in _REGISTRY:
        return False, f"Unknown provider: {provider}", []
    return await _REGISTRY[provider][0](api_key, base_url)


async def dispatch_chat(
    provider: str,
    model: str,
    api_key: str,
    messages: List[Msg],
    base_url: Optional[str] = None,
    temperature: float = 0.7,
    max_tokens: Optional[int] = None,
) -> str:
    if provider not in _REGISTRY:
        raise ValueError(f"Unknown provider: {provider}")
    return await _REGISTRY[provider][1](
        api_key, model, messages, base_url, temperature, max_tokens
    )
