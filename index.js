// index.js
import express from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// -----------------------------
// Resolve __dirname for ES modules & load .env
// -----------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

// Basic diagnostics
console.log("process.cwd():", process.cwd());
console.log("Looking for .env at:", path.join(__dirname, ".env"), "exists:", fs.existsSync(path.join(__dirname, ".env")));
console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "✅ set" : "—");
console.log("ANTHROPIC_API_KEY:", process.env.ANTHROPIC_API_KEY ? "✅ set" : "—");
console.log("GEMINI_API_KEY:", process.env.GEMINI_API_KEY ? "✅ set" : "—");

// -----------------------------
// Express
// -----------------------------
const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// -----------------------------
// Provider helpers (each one fails gracefully if no key)
// -----------------------------
async function askOpenAI(prompt) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return { provider: "OpenAI", text: "OpenAI placeholder response (no API key set)" };
    }
    const r = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a concise, helpful assistant." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 20000
      }
    );
    const text = r.data?.choices?.[0]?.message?.content?.trim() || "No content returned.";
    return { provider: "OpenAI", text };
  } catch (e) {
    const msg = e?.response?.data?.error?.message || e?.message || "Unknown error";
    return { provider: "OpenAI", text: `OpenAI error: ${msg}` };
  }
}

async function askClaude(prompt) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return { provider: "Claude", text: "Anthropic placeholder response (no API key set)" };
    }
    const r = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-3-haiku-20240307",
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }]
      },
      {
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        timeout: 20000
      }
    );
    const blocks = r.data?.content || [];
    const text =
      blocks
        .filter((b) => b?.type === "text" && typeof b.text === "string")
        .map((b) => b.text)
        .join("\n")
        .trim() || "No content returned.";
    return { provider: "Claude", text };
  } catch (e) {
    const msg = e?.response?.data?.error?.message || e?.message || "Unknown error";
    return { provider: "Claude", text: `Anthropic error: ${msg}` };
  }
}

async function askGemini(prompt) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return { provider: "Gemini", text: "Gemini placeholder response (no API key set)" };
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(
      process.env.GEMINI_API_KEY
    )}`;
    const r = await axios.post(
      url,
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 512 }
      },
      { timeout: 20000 }
    );
    const parts = r.data?.candidates?.[0]?.content?.parts || [];
    const text =
      parts
        .map((p) => p?.text)
        .filter(Boolean)
        .join("\n")
        .trim() || "No content returned.";
    return { provider: "Gemini", text };
  } catch (e) {
    const msg =
      e?.response?.data?.error?.message ||
      e?.response?.data?.error?.status ||
      e?.message ||
      "Unknown error";
    return { provider: "Gemini", text: `Gemini error: ${msg}` };
  }
}

async function askCohere(prompt) {
  try {
    if (!process.env.COHERE_API_KEY) {
      return { provider: "Cohere", text: "Cohere placeholder response (no API key set)" };
    }
    const r = await axios.post(
      "https://api.cohere.ai/v1/generate",
      { model: "command", prompt, max_tokens: 300, temperature: 0.7 },
      { headers: { Authorization: `Bearer ${process.env.COHERE_API_KEY}` }, timeout: 20000 }
    );
    const text = r.data?.generations?.[0]?.text?.trim() || "No content returned.";
    return { provider: "Cohere", text };
  } catch (e) {
    const msg = e?.response?.data?.message || e?.message || "Unknown error";
    return { provider: "Cohere", text: `Cohere error: ${msg}` };
  }
}

async function askMistral(prompt) {
  try {
    if (!process.env.MISTRAL_API_KEY) {
      return { provider: "Mistral", text: "Mistral placeholder response (no API key set)" };
    }
    const r = await axios.post(
      "https://api.mistral.ai/v1/chat/completions",
      {
        model: "mistral-small-latest",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 512
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 20000
      }
    );
    const text = r.data?.choices?.[0]?.message?.content?.trim() || "No content returned.";
    return { provider: "Mistral", text };
  } catch (e) {
    const msg = e?.response?.data?.error || e?.message || "Unknown error";
    return { provider: "Mistral", text: `Mistral error: ${msg}` };
  }
}

async function askHuggingFace(prompt) {
  try {
    if (!process.env.HF_API_KEY) {
      return { provider: "Hugging Face", text: "Hugging Face placeholder response (no API key set)" };
    }
    const model = "mistralai/Mistral-7B-Instruct-v0.2";
    const r = await axios.post(
      `https://api-inference.huggingface.co/models/${encodeURIComponent(model)}`,
      { inputs: prompt },
      { headers: { Authorization: `Bearer ${process.env.HF_API_KEY}` }, timeout: 30000 }
    );
    let text = "No content returned.";
    if (Array.isArray(r.data) && r.data[0]?.generated_text) {
      text = String(r.data[0].generated_text).trim();
    } else if (typeof r.data?.generated_text === "string") {
      text = r.data.generated_text.trim();
    } else if (Array.isArray(r.data) && r.data[0]?.summary_text) {
      text = String(r.data[0].summary_text).trim();
    }
    return { provider: "Hugging Face", text };
  } catch (e) {
    const msg = e?.response?.data?.error || e?.message || "Unknown error";
    return { provider: "Hugging Face", text: `Hugging Face error: ${msg}` };
  }
}

async function askPerplexity(prompt) {
  try {
    if (!process.env.PERPLEXITY_API_KEY) {
      return { provider: "Perplexity", text: "Perplexity placeholder response (no API key set)" };
    }
    const r = await axios.post(
      "https://api.perplexity.ai/chat/completions",
      { model: "pplx-70b-chat", messages: [{ role: "user", content: prompt }], temperature: 0.7 },
      { headers: { Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`, "Content-Type": "application/json" }, timeout: 20000 }
    );
    const text = r.data?.choices?.[0]?.message?.content?.trim() || "No content returned.";
    return { provider: "Perplexity", text };
  } catch (e) {
    const msg = e?.response?.data?.error?.message || e?.message || "Unknown error";
    return { provider: "Perplexity", text: `Perplexity error: ${msg}` };
  }
}

// -----------------------------
// AI Directory (file + fallback) with BOM stripping
// -----------------------------
const DIR_FILE = path.join(__dirname, "data", "ai-directory.json");

const FALLBACK_DIRECTORY = [
  {
    name: "OpenAI ChatGPT",
    category: "General / Chat",
    summary: "Conversational AI by OpenAI.",
    website: "https://chat.openai.com/",
    use_cases: ["Q&A", "writing", "coding"]
  },
  {
    name: "Anthropic Claude",
    category: "General / Chat",
    summary: "Helpful, harmless, honest assistant.",
    website: "https://claude.ai/",
    use_cases: ["analysis", "summaries", "ideation"]
  },
  {
    name: "Google Gemini",
    category: "General / Chat",
    summary: "Multimodal AI by Google.",
    website: "https://gemini.google.com/",
    use_cases: ["search", "images", "Q&A"]
  }
];

function normalizeCompaniesShape(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    if (Array.isArray(raw.items)) return raw.items;
    if (raw.items && typeof raw.items === "object") return Object.values(raw.items);
    return Object.values(raw);
  }
  return [];
}

function loadDirectory() {
  try {
    if (!fs.existsSync(DIR_FILE)) return FALLBACK_DIRECTORY;
    const rawText = fs.readFileSync(DIR_FILE, "utf8");
    const noBom = rawText.replace(/^\uFEFF/, ""); // strip UTF-8 BOM
    const parsed = JSON.parse(noBom);
    const items = normalizeCompaniesShape(parsed);
    return items.length ? items : FALLBACK_DIRECTORY;
  } catch (e) {
    console.error("ai-directory read/parse error:", e.message);
    return FALLBACK_DIRECTORY;
  }
}

// -----------------------------
// Routes
// -----------------------------
app.get("/", (_req, res) => {
  res.type("text/plain").send(
`Artiligenz backend is running.
GET  /health
GET  /ai-directory
GET  /ai-directory/search?q=term
POST /ask   { "prompt": "Hello" }`
  );
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/ai-directory", (_req, res) => {
  const items = loadDirectory();
  res.json({ ok: true, count: items.length, items });
});

app.get("/ai-directory/search", (req, res) => {
  const q = (req.query.q || "").toString().trim().toLowerCase();
  const items = loadDirectory();
  const filtered = !q
    ? items
    : items.filter((it) => {
        const haystack = [
          it.name,
          it.category,
          it.summary,
          ...(Array.isArray(it.use_cases) ? it.use_cases : [])
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
  res.json({ ok: true, count: filtered.length, items: filtered });
});

app.post("/ask", async (req, res) => {
  const prompt = String(req.body?.prompt ?? "").trim().slice(0, 2000);

  const answers = await Promise.all([
    askOpenAI(prompt),
    askClaude(prompt),
    askGemini(prompt),
    askCohere(prompt),
    askMistral(prompt),
    askHuggingFace(prompt),
    askPerplexity(prompt),
    Promise.resolve({ provider: "Grok", text: "Grok placeholder response" })
  ]);

  res.json({ prompt, answers });
});

// -----------------------------
// Start
// -----------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Ask-Ai backend running on http://localhost:${PORT}`);
  console.log("Routes: /, /health, /ai-directory, /ai-directory/search, /ask");
});
