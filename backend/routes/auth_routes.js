import express from "express";
import bcrypt from "bcryptjs";
import pool from "../config/db.js";
import { generateToken, authMiddleware } from "../middleware/auth.js";

const router = express.Router();

router.post("/register", async (req, res) => {
  try {
    const { full_name, email, phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ error: "Phone and password are required" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      `INSERT INTO users (full_name, email, phone, password_hash)
       VALUES (?, ?, ?, ?)`,
      [full_name, email, phone, hashedPassword]
    );

    const user = {
      id: result.insertId,
      full_name,
      email,
      phone,
      role: "member",            // schema default; explicit here for clarity
      verification_status: "incomplete"
    };

    const token = generateToken(user.id, user.role);

    res.status(201).json({
      message: "User registered successfully",
      token,
      user
    });
  } catch (error) {
    console.error(error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Phone or email already registered" });
    }

    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { phone, password } = req.body;

    const [rows] = await pool.query(
      `SELECT id, full_name, email, phone, password_hash, role, verification_status
       FROM users WHERE phone = ?`,
      [phone]
    );

    if (!rows.length) {
      return res.status(401).json({ error: "Invalid phone or password." });
    }

    const user = rows[0];
    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ error: "Invalid phone or password." });
    }

    const token = generateToken(user.id, user.role);

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        verification_status: user.verification_status
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Login failed" });
  }
});

router.get("/me", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, full_name, email, phone, role, verification_status, trust_score
       FROM users WHERE id = ?`,
      [req.userId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ user: rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to fetch user" });
  }
});

export default router;