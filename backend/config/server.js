import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || "*",
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from frontend
app.use(express.static(path.join(__dirname, "../../frontend")));

import authRoutes from "../routes/auth_routes.js";
import verificationRoutes from "../routes/verification_routes.js";
import guarantorRoutes from "../routes/guarantor_routes.js";
import depositRoutes from "../routes/deposit_routes.js";
import circleRoutes from "../routes/circle_routes.js";
import contributionRoutes from "../routes/contribution_routes.js";

app.use("/api/auth", authRoutes);
app.use("/api/verification", verificationRoutes);
app.use("/api/guarantor", guarantorRoutes);
app.use("/api/deposit", depositRoutes);
app.use("/api/groups", circleRoutes);
app.use("/api", contributionRoutes);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Serve index.html for root and unmatched routes (SPA fallback)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../../frontend/html/index.html"));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend API running on http://localhost:${PORT}`);
});

