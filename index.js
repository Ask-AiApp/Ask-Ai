// index.js
import express from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

// ✅ Bedrock Runtime SDK (NEW)
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

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
console.log(`DeepSeek: ${present("DEEPSEEK_API_KEY")}`);

// ✅ Bedrock env presence (NEW)
console.log(`Bedrock:  ${present("AWS_ACCESS_KEY_ID")}/${present("AWS_SECRET_ACCESS_KEY")} (${process.env.AWS_REGION || "eu-west-1"})`);

// -----------------------------------------------------------------------------
// Health & root
// -----------------------------------------------------------------------------
app.get("/", (_req, res) => res.send("Ask-AI backend is running."));
app.get("/health", (_req, res) => res.json({ ok: true }));

// -----------------------------------------------------------------------------
// Provider helpers
// -----------------------------------------------------------------------------
function mapFriendlyError(msg) {
  const s = String(msg || "");
  if (/401|unauthor/i.test(s)) return "Auth failed (check API key).";
  if (/403|forbid|not\s*allowed|permission/i.test(s)) return "Access denied (model/region).";
  if (/429|quota|rate|capacity/i.test(s)) return "Rate limit or quota exceeded.";
  if (/5\d\d|unavailable|timeout|timed out|ECONNRESET|ENETUNREACH/i.test(s)) return "Provider unavailable.";
  return `Unexpected error: ${s}`;
}

// ✅ Bedrock client (NEW)
const bedrock =
  process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? new BedrockRuntimeClient({
        region: process.env.AWS_REGION || "eu-west-1",
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      })
    : null;

// ✅ Bedrock Claude Sonnet invocation (NEW)
// IMPORTANT: Set BEDROCK_CLAUDE_SONNET_MODEL_ID in Render to the exact model id enabled in eu-west-1.
async function askBedrockClaudeSonnet(prompt) {
  try {
    if (!bedrock) {
      return {
        provider: "Bedrock Claude Sonnet",
        text: "Bedrock not configured (missing AWS credentials).",
      };
    }

    const modelId =
      process.env.BEDROCK_CLAUDE_SONNET_MODEL_ID ||
      "anthropic.claude-3-sonnet-20240229-v1:0";

    const body = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 700,
      temperature: 0.4,
      messages: [{ role: "user", content: prompt }],
    };

    const cmd = new InvokeModelCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: new TextEncoder().encode(JSON.stringify(body)),
    });

    const res = await bedrock.send(cmd);
    const json = JSON.parse(new TextDecoder().decode(res.body));

    const text =
      json?.content?.[0]?.text?.trim() ?? "No content returned.";

    return { provider: "Bedrock Claude Sonnet", text };
  } catch (e) {
    console.error("BEDROCK_INVOKE_ERROR", e);
    return {
      provider: "Bedrock Claude Sonnet",
      text: mapFriendlyError(e?.message),
    };
  }
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
    return { provider: "OpenAI", text: mapFriendlyError(e?.message) };
  }
}

async function askMistral(prompt) {
  try {
    if (!process.env.MISTRAL_API_KEY) {
      return { provider: "Mistral", text: "Mistral placeholder response (no API key set)" };
    }
    const r = await axios.post(
      "https://api.mistral.ai/v1/chat/completions",
      { model: "mistral-large-latest", messages: [{ role: "user", content: prompt }] },
      { headers: { Authorization: `Bearer ${process.env.MISTRAL_API_KEY}` }, timeout: 20000 }
    );
    const text =
      r.data?.choices?.[0]?.message?.content?.trim() ??
      r.data?.choices?.[0]?.text?.trim() ??
      "No content returned.";
    return { provider: "Mistral", text };
  } catch (e) {
    return { provider: "Mistral", text: mapFriendlyError(e?.message) };
  }
}

async function askGroq(prompt) {
  try {
    if (!process.env.GROQ_API_KEY) {
      return { provider: "Groq", text: "Groq placeholder response (no API key set)" };
    }
    const r = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      { model: "llama-3.3-70b-versatile", messages: [{ role: "user", content: prompt }] },
      { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, timeout: 20000 }
    );
    const text =
      r.data?.choices?.[0]?.message?.content?.trim() ??
      r.data?.choices?.[0]?.text?.trim() ??
      "No content returned.";
    return { provider: "Groq", text };
  } catch (e) {
    return { provider: "Groq", text: mapFriendlyError(e?.message) };
  }
}

/* ✅ FIXED HERE */
async function askDeepSeek(prompt) {
  try {
    if (!process.env.DEEPSEEK_API_KEY) {
      return { provider: "DeepSeek", text: "DeepSeek placeholder response (no API key set)" };
    }
    const r = await axios.post(
      "https://api.deepseek.com/v1/chat/completions",
      { model: "deepseek-chat", messages: [{ role: "user", content: prompt }] },
      { headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` }, timeout: 20000 }
    );
    const text =
      r.data?.choices?.[0]?.message?.content?.trim() ??
      r.data?.choices?.[0]?.text?.trim() ??
      "No content returned.";
    return { provider: "DeepSeek", text };
  } catch (e) {
    return { provider: "DeepSeek", text: mapFriendlyError(e?.message) };
  }
}

async function askGemini(prompt) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return { provider: "Gemini", text: "Gemini placeholder response (no API key set)" };
    }
    const r = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",
      { contents: [{ parts: [{ text: prompt }] }] },
      { headers: { "x-goog-api-key": process.env.GEMINI_API_KEY }, timeout: 20000 }
    );
    const text = r.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "No content returned.";
    return { provider: "Gemini", text };
  } catch (e) {
    return { provider: "Gemini", text: mapFriendlyError(e?.message) };
  }
}

// -----------------------------------------------------------------------------
// Ask route
// -----------------------------------------------------------------------------
app.post("/ask", async (req, res) => {
  const prompt = String(req.body?.prompt ?? "").trim();

  // ✅ Optional provider selection support (NEW)
  // If UI sends { providers: ["OpenAI","Groq","bedrock_claude_sonnet"] } we only run those.
  const providers = Array.isArray(req.body?.providers) ? req.body.providers : null;

  const jobsByKey = {
    OpenAI: () => askOpenAI(prompt),
    Mistral: () => askMistral(prompt),
    Groq: () => askGroq(prompt),
    DeepSeek: () => askDeepSeek(prompt),
    Gemini: () => askGemini(prompt),

    // ✅ Bedrock provider key expected from Lovable toggle:
    bedrock_claude_sonnet: () => askBedrockClaudeSonnet(prompt),
  };

  const keysToRun = providers?.length
    ? providers.filter((k) => Object.prototype.hasOwnProperty.call(jobsByKey, k))
    : Object.keys(jobsByKey);

  const results = await Promise.all(
    keysToRun.map(async (k) => {
      try {
        return await jobsByKey[k]();
      } catch (e) {
        return { provider: String(k), text: mapFriendlyError(e?.message) };
      }
    })
  );

  res.json({ prompt, answers: results });
});

// -----------------------------------------------------------------------------
// Start server
// -----------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Ask-AI backend running on http://localhost:${PORT}`);
});
