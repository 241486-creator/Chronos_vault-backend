const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(express.json());

// CORS Settings - FIXED
app.use(cors({
    origin: [
        "https://chronos-vault-ultimate-v1.vercel.app",
        "https://frontend-seven-iota-99.vercel.app"
    ],
    methods: ["GET", "POST"],
    credentials: true
}));

// Aiven PostgreSQL Connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// ==========================================
// 1. DATABASE SETUP (Run once: /setup-db)
// ==========================================
app.get('/setup-db', async (req, res) => {
    try {
        await pool.query(`
            DROP TABLE IF EXISTS vault_data CASCADE;
            DROP TABLE IF EXISTS users CASCADE;

            CREATE TABLE users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                heir_email TEXT,
                dead_man_switch_days INT DEFAULT 30,
                last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_released BOOLEAN DEFAULT FALSE
            );

            CREATE TABLE vault_data (
                id SERIAL PRIMARY KEY,
                user_id INT REFERENCES users(id),
                site_name TEXT,
                secret_content TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        res.json({ message: "DATABASE_CLEANED_AND_REBUILT" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 2. AUTH ROUTES (Register & Login)
// ==========================================

app.post('/register', async (req, res) => {
    const { username, email, password, heir_email } = req.body;

    console.log("Registering User:", { username, email, password, heir_email });

    if (!username || !email || !password || !heir_email) {
        return res.status(400).json({ error: "ALL_FIELDS_REQUIRED" });
    }

    try {
        const result = await pool.query(
            'INSERT INTO users (username, email, password_hash, heir_email) VALUES ($1, $2, $3, $4) RETURNING *',
            [username, email, password, heir_email]
        );

        console.log("User Created:", result.rows[0].id);
        res.status(201).json({ message: "ACCESS_GRANTED", user: result.rows[0] });

    } catch (err) {
        console.error("DB Error:", err.message);
        if (err.code === '23505') {
            res.status(400).json({ error: "IDENTITY_TAKEN" });
        } else {
            res.status(500).json({ error: "AUTH_FAILED" });
        }
    }
});

// LOGIN
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (result.rows.length > 0) {
            const user = result.rows[0];
            if (user.password_hash === password) {
                await pool.query('UPDATE users SET last_seen = NOW() WHERE id = $1', [user.id]);
                res.json({ message: "LOGIN_SUCCESSFUL", user });
            } else {
                res.status(401).json({ error: "INVALID_CREDENTIALS" });
            }
        } else {
            res.status(404).json({ error: "USER_NOT_FOUND" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 3. VAULT ROUTES
// ==========================================

app.post('/add-secret', async (req, res) => {
    const { user_id, site_name, secret_content } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO vault_data (user_id, site_name, secret_content) VALUES ($1, $2, $3) RETURNING *',
            [user_id, site_name, secret_content]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/get-vault/:user_id', async (req, res) => {
    const { user_id } = req.params;
    try {
        const result = await pool.query(
            'SELECT * FROM vault_data WHERE user_id = $1 ORDER BY created_at DESC',
            [user_id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;