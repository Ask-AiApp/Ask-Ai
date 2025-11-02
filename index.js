// index.js
import express from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

// -----------------------------------------------------------------------------
// ESM __dirname + load .env
// -----------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

// -----------------------------------------------------------------------------
// App
// -----------------------------------------------------------------------------
const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// -----------------------------------------------------------------------------
// Boot log (which keys are present)
// -----------------------------------------------------------------------------
const present = (env) => (process.env[env] ? "✅" : "—");
console.log("Ask-AI backend starting...");
console.log(`OpenAI:   ${present("OPENAI_API_KEY")}`);
console.log(`Mistral:  ${present("MISTRAL_API_KEY")}`);
console.log(`Gemini:   ${present("GEMINI_API_KEY")}`);
console.log(`Groq:     ${present("GROQ_API_KEY")}`);
console.log(`DeepSeek:     ${present("DEEPSEEK_API_KEY")}`);

// -----------------------------------------------------------------------------
// Health & root
// -----------------------------------------------------------------------------
app.get("/", (_req, res) => res.send("Ask-AI backend is running."));
app.get("/health", (_req, res) => res.json({ ok: true }));

// -----------------------------------------------------------------------------
// Provider helpers (OpenAI, Mistral, Gemini, Groq)
// -----------------------------------------------------------------------------
function mapFriendlyError(msg) {
  const s = String(msg || "");
  if (/401|unauthor/i.test(s)) return "Auth failed (check API key).";
  if (/403|forbid|not\s*allowed|permission/i.test(s)) return "Access denied (model/region).";
  if (/429|quota|rate|capacity/i.test(s)) return "Rate limit or quota exceeded.";
  if (/5\d\d|unavailable|timeout|timed out|ECONNRESET|ENETUNREACH/i.test(s)) return "Provider unavailable.";
  return `Unexpected error: ${s}`;
}

async function askOpenAI(prompt) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return { provider: "OpenAI", text: "OpenAI placeholder response (no API key set)" };
    }
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const r = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      { model, messages: [{ role: "user", content: prompt }], temperature: 0.7 },
      { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, timeout: 20000 }
    );
    const text =
      r.data?.choices?.[0]?.message?.content?.trim() ??
      r.data?.choices?.[0]?.text?.trim() ??
      "No content returned.";
    return { provider: "OpenAI", text };
  } catch (e) {
    const msg = e?.response?.data?.error?.message || e?.message || "Unknown error";
    return { provider: "OpenAI", text: mapFriendlyError(msg) };
  }
}

async function askMistral(prompt) {
  try {
    if (!process.env.MISTRAL_API_KEY) {
      return { provider: "Mistral", text: "Mistral placeholder response (no API key set)" };
    }
    const model = process.env.MISTRAL_MODEL || "mistral-large-latest";
    const r = await axios.post(
      "https://api.mistral.ai/v1/chat/completions",
      { model, messages: [{ role: "user", content: prompt }], temperature: 0.7 },
      { headers: { Authorization: `Bearer ${process.env.MISTRAL_API_KEY}` }, timeout: 20000 }
    );
    const text =
      r.data?.choices?.[0]?.message?.content?.trim() ??
      r.data?.choices?.[0]?.text?.trim() ??
      "No content returned.";
    return { provider: "Mistral", text };
  } catch (e) {
    const msg = e?.response?.data?.error?.message || e?.response?.data?.message || e?.message || "Unknown error";
    return { provider: "Mistral", text: mapFriendlyError(msg) };
  }
}

async function askGroq(prompt) {
  try {
    if (!process.env.GROQ_API_KEY) {
      return { provider: "Groq", text: "Groq placeholder response (no API key set)" };
    }
    // Avoid decommissioned defaults; try a small fallback list if needed.
    let model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
    const headers = { Authorization: `Bearer ${process.env.GROQ_API_KEY}` };
    const body = (mdl) => ({ model: mdl, messages: [{ role: "user", content: prompt }], temperature: 0.7 });

    try {
      const r = await axios.post("https://api.groq.com/openai/v1/chat/completions", body(model), { headers, timeout: 20000 });
      const text =
        r.data?.choices?.[0]?.message?.content?.trim() ??
        r.data?.choices?.[0]?.text?.trim() ??
        "No content returned.";
      return { provider: "Groq", text };
    } catch (inner) {
      const msg = inner?.response?.data?.error?.message || "";
      const decommissioned = /decommissioned|not supported|model[_\s-]?decommissioned/i.test(msg);
      if (decommissioned) {
        const fallbacks = ["llama-3.3-70b-versatile", "mistral-saba-24b"];
        for (const fb of fallbacks) {
          if (fb === model) continue;
          try {
            const r2 = await axios.post("https://api.groq.com/openai/v1/chat/completions", body(fb), { headers, timeout: 20000 });
            const text =
              r2.data?.choices?.[0]?.message?.content?.trim() ??
              r2.data?.choices?.[0]?.text?.trim() ??
              "No content returned.";
            return { provider: "Groq", text };
          } catch { /* try next */ }
        }
      }
      throw inner;
    }
  } catch (e) {
    const msg = e?.response?.data?.error?.message || e?.message || "Unknown error";
    return { provider: "Groq", text: mapFriendlyError(msg) };
  }
}

async function askDeepSeek(prompt) {
  try {
    if (!process.env.DEEPSEEK_API_KEY) {
      return { provider: "DeepSeek", text: "DeepSeek placeholder response (no API key set)" };
    }
    const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
    const r = await axios.post(
      "https://api.deepseek.com/v1/chat/completions",
      { model, messages: [{ role: "user", content: prompt }], temperature: 0.7 },
      { headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` }, timeout: 20000 }
    );
    const text =
      r.data?.choices?.[0]?.message?.content?.trim() ??
      r.data?.choices?.[0]?.text?.trim() ??
      "No content returned.";
    return { provider: "DeepSeek", text };
  } catch (e) {
    const msg = e?.response?.data?.error?.message || e?.message || "Unknown error";
    return { provider: "DeepSeek", text: mapFriendlyError(msg) };
  }
}

async function askGemini(prompt) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return { provider: "Gemini", text: "Gemini placeholder response (no API key set)" };
    }
    const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const r = await axios.post(
      url,
      { contents: [{ parts: [{ text: prompt }] }] },
      { headers: { "x-goog-api-key": process.env.GEMINI_API_KEY }, timeout: 20000 }
    );
    const text = r.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "No content returned.";
    return { provider: "Gemini", text };
  } catch (e) {
    const msg = e?.response?.data?.error?.message || e?.response?.data?.message || e?.message || "Unknown error";
    return { provider: "Gemini", text: mapFriendlyError(msg) };
  }
}

// -----------------------------------------------------------------------------
// AI Directory loader — *only* read data/ai-directory.json (no legacy server.json)
// -----------------------------------------------------------------------------
const DIRECTORY_PATH = path.join(__dirname, "data", "ai-directory.json");

let DIRECTORY = [];
let DIRECTORY_LAST_ERROR = null;
let DIRECTORY_LAST_LOADED_AT = null;

function normStr(x) { return (x ?? "").toString().trim(); }
function normArr(a) { return Array.isArray(a) ? a.filter(Boolean).map((v) => String(v).trim()) : []; }

function normCompany(c = {}) {
  return {
    name:      normStr(c.name),
    category:  normStr(c.category),
    summary:   normStr(c.summary),
    website:   normStr(c.website),
    use_cases: normArr(c.use_cases),
    logo:      c.logo ? String(c.logo) : null,
  };
}

function validateDirectory(items) {
  if (!Array.isArray(items)) throw new Error("ai-directory.json must be a JSON array");
  // light sanity check: entries must at least have a name
  for (let i = 0; i < items.length; i++) {
    if (!items[i] || typeof items[i] !== "object") throw new Error(`Entry #${i} is not an object`);
    if (!items[i].name) throw new Error(`Entry #${i} missing "name"`);
  }
}

async function loadDirectoryOnce() {
  try {
    const raw = await fs.readFile(DIRECTORY_PATH, "utf-8");
    // Ensure we are not accidentally parsing a JS file
    if (/^\s*import\s|^\s*export\s/m.test(raw)) {
      throw new Error("ai-directory.json looks like JavaScript, not JSON");
    }
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.items) ? parsed.items : []);
    validateDirectory(items);
    DIRECTORY = items.map(normCompany);
    DIRECTORY_LAST_ERROR = null;
    DIRECTORY_LAST_LOADED_AT = new Date().toISOString();
    console.log(`AI Directory loaded: ${DIRECTORY.length} items`);
  } catch (e) {
    DIRECTORY = [];
    DIRECTORY_LAST_ERROR = String(e?.message || e);
    DIRECTORY_LAST_LOADED_AT = new Date().toISOString();
    console.warn("AI Directory not loaded:", DIRECTORY_LAST_ERROR);
  }
}

// Initial load on boot
await loadDirectoryOnce();

// -----------------------------------------------------------------------------
// Directory routes (+ hot reload + status)
// -----------------------------------------------------------------------------
app.get("/ai-directory", (_req, res) => {
  res.json({ ok: true, count: DIRECTORY.length, items: DIRECTORY });
});

app.get("/ai-directory/search", (req, res) => {
  const q = (req.query.q ?? "").toString().trim().toLowerCase();
  if (!q) return res.json({ ok: true, count: DIRECTORY.length, items: DIRECTORY });
  const match = (s) => s && s.toLowerCase().includes(q);
  const filtered = DIRECTORY.filter((c) =>
    match(c.name) ||
    match(c.category) ||
    match(c.summary) ||
    match(c.website) ||
    (Array.isArray(c.use_cases) && c.use_cases.some(match))
  );
  res.json({ ok: true, count: filtered.length, items: filtered });
});

app.post("/ai-directory/reload", async (_req, res) => {
  await loadDirectoryOnce();
  res.json({
    ok: DIRECTORY_LAST_ERROR == null,
    count: DIRECTORY.length,
    error: DIRECTORY_LAST_ERROR,
    reloaded_at: DIRECTORY_LAST_LOADED_AT,
  });
});

app.get("/ai-directory/status", (_req, res) => {
  res.json({
    ok: DIRECTORY_LAST_ERROR == null,
    count: DIRECTORY.length,
    error: DIRECTORY_LAST_ERROR,
    last_loaded_at: DIRECTORY_LAST_LOADED_AT,
    path: DIRECTORY_PATH,
  });
});

// -----------------------------------------------------------------------------
// Unified /ask route (Android expects { prompt, answers })
// -----------------------------------------------------------------------------
app.post("/ask", async (req, res) => {
  const prompt = String(req.body?.prompt ?? "").trim().slice(0, 2000);
  const jobs = [
    ["OpenAI",  () => askOpenAI(prompt)],
    ["Mistral", () => askMistral(prompt)],
    ["Groq",    () => askGroq(prompt)],
    ["DeepSeek",    () => askDeepSeek(prompt)],
    ["Gemini",  () => askGemini(prompt)],
    
  ];
  const settled = await Promise.allSettled(jobs.map(([_, fn]) => fn()));
  const answers = settled.map((r, i) => {
    const provider = jobs[i][0];
    if (r.status === "fulfilled") return r.value;
    return { provider, text: mapFriendlyError(r.reason || "Unknown error") };
  });
  res.json({ prompt, answers });
});

// -----------------------------------------------------------------------------
// 404 handler (helpful for debugging wrong paths)
// -----------------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Not found", path: req.path });
});

// -----------------------------------------------------------------------------
// Start server
// -----------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Ask-AI backend running on http://localhost:${PORT}`);
  console.log("Routes: /, /health, /ai-directory, /ai-directory/search, /ai-directory/reload, /ai-directory/status, /ask");
});

/*
Sample data/ai-directory.json to get you started:

[
  {
    "name": "OpenAI GPT-4o Mini",
    "category": "General",
    "summary": "Lightweight, fast reasoning model.",
    "website": "https://platform.openai.com",
    "use_cases": ["chat", "summarization", "Q&A"],
    "logo": null
  }
]
*/
