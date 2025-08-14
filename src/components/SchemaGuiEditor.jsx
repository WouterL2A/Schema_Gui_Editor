import React from "react";
import { Plus, Download, Upload, Trash2, Pencil, Save, X, Database, CheckCircle2, AlertTriangle, Search } from "lucide-react";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import draft7Meta from "ajv/dist/refs/json-schema-draft-07.json";

// --------- Helpers / constants ----------
const deepClone = (o) => JSON.parse(JSON.stringify(o));
const JSON_TYPES = ["string", "number", "integer", "boolean", "array", "object"];
const STRING_FORMATS = ["", "uuid", "email", "date-time", "uri", "hostname", "ipv4", "ipv6"];

// --------- Default schema (same as your sample) ----------
const DEFAULT_SCHEMA = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "User Management Model",
  "type": "object",
  "definitions": {
    "roles": {
      "type": "object",
      "title": "Role",
      "properties": {
        "id": { "type": "string", "format": "uuid", "description": "Unique role identifier" },
        "name": { "type": "string", "maxLength": 100, "description": "Role name (e.g., user, admin, manager)" },
        "created_at": { "type": "string", "format": "date-time", "default": "now()", "description": "Creation timestamp" }
      },
      "required": ["id", "name"],
      "primaryKey": ["id"],
      "additionalProperties": false
    },
    "users": {
      "type": "object",
      "title": "User",
      "properties": {
        "id": { "type": "string", "format": "uuid", "description": "Unique user identifier" },
        "email": { "type": "string", "format": "email", "maxLength": 255, "description": "User email" },
        "hashed_password": { "type": "string", "minLength": 8, "maxLength": 255, "description": "Hashed password" },
        "created_at": { "type": "string", "format": "date-time", "default": "now()", "description": "Creation timestamp" },
        "roles": {
          "type": "array",
          "items": { "type": "string", "enum": ["user", "admin", "manager"] },
          "description": "List of role names (for RJSF forms)"
        },
        "permissions": {
          "type": "array",
          "items": { "type": "string", "enum": ["read", "write", "delete"] },
          "description": "Admin-specific permissions"
        }
      },
      "required": ["id", "email", "hashed_password"],
      "if": { "properties": { "roles": { "contains": { "const": "admin" } } } },
      "then": { "required": ["permissions"] },
      "primaryKey": ["id"],
      "additionalProperties": false
    },
    "user_roles": {
      "type": "object",
      "title": "UserRole",
      "properties": {
        "id": { "type": "string", "format": "uuid", "description": "Unique identifier" },
        "user_id": {
          "type": "string",
          "format": "uuid",
          "$ref": "#/definitions/users/properties/id",
          "refTable": "users",
          "refColumn": "id",
          "relationshipName": "user",
          "description": "Reference to user"
        },
        "role_id": {
          "type": "string",
          "format": "uuid",
          "$ref": "#/definitions/roles/properties/id",
          "refTable": "roles",
          "refColumn": "id",
          "relationshipName": "role",
          "description": "Reference to role"
        },
        "created_at": { "type": "string", "format": "date-time", "default": "now()", "description": "Creation timestamp" }
      },
      "required": ["id", "user_id", "role_id"],
      "primaryKey": ["id"],
      "additionalProperties": false
    },
    "sessions": {
      "type": "object",
      "title": "Session",
      "properties": {
        "id": { "type": "string", "format": "uuid", "description": "Unique session identifier" },
        "user_id": {
          "type": "string",
          "format": "uuid",
          "$ref": "#/definitions/users/properties/id",
          "refTable": "users",
          "refColumn": "id",
          "relationshipName": "user",
          "description": "Reference to user"
        },
        "issued_at": { "type": "string", "format": "date-time", "default": "now()", "description": "Session issuance timestamp" },
        "expires_at": { "type": "string", "format": "date-time", "description": "Session expiration timestamp" }
      },
      "required": ["id", "user_id", "issued_at"],
      "primaryKey": ["id"],
      "additionalProperties": false
    }
  },
  "required": [],
  "additionalProperties": false
};

// --------- Small UI atoms ----------
function Badge({ children, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
      {children}
      {onRemove && (
        <button onClick={onRemove} className="ml-1 hover:text-red-600" title="Remove">
          <X size={14} />
        </button>
      )}
    </span>
  );
}
function TextInput({ label, value, onChange, placeholder, type="text" }) {
  return (
    <label className="grid gap-1 text-sm">
      {label ? <span className="text-gray-600">{label}</span> : null}
      <input
        type={type}
        className="w-full rounded-xl border px-3 py-2 outline-none focus:ring"
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function TextArea({ label, value, onChange, placeholder, rows=4 }) {
  return (
    <label className="grid gap-1 text-sm">
      {label ? <span className="text-gray-600">{label}</span> : null}
      <textarea
        className="w-full rounded-xl border px-3 py-2 outline-none focus:ring"
        rows={rows}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function Modal({ open, title, children, onClose, onSave, saveLabel="Save" }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-gray-100"><X /></button>
        </div>
        <div className="max-h-[70vh] overflow-auto p-4">{children}</div>
        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
          <button onClick={onClose} className="rounded-xl border px-4 py-2">Cancel</button>
          {onSave && <button onClick={onSave} className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-white">
            <Save size={16}/> {saveLabel}
          </button>}
        </div>
      </div>
    </div>
  );
}

// --------- Property editor (draft-07 aware) ----------
function PropertyForm({ value, onChange }) {
  const v = value || {};
  const [local, setLocal] = React.useState(v);
  React.useEffect(() => setLocal(v), [v]);
  const set = (k, val) => setLocal((p) => ({ ...p, [k]: val }));

  const t = local.type || "";
  const isString = t === "string";
  const isNumber = t === "number" || t === "integer";
  const isArray = t === "array";

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <TextInput label="Name" value={local.__name || ""} onChange={(x) => set("__name", x)} />

      {/* Type (restricted to draft-07 primitives) */}
      <label className="grid gap-1 text-sm">
        <span className="text-gray-600">Type</span>
        <select
          className="w-full rounded-xl border px-3 py-2"
          value={t}
          onChange={(e)=> set("type", e.target.value || undefined)}
        >
          <option value="">(none)</option>
          {JSON_TYPES.map((opt)=> <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </label>

      {/* Format (only for string) */}
      <label className="grid gap-1 text-sm">
        <span className="text-gray-600">Format</span>
        <select
          className="w-full rounded-xl border px-3 py-2"
          value={local.format || ""}
          onChange={(e)=> set("format", e.target.value || undefined)}
          disabled={!isString}
        >
          {STRING_FORMATS.map((f)=> <option key={f} value={f}>{f || "(none)"}</option>)}
        </select>
      </label>

      <TextInput label="Default" value={local.default || ""} onChange={(x) => set("default", x)} placeholder="now() or literal" />

      {/* String constraints */}
      {isString && (
        <>
          <TextInput label="minLength" value={local.minLength ?? ""} onChange={(x)=> set("minLength", x ? Number(x) : undefined)} />
          <TextInput label="maxLength" value={local.maxLength ?? ""} onChange={(x)=> set("maxLength", x ? Number(x) : undefined)} />
          <TextInput label="pattern" value={local.pattern ?? ""} onChange={(x)=> set("pattern", x || undefined)} placeholder="Regex (ECMA)" />
        </>
      )}

      {/* Number / Integer constraints */}
      {isNumber && (
        <>
          <TextInput label="minimum" value={local.minimum ?? ""} onChange={(x)=> set("minimum", x!=="" ? Number(x) : undefined)} />
          <TextInput label="maximum" value={local.maximum ?? ""} onChange={(x)=> set("maximum", x!=="" ? Number(x) : undefined)} />
        </>
      )}

      {/* Enum (strings/numbers) */}
      <TextInput
        label="Enum (comma separated)"
        value={Array.isArray(local.enum) ? local.enum.join(",") : ""}
        onChange={(x)=> set("enum", x ? x.split(",").map(s=> s.trim()).filter(Boolean) : undefined)}
      />

      {/* Array-only bits */}
      {isArray && (
        <>
          <label className="grid gap-1 text-sm">
            <span className="text-gray-600">items.type</span>
            <select
              className="w-full rounded-xl border px-3 py-2"
              value={local.items?.type || ""}
              onChange={(e)=> set("items", { ...(local.items||{}), type: e.target.value || undefined })}
            >
              <option value="">(none)</option>
              {JSON_TYPES.filter(x=> x!=="array").map((opt)=> <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </label>
          <TextInput
            label="items.enum (comma separated)"
            value={Array.isArray(local.items?.enum) ? local.items.enum.join(",") : ""}
            onChange={(x)=> set("items", { ...(local.items||{}), enum: x ? x.split(",").map(s=> s.trim()).filter(Boolean) : undefined })}
          />
          <label className="inline-flex items-center gap-2 text-sm mt-2">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={!!local.uniqueItems}
              onChange={(e)=> set("uniqueItems", e.target.checked || undefined)}
            />
            <span className="text-gray-700">uniqueItems</span>
          </label>
        </>
      )}

      {/* Relationship helpers (custom metadata for your generator) */}
      <TextInput label="refTable" value={local.refTable || ""} onChange={(x) => set("refTable", x)} placeholder="users, roles, ..." />
      <TextInput label="refColumn" value={local.refColumn || ""} onChange={(x) => set("refColumn", x)} placeholder="id" />
      <TextInput label="relationshipName" value={local.relationshipName || ""} onChange={(x) => set("relationshipName", x)} />
      <TextInput label="$ref" value={local["$ref"] || ""} onChange={(x) => set("$ref", x)} placeholder="#/definitions/users/properties/id" />

      <TextArea label="Description" value={local.description || ""} onChange={(x) => set("description", x)} />
      <div className="md:col-span-2 pt-2 text-xs text-gray-500">
        Note: <code>uniqueItems</code> is valid only on arrays (draft‑07). For DB uniqueness on scalars, consider a custom extension like <code>x-unique: true</code>.
      </div>

      <div className="md:col-span-2 flex items-center justify-end">
        <button
          onClick={() => onChange(local)}
          className="rounded-xl bg-black px-4 py-2 text-white"
        >Apply</button>
      </div>
    </div>
  );
}

// --------- Main Editor ----------
export default function SchemaGuiEditor({ initialSchema }) {
  const [schema, setSchema] = React.useState(() => deepClone(initialSchema || DEFAULT_SCHEMA));
  const defs = schema.definitions || {};
  const [active, setActive] = React.useState(Object.keys(defs)[0] || "");
  const [showEntityModal, setShowEntityModal] = React.useState(false);
  const [entityDraft, setEntityDraft] = React.useState({ key: "", title: "", type: "object" });

  const [propModal, setPropModal] = React.useState({ open: false, propName: "", draft: {} });
  const [filter, setFilter] = React.useState("");
  const [message, setMessage] = React.useState(null);
  const [schemaErrors, setSchemaErrors] = React.useState([]);

  // Ajv instance (memoized)
  const ajv = React.useMemo(() => {
    const a = new Ajv({ allErrors: true, strict: false });
    addFormats(a);
    try { a.addMetaSchema(draft7Meta); } catch {}
    return a;
  }, []);

  React.useEffect(()=>{
    if (!active && Object.keys(defs).length) setActive(Object.keys(defs)[0]);
  },[schema]);

  const activeDef = defs[active];

  const notify = (text, type="ok") => {
    setMessage({ type, text });
    setTimeout(()=> setMessage(null), 3000);
  };

  const validateSchema = () => {
    // Use Ajv’s meta validation for draft‑07
    const valid = ajv.validateSchema(schema);
    if (!valid) {
      const errs = ajv.errors || [];
      setSchemaErrors(errs);
      setMessage({ type: "error", text: `${errs.length} issue(s) found` });
      return { ok: false, errors: errs };
    }
    setSchemaErrors([]);
    setMessage({ type: "ok", text: "Schema looks good (draft‑07)" });
    return { ok: true, errors: [] };
  };

  const addEntity = () => {
    const key = (entityDraft.key || "").trim();
    if (!key) return notify("Entity key is required", "error");
    if (schema.definitions[key]) return notify("Entity key already exists", "error");
    const next = deepClone(schema);
    next.definitions[key] = {
      type: entityDraft.type || "object",
      title: entityDraft.title || key,
      properties: {},
      required: [],
      primaryKey: [],
      additionalProperties: false
    };
    setSchema(next);
    setActive(key);
    setShowEntityModal(false);
    setEntityDraft({ key: "", title: "", type: "object" });
    notify("Entity created");
  };

  const removeEntity = (key) => {
    const next = deepClone(schema);
    delete next.definitions[key];
    setSchema(next);
    setActive(Object.keys(next.definitions)[0] || "");
    notify("Entity removed");
  };

  const upsertProperty = (propName, draft) => {
    const name = (draft.__name || propName || "").trim();
    if (!name) return notify("Property name is required", "error");
    const next = deepClone(schema);
    const d = next.definitions[active];
    d.properties = d.properties || {};
    const { __name, ...payload } = draft;
    d.properties[name] = payload;
    setSchema(next);
    setPropModal({ open: false, propName: "", draft: {} });
    notify("Property saved");
  };

  const editProperty = (name) => {
    const v = activeDef?.properties?.[name] || {};
    setPropModal({ open: true, propName: name, draft: { __name: name, ...deepClone(v) } });
  };

  const deleteProperty = (name) => {
    const next = deepClone(schema);
    delete next.definitions[active].properties[name];
    const def = next.definitions[active];
    def.required = (def.required || []).filter((r) => r !== name);
    def.primaryKey = (def.primaryKey || []).filter((r) => r !== name);
    setSchema(next);
    notify("Property deleted");
  };

  const addToArrayField = (field, val) => {
    if (!val) return;
    const next = deepClone(schema);
    const def = next.definitions[active];
    def[field] = Array.isArray(def[field]) ? Array.from(new Set([...def[field], val])) : [val];
    setSchema(next);
  };

  const removeFromArrayField = (field, val) => {
    const next = deepClone(schema);
    const def = next.definitions[active];
    def[field] = (def[field] || []).filter((x) => x !== val);
    setSchema(next);
  };

  const handleImport = (fileOrText) => {
    try {
      const obj = typeof fileOrText === "string" ? JSON.parse(fileOrText) : fileOrText;
      if (!obj || typeof obj !== "object" || !obj.definitions) throw new Error("Not a v7 schema with definitions");
      setSchema(deepClone(obj));
      setActive(Object.keys(obj.definitions)[0] || "");
      notify("Schema imported");
    } catch (e) {
      notify("Import failed: " + e.message, "error");
    }
  };

  const download = () => {
    const data = JSON.stringify(schema, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (schema.title?.toLowerCase().replace(/\s+/g,"-") || "schema") + ".json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredProps = React.useMemo(()=>{
    const entries = Object.entries(activeDef?.properties || {});
    if (!filter) return entries;
    return entries.filter(([k, v]) => {
      const hay = (k + " " + JSON.stringify(v)).toLowerCase();
      return hay.includes(filter.toLowerCase());
    });
  }, [activeDef, filter]);

  return (
    <div className="grid h-full grid-cols-1 md:grid-cols-[280px_1fr]">
      {/* Sidebar */}
      <aside className="border-r bg-gray-50/60 p-3 md:p-4">
        <div className="mb-3 flex items-center gap-2">
          <Database className="opacity-70" size={18} />
          <h2 className="text-sm font-semibold">Definitions</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={()=> setShowEntityModal(true)} className="inline-flex items-center gap-2 rounded-xl bg-black px-3 py-2 text-xs font-medium text-white">
            <Plus size={14}/> Add Entity
          </button>
        </div>
        <ul className="mt-3 space-y-1">
          {Object.keys(defs).map((k)=> (
            <li key={k} className={`group flex items-center justify-between rounded-xl px-2 py-1 ${k===active?"bg-white shadow":"hover:bg-white"}`}>
              <button className="flex-1 text-left" onClick={()=> setActive(k)}>
                <div className="text-sm font-medium">{k}</div>
                <div className="text-xs text-gray-500">{defs[k]?.title || ""}</div>
              </button>
              <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button className="rounded p-1 hover:bg-gray-100" title="Delete" onClick={()=> removeEntity(k)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-4 grid gap-2">
          <button onClick={download} className="inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm"><Download size={16}/> Export JSON</button>
          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm">
            <Upload size={16}/> Import JSON
            <input type="file" accept="application/json" className="hidden" onChange={(e)=>{
              const f = e.target.files?.[0];
              if (!f) return;
              const reader = new FileReader();
              reader.onload = () => handleImport(String(reader.result));
              reader.readAsText(f);
            }}/>
          </label>
          <button onClick={validateSchema} className="inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm">
            <CheckCircle2 size={16}/> Validate (draft‑07)
          </button>
        </div>

        {message && (
          <div className={`mt-3 rounded-xl border px-3 py-2 text-sm ${message.type==="error"?"border-red-300 bg-red-50 text-red-700":"border-emerald-300 bg-emerald-50 text-emerald-700"}`}>
            {message.type === "error" ? <div className="flex items-center gap-2"><AlertTriangle size={16}/> {message.text}</div> : message.text}
          </div>
        )}

        {schemaErrors.length > 0 && (
          <div className="mt-3 space-y-1 text-xs">
            {schemaErrors.slice(0, 8).map((e, i) => (
              <div key={i} className="rounded-lg border bg-white px-2 py-1">
                <div className="font-medium break-all">{e.instancePath || e.schemaPath}</div>
                <div className="text-gray-700">{e.message}</div>
              </div>
            ))}
            {schemaErrors.length > 8 && <div className="text-gray-500">…and {schemaErrors.length - 8} more</div>}
          </div>
        )}
      </aside>

      {/* Main */}
      <main className="p-4 md:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{schema.title || "Schema"}</h1>
            {active && <div className="text-sm text-gray-600">Editing entity: <b>{active}</b> {activeDef?.title ? `— ${activeDef.title}`: ""}</div>}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2.5" size={16} />
              <input className="rounded-xl border pl-8 pr-3 py-2 text-sm" placeholder="Search properties..." value={filter} onChange={(e)=> setFilter(e.target.value)} />
            </div>
            {active && (
              <button onClick={()=> setPropModal({ open: true, propName: "", draft: { __name: "", type: "string" } })} className="inline-flex items-center gap-2 rounded-xl bg-black px-3 py-2 text-sm text-white">
                <Plus size={14}/> Add property
              </button>
            )}
          </div>
        </div>

        {/* Constraints */}
        {active && (
          <section className="rounded-2xl border p-4">
            <h3 className="mb-2 text-sm font-semibold">Constraints</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-xs text-gray-600">Required</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {(activeDef.required || []).map((r)=> (
                    <Badge key={r} onRemove={()=> removeFromArrayField("required", r)}>{r}</Badge>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <select className="flex-1 rounded-xl border px-2 py-1 text-sm" onChange={(e)=> addToArrayField("required", e.target.value)}>
                    <option value="">Add required…</option>
                    {Object.keys(activeDef.properties||{}).filter(p=> !(activeDef.required||[]).includes(p)).map((p)=> (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-600">Primary Key</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {(activeDef.primaryKey || []).map((r)=> (
                    <Badge key={r} onRemove={()=> removeFromArrayField("primaryKey", r)}>{r}</Badge>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <select className="flex-1 rounded-xl border px-2 py-1 text-sm" onChange={(e)=> addToArrayField("primaryKey", e.target.value)}>
                    <option value="">Add key…</option>
                    {Object.keys(activeDef.properties||{}).filter(p=> !(activeDef.primaryKey||[]).includes(p)).map((p)=> (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Properties table */}
        <section className="rounded-2xl border mt-6">
          <div className="flex items-center justify-between border-b p-3">
            <h3 className="text-sm font-semibold">Properties</h3>
            <div className="text-xs text-gray-500">{Object.keys(activeDef?.properties||{}).length} field(s)</div>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Name</th>
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-left font-medium">Format</th>
                  <th className="px-3 py-2 text-left font-medium">Enum / Items</th>
                  <th className="px-3 py-2 text-left font-medium">FK</th>
                  <th className="px-3 py-2 text-left font-medium">Description</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProps.map(([name, v])=> {
                  const fkInfo = [v.refTable, v.refColumn].filter(Boolean).join(".") || v["$ref"] || "";
                  const enumInfo = Array.isArray(v.enum) ? `enum(${v.enum.join("|")})` : (Array.isArray(v.items?.enum) ? `items.enum(${v.items.enum.join("|")})` : (v.items?.type ? `items.type=${v.items.type}` : ""));
                  return (
                    <tr key={name} className="border-t align-top">
                      <td className="px-3 py-2">
                        <div className="font-medium">{name}</div>
                        <div className="text-xs text-gray-500">min:{v.minLength??"-"} max:{v.maxLength??"-"} def:{v.default??"-"}</div>
                      </td>
                      <td className="px-3 py-2">{v.type}</td>
                      <td className="px-3 py-2">{v.format || ""}</td>
                      <td className="px-3 py-2">{enumInfo}</td>
                      <td className="px-3 py-2">{fkInfo}</td>
                      <td className="px-3 py-2 max-w-[320px]"><div className="truncate" title={v.description||""}>{v.description||""}</div></td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <button className="rounded p-1 hover:bg-gray-100" title="Edit" onClick={()=> setPropModal({ open: true, propName: name, draft: { __name: name, ...deepClone(v) } })}>
                            <Pencil size={16}/>
                          </button>
                          <button className="rounded p-1 hover:bg-gray-100 text-red-600" title="Delete" onClick={()=> deleteProperty(name)}>
                            <Trash2 size={16}/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredProps.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-sm text-gray-500">No properties yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Raw JSON */}
        <section className="rounded-2xl border p-3 mt-6">
          <details>
            <summary className="cursor-pointer text-sm font-semibold">Advanced: raw JSON schema</summary>
            <div className="mt-3 grid gap-2">
              <TextArea rows={12} label="" value={JSON.stringify(schema, null, 2)} onChange={(txt)=> {
                try {
                  const obj = JSON.parse(txt);
                  setSchema(obj);
                } catch (e) { /* ignore until JSON valid */ }
              }}/>
              <div className="text-xs text-gray-500">Edits apply immediately if valid JSON.</div>
            </div>
          </details>
        </section>
      </main>

      {/* Entity modal */}
      <Modal open={showEntityModal} title="Add Entity" onClose={()=> setShowEntityModal(false)} onSave={addEntity}>
        <div className="grid gap-3">
          <TextInput label="Key (object name)" value={entityDraft.key} onChange={(x)=> setEntityDraft((p)=> ({...p, key: x}))} placeholder="e.g., products" />
          <TextInput label="Title" value={entityDraft.title} onChange={(x)=> setEntityDraft((p)=> ({...p, title: x}))} placeholder="Human-friendly name" />
          <TextInput label="Type" value={entityDraft.type} onChange={(x)=> setEntityDraft((p)=> ({...p, type: x}))} placeholder="object" />
        </div>
      </Modal>

      {/* Property modal */}
      <Modal open={propModal.open} title={propModal.propName ? `Edit Property: ${propModal.propName}` : "Add Property"}
             onClose={()=> setPropModal({ open: false, propName: "", draft: {} })}
             onSave={()=> upsertProperty(propModal.propName, propModal.draft)}>
        <PropertyForm value={propModal.draft} onChange={(val)=> setPropModal((p)=> ({...p, draft: val}))} />
      </Modal>
    </div>
  );
}
