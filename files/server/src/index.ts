import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import analyzeRouter from "./routes/analyze";
import auditRouter from "./routes/audit";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:4173",
  process.env.CLIENT_URL,
].filter(Boolean) as string[];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin) || origin.endsWith(".vercel.app")) {
        return callback(null, true);
      }
      return callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    methods: ["GET", "POST"],
  })
);

// PDF base64 can be large — increase limit to 15MB
app.use(express.json({ limit: "15mb" }));

app.use("/api/analyze", analyzeRouter);
app.use("/api/audit",   auditRouter);   // ← new

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    message: "Paisa Planner API is running",
    aiConfigured: !!(
      process.env.GEMINI_API_KEY &&
      process.env.GEMINI_API_KEY !== "your_gemini_api_key_here"
    ),
    env: process.env.NODE_ENV || "development",
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Paisa Planner API running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "your_gemini_api_key_here") {
    console.log("\n⚠️  GEMINI_API_KEY not set.");
    console.log("   Get a free key: https://aistudio.google.com/app/apikey\n");
  } else {
    console.log("✅ Gemini AI configured\n");
  }
});