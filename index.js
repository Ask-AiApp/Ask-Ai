import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// --- Health check route ---
app.get("/health", (req, res) => res.json({ ok: true }));

// --- Ask route ---
app.post("/ask", async (req, res) => {
  const { prompt } = req.body;
  console.log("Prompt received:", prompt);

  // Dummy responses for now
  const answers = [
    { provider: "OpenAI", text: "OpenAI placeholder response" },
    { provider: "Claude", text: "Anthropic placeholder response" },
    { provider: "Gemini", text: "Gemini placeholder response" },
    { provider: "Grok", text: "Grok placeholder response" },
  ];

  res.json({ prompt, answers });
});

// --- Start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`✅ Ask-Ai backend running on port ${PORT}`)
);
