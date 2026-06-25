import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || "*",
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend API running on http://localhost:${PORT}`);
});