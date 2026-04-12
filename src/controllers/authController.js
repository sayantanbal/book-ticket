import bcrypt from "bcryptjs";
import { pool } from "../config/db.js";
import { createToken } from "../lib/auth.js";

export async function register(req, res) {
  try {
    const { name, email, password } = req.body;
    const normalizedEmail = (email || "").trim().toLowerCase();
    const normalizedName = (name || "").trim();

    if (!normalizedName || !normalizedEmail || !password) {
      res.status(400).send({ error: "name, email and password are required" });
      return;
    }

    if (password.length < 6) {
      res.status(400).send({ error: "password must be at least 6 characters" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const insertSql = `
      INSERT INTO users (name, email, password_hash)
      VALUES ($1, $2, $3)
      RETURNING id, name, email
    `;

    const insertResult = await pool.query(insertSql, [
      normalizedName,
      normalizedEmail,
      passwordHash,
    ]);
    const user = insertResult.rows[0];
    const token = createToken(user);

    res.status(201).send({
      message: "User registered successfully",
      token,
      user,
    });
  } catch (error) {
    if (error.code === "23505") {
      res.status(409).send({ error: "Email already exists" });
      return;
    }

    console.error(error);
    res.sendStatus(500);
  }
}

export async function login(req, res) {
  try {
    const { email, password } = req.body;
    const normalizedEmail = (email || "").trim().toLowerCase();

    if (!normalizedEmail || !password) {
      res.status(400).send({ error: "email and password are required" });
      return;
    }

    const userResult = await pool.query(
      "SELECT id, name, email, password_hash FROM users WHERE email = $1",
      [normalizedEmail],
    );

    if (userResult.rowCount === 0) {
      res.status(401).send({ error: "Invalid credentials" });
      return;
    }

    const user = userResult.rows[0];
    const isPasswordCorrect = await bcrypt.compare(
      password,
      user.password_hash,
    );

    if (!isPasswordCorrect) {
      res.status(401).send({ error: "Invalid credentials" });
      return;
    }

    const token = createToken(user);
    res.send({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
}
