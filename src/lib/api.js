export const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8001";

export async function aiSuggest(instruction) {
  const r = await fetch(`${API_BASE}/ai/suggest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instruction })
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`AI suggest failed: ${r.status} ${t}`);
  }
  return r.json(); // { definition_key, definition }
}
