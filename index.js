const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/ask", (req, res) => {
  const prompt = req.body?.prompt ?? "";
  res.json({
    prompt,
    answers: [
      { provider: "OpenAI", text: `Mock answer for: ${prompt}` }
    ]
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Ask-Ai backend running on http://localhost:${PORT}`);
  console.log("Routes: GET /health, POST /ask");
});
