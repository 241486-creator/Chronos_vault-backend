const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(express.json());

// ==========================================
// CORS
// ==========================================
app.use(cors({
    origin: [
        "https://chronos-vault-ultimate-v1.vercel.app",
        "https://frontend-seven-iota-99.vercel.app"
    ],
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
}));
app.options('*', cors());

// ==========================================
// DATABASE
// ==========================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// ==========================================
// EMAIL TRANSPORTER
// ==========================================
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
    }
});

// ==========================================
// ENCRYPTION HELPERS
// ==========================================
const ENCRYPTION_KEY = process.env.ENCRYPTION_SECRET || crypto.randomBytes(32).toString('hex');

function encryptData(text) {
    const iv = crypto.randomBytes(16);
    const key = Buffer.from(ENCRYPTION_KEY.slice(0, 32).padEnd(32, '0'));
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

function decryptData(encryptedText) {
    try {
        const parts = encryptedText.split(':');
        if (parts.length < 2) return encryptedText; // purana plain text
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts.slice(1).join(':');
        const key = Buffer.from(ENCRYPTION_KEY.slice(0, 32).padEnd(32, '0'));
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        return encryptedText; // agar decrypt fail ho toh as-is return karo
    }
}

// ==========================================
// DATABASE SETUP
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
                is_released BOOLEAN DEFAULT FALSE,
                switch_triggered BOOLEAN DEFAULT FALSE
            );

            CREATE TABLE vault_data (
                id SERIAL PRIMARY KEY,
                user_id INT REFERENCES users(id) ON DELETE CASCADE,
                site_name TEXT,
                secret_content TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        res.json({ message: "DATABASE_REBUILT" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// AUTH - REGISTER
// ==========================================
app.post('/register', async (req, res) => {
    const { username, email, password, heir_email, switch_days } = req.body;

    if (!username || !email || !password || !heir_email) {
        return res.status(400).json({ error: "ALL_FIELDS_REQUIRED" });
    }

    try {
        const saltRounds = 12;
        const password_hash = await bcrypt.hash(password, saltRounds);
        const days = switch_days || 30;

        const result = await pool.query(
            `INSERT INTO users 
             (username, email, password_hash, heir_email, dead_man_switch_days) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING id, username, email, heir_email, dead_man_switch_days`,
            [username, email, password_hash, heir_email, days]
        );

        res.status(201).json({ message: "ACCESS_GRANTED", user: result.rows[0] });
    } catch (err) {
        if (err.code === '23505') {
            res.status(400).json({ error: "IDENTITY_TAKEN" });
        } else {
            res.status(500).json({ error: "AUTH_FAILED" });
        }
    }
});

// ==========================================
// AUTH - LOGIN
// ==========================================
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "ALL_FIELDS_REQUIRED" });
    }

    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "USER_NOT_FOUND" });
        }

        const user = result.rows[0];
        const isValid = await bcrypt.compare(password, user.password_hash);

        if (!isValid) {
            return res.status(401).json({ error: "INVALID_CREDENTIALS" });
        }

        await pool.query(
            'UPDATE users SET last_seen = NOW(), switch_triggered = FALSE WHERE id = $1',
            [user.id]
        );

        const { password_hash, ...safeUser } = user;
        res.json({ message: "LOGIN_SUCCESSFUL", user: safeUser });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// UPDATE SWITCH DAYS
// ==========================================
app.post('/update-switch-days', async (req, res) => {
    const { user_id, switch_days } = req.body;
    try {
        await pool.query(
            'UPDATE users SET dead_man_switch_days = $1 WHERE id = $2',
            [switch_days, user_id]
        );
        res.json({ message: "SWITCH_DAYS_UPDATED" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// VAULT - ADD SECRET
// ==========================================
app.post('/add-secret', async (req, res) => {
    const { user_id, site_name, secret_content } = req.body;

    if (!user_id || !site_name || !secret_content) {
        return res.status(400).json({ error: "ALL_FIELDS_REQUIRED" });
    }

    try {
        const encryptedSecret = encryptData(secret_content);
        const result = await pool.query(
            'INSERT INTO vault_data (user_id, site_name, secret_content) VALUES ($1, $2, $3) RETURNING *',
            [user_id, site_name, encryptedSecret]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// VAULT - GET SECRETS
// ==========================================
app.get('/get-vault/:user_id', async (req, res) => {
    const { user_id } = req.params;
    try {
        const result = await pool.query(
            'SELECT * FROM vault_data WHERE user_id = $1 ORDER BY created_at DESC',
            [user_id]
        );
        const decryptedVault = result.rows.map(row => ({
            ...row,
            secret_content: decryptData(row.secret_content)
        }));
        res.json(decryptedVault);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// VAULT - DELETE SECRET
// ==========================================
app.delete('/delete-secret/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM vault_data WHERE id = $1', [id]);
        res.json({ message: "SECRET_DELETED" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// DEAD MAN'S SWITCH - CRON ENDPOINT
// Vercel Cron daily call karega is endpoint ko
// ==========================================
app.get('/cron/check-switch', async (req, res) => {
    // Verify cron secret
    const authHeader = req.headers['authorization'];
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    try {
        const result = await pool.query(`
            SELECT * FROM users 
            WHERE heir_email IS NOT NULL 
            AND switch_triggered = FALSE
            AND is_released = FALSE
            AND last_seen < NOW() - (dead_man_switch_days || ' days')::INTERVAL
        `);

        let triggered = 0;
        for (const user of result.rows) {
            try {
                const secrets = await pool.query(
                    'SELECT * FROM vault_data WHERE user_id = $1', [user.id]
                );
                await sendHeirEmail(user, secrets.rows);
                await pool.query(
                    'UPDATE users SET switch_triggered = TRUE WHERE id = $1', [user.id]
                );
                triggered++;
            } catch (e) {
                console.error(`Email failed for ${user.username}:`, e.message);
            }
        }
        res.json({ message: "CRON_COMPLETE", triggered });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// SEND HEIR EMAIL
// ==========================================
async function sendHeirEmail(user, secrets) {
    const secretsList = secrets.map((s, i) =>
        `${i + 1}. ${s.site_name}: ${decryptData(s.secret_content)}`
    ).join('\n');

    await transporter.sendMail({
        from: `"ChronosVault System" <${process.env.GMAIL_USER}>`,
        to: user.heir_email,
        subject: `⚠️ ChronosVault: ${user.username} ke secrets - Dead Man's Switch Triggered`,
        html: `
        <div style="font-family:monospace;background:#000;color:#00ff41;padding:30px;border:1px solid #00ff41;">
            <h1 style="color:#00ff41;letter-spacing:5px;">CHRONOS_VAULT</h1>
            <h2 style="color:#ff4040;">⚠️ DEAD MAN'S SWITCH TRIGGERED</h2>
            <p style="color:#ccc;">
                User <strong style="color:#00ff41;">${user.username}</strong> (${user.email}) 
                ne <strong>${user.dead_man_switch_days} din</strong> se login nahi kiya.
            </p>
            <p style="color:#ccc;">Aap ko heir designate kiya gaya tha. Yeh saare secrets hain:</p>
            <div style="background:#001100;padding:20px;border:1px solid #00ff41;margin:20px 0;">
                <pre style="color:#00ff41;">${secretsList || 'Koi secrets nahi hain.'}</pre>
            </div>
            <p style="color:#888;font-size:12px;">
                Yeh email automatically bheja gaya hai ChronosVault Dead Man's Switch system se.
            </p>
        </div>`
    });
}

// ==========================================
// TEST HEIR EMAIL
// ==========================================
app.post('/test-heir-email/:user_id', async (req, res) => {
    const { user_id } = req.params;
    try {
        const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [user_id]);
        if (userResult.rows.length === 0) return res.status(404).json({ error: "USER_NOT_FOUND" });
        const user = userResult.rows[0];
        const secrets = await pool.query('SELECT * FROM vault_data WHERE user_id = $1', [user_id]);
        await sendHeirEmail(user, secrets.rows);
        res.json({ message: "TEST_EMAIL_SENT" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// SERVER
// ==========================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`ChronosVault Server on port ${PORT}`));

module.exports = app;