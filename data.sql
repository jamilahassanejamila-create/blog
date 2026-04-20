-- ============================================================
--  WebMarko CRM — Schema + Seed Data
--  Compatible avec server.js (Express + mysql2)
-- ============================================================

CREATE DATABASE IF NOT EXISTS webmarko_crm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE webmarko_crm;


-- ─── CLIENTS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    prenom      VARCHAR(50),
    nom         VARCHAR(50),
    email       VARCHAR(100) UNIQUE,
    telephone   VARCHAR(20),
    ville       VARCHAR(50),
    entreprise  VARCHAR(100),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── SITES ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sites (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    nom_site    VARCHAR(100),
    url         TEXT,
    client_id   INT,
    statut      VARCHAR(50) DEFAULT 'En ligne',
    type        VARCHAR(50),
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- ─── RECLAMATIONS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reclamations (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    sujet       VARCHAR(255),
    description TEXT,
    statut      VARCHAR(50) DEFAULT 'En attente',
    priorite    VARCHAR(50) DEFAULT 'Normale',
    client_id   INT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- ─── USERS ───────────────────────────────────────────────────────────────────
-- password column stores SHA-256 hex hash (via Node.js crypto)
CREATE TABLE IF NOT EXISTS users (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    email       VARCHAR(100) UNIQUE,
    password    VARCHAR(64),   -- SHA-256 hex (64 chars)
    role        VARCHAR(20) DEFAULT 'client',
    client_id   INT,
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- ─── SEED: Clients ───────────────────────────────────────────────────────────
INSERT IGNORE INTO clients (prenom, nom, email, telephone, ville, entreprise) VALUES
('Mohamed',  'El Amrani', 'yassine@marco.com',  '+212600000001', 'Marrakech',  'Travel Atlas'),
('Salma',    'Bennani',   'salma@marco.com',    '+212600000002', 'Fes',         'Desert Tours'),
('Mustapha', 'Lahlou',    'omar@marco.com',     '+212600000003', 'Rabat',       'Morocco Discover'),
('Nadia',    'Tazi',      'nadia@marco.com',    '+212600000004', 'Casablanca',  'Private Trips'),
('Hamza',    'Zerouali',  'hamza@marco.com',    '+212600000005', 'Agadir',      'Excursion Pro'),
('Ali',      'Kabbaj',    'imane@marco.com',    '+212600000006', 'Tangier',     'Travel Source'),
('Karim',    'Ouazzani',  'karim@marco.com',    '+212600000007', 'Ouarzazate',  'Atlas Agency'),
('Soufiane', 'Mehdi',     'soufiane@marco.com', '+212600000008', 'Tetouan',     'Sahara Trips'),
('Khadija',  'Alaoui',    'khadija@marco.com',  '+212600000009', 'Essaouira',   'Ocean Travel'),
('Rachid',   'Idrissi',   'rachid@marco.com',   '+212600000010', 'Meknes',      'Nomad Experience');

-- ─── SEED: Sites ─────────────────────────────────────────────────────────────
INSERT IGNORE INTO sites (nom_site, url, client_id, statut, type) VALUES
('Berber Travel',          'https://berber-travel.com',                  1, 'En ligne',   'Tourisme'),
('Morocco Desert Friends', 'https://moroccodesertfriends.com',           2, 'En ligne',   'Tourisme'),
('Discovering Morocco',    'https://discoveringmoroccotravel.com',       3, 'En ligne',   'Tourisme'),
('Private Tours Marrakech','https://private-tours-marrakech.com',        4, 'En ligne',   'Tourisme'),
('Morocco Travel Source',  'https://moroccotravelsource.com',            6, 'En ligne',   'Tourisme'),
('Excursions Marrakech',   'https://excursionsinmarrakech.com',          5, 'En ligne',   'Tourisme'),
('Planning to Morocco',    'https://planningtomorocco.com',              7, 'En ligne',   'Tourisme'),
('Para Atlas Targa',       'https://paraatlastarga.com',                 8, 'En ligne',   'Tourisme'),
('Desert Travel Admin',    'https://moroccodeserttravel.wetest.website', 9, 'Maintenance','Admin'),
('Your Morocco Holidays',  'https://your-morocco-holidays.com',         10, 'En ligne',   'Tourisme');

-- ─── SEED: Reclamations ──────────────────────────────────────────────────────
INSERT IGNORE INTO reclamations (sujet, description, statut, priorite, client_id) VALUES
('Site lent depuis mise à jour',   'Le site met 8 secondes à charger.',        'Résolu',     'Urgente',  1),
('Bug formulaire de contact',      'Les emails ne partent plus du formulaire.', 'Résolu',     'Normale',  2),
('Changement logo et couleurs',    'Besoin de changer le logo et les couleurs.','En attente', 'Faible',   3),
('Email professionnel bloqué',     'Impossible d\'envoyer depuis le domaine.',  'En attente', 'Urgente',  4),
('Page produit erreur 500',        'La page produit affiche une erreur 500.',   'En cours',   'Normale',  1);

-- ─── SEED: Users ─────────────────────────────────────────────────────────────
-- Passwords are SHA-256 hashes. In Node.js: crypto.createHash('sha256').update(password).digest('hex')
-- admin123  → 240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9
-- Mohamed   → hash of 'Mohamed'
-- Salma     → hash of 'Salma'
-- etc.
INSERT IGNORE INTO users (email, password, role, client_id) VALUES
('admin@marco.com',    '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'admin',  NULL),
-- Client passwords = their prenom (case sensitive)
-- Mohamed  SHA256 = 77e9a9f7b8fc30a91c8a0a79fefbbeff9d8f9d7b0e99b8b26ad4e4b9e6df7e7d
-- (run: node -e "console.log(require('crypto').createHash('sha256').update('Mohamed').digest('hex'))")
-- For convenience the server auto-creates these when adding a client via POST /clients
('yassine@marco.com',  (SELECT SHA2('Mohamed',  256)), 'client', 1),
('salma@marco.com',    (SELECT SHA2('Salma',    256)), 'client', 2),
('omar@marco.com',     (SELECT SHA2('Mustapha', 256)), 'client', 3),
('nadia@marco.com',    (SELECT SHA2('Nadia',    256)), 'client', 4),
('hamza@marco.com',    (SELECT SHA2('Hamza',    256)), 'client', 5),
('imane@marco.com',    (SELECT SHA2('Ali',      256)), 'client', 6),
('karim@marco.com',    (SELECT SHA2('Karim',    256)), 'client', 7),
('soufiane@marco.com', (SELECT SHA2('Soufiane', 256)), 'client', 8),
('khadija@marco.com',  (SELECT SHA2('Khadija',  256)), 'client', 9),
('rachid@marco.com',   (SELECT SHA2('Rachid',   256)), 'client', 10);

show tables
SELECT email, password FROM users;
SELECT * FROM users;
SET SQL_SAFE_UPDATES = 0;

UPDATE users 
SET password_hash = SHA2(password, 256);
SELECT email, password_hash FROM users;
ALTER TABLE users
CHANGE password password_hash VARCHAR(64);
SHOW COLUMNS FROM users;
ALTER TABLE users DROP COLUMN password;
SELECT email, password_hash FROM users WHERE email='admin@marco.com';
UPDATE users 
SET password_hash = SHA2('admin123', 256)
WHERE email = 'admin@marco.com';
SELECT * FROM users LIMIT 1;
UPDATE users 
SET password_hash = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9'
WHERE email = 'admin@marco.com';
SELECT email, password_hash FROM users WHERE email IN ('admin@marco.com', 'yassine@marco.com');
SELECT c.prenom, c.nom, COUNT(s.id) as nb_sites 
FROM clients c 
LEFT JOIN sites s ON c.id = s.client_id 
GROUP BY c.id;
SHOW COLUMNS FROM users;
UPDATE users
SET password_hash = SHA2('Mohamed',256)
WHERE email='yassine@marco.com';

UPDATE clients SET email='mohamed@marco.com'  WHERE prenom='Mohamed';
UPDATE clients SET email='salma@marco.com'    WHERE prenom='Salma';
UPDATE clients SET email='mustapha@marco.com' WHERE prenom='Mustapha';
UPDATE clients SET email='nadia@marco.com'    WHERE prenom='Nadia';
UPDATE clients SET email='hamza@marco.com'    WHERE prenom='Hamza';
UPDATE clients SET email='ali@marco.com'      WHERE prenom='Ali';
UPDATE clients SET email='karim@marco.com'    WHERE prenom='Karim';
UPDATE clients SET email='soufiane@marco.com' WHERE prenom='Soufiane';
UPDATE clients SET email='khadija@marco.com'  WHERE prenom='Khadija';
UPDATE clients SET email='rachid@marco.com'   WHERE prenom='Rachid';

UPDATE users SET email='mohamed@marco.com'  WHERE client_id=1;
UPDATE users SET email='salma@marco.com'    WHERE client_id=2;
UPDATE users SET email='mustapha@marco.com' WHERE client_id=3;
UPDATE users SET email='nadia@marco.com'    WHERE client_id=4;
UPDATE users SET email='hamza@marco.com'    WHERE client_id=5;
UPDATE users SET email='ali@marco.com'      WHERE client_id=6;
UPDATE users SET email='karim@marco.com'    WHERE client_id=7;
UPDATE users SET email='soufiane@marco.com' WHERE client_id=8;
UPDATE users SET email='khadija@marco.com'  WHERE client_id=9;
UPDATE users SET email='rachid@marco.com'   WHERE client_id=10;

UPDATE users SET password_hash = SHA2('mohamed',256)  WHERE client_id=1;
UPDATE users SET password_hash = SHA2('salma',256)    WHERE client_id=2;
UPDATE users SET password_hash = SHA2('mustapha',256) WHERE client_id=3;
UPDATE users SET password_hash = SHA2('nadia',256)    WHERE client_id=4;
UPDATE users SET password_hash = SHA2('hamza',256)    WHERE client_id=5;
UPDATE users SET password_hash = SHA2('ali',256)      WHERE client_id=6;
UPDATE users SET password_hash = SHA2('karim',256)    WHERE client_id=7;
UPDATE users SET password_hash = SHA2('soufiane',256) WHERE client_id=8;
UPDATE users SET password_hash = SHA2('khadija',256)  WHERE client_id=9;
UPDATE users SET password_hash = SHA2('rachid',256)   WHERE client_id=10;

ALTER TABLE reclamations ADD COLUMN type VARCHAR(100);
ALTER TABLE sites ADD COLUMN tech VARCHAR(100);

UPDATE sites SET tech = 'WordPress' WHERE id IN (1, 2);
UPDATE sites SET tech = 'React'     WHERE id = 3;
UPDATE sites SET tech = 'Next.js'   WHERE id = 4;
UPDATE sites SET tech = 'WordPress' WHERE id IN (5, 6);


-- ============================================================
--  WebMarko CRM v2.0 — Schema Complet + Migration
-- ============================================================

CREATE DATABASE IF NOT EXISTS webmarko_crm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE webmarko_crm;

-- ─── CLIENTS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    prenom      VARCHAR(50)  NOT NULL,
    nom         VARCHAR(50)  NOT NULL,
    email       VARCHAR(100) UNIQUE NOT NULL,
    telephone   VARCHAR(20),
    ville       VARCHAR(50),
    entreprise  VARCHAR(100),
    secteur     VARCHAR(50),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ─── SITES ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sites (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    nom_site    VARCHAR(100) NOT NULL,
    url         TEXT,
    client_id   INT,
    statut      VARCHAR(50)  DEFAULT 'En ligne',
    type        VARCHAR(50),
    tech        VARCHAR(100),
    notes       TEXT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
);

-- ─── RECLAMATIONS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reclamations (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    sujet       VARCHAR(255) NOT NULL,
    description TEXT,
    statut      VARCHAR(50)  DEFAULT 'En attente',
    priorite    VARCHAR(50)  DEFAULT 'Normale',
    type        VARCHAR(100),
    client_id   INT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP NULL DEFAULT NULL,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
);

-- Auto-set resolved_at quand statut = Résolu
DELIMITER $$
CREATE TRIGGER IF NOT EXISTS trg_rec_resolved
BEFORE UPDATE ON reclamations
FOR EACH ROW
BEGIN
    IF NEW.statut = 'Résolu' AND OLD.statut != 'Résolu' THEN
        SET NEW.resolved_at = NOW();
    END IF;
END$$
DELIMITER ;

-- ─── USERS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    email         VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255),   -- bcrypt hash
    role          VARCHAR(20)  DEFAULT 'client',
    client_id     INT,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
);

-- ─── FACTURES ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS factures (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    numero         VARCHAR(20)  UNIQUE NOT NULL,  -- FAC-2025-0001
    client_id      INT,
    statut         VARCHAR(30)  DEFAULT 'En attente',  -- En attente, Payée, Annulée
    total_ht       DECIMAL(10,2) DEFAULT 0.00,
    tva            DECIMAL(5,2)  DEFAULT 20.00,    -- %
    total_ttc      DECIMAL(10,2) DEFAULT 0.00,
    date_echeance  DATE NULL,
    notes          TEXT,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
);

-- ─── FACTURE LIGNES ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facture_lignes (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    facture_id     INT NOT NULL,
    description    VARCHAR(255) NOT NULL,
    quantite       DECIMAL(10,2) DEFAULT 1,
    prix_unitaire  DECIMAL(10,2) DEFAULT 0.00,
    sous_total     DECIMAL(10,2) DEFAULT 0.00,
    FOREIGN KEY (facture_id) REFERENCES factures(id) ON DELETE CASCADE
);

-- ─── HISTORIQUE ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS historique (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT,
    action      VARCHAR(20)  NOT NULL,   -- CREATE, UPDATE, DELETE, LOGIN
    table_name  VARCHAR(50),
    record_id   VARCHAR(50),
    details     TEXT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ─── INDEX PERFORMANCES ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sites_client     ON sites(client_id);
CREATE INDEX IF NOT EXISTS idx_recs_client      ON reclamations(client_id);
CREATE INDEX IF NOT EXISTS idx_recs_statut      ON reclamations(statut);
CREATE INDEX IF NOT EXISTS idx_factures_client  ON factures(client_id);
CREATE INDEX IF NOT EXISTS idx_historique_user  ON historique(user_id);
CREATE INDEX IF NOT EXISTS idx_historique_date  ON historique(created_at);

-- ─── MIGRATION depuis v1 ─────────────────────────────────────────────────────
-- Si tu as déjà la DB v1, lance ces commandes pour migrer:

-- ALTER TABLE clients ADD COLUMN IF NOT EXISTS secteur VARCHAR(50);
-- ALTER TABLE clients ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
-- ALTER TABLE sites   ADD COLUMN IF NOT EXISTS tech VARCHAR(100);
-- ALTER TABLE sites   ADD COLUMN IF NOT EXISTS notes TEXT;
-- ALTER TABLE sites   ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
-- ALTER TABLE reclamations ADD COLUMN IF NOT EXISTS type VARCHAR(100);
-- ALTER TABLE reclamations ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP NULL DEFAULT NULL;
-- ALTER TABLE reclamations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
-- ALTER TABLE users CHANGE password password_hash VARCHAR(255);

-- ─── SEED: Clients ───────────────────────────────────────────────────────────
INSERT IGNORE INTO clients (prenom, nom, email, telephone, ville, entreprise, secteur) VALUES
('Mohamed',  'El Amrani', 'mohamed@marco.com',  '+212600000001', 'Marrakech',  'Travel Atlas',     'Tourisme'),
('Salma',    'Bennani',   'salma@marco.com',    '+212600000002', 'Fes',         'Desert Tours',     'Tourisme'),
('Mustapha', 'Lahlou',    'mustapha@marco.com', '+212600000003', 'Rabat',       'Morocco Discover', 'Tourisme'),
('Nadia',    'Tazi',      'nadia@marco.com',    '+212600000004', 'Casablanca',  'Private Trips',    'Tourisme'),
('Hamza',    'Zerouali',  'hamza@marco.com',    '+212600000005', 'Agadir',      'Excursion Pro',    'Tourisme'),
('Ali',      'Kabbaj',    'ali@marco.com',      '+212600000006', 'Tangier',     'Travel Source',    'Tourisme'),
('Karim',    'Ouazzani',  'karim@marco.com',    '+212600000007', 'Ouarzazate',  'Atlas Agency',     'Tourisme'),
('Soufiane', 'Mehdi',     'soufiane@marco.com', '+212600000008', 'Tetouan',     'Sahara Trips',     'Tourisme'),
('Khadija',  'Alaoui',    'khadija@marco.com',  '+212600000009', 'Essaouira',   'Ocean Travel',     'Tourisme'),
('Rachid',   'Idrissi',   'rachid@marco.com',   '+212600000010', 'Meknes',      'Nomad Experience', 'Tourisme');

-- ─── SEED: Sites ─────────────────────────────────────────────────────────────
INSERT IGNORE INTO sites (nom_site, url, client_id, statut, type, tech) VALUES
('Berber Travel',          'https://berber-travel.com',                  1, 'En ligne',    'Tourisme', 'WordPress'),
('Morocco Desert Friends', 'https://moroccodesertfriends.com',           2, 'En ligne',    'Tourisme', 'WordPress'),
('Discovering Morocco',    'https://discoveringmoroccotravel.com',       3, 'Maintenance', 'Tourisme', 'React'),
('Private Tours Marrakech','https://private-tours-marrakech.com',        4, 'En ligne',    'Tourisme', 'Next.js'),
('Morocco Travel Source',  'https://moroccotravelsource.com',            6, 'En ligne',    'Tourisme', 'WordPress'),
('Excursions Marrakech',   'https://excursionsinmarrakech.com',          5, 'En ligne',    'Tourisme', 'WordPress'),
('Planning to Morocco',    'https://planningtomorocco.com',              7, 'En ligne',    'Tourisme', 'Laravel'),
('Para Atlas Targa',       'https://paraatlastarga.com',                 8, 'En ligne',    'Tourisme', 'WordPress'),
('Desert Travel Admin',    'https://moroccodeserttravel.wetest.website', 9, 'Maintenance', 'Admin',    'Custom'),
('Your Morocco Holidays',  'https://your-morocco-holidays.com',         10, 'En ligne',    'Tourisme', 'WordPress');

-- ─── SEED: Reclamations ──────────────────────────────────────────────────────
INSERT IGNORE INTO reclamations (sujet, description, statut, priorite, type, client_id) VALUES
('Site lent depuis mise à jour',   'Le site met 8 secondes à charger.',        'Résolu',     'Urgente', 'Problème de performance', 1),
('Bug formulaire de contact',      'Les emails ne partent plus du formulaire.', 'Résolu',     'Normale', 'Bug technique',           2),
('Changement logo et couleurs',    'Besoin de changer le logo et les couleurs.','En attente', 'Faible',  'Demande de modification', 3),
('Email professionnel bloqué',     'Impossible d\'envoyer depuis le domaine.',  'En attente', 'Urgente', 'Email professionnel',     4),
('Page produit erreur 500',        'La page produit affiche une erreur 500.',   'En cours',   'Normale', 'Bug technique',           1);

-- ─── SEED: Users (bcrypt via SHA2 placeholder → à remplacer par bcrypt réel) ──
-- Note: le server.js va migrer auto les SHA256 → bcrypt au premier login
INSERT IGNORE INTO users (email, password_hash, role, client_id) VALUES
('admin@marco.com',    SHA2('admin123',  256), 'admin',  NULL),
('mohamed@marco.com',  SHA2('Mohamed',   256), 'client', 1),
('salma@marco.com',    SHA2('Salma',     256), 'client', 2),
('mustapha@marco.com', SHA2('Mustapha',  256), 'client', 3),
('nadia@marco.com',    SHA2('Nadia',     256), 'client', 4),
('hamza@marco.com',    SHA2('Hamza',     256), 'client', 5),
('ali@marco.com',      SHA2('Ali',       256), 'client', 6),
('karim@marco.com',    SHA2('Karim',     256), 'client', 7),
('soufiane@marco.com', SHA2('Soufiane',  256), 'client', 8),
('khadija@marco.com',  SHA2('Khadija',   256), 'client', 9),
('rachid@marco.com',   SHA2('Rachid',    256), 'client', 10);

-- ─── SEED: Factures demo ─────────────────────────────────────────────────────
INSERT IGNORE INTO factures (numero, client_id, statut, total_ht, tva, total_ttc, date_echeance, notes) VALUES
('FAC-2025-0001', 1, 'Payée',      2500.00, 20, 3000.00, '2025-02-01', 'Création site + hébergement'),
('FAC-2025-0002', 2, 'En attente', 1500.00, 20, 1800.00, '2025-03-15', 'Maintenance mensuelle'),
('FAC-2025-0003', 3, 'En attente',  800.00, 20,  960.00, '2025-04-01', 'Modification design'),
('FAC-2025-0004', 4, 'Payée',      3200.00, 20, 3840.00, '2025-01-20', 'Refonte complète'),
('FAC-2025-0005', 5, 'Annulée',     500.00, 20,  600.00, '2025-02-28', 'Formation CMS');

-- Lignes des factures demo
INSERT IGNORE INTO facture_lignes (facture_id, description, quantite, prix_unitaire, sous_total) VALUES
(1, 'Création site WordPress',     1,    2000.00, 2000.00),
(1, 'Hébergement annuel',          1,     500.00,  500.00),
(2, 'Maintenance mensuelle',       1,    1500.00, 1500.00),
(3, 'Modification logo + couleurs',1,     500.00,  500.00),
(3, 'Retouches pages',             3,     100.00,  300.00),
(4, 'Refonte site complet',        1,    3000.00, 3000.00),
(4, 'Formation client',            2,     100.00,  200.00),
(5, 'Formation WordPress',         1,     500.00,  500.00);
-- ─── Useful queries ──────────────────────────────────────────────────────────
-- SELECT c.prenom, c.nom, s.nom_site, s.url, s.statut FROM clients c JOIN sites s ON c.id = s.client_id;
-- SELECT * FROM sites WHERE statut = 'Maintenance';
-- SELECT client_id, COUNT(*) AS nb_sites FROM sites GROUP BY client_id HAVING COUNT(*) > 1;















USE webmarko_crm;

-- Table historique
CREATE TABLE IF NOT EXISTS historique (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT,
    action      VARCHAR(20) NOT NULL,
    table_name  VARCHAR(50),
    record_id   VARCHAR(50),
    details     TEXT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Table factures
CREATE TABLE IF NOT EXISTS factures (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    numero         VARCHAR(20) UNIQUE NOT NULL,
    client_id      INT,
    statut         VARCHAR(30) DEFAULT 'En attente',
    total_ht       DECIMAL(10,2) DEFAULT 0.00,
    tva            DECIMAL(5,2)  DEFAULT 20.00,
    total_ttc      DECIMAL(10,2) DEFAULT 0.00,
    date_echeance  DATE NULL,
    notes          TEXT,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
);

-- Table facture_lignes
CREATE TABLE IF NOT EXISTS facture_lignes (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    facture_id     INT NOT NULL,
    description    VARCHAR(255) NOT NULL,
    quantite       DECIMAL(10,2) DEFAULT 1,
    prix_unitaire  DECIMAL(10,2) DEFAULT 0.00,
    sous_total     DECIMAL(10,2) DEFAULT 0.00,
    FOREIGN KEY (facture_id) REFERENCES factures(id) ON DELETE CASCADE
);


-- Crée les comptes manquants pour tous les clients existants
INSERT INTO users (email, password_hash, role, client_id)
SELECT 
    c.email,
    SHA2(c.prenom, 256),  -- mdp = prénom (sera migré vers bcrypt au premier login)
    'client',
    c.id
FROM clients c
LEFT JOIN users u ON LOWER(u.email) = LOWER(c.email)
WHERE u.id IS NULL;

ALTER TABLE clients ADD COLUMN secteur VARCHAR(50);

-- Chof les doublons
SELECT email, COUNT(*) as cnt FROM clients GROUP BY email HAVING cnt > 1;

-- Supprime les doublons (garde le premier)
DELETE c1 FROM clients c1
INNER JOIN clients c2
WHERE c1.id > c2.id AND c1.email = c2.email;