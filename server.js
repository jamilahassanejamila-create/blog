require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const mysql = require('mysql2');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

const app = express();

// ====================== CONFIG ======================
if (!process.env.JWT_SECRET) {
    console.error('❌ FATAL: JWT_SECRET manquant dans .env — le serveur refuse de démarrer.');
    process.exit(1);
}
const JWT_SECRET  = process.env.JWT_SECRET;
const JWT_EXPIRES = '24h';
const SALT_ROUNDS = 12; // 🔒 12 rounds au lieu de 10 = plus sécurisé

// ====================== EMAIL (Placeholder / Gmail SMTP) ======================
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false
    }
});

async function sendEmail(to, subject, html) {
    try {
        await transporter.sendMail({
            from: `"WebMarko CRM" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            html
        });
        console.log(`✅ Email envoyé à ${to}`);
        return true;
    } catch (err) {
        console.warn('⚠️ Email non envoyé (placeholder):', err.message);
        return false;
    }
}

// ====================== MIDDLEWARE ======================
// ✅ CORS dynamique — ajoute PROD_ORIGIN dans .env pour la production
const ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    ...(process.env.PROD_ORIGIN ? [process.env.PROD_ORIGIN] : [])
];
app.use(cors({
    origin: (origin, cb) => {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
        cb(new Error(`CORS bloqué pour: ${origin}`));
    },
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ====================== RATE LIMITING ======================
const loginAttempts = new Map(); // IP => { count, lastAttempt }

function rateLimitLogin(req, res, next) {
    const ip = req.ip;
    const now = Date.now();
    const entry = loginAttempts.get(ip) || { count: 0, lastAttempt: 0 };
    // Reset après 15 minutes
    if (now - entry.lastAttempt > 15 * 60 * 1000) entry.count = 0;
    entry.count++;
    entry.lastAttempt = now;
    loginAttempts.set(ip, entry);
    if (entry.count > 10) {
        return res.status(429).json({ error: 'Trop de tentatives — réessayez dans 15 min' });
    }
    next();
}

// ====================== SECURITY HEADERS ======================
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// ====================== INPUT VALIDATION ======================
function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sanitize(str) {
    if (typeof str !== 'string') return str;
    return str.trim().replace(/<script[^>]*>.*?<\/script>/gi, '').substring(0, 500);
}

// ====================== JWT MIDDLEWARE ======================
function authMiddleware(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token manquant' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch {
        return res.status(403).json({ error: 'Token invalide ou expiré' });
    }
}

function adminOnly(req, res, next) {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès refusé — Admin seulement' });
    next();
}

// ====================== MySQL Connection ======================
// اتصال أولي بدون database لإنشاءها إلا ما كانتش
const dbInit = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
});

dbInit.connect(err => {
    if (err) { console.error('❌ DB init error:', err.message); process.exit(1); }
    dbInit.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'webmarko_crm'}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`, (err2) => {
        if (err2) { console.error('❌ Create DB error:', err2.message); process.exit(1); }
        console.log('✅ Database prête');
        dbInit.end();
    });
});

const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'webmarko_crm',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Promisify pour async/await
const dbQuery = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, results) => {
            if (err) reject(err);
            else resolve(results);
        });
    });
};

db.getConnection((err, conn) => {
    if (err) console.log('❌ DB error:', err);
    else { console.log('✅ MySQL connecté'); conn.release(); }
});

// ====================== HISTORIQUE ======================
async function logAction(userId, action, table, recordId, details = '') {
    try {
        await dbQuery(
            'INSERT INTO historique (user_id, action, table_name, record_id, details) VALUES (?, ?, ?, ?, ?)',
            [userId, action, table, recordId, details]
        );
    } catch (e) {
        console.warn('Historique error:', e.message);
    }
}

// ====================== AUTH ======================
app.post('/login', rateLimitLogin, async (req, res) => {
    try {
        const email = sanitize(req.body.email || '').toLowerCase();
        const password = req.body.password || '';

        if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });
        if (!validateEmail(email)) return res.status(400).json({ error: 'Email invalide' });

        const results = await dbQuery(
            'SELECT id, email, role, client_id, password_hash FROM users WHERE LOWER(email) = ?',
            [email]
        );

        if (!results.length) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

        const user = results[0];

        // Support bcrypt ET sha256 (migration progressive)
        let passwordOk = false;
        if (user.password_hash.startsWith('$2')) {
            // bcrypt hash
            passwordOk = await bcrypt.compare(password, user.password_hash);
        } else {
            // legacy sha256
            const sha = crypto.createHash('sha256').update(password).digest('hex');
            passwordOk = sha === user.password_hash;
            // Migration automatique vers bcrypt
            if (passwordOk) {
                const newHash = await bcrypt.hash(password, SALT_ROUNDS);
                await dbQuery('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, user.id]);
            }
        }

        if (!passwordOk) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

        loginAttempts.delete(req.ip); // ✅ Reset les tentatives après succès

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, client_id: user.client_id },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES }
        );

        await logAction(user.id, 'LOGIN', 'users', user.id, `Login depuis ${req.ip}`);

        const { password_hash, ...safeUser } = user;
        res.json({ message: 'Login success', token, user: safeUser });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Refresh token
app.post('/refresh-token', authMiddleware, async (req, res) => {
    const token = jwt.sign(
        { id: req.user.id, email: req.user.email, role: req.user.role, client_id: req.user.client_id },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES }
    );
    res.json({ token });
});

// ====================== CLIENTS ======================
app.get('/clients', authMiddleware, adminOnly, async (req, res) => {
    try {
        const page  = parseInt(req.query.page)  || 1;
        const limit = parseInt(req.query.limit) || 50;
        const search  = req.query.search  || '';
        const secteur = req.query.secteur || '';
        const ville   = req.query.ville   || '';
        const offset  = (page - 1) * limit;

        let where = 'WHERE 1=1';
        const params = [];

        if (search) {
            where += ' AND (c.prenom LIKE ? OR c.nom LIKE ? OR c.email LIKE ? OR c.entreprise LIKE ?)';
            const s = `%${search}%`;
            params.push(s, s, s, s);
        }
        if (secteur) { where += ' AND c.secteur = ?'; params.push(secteur); }
        if (ville)   { where += ' AND c.ville = ?';   params.push(ville);   }

        const countResult = await dbQuery(`SELECT COUNT(*) AS total FROM clients c ${where}`, params);
        const total = countResult[0].total;

        const sql = `
            SELECT c.*,
                COUNT(DISTINCT s.id) AS nb_sites,
                COUNT(DISTINCT r.id) AS nb_recs
            FROM clients c
            LEFT JOIN sites s ON s.client_id = c.id
            LEFT JOIN reclamations r ON r.client_id = c.id AND r.statut != 'Résolu'
            ${where}
            GROUP BY c.id
            ORDER BY c.created_at DESC
            LIMIT ? OFFSET ?
        `;

        const clients = await dbQuery(sql, [...params, limit, offset]);
        res.json({ data: clients, total, page, limit, pages: Math.ceil(total / limit) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/clients', authMiddleware, adminOnly, async (req, res) => {
    try {
        const prenom     = sanitize(req.body.prenom);
        const nom        = sanitize(req.body.nom);
        const email      = sanitize(req.body.email || '').toLowerCase();
        const telephone  = sanitize(req.body.telephone || req.body.tel || '');
        const ville      = sanitize(req.body.ville || '');
        const entreprise = sanitize(req.body.entreprise || '');
        const secteur    = sanitize(req.body.secteur || '');

        if (!prenom || !nom || !email) return res.status(400).json({ error: 'Prénom, nom et email requis' });
        if (!validateEmail(email)) return res.status(400).json({ error: 'Email invalide' });

        const result = await dbQuery(
            'INSERT INTO clients (prenom, nom, email, telephone, ville, entreprise, secteur) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [prenom, nom, email, telephone, ville, entreprise, secteur || null]
        );

        const newClient = { id: result.insertId, prenom, nom, email, telephone, ville, entreprise, secteur };

        // Créer compte user automatiquement
        // Créer compte user automatiquement
const passHash = await bcrypt.hash(prenom, SALT_ROUNDS);

// Check si user existe déjà
const existingUser = await dbQuery('SELECT id FROM users WHERE LOWER(email) = ?', [email.toLowerCase()]);

if (existingUser.length === 0) {
    await dbQuery(
        'INSERT INTO users (email, password_hash, role, client_id) VALUES (?, ?, "client", ?)',
        [email, passHash, result.insertId]
    );
    console.log(`✅ Compte créé: ${email} / mdp: ${prenom}`);
} else {
    // Update client_id ila user existe mais sans client_id
    await dbQuery(
        'UPDATE users SET client_id = ?, role = "client" WHERE LOWER(email) = ? AND client_id IS NULL',
        [result.insertId, email.toLowerCase()]
    );
    console.log(`⚠️ User existant mis à jour: ${email}`);
}
        // Email notification (placeholder)
        await sendEmail(email,
            'Bienvenue chez WebMarko',
            `<h2>Bienvenue ${prenom} !</h2><p>Votre compte CRM WebMarko a été créé.</p><p>Email: ${email}<br>Mot de passe: votre prénom</p>`
        );

        res.json(newClient);
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Email déjà utilisé' });
        res.status(500).json({ error: err.message });
    }
});

app.put('/clients/:id', authMiddleware, adminOnly, async (req, res) => {
    try {
        const id         = req.params.id;
        const prenom     = sanitize(req.body.prenom);
        const nom        = sanitize(req.body.nom);
        const email      = sanitize(req.body.email || '').toLowerCase();
        const telephone  = sanitize(req.body.telephone || req.body.tel || '');
        const ville      = sanitize(req.body.ville || '');
        const entreprise = sanitize(req.body.entreprise || '');
        const secteur    = sanitize(req.body.secteur || '');

        if (!prenom || !nom || !email) return res.status(400).json({ error: 'Champs requis manquants' });

        await dbQuery(
            'UPDATE clients SET prenom=?, nom=?, email=?, telephone=?, ville=?, entreprise=?, secteur=? WHERE id=?',
            [prenom, nom, email, telephone, ville, entreprise, secteur || null, id]
        );

        await logAction(req.user.id, 'UPDATE', 'clients', id, `${prenom} ${nom}`);
        res.json({ message: 'Client modifié' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/clients/:id', authMiddleware, adminOnly, async (req, res) => {
    try {
        await dbQuery('DELETE FROM clients WHERE id = ?', [req.params.id]);
        await logAction(req.user.id, 'DELETE', 'clients', req.params.id, '');
        res.json({ message: 'Client supprimé' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/clients/:id', authMiddleware, async (req, res) => {
    try {
        // Client peut voir seulement son propre profil
        if (req.user.role === 'client' && String(req.user.client_id) !== String(req.params.id)) {
            return res.status(403).json({ error: 'Accès refusé' });
        }
        const result = await dbQuery('SELECT * FROM clients WHERE id = ?', [req.params.id]);
        if (!result.length) return res.status(404).json({ error: 'Client non trouvé' });
        res.json(result[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ====================== SITES ======================
app.get('/sites', authMiddleware, async (req, res) => {
    try {
        const page   = parseInt(req.query.page)  || 1;
        const limit  = parseInt(req.query.limit) || 50;
        const search = req.query.search || '';
        const statut = req.query.statut || '';
        const offset = (page - 1) * limit;

        let where = 'WHERE 1=1';
        const params = [];

        // Client voit seulement ses sites
        if (req.user.role === 'client') {
            where += ' AND s.client_id = ?';
            params.push(req.user.client_id);
        }

        if (search) {
            where += ' AND (s.nom_site LIKE ? OR s.url LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }
        if (statut) { where += ' AND s.statut = ?'; params.push(statut); }

        const countResult = await dbQuery(`SELECT COUNT(*) AS total FROM sites s ${where}`, params);
        const total = countResult[0].total;

        const sql = `
            SELECT s.*,
                c.prenom AS client_prenom, c.nom AS client_nom,
                c.email AS client_email, c.telephone AS client_telephone,
                c.ville AS client_ville, c.entreprise AS client_entreprise
            FROM sites s
            LEFT JOIN clients c ON s.client_id = c.id
            ${where}
            ORDER BY s.id DESC
            LIMIT ? OFFSET ?
        `;

        const sites = await dbQuery(sql, [...params, limit, offset]);
        res.json({ data: sites, total, page, limit, pages: Math.ceil(total / limit) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/sites', authMiddleware, adminOnly, async (req, res) => {
    try {
        const nom_site  = sanitize(req.body.nom_site || req.body.nom);
        const url       = sanitize(req.body.url || '');
        const client_id = req.body.client_id;
        const statut    = sanitize(req.body.statut || 'En ligne');
        const type      = sanitize(req.body.type || '');
        const tech      = sanitize(req.body.tech || '');
        const notes     = sanitize(req.body.notes || '');

        if (!nom_site || !url) return res.status(400).json({ error: 'Nom et URL requis' });

        const result = await dbQuery(
            'INSERT INTO sites (nom_site, url, client_id, statut, type, tech, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [nom_site, url, client_id, statut, type, tech || null, notes || null]
        );

        await logAction(req.user.id, 'CREATE', 'sites', result.insertId, nom_site);
        res.json({ id: result.insertId, nom_site, url, client_id, statut, type, tech, notes });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/sites/:id', authMiddleware, adminOnly, async (req, res) => {
    try {
        const nom_site  = sanitize(req.body.nom_site || req.body.nom);
        const url       = sanitize(req.body.url || '');
        const client_id = req.body.client_id;
        const statut    = sanitize(req.body.statut || 'En ligne');
        const type      = sanitize(req.body.type || '');
        const tech      = sanitize(req.body.tech || '');
        const notes     = sanitize(req.body.notes || '');

        await dbQuery(
            'UPDATE sites SET nom_site=?, url=?, client_id=?, statut=?, type=?, tech=?, notes=? WHERE id=?',
            [nom_site, url, client_id, statut, type, tech || null, notes || null, req.params.id]
        );

        await logAction(req.user.id, 'UPDATE', 'sites', req.params.id, nom_site);
        res.json({ message: 'Site modifié' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/sites/:id', authMiddleware, adminOnly, async (req, res) => {
    try {
        await dbQuery('DELETE FROM sites WHERE id = ?', [req.params.id]);
        await logAction(req.user.id, 'DELETE', 'sites', req.params.id, '');
        res.json({ message: 'Site supprimé' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ====================== RECLAMATIONS ======================
app.get('/reclamations', authMiddleware, async (req, res) => {
    try {
        const page     = parseInt(req.query.page)  || 1;
        const limit    = parseInt(req.query.limit) || 50;
        const search   = req.query.search   || '';
        const statut   = req.query.statut   || '';
        const priorite = req.query.priorite || '';
        const offset   = (page - 1) * limit;

        let where = 'WHERE 1=1';
        const params = [];

        if (req.user.role === 'client') {
            where += ' AND r.client_id = ?';
            params.push(req.user.client_id);
        }

        if (search)   { where += ' AND (r.sujet LIKE ? OR r.description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
        if (statut)   { where += ' AND r.statut = ?';   params.push(statut); }
        if (priorite) { where += ' AND r.priorite = ?'; params.push(priorite); }

        const countResult = await dbQuery(`SELECT COUNT(*) AS total FROM reclamations r ${where}`, params);
        const total = countResult[0].total;

        const sql = `
            SELECT r.*, c.prenom AS client_prenom, c.nom AS client_nom, c.email AS client_email
            FROM reclamations r
            LEFT JOIN clients c ON r.client_id = c.id
            ${where}
            ORDER BY r.created_at DESC
            LIMIT ? OFFSET ?
        `;

        const recs = await dbQuery(sql, [...params, limit, offset]);
        res.json({ data: recs, total, page, limit, pages: Math.ceil(total / limit) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/reclamations', authMiddleware, async (req, res) => {
    try {
        const sujet       = sanitize(req.body.sujet || '');
        const description = sanitize(req.body.description || '');
        const type        = sanitize(req.body.type || '');
        const statut      = req.user.role === 'admin' ? sanitize(req.body.statut || 'En attente') : 'En attente';
        const priorite    = sanitize(req.body.priorite || 'Normale');
        const client_id   = req.user.role === 'client' ? req.user.client_id : req.body.client_id;

        if (!sujet || !description) return res.status(400).json({ error: 'Sujet et description requis' });

        const result = await dbQuery(
            'INSERT INTO reclamations (sujet, description, statut, priorite, client_id, type) VALUES (?, ?, ?, ?, ?, ?)',
            [sujet, description, statut, priorite, client_id, type || null]
        );

        await logAction(req.user.id, 'CREATE', 'reclamations', result.insertId, sujet);

        // Notify admin par email pour toutes les réclamations
        const clientRows = await dbQuery('SELECT * FROM clients WHERE id = ?', [client_id]);
        const cl = clientRows[0] || {};
        const emoji = priorite === 'Urgente' ? '🚨' : priorite === 'Haute' ? '⚠️' : '📩';
        await sendEmail(
            process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
            `${emoji} Nouvelle Réclamation — ${sujet}`,
            `<h2>Nouvelle réclamation reçue</h2>
             <p><strong>Client:</strong> ${cl.prenom || ''} ${cl.nom || ''}</p>
             <p><strong>Email:</strong> ${cl.email || ''}</p>
             <p><strong>Sujet:</strong> ${sujet}</p>
             <p><strong>Type:</strong> ${type || '—'}</p>
             <p><strong>Priorité:</strong> ${priorite}</p>
             <p><strong>Description:</strong> ${description}</p>`
        );

        res.json({ id: result.insertId, sujet, description, statut, priorite, client_id, type });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/reclamations/:id', authMiddleware, async (req, res) => {
    try {
        const sujet       = sanitize(req.body.sujet || '');
        const description = sanitize(req.body.description || '');
        const statut      = sanitize(req.body.statut || 'En attente');
        const priorite    = sanitize(req.body.priorite || 'Normale');
        const type        = sanitize(req.body.type || '');
        const client_id   = req.body.client_id;

        // Client peut seulement modifier ses propres réclamations
        if (req.user.role === 'client') {
            const rec = await dbQuery('SELECT client_id FROM reclamations WHERE id = ?', [req.params.id]);
            if (!rec.length || String(rec[0].client_id) !== String(req.user.client_id)) {
                return res.status(403).json({ error: 'Accès refusé' });
            }
        }

        await dbQuery(
            'UPDATE reclamations SET sujet=?, description=?, statut=?, priorite=?, type=?, client_id=? WHERE id=?',
            [sujet, description, statut, priorite, type || null, client_id, req.params.id]
        );

        await logAction(req.user.id, 'UPDATE', 'reclamations', req.params.id, `statut: ${statut}`);

        // Email au client si statut change
        if (req.user.role === 'admin') {
            const recRows    = await dbQuery('SELECT r.*, c.email, c.prenom FROM reclamations r JOIN clients c ON r.client_id = c.id WHERE r.id = ?', [req.params.id]);
            const rec = recRows[0];
            if (rec) {
                await sendEmail(rec.email,
                    `Mise à jour de votre réclamation — ${sujet}`,
                    `<h2>Réclamation mise à jour</h2><p>Bonjour ${rec.prenom},</p><p>Le statut de votre réclamation "<strong>${sujet}</strong>" est maintenant: <strong>${statut}</strong></p>`
                );
            }
        }

        res.json({ message: 'Réclamation modifiée' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/reclamations/:id', authMiddleware, adminOnly, async (req, res) => {
    try {
        await dbQuery('DELETE FROM reclamations WHERE id = ?', [req.params.id]);
        await logAction(req.user.id, 'DELETE', 'reclamations', req.params.id, '');
        res.json({ message: 'Réclamation supprimée' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ====================== FACTURATION ======================
app.get('/factures', authMiddleware, async (req, res) => {
    try {
        const page   = parseInt(req.query.page)  || 1;
        const limit  = parseInt(req.query.limit) || 50;
        const statut = req.query.statut || '';
        const offset = (page - 1) * limit;

        let where = 'WHERE 1=1';
        const params = [];

        if (req.user.role === 'client') {
            where += ' AND f.client_id = ?';
            params.push(req.user.client_id);
        }
        if (statut) { where += ' AND f.statut = ?'; params.push(statut); }

        const countResult = await dbQuery(`SELECT COUNT(*) AS total FROM factures f ${where}`, params);
        const total = countResult[0].total;

        const sql = `
            SELECT f.*, c.prenom AS client_prenom, c.nom AS client_nom,
                   c.email AS client_email, c.entreprise AS client_entreprise
            FROM factures f
            LEFT JOIN clients c ON f.client_id = c.id
            ${where}
            ORDER BY f.created_at DESC
            LIMIT ? OFFSET ?
        `;

        const factures = await dbQuery(sql, [...params, limit, offset]);

        // Charger les lignes pour chaque facture
        for (const f of factures) {
            f.lignes = await dbQuery('SELECT * FROM facture_lignes WHERE facture_id = ?', [f.id]);
        }

        res.json({ data: factures, total, page, limit, pages: Math.ceil(total / limit) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/factures/:id', authMiddleware, async (req, res) => {
    try {
        const factures = await dbQuery('SELECT f.*, c.prenom AS client_prenom, c.nom AS client_nom, c.email AS client_email, c.entreprise AS client_entreprise, c.ville AS client_ville FROM factures f LEFT JOIN clients c ON f.client_id = c.id WHERE f.id = ?', [req.params.id]);
        if (!factures.length) return res.status(404).json({ error: 'Facture non trouvée' });
        const facture = factures[0];
        facture.lignes = await dbQuery('SELECT * FROM facture_lignes WHERE facture_id = ?', [facture.id]);
        res.json(facture);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/factures', authMiddleware, adminOnly, async (req, res) => {
    try {
        const { client_id, date_echeance, notes, lignes = [] } = req.body;
        const statut = 'En attente';

        if (!client_id) return res.status(400).json({ error: 'Client requis' });
        if (!lignes.length) return res.status(400).json({ error: 'Au moins une ligne requise' });

        // Numéro facture auto: FAC-YYYY-NNNN
        const year = new Date().getFullYear();
        const countRow = await dbQuery('SELECT COUNT(*) AS cnt FROM factures WHERE YEAR(created_at) = ?', [year]);
        const num = String(countRow[0].cnt + 1).padStart(4, '0');
        const numero = `FAC-${year}-${num}`;

        // Calcul totaux
        let total_ht = 0;
        for (const l of lignes) {
            total_ht += parseFloat(l.quantite || 1) * parseFloat(l.prix_unitaire || 0);
        }
        const tva = parseFloat(req.body.tva || 20);
        const total_ttc = total_ht * (1 + tva / 100);

        const result = await dbQuery(
            'INSERT INTO factures (numero, client_id, statut, total_ht, tva, total_ttc, date_echeance, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [numero, client_id, statut, total_ht.toFixed(2), tva, total_ttc.toFixed(2), date_echeance || null, sanitize(notes || '')]
        );

        const factureId = result.insertId;

        // Insérer les lignes
        for (const l of lignes) {
            const sous_total = parseFloat(l.quantite || 1) * parseFloat(l.prix_unitaire || 0);
            await dbQuery(
                'INSERT INTO facture_lignes (facture_id, description, quantite, prix_unitaire, sous_total) VALUES (?, ?, ?, ?, ?)',
                [factureId, sanitize(l.description || ''), l.quantite || 1, l.prix_unitaire || 0, sous_total.toFixed(2)]
            );
        }

        await logAction(req.user.id, 'CREATE', 'factures', factureId, numero);

        // Email au client
        const clientRows = await dbQuery('SELECT * FROM clients WHERE id = ?', [client_id]);
        const cl = clientRows[0] || {};
        await sendEmail(cl.email,
            `Nouvelle facture ${numero}`,
            `<h2>Facture ${numero}</h2>
             <p>Bonjour ${cl.prenom},</p>
             <p>Votre facture d'un montant de <strong>${total_ttc.toFixed(2)} MAD TTC</strong> a été générée.</p>
             <p>Date d'échéance: ${date_echeance || 'Non définie'}</p>`
        );

        res.json({ id: factureId, numero, total_ht, tva, total_ttc, statut });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/factures/:id', authMiddleware, adminOnly, async (req, res) => {
    try {
        const { statut, date_echeance, notes, lignes } = req.body;

        await dbQuery(
            'UPDATE factures SET statut=?, date_echeance=?, notes=? WHERE id=?',
            [statut, date_echeance || null, sanitize(notes || ''), req.params.id]
        );

        // Mettre à jour les lignes si fournies
        if (lignes && lignes.length) {
            await dbQuery('DELETE FROM facture_lignes WHERE facture_id = ?', [req.params.id]);
            let total_ht = 0;
            for (const l of lignes) {
                const sous_total = parseFloat(l.quantite || 1) * parseFloat(l.prix_unitaire || 0);
                total_ht += sous_total;
                await dbQuery(
                    'INSERT INTO facture_lignes (facture_id, description, quantite, prix_unitaire, sous_total) VALUES (?, ?, ?, ?, ?)',
                    [req.params.id, sanitize(l.description || ''), l.quantite || 1, l.prix_unitaire || 0, sous_total.toFixed(2)]
                );
            }
            const tvaRow = await dbQuery('SELECT tva FROM factures WHERE id = ?', [req.params.id]);
            const tva = tvaRow[0]?.tva || 20;
            const total_ttc = total_ht * (1 + tva / 100);
            await dbQuery('UPDATE factures SET total_ht=?, total_ttc=? WHERE id=?', [total_ht.toFixed(2), total_ttc.toFixed(2), req.params.id]);
        }

        await logAction(req.user.id, 'UPDATE', 'factures', req.params.id, `statut: ${statut}`);
        res.json({ message: 'Facture modifiée' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/factures/:id', authMiddleware, adminOnly, async (req, res) => {
    try {
        await dbQuery('DELETE FROM facture_lignes WHERE facture_id = ?', [req.params.id]);
        await dbQuery('DELETE FROM factures WHERE id = ?', [req.params.id]);
        await logAction(req.user.id, 'DELETE', 'factures', req.params.id, '');
        res.json({ message: 'Facture supprimée' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ====================== HISTORIQUE ======================
app.get('/historique', authMiddleware, adminOnly, async (req, res) => {
    try {
        const page   = parseInt(req.query.page)  || 1;
        const limit  = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;

        const countResult = await dbQuery('SELECT COUNT(*) AS total FROM historique');
        const total = countResult[0].total;

        const rows = await dbQuery(`
            SELECT h.*, u.email AS user_email
            FROM historique h
            LEFT JOIN users u ON h.user_id = u.id
            ORDER BY h.created_at DESC
            LIMIT ? OFFSET ?
        `, [limit, offset]);

        res.json({ data: rows, total, page, limit, pages: Math.ceil(total / limit) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ====================== STATS ======================
app.get('/stats', authMiddleware, adminOnly, async (req, res) => {
    try {
        const [[clients], [sites], [online], [recs], [factures], [revenus]] = await Promise.all([
            dbQuery('SELECT COUNT(*) AS v FROM clients'),
            dbQuery('SELECT COUNT(*) AS v FROM sites'),
            dbQuery("SELECT COUNT(*) AS v FROM sites WHERE statut='En ligne'"),
            dbQuery("SELECT COUNT(*) AS v FROM reclamations WHERE statut != 'Résolu'"),
            dbQuery("SELECT COUNT(*) AS v FROM factures WHERE statut='En attente'"),
            dbQuery("SELECT COALESCE(SUM(total_ttc),0) AS v FROM factures WHERE statut='Payée'")
        ]);

        res.json({
            total_clients:   clients.v,
            total_sites:     sites.v,
            en_ligne:        online.v,
            total_recs:      recs.v,
            factures_att:    factures.v,
            revenus_total:   parseFloat(revenus.v).toFixed(2)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ====================== EXPORT CSV ======================
app.get('/export/clients', authMiddleware, adminOnly, async (req, res) => {
    try {
        const clients = await dbQuery('SELECT prenom, nom, email, telephone, ville, entreprise, secteur, created_at FROM clients ORDER BY created_at DESC');
        const header = 'Prénom,Nom,Email,Téléphone,Ville,Entreprise,Secteur,Date création\n';
        const rows = clients.map(c =>
            `"${c.prenom}","${c.nom}","${c.email}","${c.telephone||''}","${c.ville||''}","${c.entreprise||''}","${c.secteur||''}","${c.created_at||''}"`
        ).join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="clients.csv"');
        res.send('\uFEFF' + header + rows); // BOM for Excel
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/export/reclamations', authMiddleware, adminOnly, async (req, res) => {
    try {
        const recs = await dbQuery(`
            SELECT r.sujet, r.type, r.statut, r.priorite, r.created_at,
                   c.prenom AS client_prenom, c.nom AS client_nom
            FROM reclamations r
            LEFT JOIN clients c ON r.client_id = c.id
            ORDER BY r.created_at DESC
        `);
        const header = 'Sujet,Type,Statut,Priorité,Date,Client\n';
        const rows = recs.map(r =>
            `"${r.sujet}","${r.type||''}","${r.statut}","${r.priorite}","${r.created_at||''}","${r.client_prenom||''} ${r.client_nom||''}"`
        ).join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="reclamations.csv"');
        res.send('\uFEFF' + header + rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/export/factures', authMiddleware, adminOnly, async (req, res) => {
    try {
        const factures = await dbQuery(`
            SELECT f.numero, f.statut, f.total_ht, f.tva, f.total_ttc, f.date_echeance, f.created_at,
                   c.prenom AS client_prenom, c.nom AS client_nom, c.entreprise
            FROM factures f
            LEFT JOIN clients c ON f.client_id = c.id
            ORDER BY f.created_at DESC
        `);
        const header = 'Numéro,Statut,Total HT,TVA%,Total TTC,Échéance,Date,Client,Entreprise\n';
        const rows = factures.map(f =>
            `"${f.numero}","${f.statut}","${f.total_ht}","${f.tva}","${f.total_ttc}","${f.date_echeance||''}","${f.created_at||''}","${f.client_prenom||''} ${f.client_nom||''}","${f.entreprise||''}"`
        ).join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="factures.csv"');
        res.send('\uFEFF' + header + rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ====================== USERS ======================
app.get('/users', authMiddleware, adminOnly, async (req, res) => {
    try {
        const users = await dbQuery('SELECT id, email, role, client_id, created_at FROM users ORDER BY id');
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/users/:id/password', authMiddleware, async (req, res) => {
    try {
        // Seulement admin ou l'utilisateur lui-même
        if (req.user.role !== 'admin' && String(req.user.id) !== String(req.params.id)) {
            return res.status(403).json({ error: 'Accès refusé' });
        }
        const { password } = req.body;
        if (!password || password.length < 8) return res.status(400).json({ error: 'Mot de passe trop court (min 8 car.)' });
        const hash = await bcrypt.hash(password, SALT_ROUNDS);
        await dbQuery('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.params.id]);
        res.json({ message: 'Mot de passe mis à jour' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ====================== OTHER ======================
app.get('/test', (req, res) => res.json({ status: 'ok', version: '2.0', auth: 'JWT' }));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'webmarko-crm.html'));
});

// ====================== START ======================
app.listen(3000, () => {
    console.log('🚀 Server v2.1 on http://localhost:3000');
    console.log('🔐 JWT Authentication activé | Rate limiting actif');
    console.log('🛡️  Security headers: X-Frame-Options, X-XSS-Protection');
    console.log('📦 Routes: /clients /sites /reclamations /factures /stats /historique /export/*');
    console.log('');
    console.log('📝 .env requis:');
    console.log('   JWT_SECRET=<votre_secret_fort_ici>');
    console.log('   DB_HOST=localhost | DB_USER=root | DB_PASS=... | DB_NAME=webmarko_crm');
    console.log('   EMAIL_USER=... | EMAIL_PASS=... | ADMIN_EMAIL=...');
    console.log('   PROD_ORIGIN=https://votre-domaine.ma  (optionnel)');
});