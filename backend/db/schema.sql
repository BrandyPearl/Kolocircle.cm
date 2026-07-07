-- ============================================================
-- KoloCircle — Canonical MySQL Schema
-- Supersedes dbScripts/tables.sql (MySQL, partial) and
-- server/db/schema.sql (PostgreSQL, retired).
-- Engine: InnoDB (required for foreign keys + transactions)
-- ============================================================

SET default_storage_engine = INNODB;

-- ----------------------------------------------------------
-- USERS — single canonical identity table
-- ----------------------------------------------------------
CREATE TABLE users (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    full_name VARCHAR(100),
    email VARCHAR(120) UNIQUE,
    phone VARCHAR(20) UNIQUE NOT NULL,
    password_hash TEXT,
    date_of_birth DATE,
    gender VARCHAR(10),
    cni_number VARCHAR(50) UNIQUE,
    region VARCHAR(50),
    phone_verified BOOLEAN DEFAULT FALSE,
    verification_status VARCHAR(30) DEFAULT 'incomplete',
    trust_score INT DEFAULT 0,
    role ENUM('member', 'platform_admin') DEFAULT 'member',
    status ENUM('active', 'suspended') DEFAULT 'active',
    ip_address VARCHAR(45),
    device_fingerprint TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------
-- VERIFICATION / KYC (from the existing, working module)
-- ----------------------------------------------------------
CREATE TABLE otp_codes (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    phone VARCHAR(20) NOT NULL,
    code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE verification_documents (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    doc_type VARCHAR(30) NOT NULL,
    file_path TEXT NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE guarantors (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    member_id BIGINT NOT NULL,
    guarantor_user_id BIGINT,
    guarantor_name VARCHAR(100) NOT NULL,
    guarantor_cni VARCHAR(50) NOT NULL,
    guarantor_phone VARCHAR(20) NOT NULL,
    relation VARCHAR(50) NOT NULL,
    town VARCHAR(100),
    reason TEXT,
    status ENUM('pending', 'confirmed', 'declined', 'released') DEFAULT 'pending',
    confirmation_token TEXT,
    token_expires_at TIMESTAMP NULL,
    confirmed_at TIMESTAMP NULL,
    released_at TIMESTAMP NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (member_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (guarantor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE deposits (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    amount INT NOT NULL DEFAULT 5000,
    currency VARCHAR(5) DEFAULT 'XAF',
    operator VARCHAR(20),
    momo_reference_id VARCHAR(100) UNIQUE,
    status ENUM('pending', 'successful', 'failed') DEFAULT 'pending',
    initiated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE verification_submissions (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    user_agent TEXT,
    review_status VARCHAR(30) DEFAULT 'pending_review',
    reviewed_at TIMESTAMP NULL,
    reviewer_note TEXT,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------
-- CIRCLES (njangi groups) — persistent across many cycles
-- ----------------------------------------------------------
CREATE TABLE njangi_groups (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    creator_id BIGINT NOT NULL,
    group_name VARCHAR(100) NOT NULL,
    description TEXT,
    visibility ENUM('private', 'public') NOT NULL DEFAULT 'private',
    invite_token CHAR(32) UNIQUE,
    contribution_amount DECIMAL(12,2) NOT NULL,
    contribution_frequency ENUM('weekly', 'monthly') NOT NULL,
    max_members INT NOT NULL,
    -- group-level lifecycle: distinct from any single cycle's status.
    -- 'forming'   -> accepting members, no cycle active yet
    -- 'in_cycle'  -> a cycle is currently running, membership closed
    -- 'between_cycles' -> a cycle just ended, open for join/leave again
    -- 'closed'    -> group permanently disbanded
    group_status ENUM('forming', 'in_cycle', 'between_cycles', 'closed') DEFAULT 'forming',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT chk_max_members CHECK (max_members >= 2),
    CONSTRAINT chk_contribution_amount CHECK (contribution_amount > 0)
);

-- ----------------------------------------------------------
-- GROUP MEMBERSHIP — lifetime relationship between a user and a group.
-- Does NOT carry payout_order; that is per-cycle (see cycle_members).
-- ----------------------------------------------------------
CREATE TABLE group_members (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    group_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    -- how this person came to be considered for membership
    join_path ENUM('admin_added', 'private_link', 'public_request') NOT NULL,
    request_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    -- set when an approved member asks to leave; takes effect at cycle end
    leave_requested BOOLEAN DEFAULT FALSE,
    leave_requested_at TIMESTAMP NULL,
    member_status ENUM('active', 'left', 'removed') DEFAULT 'active',
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP NULL,

    UNIQUE (group_id, user_id),

    FOREIGN KEY (group_id) REFERENCES njangi_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------
-- CYCLES — one row per rotation a group runs through its lifetime.
-- A group can have many cycles; only one may be 'active' at a time
-- (enforced in application logic, not DB, since MySQL has no native
-- partial unique index — see Application Layer notes).
-- ----------------------------------------------------------
CREATE TABLE cycles (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    group_id BIGINT NOT NULL,
    cycle_number INT NOT NULL,
    start_date DATE,
    end_date DATE NULL,
    status ENUM('active', 'completed', 'cancelled') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (group_id, cycle_number),

    FOREIGN KEY (group_id) REFERENCES njangi_groups(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------
-- CYCLE MEMBERS — the roster + payout order for ONE specific cycle.
-- Admin manually assigns payout_order per cycle (ballot-paper model);
-- there is no computed/carried-over ordering.
-- ----------------------------------------------------------
CREATE TABLE cycle_members (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    cycle_id BIGINT NOT NULL,
    membership_id BIGINT NOT NULL,
    payout_order INT NULL,
    has_been_paid BOOLEAN DEFAULT FALSE,

    UNIQUE (cycle_id, membership_id),
    UNIQUE (cycle_id, payout_order),

    FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE,
    FOREIGN KEY (membership_id) REFERENCES group_members(id) ON DELETE CASCADE
);

CREATE TABLE contributions (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    cycle_member_id BIGINT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    contribution_round INT NOT NULL,
    contribution_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('paid', 'pending', 'missed') DEFAULT 'pending',

    UNIQUE (cycle_member_id, contribution_round),

    FOREIGN KEY (cycle_member_id) REFERENCES cycle_members(id) ON DELETE CASCADE,
    CONSTRAINT chk_contribution_positive CHECK (amount > 0)
);

CREATE TABLE payout_cycles (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    cycle_id BIGINT NOT NULL,
    cycle_member_id BIGINT NOT NULL,
    payout_round INT NOT NULL,
    payout_date DATE,
    amount DECIMAL(12,2) NOT NULL,
    status ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (cycle_id, payout_round),

    FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE,
    FOREIGN KEY (cycle_member_id) REFERENCES cycle_members(id) ON DELETE RESTRICT
);

-- ----------------------------------------------------------
-- WALLET + LEDGER (the financial backbone — brief, section 8)
-- Application layer must INSERT-only into ledger_entries.
-- A dedicated low-privilege DB user (see Section "DB roles" below)
-- is granted INSERT, SELECT only on this table — no UPDATE, no DELETE.
--
-- MONEY FLOW MODEL (confirmed design):
--   Top-up:        MoMo            -> personal wallet      (credit)
--   Contribution:  personal wallet -> group wallet (escrow) (debit personal / credit group)
--   Payout:        group wallet    -> personal wallet       (debit group / credit personal)
--   Withdrawal:    personal wallet -> MoMo                  (debit)
-- Every transfer between two wallets produces TWO ledger_entries rows
-- (proper double-entry bookkeeping) — one debit, one credit, sharing
-- the same reference_table/reference_id so they can be traced as a
-- pair. A wallet's balance is always exactly the sum of its own
-- ledger_entries.amount values; nothing is ever special-cased.
-- ----------------------------------------------------------
CREATE TABLE wallets (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT UNIQUE NOT NULL,
    balance DECIMAL(12,2) DEFAULT 0.00,
    currency VARCHAR(10) DEFAULT 'XAF',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- One per circle, created automatically when the group itself is
-- created (confirmed decision) — acts as the escrow holding pot for
-- that circle's contributions until each round's payout fires.
CREATE TABLE group_wallets (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    group_id BIGINT UNIQUE NOT NULL,
    balance DECIMAL(12,2) DEFAULT 0.00,
    currency VARCHAR(10) DEFAULT 'XAF',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (group_id) REFERENCES njangi_groups(id) ON DELETE CASCADE
);

CREATE TABLE ledger_entries (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    -- Exactly one of wallet_id / group_wallet_id is set, never both —
    -- enforced in the application layer (ledgerService.js), since
    -- MySQL has no native XOR-style CHECK across two FKs reliably
    -- portable across versions.
    wallet_id BIGINT NULL,
    group_wallet_id BIGINT NULL,
    entry_type ENUM('topup', 'contribution', 'payout', 'withdrawal', 'deposit') NOT NULL,
    direction ENUM('credit', 'debit') NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    reference_table VARCHAR(30) NOT NULL,
    reference_id BIGINT NOT NULL,
    balance_after DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE RESTRICT,
    FOREIGN KEY (group_wallet_id) REFERENCES group_wallets(id) ON DELETE RESTRICT
);

-- ----------------------------------------------------------
-- TOP-UPS — MoMo -> personal wallet. Separate from `deposits`
-- (the one-time 5,000 XAF security deposit at verification time);
-- a top-up is a repeatable, user-initiated wallet funding action.
-- ----------------------------------------------------------
CREATE TABLE wallet_topups (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    operator VARCHAR(20),
    momo_reference_id VARCHAR(100) UNIQUE,
    status ENUM('pending', 'successful', 'failed') DEFAULT 'pending',
    initiated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_topup_positive CHECK (amount > 0)
);

-- ----------------------------------------------------------
-- WITHDRAWALS — personal wallet -> MoMo.
-- ----------------------------------------------------------
CREATE TABLE wallet_withdrawals (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    operator VARCHAR(20),
    momo_reference_id VARCHAR(100) UNIQUE,
    status ENUM('pending', 'successful', 'failed') DEFAULT 'pending',
    initiated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_withdrawal_positive CHECK (amount > 0)
);

-- ----------------------------------------------------------
-- NOTIFICATIONS
-- ----------------------------------------------------------
CREATE TABLE notifications (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    title VARCHAR(150),
    message TEXT,
    notification_type VARCHAR(30),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------
-- INDEXES for known access patterns
-- ----------------------------------------------------------
CREATE INDEX idx_otp_user ON otp_codes(user_id);
CREATE INDEX idx_verification_docs_user ON verification_documents(user_id);
CREATE INDEX idx_guarantors_member ON guarantors(member_id);
CREATE INDEX idx_guarantors_status ON guarantors(status);
CREATE INDEX idx_deposits_user ON deposits(user_id);
CREATE INDEX idx_groups_creator ON njangi_groups(creator_id);
CREATE INDEX idx_groups_invite_token ON njangi_groups(invite_token);
CREATE INDEX idx_members_group ON group_members(group_id);
CREATE INDEX idx_members_user ON group_members(user_id);
CREATE INDEX idx_cycles_group ON cycles(group_id);
CREATE INDEX idx_cycle_members_cycle ON cycle_members(cycle_id);
CREATE INDEX idx_cycle_members_membership ON cycle_members(membership_id);
CREATE INDEX idx_contributions_cycle_member ON contributions(cycle_member_id);
CREATE INDEX idx_payouts_cycle ON payout_cycles(cycle_id);
CREATE INDEX idx_ledger_wallet ON ledger_entries(wallet_id);
CREATE INDEX idx_ledger_group_wallet ON ledger_entries(group_wallet_id);
CREATE INDEX idx_ledger_reference ON ledger_entries(reference_table, reference_id);
CREATE INDEX idx_topups_user ON wallet_topups(user_id);
CREATE INDEX idx_withdrawals_user ON wallet_withdrawals(user_id);
CREATE INDEX idx_group_wallets_group ON group_wallets(group_id);
CREATE INDEX idx_notifications_user ON notifications(user_id);

-- ----------------------------------------------------------
-- DB ROLES — ledger append-only enforcement (CONFIRMED DECISION)
-- ----------------------------------------------------------
-- KoloCircle's backend (config/db.js) must connect as 'kolocircle_app',
-- NOT as root/admin. This guarantees that even a coding mistake or a
-- direct mysql client session using these credentials physically
-- cannot UPDATE or DELETE a ledger_entries row — MySQL itself refuses
-- the statement at the privilege level, independent of application code.
--
-- Run once, as a MySQL admin user (root), during environment setup:

CREATE USER IF NOT EXISTS 'kolocircle_app'@'%' IDENTIFIED BY 'CHANGE_ME_BEFORE_DEPLOY';

-- Full read/write on every table EXCEPT ledger_entries
GRANT SELECT, INSERT, UPDATE, DELETE ON kolocircle.users TO 'kolocircle_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON kolocircle.otp_codes TO 'kolocircle_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON kolocircle.verification_documents TO 'kolocircle_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON kolocircle.guarantors TO 'kolocircle_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON kolocircle.deposits TO 'kolocircle_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON kolocircle.verification_submissions TO 'kolocircle_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON kolocircle.njangi_groups TO 'kolocircle_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON kolocircle.group_members TO 'kolocircle_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON kolocircle.cycles TO 'kolocircle_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON kolocircle.cycle_members TO 'kolocircle_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON kolocircle.contributions TO 'kolocircle_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON kolocircle.payout_cycles TO 'kolocircle_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON kolocircle.wallets TO 'kolocircle_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON kolocircle.group_wallets TO 'kolocircle_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON kolocircle.wallet_topups TO 'kolocircle_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON kolocircle.wallet_withdrawals TO 'kolocircle_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON kolocircle.notifications TO 'kolocircle_app'@'%';

-- ledger_entries: INSERT and SELECT only. No UPDATE, no DELETE — ever.
GRANT SELECT, INSERT ON kolocircle.ledger_entries TO 'kolocircle_app'@'%';

FLUSH PRIVILEGES;

-- Verification (run manually to confirm the grant took effect):
-- SHOW GRANTS FOR 'kolocircle_app'@'%';
-- Expected for ledger_entries: GRANT SELECT, INSERT ON `kolocircle`.`ledger_entries` ...
-- (no UPDATE, no DELETE listed)