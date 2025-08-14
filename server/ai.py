from typing import Optional, Dict, Any, List, Tuple
import os
import json
import re
import httpx

AI_API_BASE = os.getenv("AI_API_BASE", "").rstrip("/")
AI_API_KEY = os.getenv("AI_API_KEY", "")
AI_MODEL = os.getenv("AI_MODEL", "gpt-4o-mini")

SYSTEM_PROMPT = """You are an assistant that writes JSON Schema (draft-07) for CRUD backends.

ALWAYS return STRICT JSON with this shape (no prose):
{
  "mode": "new_definition" | "extend_entity",
  "definition_key": "snake_or_plural_identifier_or_existing",
  "definition": {
    "type": "object",
    "title": "Human Title",
    "properties": { "<field>": { ... } },
    "required": ["..."],
    "primaryKey": ["..."],
    "additionalProperties": false
  }
}

Rules:
- Only use primitives: string, number, integer, boolean, array, object.
- Prefer formats when obvious: uuid, email, date-time, uri.
- If PRIMARY KEY is unclear, create { id: string uuid } and set primaryKey:["id"]; put "id" in required.
- Keep additionalProperties false.
- If the user mentions enums like "enum: a, b, c", set {"enum": ["a","b","c"]}.
- If they mention FK like "FK: user_id → users.id", set fields:
  - "user_id": {"type":"string","format":"uuid","refTable":"users","refColumn":"id","$ref":"#/definitions/users/properties/id","relationshipName":"user"}
- For arrays of strings with enums ("roles: user,admin"), produce { "type":"array", "items":{"type":"string","enum":[...]} }.
- If mode is "extend_entity", only include properties to add/merge into that entity; do not override existing keys unless identical.
- Obey the context: existing definitions and their fields (provided below). Align FK names if possible.

Return STRICT JSON only, no backticks.
"""

FEW_SHOT = [
  {
    "user": "Create projects with fields: id (uuid), name (string max 120), owner_email (email), status enum: planned,active,done; timestamps created_at (date-time).",
    "assistant": {
      "mode": "new_definition",
      "definition_key": "projects",
      "definition": {
        "type": "object",
        "title": "Project",
        "properties": {
          "id": {"type": "string", "format": "uuid"},
          "name": {"type": "string", "maxLength": 120},
          "owner_email": {"type": "string", "format": "email"},
          "status": {"type": "string", "enum": ["planned","active","done"]},
          "created_at": {"type": "string", "format": "date-time"}
        },
        "required": ["id","name","status"],
        "primaryKey": ["id"],
        "additionalProperties": False
      }
    }
  },
  {
    "user": "Extend users with: display_name (string), tier enum: free,pro,business",
    "assistant": {
      "mode": "extend_entity",
      "definition_key": "users",
      "definition": {
        "type": "object",
        "title": "User",
        "properties": {
          "display_name": {"type": "string"},
          "tier": {"type": "string", "enum": ["free","pro","business"]}
        },
        "required": [],
        "primaryKey": [],
        "additionalProperties": False
      }
    }
  }
]

def _rule_based_from_text(text: str, mode: str, target: Optional[str]) -> Dict[str, Any]:
    """
    Robust fallback that parses simple cues like enums, FKs, and timestamps.
    """
    t = (text or "").strip()
    key = (target or "entity").strip() if mode == "extend_entity" else "entity"
    title = key[:-1].capitalize() if key.endswith("s") else key.capitalize()

    props: Dict[str, Any] = {}
    required: List[str] = []
    pk: List[str] = []

    # If new def, inject id by default
    if mode == "new_definition":
        props["id"] = {"type": "string", "format": "uuid"}
        required.append("id")
        pk = ["id"]

    # enums like: status enum: planned, active, done
    for m in re.finditer(r"(\w+)\s+enum:\s*([^\n;]+)", t, re.I):
        field = m.group(1)
        values = [v.strip() for v in re.split(r"[,\|]", m.group(2)) if v.strip()]
        if values:
            props[field] = {"type": "string", "enum": values}

    # arrays of strings like: roles: user, admin, manager
    for m in re.finditer(r"(\w+)\s*:\s*([A-Za-z][\w\s,\|\-]*)", t):
        field = m.group(1)
        raw = m.group(2)
        if "enum" in raw.lower():
            continue
        candidates = [v.strip() for v in re.split(r"[,\|]", raw) if v.strip()]
        if len(candidates) >= 2 and field not in props:
            props[field] = {"type":"array","items":{"type":"string","enum":candidates}}

    # email/uuid/datetime guesses
    def upsert(f: str, spec: Dict[str, Any]): 
        if f not in props: props[f] = spec

    for w in ["email"]:
        if re.search(rf"\b{w}\b", t, re.I):
            upsert("email", {"type": "string", "format": "email"})
    for name in re.findall(r"\b\w+_at\b", t):
        upsert(name, {"type": "string", "format": "date-time"})

    # FK like: FK: user_id → users.id
    for m in re.finditer(r"FK:\s*(\w+)\s*[->→]\s*(\w+)\.(\w+)", t, re.I):
        field, table, col = m.group(1), m.group(2), m.group(3)
        props[field] = {
            "type": "string",
            "format": "uuid",
            "refTable": table,
            "refColumn": col,
            "$ref": f"#/definitions/{table}/properties/{col}",
            "relationshipName": table[:-1] if table.endswith("s") else table
        }

    # generic names
    for m in re.finditer(r"\b(\w+)\s*\((string|number|integer|boolean)\)", t, re.I):
        field, typ = m.group(1), m.group(2).lower()
        props.setdefault(field, {"type": typ})

    definition = {
        "type": "object",
        "title": title,
        "properties": props,
        "required": required,
        "primaryKey": pk,
        "additionalProperties": False
    }
    return {
        "mode": mode,
        "definition_key": key,
        "definition": definition
    }

def _coerce_draft07(defn: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure required draft-07 hygiene and guardrails."""
    d = dict(defn or {})
    d.setdefault("type", "object")
    d.setdefault("properties", {})
    d.setdefault("required", [])
    d.setdefault("primaryKey", [])
    if "additionalProperties" not in d:
        d["additionalProperties"] = False

    # sanitize properties
    for _, spec in list(d["properties"].items()):
        if not isinstance(spec, dict): 
            continue
        t = spec.get("type")
        if t not in ("string","number","integer","boolean","array","object", None):
            spec["type"] = "string"
            t = "string"
        if t == "array":
            items = spec.get("items") or {}
            if not isinstance(items, dict):
                items = {}
            if items.get("type") not in ("string","number","integer","boolean","object"):
                items["type"] = "string"
            spec["items"] = items
        # strip invalid uniqueItems on non-arrays
        if "uniqueItems" in spec and spec.get("type") != "array":
            spec.pop("uniqueItems", None)
    return d

def _merge_extend(existing: Dict[str, Any], suggestion: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(existing)
    out.setdefault("properties", {})
    out["properties"].update(suggestion.get("properties", {}))
    def _uniq(a: List[str]) -> List[str]:
        return list(dict.fromkeys([x for x in a if x]))
    out["required"] = _uniq(list(out.get("required", [])) + list(suggestion.get("required", [])))
    out["primaryKey"] = _uniq(list(out.get("primaryKey", [])) + list(suggestion.get("primaryKey", [])))
    if "additionalProperties" in suggestion:
        out["additionalProperties"] = suggestion["additionalProperties"]
    if not out.get("title") and suggestion.get("title"):
        out["title"] = suggestion["title"]
    return out

async def _call_ai(instruction: str, mode: str, schema_ctx: Dict[str, Any], target: Optional[str], temperature: float) -> Optional[Dict[str, Any]]:
    if not AI_API_BASE or not AI_API_KEY:
        return None
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    # add few-shot
    for ex in FEW_SHOT:
        messages.append({"role": "user", "content": ex["user"]})
        messages.append({"role": "assistant", "content": json.dumps(ex["assistant"])})
    # context block (small to keep tokens low)
    ctx = {
        "mode": mode,
        "target_entity": target,
        "existing_definition_keys": list((schema_ctx.get("definitions") or {}).keys())[:50],
        "existing_shapes": {
            k: {"properties": list((v.get("properties") or {}).keys())[:60], "primaryKey": v.get("primaryKey", [])}
            for k, v in (schema_ctx.get("definitions") or {}).items()
        }
    }
    messages.append({"role": "user", "content": f"CONTEXT:\n{json.dumps(ctx, ensure_ascii=False)}"})
    messages.append({"role": "user", "content": instruction.strip()})

    payload = {
        "model": AI_MODEL,
        "messages": messages,
        "temperature": max(0.0, min(1.0, temperature or 0.2)),
        # Prefer strict JSON output; many providers accept this
        "response_format": {"type": "json_object"}
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

async def suggest_definition(instruction: str, mode: str, schema_ctx: Dict[str, Any], target: Optional[str], temperature: float = 0.2) -> Dict[str, Any]:
    ai = await _call_ai(instruction, mode, schema_ctx, target, temperature)
    if not ai:
        ai = _rule_based_from_text(instruction, mode, target)

    # sanitize & coerce
    ai["definition"] = _coerce_draft07(ai.get("definition") or {})

    # if extending, only keep properties that don't obviously collide with different types
    if mode == "extend_entity" and target and isinstance(schema_ctx.get("definitions", {}).get(target), dict):
        existing = schema_ctx["definitions"][target]
        ai["definition"] = _merge_extend(existing, ai["definition"])

    return ai
