import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "kolocircle_app",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "kolocircle",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

(async () => {
  try {
    const connection = await pool.getConnection();
    console.log("✅ Database connected successfully as", process.env.DB_USER || "kolocircle_app");
    connection.release();
  } catch (error) {
    console.error("❌ Database connection failed");
    console.error(error);
  }
})();

export default pool;