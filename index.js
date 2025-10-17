// index.js
import express from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// -----------------------------
// Resolve __dirname for ES modules & load .env
// -----------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

// -----------------------------
// App
// -----------------------------
const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// -----------------------------
// Boot log (which keys are present)
// -----------------------------
function present(env) {
  return process.env[env] ? "✅" : "—";
}
console.log("Ask-AI backend starting...");
console.log(`OpenAI:   ${present("OPENAI_API_KEY")}`);
console.log(`Mistral:  ${present("MISTRAL_API_KEY")}`);
console.log(`Gemini:   ${present("GEMINI_API_KEY")}`);
console.log(`Groq:     ${present("GROQ_API_KEY")}`);

// -----------------------------
// Health & root
// -----------------------------
app.get("/", (_req, res) => res.send("Ask-AI backend is running."));
app.get("/health", (_req, res) => res.json({ ok: true }));

// -----------------------------
// Provider helpers
// -----------------------------

async function askOpenAI(prompt) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return { provider: "OpenAI", text: "OpenAI placeholder response (no API key set)" };
    }
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const r = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model,
        messages: [{ role: "user", content: prompt }],
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
    const text =
      r.data?.choices?.[0]?.message?.content?.trim() ||
      r.data?.choices?.[0]?.text?.trim() ||
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
    // Common models: "mistral-large-latest", "mistral-small-latest", etc.
    const model = process.env.MISTRAL_MODEL || "mistral-large-latest";
    const r = await axios.post(
      "https://api.mistral.ai/v1/chat/completions",
      {
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 20000
      }
    );
    const text =
      r.data?.choices?.[0]?.message?.content?.trim() ||
      r.data?.choices?.[0]?.text?.trim() ||
      "No content returned.";
    return { provider: "Mistral", text };
  } catch (e) {
    const msg =
      e?.response?.data?.error?.message ||
      e?.response?.data?.message ||
      e?.message ||
      "Unknown error";
    return { provider: "Mistral", text: mapFriendlyError(msg) };
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
      {
        headers: {
          "x-goog-api-key": process.env.GEMINI_API_KEY,
          "Content-Type": "application/json"
        },
        timeout: 20000
      }
    );
    const text =
      r.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      "No content returned.";
    return { provider: "Gemini", text };
  } catch (e) {
    const msg =
      e?.response?.data?.error?.message ||
      e?.response?.data?.message ||
      e?.message ||
      "Unknown error";
    return { provider: "Gemini", text: mapFriendlyError(msg) };
  }
}

async function askGroq(prompt) {
  try {
    if (!process.env.GROQ_API_KEY) {
      return { provider: "Groq", text: "Groq placeholder response (no API key set)" };
    }
    const model = process.env.GROQ_MODEL || "llama-3.1-70b-versatile";
    const r = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 20000
      }
    );
    const text =
      r.data?.choices?.[0]?.message?.content?.trim() ||
      r.data?.choices?.[0]?.text?.trim() ||
      "No content returned.";
    return { provider: "Groq", text };
  } catch (e) {
    const msg = e?.response?.data?.error?.message || e?.message || "Unknown error";
    return { provider: "Groq", text: mapFriendlyError(msg) };
  }
}

// -----------------------------
// Friendly error mapping
// -----------------------------
function mapFriendlyError(msg) {
  const s = String(msg);
  if (/401|unauthor/i.test(s)) return "Auth failed (check API key).";
  if (/403|forbid|not\s*allowed/i.test(s)) return "Access denied (model/region).";
  if (/429|quota|rate/i.test(s)) return "Rate limit or quota exceeded.";
  if (/5\d\d|unavailable|timeout|timed out/i.test(s)) return "Provider unavailable.";
  return `Unexpected error: ${s}`;
}

// -----------------------------
// Unified /ask route (Android expects { prompt, answers })
// -----------------------------
app.post("/ask", async (req, res) => {
  const prompt = String(req.body?.prompt ?? "").trim().slice(0, 2000);

  const jobs = [
    ["OpenAI",  () => askOpenAI(prompt)],
    ["Mistral", () => askMistral(prompt)],
    ["Gemini",  () => askGemini(prompt)],
    ["Groq",    () => askGroq(prompt)]
  ];

  const settled = await Promise.allSettled(jobs.map(([_, fn]) => fn()));
  const answers = settled.map((r, i) => {
    const provider = jobs[i][0];
    if (r.status === "fulfilled") return r.value;
    return { provider, text: mapFriendlyError(r.reason || "Unknown error") };
  });

  res.json({ prompt, answers });
});

// -----------------------------
// Start
// -----------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Ask-AI backend running on http://localhost:${PORT}`);
  console.log("Routes: /, /health, /ask");
});
