const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Aiven PostgreSQL Connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // SSL certificate fix for Aiven
    }
});

// ==========================================
// 1. DATABASE SETUP ROUTE (Run this once!)
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
                heir_email TEXT NOT NULL,
                dead_man_switch_days INT DEFAULT 30,
                last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_released BOOLEAN DEFAULT FALSE
            );

            CREATE TABLE vault_data (
                id SERIAL PRIMARY KEY,
                user_id INT REFERENCES users(id) ON DELETE CASCADE,
                site_name TEXT NOT NULL,
                secret_content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        res.send("<h1>Chronos Vault: Database Setup Successful!</h1><p>Tables 'users' and 'vault_data' have been created.</p>");
    } catch (err) {
        res.status(500).send("Error setting up DB: " + err.message);
    }
});

// ==========================================
// 2. USER AUTHENTICATION ROUTES
// ==========================================

// Signup Route
app.post('/register', async (req, res) => {
    const { username, email, password, heir_email, switch_days } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO users (username, email, password_hash, heir_email, dead_man_switch_days) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [username, email, password, heir_email, switch_days || 30]
        );
        res.status(201).json({ message: "User Registered", userId: result.rows[0].id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Registration failed. Email/Username might already exist." });
    }
});

// Login Route (Simple Version)
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query(
            'SELECT id, username, email, heir_email FROM users WHERE email = $1 AND password_hash = $2',
            [email, password]
        );
        if (result.rows.length > 0) {
            res.json({ message: "Login Successful", user: result.rows[0] });
        } else {
            res.status(401).json({ error: "Invalid credentials" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 3. DEAD MAN SWITCH LOGIC
// ==========================================

// "I AM ALIVE" Button (Resets the timer)
app.post('/check-in/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        await pool.query('UPDATE users SET last_seen = NOW() WHERE id = $1', [userId]);
        res.json({ message: "Timer reset. We know you are alive!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 4. VAULT DATA ROUTES (User-Specific)
// ==========================================

// Add Secret to Vault
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

// Get User's Private Vault
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

// Status Route
app.get('/', (req, res) => {
    res.json({ status: "Chronos Vault API is Operational" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});