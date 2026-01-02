// index.js
import express from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// ✅ Bedrock Runtime SDK (updated to use Converse)
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

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

// ✅ Bedrock env presence
console.log(
  `Bedrock:  ${present("AWS_ACCESS_KEY_ID")}/${present("AWS_SECRET_ACCESS_KEY")} (${process.env.AWS_REGION || "eu-west-1"})`
);

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

// Canonicalize provider IDs coming from UI (Lovable currently lowercases)
function canonicalProviderId(id) {
  return String(id || "").trim().toLowerCase();
}

// -----------------------------------------------------------------------------
// ✅ Bedrock client
// -----------------------------------------------------------------------------
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

// -----------------------------------------------------------------------------
// ✅ Bedrock generic converse helper (updated to use Converse API)
// -----------------------------------------------------------------------------
async function bedrockConverse({ modelId, prompt, providerLabel }) {
  try {
    if (!bedrock) {
      return { provider: providerLabel, text: "Bedrock not configured (missing AWS credentials)." };
    }
    if (!modelId) {
      return { provider: providerLabel, text: "Bedrock modelId not configured (missing env var)." };
    }

    const cmd = new ConverseCommand({
      modelId,
      messages: [
        { role: "user", content: [{ text: prompt }] }
      ],
      inferenceConfig: {
        maxTokens: 700,
        temperature: 0.4
      }
    });

    const res = await bedrock.send(cmd);

    const text =
      res?.output?.message?.content?.[0]?.text?.trim?.() ||
      "No content returned.";

    return { provider: providerLabel, text };
  } catch (e) {
    console.error("BEDROCK_CONVERSE_ERROR", providerLabel, e);
    return { provider: providerLabel, text: mapFriendlyError(e?.message) };
  }
}

// -----------------------------------------------------------------------------
// ✅ Bedrock Claude Sonnet (using Converse API)
// -----------------------------------------------------------------------------
async function askBedrockClaudeSonnet(prompt) {
  const modelId =
    process.env.BEDROCK_CLAUDE_SONNET_MODEL_ID || "anthropic.claude-3-sonnet-20240229-v1:0";

  return bedrockConverse({
    modelId,
    prompt,
    providerLabel: "Claude Sonnet",
  });
}

// -----------------------------------------------------------------------------
// ✅ Bedrock Nova Micro (NEW, using Converse API)
// -----------------------------------------------------------------------------
async function askBedrockNovaMicro(prompt) {
  const modelId =
    process.env.BEDROCK_NOVA_MICRO_MODEL_ID || "amazon.nova-micro-v1:0";

  return bedrockConverse({
    modelId,
    prompt,
    providerLabel: "Amazon Nova",
  });
}

// -----------------------------------------------------------------------------
// Existing non-Bedrock providers (unchanged)
// -----------------------------------------------------------------------------
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
    const model = process.env.MISTRAL_MODEL || "mistral-large-latest";
    const r = await axios.post(
      "https://api.mistral.ai/v1/chat/completions",
      { model, messages: [{ role: "user", content: prompt }] },
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
    const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
    const r = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
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
// ✅ Providers endpoint (updated for locked 5-model plan)
// -----------------------------------------------------------------------------
app.get("/providers", (_req, res) => {
  const providers = [
    { id: "mistral", name: "Mistral", enabled: !!process.env.MISTRAL_API_KEY, comingSoon: !process.env.MISTRAL_API_KEY, group: "Standalone" },
    { id: "groq", name: "Groq", enabled: !!process.env.GROQ_API_KEY, comingSoon: !process.env.GROQ_API_KEY, group: "Standalone" },
    { id: "gemini", name: "Google (Gemini)", enabled: !!process.env.GEMINI_API_KEY, comingSoon: !process.env.GEMINI_API_KEY, group: "Standalone" },

    {
      id: "bedrock_claude_sonnet",
      name: "Claude Sonnet",
      enabled: !!bedrock,
      comingSoon: !bedrock,
      group: "Bedrock",
    },
    {
      id: "bedrock_nova_micro",
      name: "Amazon Nova",
      enabled: !!bedrock,
      comingSoon: !bedrock,
      group: "Bedrock",
    },
  ];

  res.json({ providers });
});

// -----------------------------------------------------------------------------
// Ask route
// -----------------------------------------------------------------------------
app.post("/ask", async (req, res) => {
  const prompt = String(req.body?.prompt ?? "").trim();

  // Optional provider selection support
  const providers = Array.isArray(req.body?.providers) ? req.body.providers : null;
  const requested = providers?.length ? providers.map(canonicalProviderId) : null;

  // ✅ Canonical lowercase keys (targeted fix for Lovable)
  const jobsByKey = {
    mistral: () => askMistral(prompt),
    groq: () => askGroq(prompt),
    gemini: () => askGemini(prompt),

    bedrock_claude_sonnet: () => askBedrockClaudeSonnet(prompt),
    bedrock_nova_micro: () => askBedrockNovaMicro(prompt),
  };

  const keysToRun = requested?.length
    ? requested.filter((k) => Object.prototype.hasOwnProperty.call(jobsByKey, k))
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