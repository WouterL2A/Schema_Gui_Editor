export const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8001";

export async function aiSuggest({ instruction, mode = "new_definition", schema_ctx, target_entity = null, temperature = 0.2 }) {
  const r = await fetch(`${API_BASE}/ai/suggest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instruction, mode, schema_ctx, target_entity, temperature })
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`AI suggest failed: ${r.status} ${t}`);
  }
  return r.json(); // { mode, definition_key, definition }
}
