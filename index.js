import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import axios from 'axios';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const {
  OPENAI_API_KEY,
  ANTHROPIC_API_KEY,
  GEMINI_API_KEY,
  XAI_API_KEY // optional (Grok)
} = process.env;

// ---- provider callers ----
async function askOpenAI(prompt) {
  try {
    const r = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      { model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }] },
      { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
    );
    return r.data.choices?.[0]?.message?.content ?? '';
  } catch (e) {
    return `OpenAI error: ${e.response?.status || e.code || e.message}`;
  }
}

async function askAnthropic(prompt) {
  try {
    const r = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }]
      },
      { headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' } }
    );
    return r.data?.content?.[0]?.text ?? '';
  } catch (e) {
    return `Anthropic error: ${e.response?.status || e.code || e.message}`;
  }
}

async function askGemini(prompt) {
  try {
    const r = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      { contents: [{ role: 'user', parts: [{ text: prompt }]}] }
    );
    return r.data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') ?? '';
  } catch (e) {
    return `Gemini error: ${e.response?.status || e.code || e.message}`;
  }
}

async function askGrok(prompt) {
  if (!XAI_API_KEY) return 'Grok not configured.';
  try {
    const r = await axios.post(
      'https://api.x.ai/v1/chat/completions',
      { model: 'grok-beta', messages: [{ role: 'user', content: prompt }] },
      { headers: { Authorization: `Bearer ${XAI_API_KEY}` } }
    );
    return r.data.choices?.[0]?.message?.content ?? '';
  } catch (e) {
    return `Grok error: ${e.response?.status || e.code || e.message}`;
  }
}

// ---- single endpoint ----
app.post('/ask', async (req, res) => {
  const prompt = (req.body?.prompt || '').toString().trim();
  if (!prompt) return res.status(400).json({ error: 'prompt required' });

  const tasks = [
    ['OpenAI', askOpenAI(prompt)],
    ['Claude', askAnthropic(prompt)],
    ['Gemini', askGemini(prompt)],
    ['Grok', askGrok(prompt)]
  ];

  const settled = await Promise.allSettled(tasks.map(([, p]) => p));
  const answers = tasks.map(([name], i) => ({
    provider: name,
    text:
      settled[i].status === 'fulfilled'
        ? settled[i].value
        : `Error: ${settled[i].reason?.message || 'unknown'}`
  }));

  res.json({ prompt, answers });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Ask-Ai backend: http://localhost:${PORT}`));
