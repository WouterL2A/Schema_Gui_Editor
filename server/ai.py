from typing import Optional, Dict, Any
import os
import json
import httpx

AI_API_BASE = os.getenv("AI_API_BASE", "").rstrip("/")
AI_API_KEY = os.getenv("AI_API_KEY", "")
AI_MODEL = os.getenv("AI_MODEL", "gpt-4o-mini")

SYSTEM_PROMPT = """You are a helpful assistant that writes JSON Schema (draft-07) entity definitions for database-backed CRUD apps.
Return ONLY a JSON object with this shape:
{
  "definition_key": "snake_or_plural_identifier",
  "definition": {
    "type": "object",
    "title": "Human Title",
    "properties": { ... },
    "required": [ ... ],
    "primaryKey": [ ... ],
    "additionalProperties": false
  }
}
Rules:
- Be accurate to the user's intent. Prefer string/number/integer/boolean/array/object.
- Use formats where obvious (uuid, email, date-time).
- Always include a sensible primaryKey (prefer "id" with format "uuid") and "required".
- If enums are specified in the prompt, include them.
- No prose or code fences—return pure JSON only.
"""

def _rule_based_fallback(instruction: str) -> Dict[str, Any]:
    text = (instruction or "").lower()
    key = "entity"
    title = "Entity"
    props: Dict[str, Any] = {
        "id": {"type": "string", "format": "uuid", "description": "Primary key"}
    }
    required = ["id"]

    # crude "Fields:" parser
    if "fields:" in text:
        fields_part = text.split("fields:", 1)[1].strip().split("\n")[0]
        for raw in [f.strip() for f in fields_part.split(",") if f.strip()]:
            name = raw
            if " " in raw:
                name = raw.split(" ", 1)[0]
            if name in props:
                continue
            if "email" in name:
                props[name] = {"type": "string", "format": "email"}
            elif name.endswith("_at") or "date" in name or "time" in name:
                props[name] = {"type": "string", "format": "date-time"}
            elif any(tok in name for tok in ["amount", "price", "total"]):
                props[name] = {"type": "number"}
            else:
                props[name] = {"type": "string"}

    for token in ["user", "role", "session", "project", "invoice", "order", "product"]:
        if token in text:
            key = token if token.endswith("s") else f"{token}s"
            title = token.capitalize()
            break

    return {
        "definition_key": key,
        "definition": {
            "type": "object",
            "title": title,
            "properties": props,
            "required": required,
            "primaryKey": ["id"],
            "additionalProperties": False
        }
    }

async def _call_ai(instruction: str) -> Optional[Dict[str, Any]]:
    if not AI_API_BASE or not AI_API_KEY:
        return None
    payload = {
        "model": AI_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": instruction.strip()}
        ],
        "temperature": 0.2
    }
    headers = {"Authorization": f"Bearer {AI_API_KEY}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(f"{AI_API_BASE}/chat/completions", headers=headers, json=payload)
        r.raise_for_status()
        data = r.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        try:
            parsed = json.loads(content)
            if isinstance(parsed, dict) and "definition" in parsed and "definition_key" in parsed:
                return parsed
        except Exception:
            return None
    return None

async def suggest_definition(instruction: str) -> Dict[str, Any]:
    ai = await _call_ai(instruction)
    if ai:
        return ai
    return _rule_based_fallback(instruction)
