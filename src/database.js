const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

function createDatabase({ dbPath, seed }) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA synchronous = NORMAL;");

  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      initials TEXT NOT NULL,
      role TEXT NOT NULL,
      plan TEXT NOT NULL,
      region TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT;

    CREATE TABLE IF NOT EXISTS providers (
      workspace_id TEXT NOT NULL,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      website TEXT NOT NULL,
      docs_url TEXT NOT NULL,
      console_url TEXT NOT NULL,
      api_base_url TEXT NOT NULL,
      health TEXT NOT NULL CHECK (health IN ('operational', 'attention', 'down')),
      month_cost REAL NOT NULL DEFAULT 0 CHECK (month_cost >= 0),
      peak_rpm INTEGER NOT NULL DEFAULT 0 CHECK (peak_rpm >= 0),
      PRIMARY KEY (workspace_id, id),
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS credentials (
      workspace_id TEXT NOT NULL,
      id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      environment TEXT NOT NULL,
      ciphertext BLOB,
      encryption_version INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (workspace_id, id),
      FOREIGN KEY (workspace_id, provider_id) REFERENCES providers(workspace_id, id) ON DELETE CASCADE,
      CHECK (ciphertext IS NULL OR encryption_version IS NOT NULL)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS quota_snapshots (
      workspace_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      used INTEGER NOT NULL CHECK (used BETWEEN 0 AND 100),
      remaining INTEGER NOT NULL CHECK (remaining BETWEEN 0 AND 100),
      unit TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('provider_api', 'billing_import', 'response_headers', 'manual', 'estimated', 'unknown')),
      freshness TEXT NOT NULL,
      captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (workspace_id, provider_id),
      FOREIGN KEY (workspace_id, provider_id) REFERENCES providers(workspace_id, id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS provider_metric_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      used INTEGER NOT NULL CHECK (used BETWEEN 0 AND 100),
      remaining INTEGER NOT NULL CHECK (remaining BETWEEN 0 AND 100),
      unit TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('provider_api', 'billing_import', 'response_headers', 'manual', 'estimated', 'unknown')),
      month_cost REAL NOT NULL DEFAULT 0 CHECK (month_cost >= 0),
      peak_rpm INTEGER NOT NULL DEFAULT 0 CHECK (peak_rpm >= 0),
      captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workspace_id, provider_id) REFERENCES providers(workspace_id, id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
      status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
      message TEXT NOT NULL,
      source_snapshot_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at TEXT,
      FOREIGN KEY (workspace_id, provider_id) REFERENCES providers(workspace_id, id) ON DELETE CASCADE,
      FOREIGN KEY (source_snapshot_id) REFERENCES provider_metric_history(id) ON DELETE SET NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS capabilities (
      workspace_id TEXT NOT NULL,
      id TEXT NOT NULL,
      label TEXT NOT NULL,
      primary_provider TEXT NOT NULL,
      fallback_provider TEXT NOT NULL,
      application_count INTEGER NOT NULL DEFAULT 0 CHECK (application_count >= 0),
      state TEXT NOT NULL,
      PRIMARY KEY (workspace_id, id),
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS capability_contracts (
      workspace_id TEXT NOT NULL,
      capability_id TEXT NOT NULL,
      description TEXT NOT NULL,
      primary_provider_id TEXT,
      fallback_provider_id TEXT,
      input_contract TEXT NOT NULL,
      output_contract TEXT NOT NULL,
      data_classification TEXT NOT NULL CHECK (data_classification IN ('public', 'internal', 'confidential', 'restricted')),
      retention_policy TEXT NOT NULL CHECK (retention_policy IN ('none', 'metadata_only', 'ephemeral')),
      activated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (workspace_id, capability_id),
      FOREIGN KEY (workspace_id, capability_id) REFERENCES capabilities(workspace_id, id) ON DELETE CASCADE,
      FOREIGN KEY (workspace_id, primary_provider_id) REFERENCES providers(workspace_id, id) ON DELETE RESTRICT,
      FOREIGN KEY (workspace_id, fallback_provider_id) REFERENCES providers(workspace_id, id) ON DELETE RESTRICT
    ) STRICT;

    CREATE TABLE IF NOT EXISTS capability_proposals (
      workspace_id TEXT NOT NULL,
      capability_id TEXT NOT NULL,
      label TEXT NOT NULL,
      description TEXT NOT NULL,
      primary_provider_id TEXT NOT NULL,
      fallback_provider_id TEXT,
      input_contract TEXT NOT NULL,
      output_contract TEXT NOT NULL,
      data_classification TEXT NOT NULL CHECK (data_classification IN ('public', 'internal', 'confidential', 'restricted')),
      retention_policy TEXT NOT NULL CHECK (retention_policy IN ('none', 'metadata_only', 'ephemeral')),
      status TEXT NOT NULL CHECK (status IN ('candidate', 'activated', 'rejected')),
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      activated_at TEXT,
      PRIMARY KEY (workspace_id, capability_id),
      FOREIGN KEY (workspace_id, primary_provider_id) REFERENCES providers(workspace_id, id) ON DELETE RESTRICT,
      FOREIGN KEY (workspace_id, fallback_provider_id) REFERENCES providers(workspace_id, id) ON DELETE RESTRICT
    ) STRICT;

    CREATE TABLE IF NOT EXISTS applications (
      workspace_id TEXT NOT NULL,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      environment TEXT NOT NULL,
      capability_count INTEGER NOT NULL DEFAULT 0 CHECK (capability_count >= 0),
      spend REAL NOT NULL DEFAULT 0 CHECK (spend >= 0),
      budget REAL NOT NULL CHECK (budget >= 0),
      agent_count INTEGER NOT NULL DEFAULT 0 CHECK (agent_count >= 0),
      state TEXT NOT NULL,
      PRIMARY KEY (workspace_id, id),
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS agents (
      workspace_id TEXT NOT NULL,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      application_id TEXT NOT NULL,
      grant_count INTEGER NOT NULL DEFAULT 0 CHECK (grant_count >= 0),
      expires TEXT NOT NULL,
      state TEXT NOT NULL,
      PRIMARY KEY (workspace_id, id),
      FOREIGN KEY (workspace_id, application_id) REFERENCES applications(workspace_id, id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id TEXT NOT NULL,
      display_time TEXT NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      outcome TEXT NOT NULL,
      detail TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS auth_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_salt BLOB NOT NULL,
      password_hash BLOB NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY,
      account_id INTEGER NOT NULL,
      csrf_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES auth_accounts(id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS auth_session_metadata (
      session_id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      device_label TEXT NOT NULL,
      client_hash TEXT NOT NULL,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (token_hash) REFERENCES auth_sessions(token_hash) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS auth_login_failures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      login_key_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT;

    CREATE TABLE IF NOT EXISTS application_tokens (
      token_hash TEXT PRIMARY KEY,
      token_id TEXT NOT NULL UNIQUE,
      workspace_id TEXT NOT NULL,
      application_id TEXT NOT NULL,
      label TEXT NOT NULL,
      prefix TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
      expires_at TEXT,
      last_used_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workspace_id, application_id) REFERENCES applications(workspace_id, id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS application_capability_grants (
      workspace_id TEXT NOT NULL,
      application_id TEXT NOT NULL,
      capability_id TEXT NOT NULL,
      rpm_limit INTEGER NOT NULL DEFAULT 30 CHECK (rpm_limit BETWEEN 1 AND 10000),
      daily_limit INTEGER NOT NULL DEFAULT 1000 CHECK (daily_limit BETWEEN 1 AND 10000000),
      enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (workspace_id, application_id, capability_id),
      FOREIGN KEY (workspace_id, application_id) REFERENCES applications(workspace_id, id) ON DELETE CASCADE,
      FOREIGN KEY (workspace_id, capability_id) REFERENCES capabilities(workspace_id, id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS agent_capability_grants (
      workspace_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      capability_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (workspace_id, agent_id, capability_id),
      FOREIGN KEY (workspace_id, agent_id) REFERENCES agents(workspace_id, id) ON DELETE CASCADE,
      FOREIGN KEY (workspace_id, capability_id) REFERENCES capabilities(workspace_id, id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS agent_tokens (
      token_hash TEXT PRIMARY KEY,
      token_id TEXT NOT NULL UNIQUE,
      workspace_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      label TEXT NOT NULL,
      prefix TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
      expires_at TEXT NOT NULL,
      last_used_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workspace_id, agent_id) REFERENCES agents(workspace_id, id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS invocation_records (
      request_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      application_id TEXT NOT NULL,
      capability_id TEXT NOT NULL,
      token_id TEXT NOT NULL,
      decision TEXT NOT NULL CHECK (decision IN ('allowed', 'denied')),
      reason TEXT NOT NULL,
      provider_route TEXT,
      execution_mode TEXT NOT NULL CHECK (execution_mode IN ('dry_run', 'live')),
      units INTEGER NOT NULL DEFAULT 1 CHECK (units >= 0),
      latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workspace_id, application_id) REFERENCES applications(workspace_id, id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS gateway_idempotency (
      workspace_id TEXT NOT NULL,
      identity_type TEXT NOT NULL CHECK (identity_type IN ('application', 'agent')),
      identity_id TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      request_fingerprint TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('pending', 'completed')),
      request_id TEXT,
      response_status INTEGER,
      response_json TEXT,
      replay_count INTEGER NOT NULL DEFAULT 0 CHECK (replay_count >= 0),
      last_replayed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      expires_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, identity_type, identity_id, key_hash),
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      CHECK ((state = 'pending' AND response_status IS NULL AND response_json IS NULL)
        OR (state = 'completed' AND response_status IS NOT NULL AND response_json IS NOT NULL))
    ) STRICT;

    CREATE INDEX IF NOT EXISTS idx_providers_workspace ON providers(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_credentials_workspace_provider ON credentials(workspace_id, provider_id);
    CREATE INDEX IF NOT EXISTS idx_capabilities_workspace ON capabilities(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_applications_workspace ON applications(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_agents_workspace_application ON agents(workspace_id, application_id);
    CREATE INDEX IF NOT EXISTS idx_audit_workspace_created ON audit_events(workspace_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_account_expiry ON auth_sessions(account_id, expires_at);
    CREATE INDEX IF NOT EXISTS idx_session_metadata_client ON auth_session_metadata(client_hash, last_seen_at DESC);
    CREATE INDEX IF NOT EXISTS idx_login_failures_key_time ON auth_login_failures(login_key_hash, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_app_tokens_workspace_app ON application_tokens(workspace_id, application_id, status);
    CREATE INDEX IF NOT EXISTS idx_grants_workspace_app ON application_capability_grants(workspace_id, application_id, enabled);
    CREATE INDEX IF NOT EXISTS idx_invocations_rate ON invocation_records(workspace_id, application_id, capability_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_tokens_workspace_agent ON agent_tokens(workspace_id, agent_id, status);
    CREATE INDEX IF NOT EXISTS idx_agent_grants_workspace_agent ON agent_capability_grants(workspace_id, agent_id);
    CREATE INDEX IF NOT EXISTS idx_idempotency_expiry ON gateway_idempotency(expires_at, state);
    CREATE INDEX IF NOT EXISTS idx_metric_history_provider_time ON provider_metric_history(workspace_id, provider_id, captured_at DESC);
    CREATE INDEX IF NOT EXISTS idx_alerts_workspace_status ON alerts(workspace_id, status, severity, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_capability_proposals_status ON capability_proposals(workspace_id, status, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_one_open_kind ON alerts(workspace_id, provider_id, kind) WHERE status = 'open';
  `);

  ensureColumn(db, "invocation_records", "identity_type", "TEXT NOT NULL DEFAULT 'application' CHECK (identity_type IN ('application', 'agent'))");
  ensureColumn(db, "invocation_records", "agent_id", "TEXT");
  ensureColumn(db, "gateway_idempotency", "replay_count", "INTEGER NOT NULL DEFAULT 0 CHECK (replay_count >= 0)");
  ensureColumn(db, "gateway_idempotency", "last_replayed_at", "TEXT");

  seedIfEmpty(db, seed);
  seedControlPlaneIfEmpty(db, seed);
  seedMetricHistoryIfEmpty(db);
  seedCapabilityContractsIfEmpty(db);
  seedMissingSessionMetadata(db);

  const statements = {
    listUsers: db.prepare("SELECT id, name, initials, role, plan, region FROM workspaces ORDER BY rowid"),
    findUser: db.prepare("SELECT id, name, initials, role, plan, region FROM workspaces WHERE id = ?"),
    providers: db.prepare(`
      SELECT p.id, p.name, p.category, p.website, p.docs_url AS docs, p.console_url AS console,
        p.api_base_url AS apiBase, p.health, p.month_cost AS monthCost, p.peak_rpm AS peakRpm,
        c.status AS credentialStatus, c.fingerprint, c.environment,
        q.used AS quotaUsed, q.remaining AS quotaRemaining, q.unit AS quotaUnit,
        q.source AS quotaSource, q.freshness AS quotaFresh
      FROM providers p
      JOIN credentials c ON c.workspace_id = p.workspace_id AND c.provider_id = p.id
      JOIN quota_snapshots q ON q.workspace_id = p.workspace_id AND q.provider_id = p.id
      WHERE p.workspace_id = ? ORDER BY p.rowid
    `),
    capabilities: db.prepare(`SELECT c.id, c.label, c.primary_provider AS primaryProvider, c.fallback_provider AS fallbackProvider,
      c.application_count AS applicationCount, c.state, cc.description, cc.primary_provider_id AS primaryProviderId,
      cc.fallback_provider_id AS fallbackProviderId, cc.input_contract AS inputContract,
      cc.output_contract AS outputContract, cc.data_classification AS dataClassification,
      cc.retention_policy AS retentionPolicy FROM capabilities c LEFT JOIN capability_contracts cc
      ON cc.workspace_id = c.workspace_id AND cc.capability_id = c.id WHERE c.workspace_id = ? ORDER BY c.rowid`),
    applications: db.prepare(`SELECT id, name, environment, capability_count AS capabilityCount, spend, budget,
      agent_count AS agentCount, state FROM applications WHERE workspace_id = ? ORDER BY rowid`),
    agents: db.prepare(`SELECT id, name, application_id AS applicationId, grant_count AS grantCount, expires, state
      FROM agents WHERE workspace_id = ? ORDER BY rowid`),
    audits: db.prepare(`SELECT display_time AS time, actor, action, outcome, detail FROM audit_events
      WHERE workspace_id = ? ORDER BY id`),
    credentials: db.prepare(`SELECT id, provider_id AS providerId, label, status, fingerprint, environment
      FROM credentials WHERE workspace_id = ? ORDER BY rowid`),
    accountCount: db.prepare("SELECT COUNT(*) AS count FROM auth_accounts"),
    accountByUsername: db.prepare(`SELECT a.id, a.workspace_id AS workspaceId, a.username,
      a.password_salt AS passwordSalt, a.password_hash AS passwordHash
      FROM auth_accounts a WHERE a.username = ? COLLATE NOCASE`),
    session: db.prepare(`SELECT s.token_hash AS tokenHash, s.csrf_hash AS csrfHash, s.expires_at AS expiresAt,
      m.session_id AS sessionId, m.device_label AS deviceLabel, m.last_seen_at AS lastSeenAt,
      a.id AS accountId, a.username, a.workspace_id AS workspaceId,
      w.name, w.initials, w.role, w.plan, w.region
      FROM auth_sessions s JOIN auth_accounts a ON a.id = s.account_id
      JOIN workspaces w ON w.id = a.workspace_id
      LEFT JOIN auth_session_metadata m ON m.token_hash = s.token_hash
      WHERE s.token_hash = ? AND julianday(s.expires_at) > julianday('now')`),
    insertAccount: db.prepare(`INSERT INTO auth_accounts
      (workspace_id, username, password_salt, password_hash) VALUES (?, ?, ?, ?)`),
    insertSession: db.prepare(`INSERT INTO auth_sessions
      (token_hash, account_id, csrf_hash, expires_at) VALUES (?, ?, ?, ?)`),
    insertSessionMetadata: db.prepare(`INSERT INTO auth_session_metadata
      (session_id, token_hash, device_label, client_hash) VALUES (?, ?, ?, ?)`),
    touchSession: db.prepare("UPDATE auth_session_metadata SET last_seen_at = CURRENT_TIMESTAMP WHERE token_hash = ?"),
    sessionsForAccount: db.prepare(`SELECT m.session_id AS sessionId, m.device_label AS deviceLabel,
      m.client_hash AS clientHash, m.last_seen_at AS lastSeenAt, s.created_at AS createdAt,
      s.expires_at AS expiresAt FROM auth_sessions s JOIN auth_session_metadata m ON m.token_hash = s.token_hash
      WHERE s.account_id = ? AND julianday(s.expires_at) > julianday('now') ORDER BY m.last_seen_at DESC`),
    sessionForAccount: db.prepare(`SELECT s.token_hash AS tokenHash FROM auth_sessions s
      JOIN auth_session_metadata m ON m.token_hash = s.token_hash WHERE s.account_id = ? AND m.session_id = ?`),
    failedLoginCount: db.prepare(`SELECT COUNT(*) AS count FROM auth_login_failures
      WHERE login_key_hash = ? AND created_at >= datetime('now', '-15 minutes')`),
    insertLoginFailure: db.prepare("INSERT INTO auth_login_failures (login_key_hash) VALUES (?)"),
    clearLoginFailures: db.prepare("DELETE FROM auth_login_failures WHERE login_key_hash = ?"),
    pruneLoginFailures: db.prepare("DELETE FROM auth_login_failures WHERE created_at < datetime('now', '-1 day')"),
    updatePassword: db.prepare("UPDATE auth_accounts SET password_salt = ?, password_hash = ? WHERE id = ?"),
    deleteAccountSessions: db.prepare("DELETE FROM auth_sessions WHERE account_id = ?"),
    deleteSession: db.prepare("DELETE FROM auth_sessions WHERE token_hash = ?"),
    updateSessionCsrf: db.prepare("UPDATE auth_sessions SET csrf_hash = ? WHERE token_hash = ?"),
    deleteExpiredSessions: db.prepare("DELETE FROM auth_sessions WHERE julianday(expires_at) <= julianday('now')"),
    updateCredential: db.prepare(`UPDATE credentials SET ciphertext = ?, encryption_version = ?,
      fingerprint = ?, status = 'configured', updated_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ? AND provider_id = ?`),
    credentialEnvelope: db.prepare(`SELECT ciphertext, encryption_version AS encryptionVersion,
      environment, status, fingerprint FROM credentials
      WHERE workspace_id = ? AND provider_id = ? AND environment = ?`),
    insertProvider: db.prepare(`INSERT INTO providers
      (workspace_id, id, name, category, website, docs_url, console_url, api_base_url, health, month_cost, peak_rpm)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'attention', 0, 0)`),
    insertCredential: db.prepare(`INSERT INTO credentials
      (workspace_id, id, provider_id, label, status, fingerprint, environment, ciphertext, encryption_version)
      VALUES (?, ?, ?, ?, 'configured', ?, ?, ?, 1)`),
    insertQuota: db.prepare(`INSERT INTO quota_snapshots
      (workspace_id, provider_id, used, remaining, unit, source, freshness)
      VALUES (?, ?, ?, ?, ?, ?, 'just recorded')`),
    providerExists: db.prepare("SELECT id, name FROM providers WHERE workspace_id = ? AND id = ?"),
    updateProviderMetrics: db.prepare(`UPDATE providers SET month_cost = ?, peak_rpm = ?,
      health = CASE WHEN ? <= 20 THEN 'attention' WHEN health = 'down' THEN 'down' ELSE 'operational' END
      WHERE workspace_id = ? AND id = ?`),
    updateQuota: db.prepare(`UPDATE quota_snapshots SET used = ?, remaining = ?, unit = ?, source = ?,
      freshness = 'just recorded', captured_at = CURRENT_TIMESTAMP WHERE workspace_id = ? AND provider_id = ?`),
    insertMetricHistory: db.prepare(`INSERT INTO provider_metric_history
      (workspace_id, provider_id, used, remaining, unit, source, month_cost, peak_rpm)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
    resolveAlert: db.prepare(`UPDATE alerts SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ? AND provider_id = ? AND kind = ? AND status = 'open'`),
    openAlert: db.prepare(`INSERT INTO alerts
      (workspace_id, provider_id, kind, severity, status, message, source_snapshot_id)
      VALUES (?, ?, ?, ?, 'open', ?, ?)`),
    updateOpenAlert: db.prepare(`UPDATE alerts SET severity = ?, message = ?, source_snapshot_id = ?
      WHERE workspace_id = ? AND provider_id = ? AND kind = ? AND status = 'open'`),
    metricHistory: db.prepare(`SELECT h.id, h.provider_id AS providerId, p.name AS providerName,
      h.used, h.remaining, h.unit, h.source, h.month_cost AS monthCost, h.peak_rpm AS peakRpm,
      h.captured_at AS capturedAt FROM provider_metric_history h JOIN providers p
      ON p.workspace_id = h.workspace_id AND p.id = h.provider_id
      WHERE h.workspace_id = ? ORDER BY h.id DESC LIMIT ?`),
    alerts: db.prepare(`SELECT a.id, a.provider_id AS providerId, p.name AS providerName, a.kind,
      a.severity, a.status, a.message, a.created_at AS createdAt, a.resolved_at AS resolvedAt
      FROM alerts a JOIN providers p ON p.workspace_id = a.workspace_id AND p.id = a.provider_id
      WHERE a.workspace_id = ? AND (? = 'all' OR a.status = ?) ORDER BY
      CASE a.severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END, a.id DESC LIMIT ?`),
    insertAudit: db.prepare(`INSERT INTO audit_events
      (workspace_id, display_time, actor, action, outcome, detail) VALUES (?, ?, ?, ?, ?, ?)`),
    application: db.prepare(`SELECT id, name, environment, state FROM applications WHERE workspace_id = ? AND id = ?`),
    insertApplication: db.prepare(`INSERT INTO applications
      (workspace_id, id, name, environment, capability_count, spend, budget, agent_count, state)
      VALUES (?, ?, ?, ?, 0, 0, ?, 0, 'active')`),
    insertApplicationToken: db.prepare(`INSERT INTO application_tokens
      (token_hash, token_id, workspace_id, application_id, label, prefix, fingerprint, status, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`),
    applicationTokens: db.prepare(`SELECT token_id AS tokenId, application_id AS applicationId, label, prefix,
      fingerprint, status, expires_at AS expiresAt, last_used_at AS lastUsedAt, created_at AS createdAt
      FROM application_tokens WHERE workspace_id = ? ORDER BY created_at DESC`),
    applicationTokenByHash: db.prepare(`SELECT t.token_hash AS tokenHash, t.token_id AS tokenId,
      t.workspace_id AS workspaceId, t.application_id AS applicationId, t.status AS tokenStatus,
      t.expires_at AS expiresAt, a.environment, a.state AS applicationState, a.name AS applicationName,
      a.spend, a.budget
      FROM application_tokens t JOIN applications a
      ON a.workspace_id = t.workspace_id AND a.id = t.application_id WHERE t.token_hash = ?`),
    touchApplicationToken: db.prepare("UPDATE application_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE token_hash = ?"),
    revokeApplicationToken: db.prepare(`UPDATE application_tokens SET status = 'revoked'
      WHERE workspace_id = ? AND token_id = ? AND status = 'active'`),
    agent: db.prepare(`SELECT id, name, application_id AS applicationId, grant_count AS grantCount,
      expires, state FROM agents WHERE workspace_id = ? AND id = ?`),
    insertAgent: db.prepare(`INSERT INTO agents
      (workspace_id, id, name, application_id, grant_count, expires, state) VALUES (?, ?, ?, ?, ?, ?, 'active')`),
    insertAgentGrant: db.prepare(`INSERT INTO agent_capability_grants
      (workspace_id, agent_id, capability_id) VALUES (?, ?, ?)`),
    applicationEnabledGrant: db.prepare(`SELECT capability_id AS capabilityId FROM application_capability_grants
      WHERE workspace_id = ? AND application_id = ? AND capability_id = ? AND enabled = 1`),
    updateApplicationAgentCount: db.prepare(`UPDATE applications SET agent_count =
      (SELECT COUNT(*) FROM agents WHERE agents.workspace_id = applications.workspace_id
       AND agents.application_id = applications.id AND agents.state = 'active')
      WHERE workspace_id = ? AND id = ?`),
    agentCapabilityIds: db.prepare(`SELECT capability_id AS capabilityId FROM agent_capability_grants
      WHERE workspace_id = ? AND agent_id = ? ORDER BY capability_id`),
    insertAgentToken: db.prepare(`INSERT INTO agent_tokens
      (token_hash, token_id, workspace_id, agent_id, label, prefix, fingerprint, status, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`),
    agentTokens: db.prepare(`SELECT t.token_id AS tokenId, t.agent_id AS agentId, a.application_id AS applicationId,
      t.label, t.prefix, t.fingerprint, t.status, t.expires_at AS expiresAt,
      t.last_used_at AS lastUsedAt, t.created_at AS createdAt FROM agent_tokens t JOIN agents a
      ON a.workspace_id = t.workspace_id AND a.id = t.agent_id WHERE t.workspace_id = ? ORDER BY t.created_at DESC`),
    agentTokenByHash: db.prepare(`SELECT t.token_hash AS tokenHash, t.token_id AS tokenId,
      t.workspace_id AS workspaceId, t.agent_id AS agentId, t.status AS tokenStatus,
      t.expires_at AS expiresAt, ag.name AS agentName, ag.state AS agentState,
      ag.application_id AS applicationId, a.environment, a.state AS applicationState,
      a.name AS applicationName, a.spend, a.budget FROM agent_tokens t JOIN agents ag
      ON ag.workspace_id = t.workspace_id AND ag.id = t.agent_id JOIN applications a
      ON a.workspace_id = ag.workspace_id AND a.id = ag.application_id WHERE t.token_hash = ?`),
    touchAgentToken: db.prepare("UPDATE agent_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE token_hash = ?"),
    revokeAgentToken: db.prepare(`UPDATE agent_tokens SET status = 'revoked'
      WHERE workspace_id = ? AND token_id = ? AND status = 'active'`),
    grant: db.prepare(`SELECT g.rpm_limit AS rpmLimit, g.daily_limit AS dailyLimit, g.enabled,
      c.label, c.primary_provider AS primaryProvider, c.fallback_provider AS fallbackProvider, c.state,
      cc.primary_provider_id AS primaryProviderId, p.api_base_url AS providerApiBase,
      cc.description, cc.input_contract AS inputContract, cc.output_contract AS outputContract,
      cc.data_classification AS dataClassification, cc.retention_policy AS retentionPolicy
      FROM application_capability_grants g JOIN capabilities c
      ON c.workspace_id = g.workspace_id AND c.id = g.capability_id
      LEFT JOIN capability_contracts cc ON cc.workspace_id = c.workspace_id AND cc.capability_id = c.id
      LEFT JOIN providers p ON p.workspace_id = cc.workspace_id AND p.id = cc.primary_provider_id
      WHERE g.workspace_id = ? AND g.application_id = ? AND g.capability_id = ?`),
    grants: db.prepare(`SELECT g.application_id AS applicationId, g.capability_id AS capabilityId,
      c.label, g.rpm_limit AS rpmLimit, g.daily_limit AS dailyLimit, g.enabled,
      cc.description, cc.input_contract AS inputContract, cc.output_contract AS outputContract,
      cc.data_classification AS dataClassification, cc.retention_policy AS retentionPolicy
      FROM application_capability_grants g JOIN capabilities c
      ON c.workspace_id = g.workspace_id AND c.id = g.capability_id
      LEFT JOIN capability_contracts cc ON cc.workspace_id = c.workspace_id AND cc.capability_id = c.id
      WHERE g.workspace_id = ? ORDER BY g.application_id, g.capability_id`),
    capability: db.prepare("SELECT id, label FROM capabilities WHERE workspace_id = ? AND id = ?"),
    providerForContract: db.prepare("SELECT id FROM providers WHERE workspace_id = ? AND id = ?"),
    capabilityProposal: db.prepare(`SELECT workspace_id AS workspaceId, capability_id AS capabilityId,
      label, description, primary_provider_id AS primaryProviderId, fallback_provider_id AS fallbackProviderId,
      input_contract AS inputContract, output_contract AS outputContract,
      data_classification AS dataClassification, retention_policy AS retentionPolicy, status,
      created_by AS createdBy, created_at AS createdAt, activated_at AS activatedAt
      FROM capability_proposals WHERE workspace_id = ? AND capability_id = ?`),
    capabilityProposals: db.prepare(`SELECT capability_id AS capabilityId, label, description,
      primary_provider_id AS primaryProviderId, fallback_provider_id AS fallbackProviderId,
      input_contract AS inputContract, output_contract AS outputContract,
      data_classification AS dataClassification, retention_policy AS retentionPolicy, status,
      created_by AS createdBy, created_at AS createdAt, activated_at AS activatedAt
      FROM capability_proposals WHERE workspace_id = ? ORDER BY created_at DESC`),
    insertCapabilityProposal: db.prepare(`INSERT INTO capability_proposals
      (workspace_id, capability_id, label, description, primary_provider_id, fallback_provider_id,
       input_contract, output_contract, data_classification, retention_policy, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'candidate', ?)`),
    insertActivatedCapability: db.prepare(`INSERT INTO capabilities
      (workspace_id, id, label, primary_provider, fallback_provider, application_count, state)
      VALUES (?, ?, ?, ?, ?, 0, 'ready')`),
    insertCapabilityContract: db.prepare(`INSERT INTO capability_contracts
      (workspace_id, capability_id, description, primary_provider_id, fallback_provider_id,
       input_contract, output_contract, data_classification, retention_policy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    activateCapabilityProposal: db.prepare(`UPDATE capability_proposals SET status = 'activated',
      activated_at = CURRENT_TIMESTAMP WHERE workspace_id = ? AND capability_id = ? AND status = 'candidate'`),
    upsertGrant: db.prepare(`INSERT INTO application_capability_grants
      (workspace_id, application_id, capability_id, rpm_limit, daily_limit, enabled)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id, application_id, capability_id) DO UPDATE SET
      rpm_limit = excluded.rpm_limit, daily_limit = excluded.daily_limit, enabled = excluded.enabled`),
    updateApplicationGrantCount: db.prepare(`UPDATE applications SET capability_count =
      (SELECT COUNT(*) FROM application_capability_grants g WHERE g.workspace_id = applications.workspace_id
       AND g.application_id = applications.id AND g.enabled = 1)
      WHERE workspace_id = ? AND id = ?`),
    minuteUsage: db.prepare(`SELECT COUNT(*) AS count FROM invocation_records
      WHERE workspace_id = ? AND application_id = ? AND capability_id = ? AND decision = 'allowed'
      AND created_at >= datetime('now', '-1 minute')`),
    dailyUsage: db.prepare(`SELECT COUNT(*) AS count FROM invocation_records
      WHERE workspace_id = ? AND application_id = ? AND capability_id = ? AND decision = 'allowed'
      AND created_at >= datetime('now', '-1 day')`),
    insertInvocation: db.prepare(`INSERT INTO invocation_records
      (request_id, workspace_id, application_id, capability_id, token_id, decision, reason,
       provider_route, execution_mode, units, latency_ms, identity_type, agent_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    invocations: db.prepare(`SELECT request_id AS requestId, application_id AS applicationId,
      capability_id AS capabilityId, identity_type AS identityType, agent_id AS agentId,
      decision, reason, provider_route AS providerRoute,
      execution_mode AS executionMode, units, latency_ms AS latencyMs, created_at AS createdAt
      FROM invocation_records WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?`),
    workspaceUsage: db.prepare(`SELECT COUNT(*) AS total, SUM(decision = 'allowed') AS allowed,
      SUM(decision = 'denied') AS denied, COALESCE(SUM(units), 0) AS units,
      AVG(latency_ms) AS averageLatencyMs, MAX(created_at) AS lastInvocationAt
      FROM invocation_records WHERE workspace_id = ? AND created_at >= datetime('now', 'start of day')`),
    applicationUsage: db.prepare(`SELECT a.id AS applicationId, a.name,
      COUNT(i.request_id) AS total, COALESCE(SUM(i.decision = 'allowed'), 0) AS allowed,
      COALESCE(SUM(i.decision = 'denied'), 0) AS denied, COALESCE(SUM(i.units), 0) AS units,
      AVG(i.latency_ms) AS averageLatencyMs, MAX(i.created_at) AS lastInvocationAt
      FROM applications a LEFT JOIN invocation_records i ON i.workspace_id = a.workspace_id
      AND i.application_id = a.id AND i.created_at >= datetime('now', 'start of day')
      WHERE a.workspace_id = ? GROUP BY a.id, a.name ORDER BY a.rowid`),
    applicationPeaks: db.prepare(`SELECT application_id AS applicationId, MAX(requests) AS peakRpm FROM (
      SELECT application_id, substr(created_at, 1, 16) AS minute, COUNT(*) AS requests
      FROM invocation_records WHERE workspace_id = ? AND decision = 'allowed'
      AND created_at >= datetime('now', 'start of day') GROUP BY application_id, minute
    ) GROUP BY application_id`),
    capabilityUsage: db.prepare(`SELECT application_id AS applicationId, capability_id AS capabilityId,
      COUNT(*) AS total, SUM(decision = 'allowed') AS allowed, SUM(decision = 'denied') AS denied,
      COALESCE(SUM(units), 0) AS units, AVG(latency_ms) AS averageLatencyMs,
      MAX(created_at) AS lastInvocationAt FROM invocation_records WHERE workspace_id = ?
      AND created_at >= datetime('now', 'start of day') GROUP BY application_id, capability_id
      ORDER BY application_id, capability_id`),
    agentUsage: db.prepare(`SELECT agent_id AS agentId, COUNT(*) AS total,
      SUM(decision = 'allowed') AS allowed, SUM(decision = 'denied') AS denied,
      COALESCE(SUM(units), 0) AS units, AVG(latency_ms) AS averageLatencyMs,
      MAX(created_at) AS lastInvocationAt FROM invocation_records WHERE workspace_id = ?
      AND identity_type = 'agent' AND agent_id IS NOT NULL
      AND created_at >= datetime('now', 'start of day') GROUP BY agent_id ORDER BY agent_id`),
    pruneIdempotency: db.prepare(`DELETE FROM gateway_idempotency WHERE julianday(expires_at) <= julianday('now')
      OR (state = 'pending' AND created_at <= datetime('now', '-5 minutes'))`),
    insertIdempotency: db.prepare(`INSERT OR IGNORE INTO gateway_idempotency
      (workspace_id, identity_type, identity_id, key_hash, request_fingerprint, state, expires_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)`),
    idempotency: db.prepare(`SELECT request_fingerprint AS requestFingerprint, state,
      request_id AS requestId, response_status AS responseStatus, response_json AS responseJson,
      replay_count AS replayCount, last_replayed_at AS lastReplayedAt,
      created_at AS createdAt, completed_at AS completedAt, expires_at AS expiresAt
      FROM gateway_idempotency WHERE workspace_id = ? AND identity_type = ? AND identity_id = ? AND key_hash = ?`),
    markIdempotencyReplay: db.prepare(`UPDATE gateway_idempotency SET replay_count = replay_count + 1,
      last_replayed_at = CURRENT_TIMESTAMP WHERE workspace_id = ? AND identity_type = ?
      AND identity_id = ? AND key_hash = ? AND state = 'completed'`),
    idempotencyInventory: db.prepare(`SELECT identity_type AS identityType, identity_id AS identityId,
      state, request_id AS requestId, response_status AS responseStatus, replay_count AS replayCount,
      last_replayed_at AS lastReplayedAt, created_at AS createdAt, completed_at AS completedAt,
      expires_at AS expiresAt FROM gateway_idempotency WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?`),
    idempotencyReplaySummary: db.prepare(`SELECT COALESCE(SUM(replay_count), 0) AS replays
      FROM gateway_idempotency WHERE workspace_id = ? AND created_at >= datetime('now', 'start of day')`),
    completeIdempotency: db.prepare(`UPDATE gateway_idempotency SET state = 'completed', request_id = ?,
      response_status = ?, response_json = ?, completed_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ? AND identity_type = ? AND identity_id = ? AND key_hash = ? AND state = 'pending'`),
  };

  function listProviders(workspaceId) {
    return statements.providers.all(workspaceId).map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      website: row.website,
      docs: row.docs,
      console: row.console,
      apiBase: row.apiBase,
      health: row.health,
      credential: { status: row.credentialStatus, fingerprint: row.fingerprint, environment: row.environment },
      quota: { used: row.quotaUsed, remaining: row.quotaRemaining, unit: row.quotaUnit, source: row.quotaSource, fresh: row.quotaFresh },
      monthCost: row.monthCost,
      peak: `${row.peakRpm} req/min`,
    }));
  }

  const analyticsRanges = {
    "24h": { since: "-24 hours", bucketHours: 1, bucketCount: 24 },
    "7d": { since: "-7 days", bucketHours: 6, bucketCount: 28 },
    "30d": { since: "-30 days", bucketHours: 24, bucketCount: 30 },
  };

  function usageAnalyticsRange(workspaceId, range = "24h") {
    const config = analyticsRanges[range];
    if (!config) throw new Error("Unsupported analytics range");
    const bucket = config.bucketHours === 1
      ? "strftime('%Y-%m-%d %H:00:00', i.created_at)"
      : config.bucketHours === 6
        ? "strftime('%Y-%m-%d ', i.created_at) || printf('%02d:00:00', CAST(CAST(strftime('%H', i.created_at) AS INTEGER) / 6 AS INTEGER) * 6)"
        : "strftime('%Y-%m-%d 00:00:00', i.created_at)";
    const from = `datetime('now', '${config.since}')`;
    const providerJoin = `LEFT JOIN providers p ON p.workspace_id = i.workspace_id
      AND (p.id = i.provider_route OR p.name = i.provider_route)`;
    const trend = db.prepare(`SELECT ${bucket} AS bucket,
      COALESCE(p.id, i.provider_route, 'unrouted') AS providerId,
      COALESCE(p.name, i.provider_route, 'Policy / unrouted') AS providerName,
      COUNT(*) AS calls,
      COALESCE(SUM(i.decision = 'allowed'), 0) AS allowed,
      COALESCE(SUM(i.decision = 'denied'), 0) AS denied,
      COALESCE(SUM(i.units), 0) AS units,
      ROUND(AVG(i.latency_ms)) AS averageLatencyMs
      FROM invocation_records i ${providerJoin}
      WHERE i.workspace_id = ? AND i.created_at >= ${from}
      GROUP BY bucket, providerId, providerName ORDER BY bucket, providerName`).all(workspaceId);
    const providers = db.prepare(`SELECT
      COALESCE(p.id, i.provider_route, 'unrouted') AS providerId,
      COALESCE(p.name, i.provider_route, 'Policy / unrouted') AS providerName,
      COUNT(*) AS total,
      COALESCE(SUM(i.decision = 'allowed'), 0) AS allowed,
      COALESCE(SUM(i.decision = 'denied'), 0) AS denied,
      COALESCE(SUM(i.units), 0) AS units,
      ROUND(AVG(i.latency_ms)) AS averageLatencyMs
      FROM invocation_records i ${providerJoin}
      WHERE i.workspace_id = ? AND i.created_at >= ${from}
      GROUP BY providerId, providerName ORDER BY total DESC, providerName`).all(workspaceId);
    const numeric = (row) => ({ ...row, calls: Number(row.calls || 0), total: Number(row.total || 0),
      allowed: Number(row.allowed || 0), denied: Number(row.denied || 0), units: Number(row.units || 0),
      averageLatencyMs: row.averageLatencyMs === null ? null : Number(row.averageLatencyMs) });
    return { source: "gateway_observed", range, bucketHours: config.bucketHours, bucketCount: config.bucketCount,
      capturedAt: new Date().toISOString(), trend: trend.map(numeric), providers: providers.map(numeric) };
  }

  return {
    dbPath,
    listUsers: () => statements.listUsers.all(),
    findUser: (id) => statements.findUser.get(id) || null,
    listProviders,
    listCapabilities: (id) => statements.capabilities.all(id).map((row) => ({
      id: row.id, label: row.label, primary: row.primaryProvider, fallback: row.fallbackProvider,
      apps: row.applicationCount, state: row.state, description: row.description || "Legacy capability contract",
      primaryProviderId: row.primaryProviderId, fallbackProviderId: row.fallbackProviderId,
      inputContract: row.inputContract ? JSON.parse(row.inputContract) : { type: "object" },
      outputContract: row.outputContract ? JSON.parse(row.outputContract) : { type: "object" },
      dataClassification: row.dataClassification || "internal", retentionPolicy: row.retentionPolicy || "metadata_only",
    })),
    listApplications: (id) => statements.applications.all(id).map((row) => ({
      id: row.id, name: row.name, environment: row.environment, capabilities: row.capabilityCount,
      spend: row.spend, budget: row.budget, agents: row.agentCount, state: row.state,
    })),
    listAgents: (id) => statements.agents.all(id).map((row) => ({
      id: row.id, name: row.name, applicationId: row.applicationId, grants: row.grantCount,
      expires: row.expires, state: row.state,
    })),
    listAudits: (id) => statements.audits.all(id),
    listCredentials: (id) => statements.credentials.all(id),
    findCredentialEnvelope: (workspaceId, providerId, environment) => {
      const row = statements.credentialEnvelope.get(workspaceId, providerId, environment);
      if (!row || row.status !== "configured" || !row.ciphertext || row.encryptionVersion !== 1) return null;
      return row;
    },
    listApplicationTokens: (id) => statements.applicationTokens.all(id),
    listAgentTokens: (id) => statements.agentTokens.all(id),
    listGrants: (id) => statements.grants.all(id).map(mapContractGrant),
    listInvocations: (id, limit = 50) => statements.invocations.all(id, Math.min(200, Math.max(1, limit))),
    usageAnalytics: (workspaceId) => {
      const peaks = new Map(statements.applicationPeaks.all(workspaceId).map((item) => [item.applicationId, item.peakRpm]));
      const normalize = (item) => ({ ...item, total: Number(item.total || 0), allowed: Number(item.allowed || 0),
        denied: Number(item.denied || 0), units: Number(item.units || 0),
        averageLatencyMs: item.averageLatencyMs === null ? null : Math.round(Number(item.averageLatencyMs)) });
      return {
        source: "gateway_observed",
        window: "utc_day",
        capturedAt: new Date().toISOString(),
        workspace: { ...normalize(statements.workspaceUsage.get(workspaceId)), replays: Number(statements.idempotencyReplaySummary.get(workspaceId).replays || 0) },
        applications: statements.applicationUsage.all(workspaceId).map((item) => ({ ...normalize(item), peakRpm: Number(peaks.get(item.applicationId) || 0) })),
        capabilities: statements.capabilityUsage.all(workspaceId).map(normalize),
        agents: statements.agentUsage.all(workspaceId).map(normalize),
      };
    },
    usageAnalyticsRange,
    claimIdempotency: ({ workspaceId, identityType, identityId, keyHash, requestFingerprint, expiresAt }) => {
      statements.pruneIdempotency.run();
      const inserted = statements.insertIdempotency.run(workspaceId, identityType, identityId, keyHash, requestFingerprint, expiresAt);
      const record = statements.idempotency.get(workspaceId, identityType, identityId, keyHash);
      return { owned: inserted.changes === 1, record };
    },
    markIdempotencyReplay: ({ workspaceId, identityType, identityId, keyHash }) =>
      statements.markIdempotencyReplay.run(workspaceId, identityType, identityId, keyHash),
    listIdempotency: (workspaceId, limit = 100) => statements.idempotencyInventory.all(workspaceId, Math.min(200, Math.max(1, limit))),
    listMetricHistory: (id, limit = 100) => statements.metricHistory.all(id, Math.min(500, Math.max(1, limit))),
    listAlerts: (id, status = "open", limit = 100) => statements.alerts.all(id, status, status, Math.min(500, Math.max(1, limit))),
    listCapabilityProposals: (id) => statements.capabilityProposals.all(id).map(mapProposal),
    accountCount: () => statements.accountCount.get().count,
    findAccountByUsername: (username) => statements.accountByUsername.get(username) || null,
    createAccount: ({ workspaceId, username, passwordSalt, passwordHash }) =>
      statements.insertAccount.run(workspaceId, username, passwordSalt, passwordHash).lastInsertRowid,
    createSession: ({ tokenHash, sessionId, accountId, csrfHash, expiresAt, deviceLabel, clientHash }) => {
      statements.deleteExpiredSessions.run();
      db.exec("BEGIN IMMEDIATE");
      try {
        statements.insertSession.run(tokenHash, accountId, csrfHash, expiresAt);
        statements.insertSessionMetadata.run(sessionId, tokenHash, deviceLabel, clientHash);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    findSession: (tokenHash) => {
      const session = statements.session.get(tokenHash) || null;
      if (session) statements.touchSession.run(tokenHash);
      return session;
    },
    listSessions: (accountId) => statements.sessionsForAccount.all(accountId),
    revokeSession: ({ accountId, sessionId }) => {
      const item = statements.sessionForAccount.get(accountId, sessionId);
      if (!item) throw new Error("Session not found.");
      statements.deleteSession.run(item.tokenHash);
      return item.tokenHash;
    },
    failedLoginCount: (loginKeyHash) => {
      statements.pruneLoginFailures.run();
      return statements.failedLoginCount.get(loginKeyHash).count;
    },
    recordLoginFailure: (loginKeyHash) => statements.insertLoginFailure.run(loginKeyHash),
    clearLoginFailures: (loginKeyHash) => statements.clearLoginFailures.run(loginKeyHash),
    changePasswordAndRevokeSessions: ({ accountId, passwordSalt, passwordHash, workspaceId, actor }) => {
      db.exec("BEGIN IMMEDIATE");
      try {
        statements.updatePassword.run(passwordSalt, passwordHash, accountId);
        statements.deleteAccountSessions.run(accountId);
        statements.insertAudit.run(workspaceId, "Now", actor, "Changed administrator password", "Recorded", "All control-plane sessions revoked");
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    deleteSession: (tokenHash) => statements.deleteSession.run(tokenHash),
    updateSessionCsrf: (tokenHash, csrfHash) => statements.updateSessionCsrf.run(csrfHash, tokenHash),
    storeCredentialCiphertext: ({ workspaceId, providerId, ciphertext, fingerprint, actor }) => {
      db.exec("BEGIN IMMEDIATE");
      try {
        const result = statements.updateCredential.run(ciphertext, 1, fingerprint, workspaceId, providerId);
        if (result.changes !== 1) throw new Error("Provider credential record not found.");
        statements.insertAudit.run(workspaceId, "Now", actor, "Rotated provider credential", "Recorded",
          `${providerId} credential encrypted server-side; fingerprint ${fingerprint}`);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    createProvider: ({ workspaceId, id, name, category, website, docs, consoleUrl, apiBase, environment,
      ciphertext, fingerprint, quotaRemaining, quotaUnit, quotaSource, actor }) => {
      db.exec("BEGIN IMMEDIATE");
      try {
        statements.insertProvider.run(workspaceId, id, name, category, website, docs, consoleUrl, apiBase);
        statements.insertCredential.run(workspaceId, `credential-${id}`, id, `${name} ${environment}`,
          fingerprint, environment, ciphertext);
        statements.insertQuota.run(workspaceId, id, 100 - quotaRemaining, quotaRemaining, quotaUnit, quotaSource);
        const snapshot = statements.insertMetricHistory.run(workspaceId, id, 100 - quotaRemaining, quotaRemaining,
          quotaUnit, quotaSource, 0, 0);
        applyMetricAlerts(statements, { workspaceId, providerId: id, providerName: name, remaining: quotaRemaining,
          source: quotaSource, snapshotId: snapshot.lastInsertRowid });
        statements.insertAudit.run(workspaceId, "Now", actor, "Registered provider", "Recorded",
          `${id} · ${category} · ${environment} · credential ${fingerprint}`);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    recordProviderMetrics: ({ workspaceId, providerId, remaining, unit, source, monthCost, peakRpm, actor }) => {
      const provider = statements.providerExists.get(workspaceId, providerId);
      if (!provider) throw new Error("Provider not found.");
      db.exec("BEGIN IMMEDIATE");
      try {
        statements.updateProviderMetrics.run(monthCost, peakRpm, remaining, workspaceId, providerId);
        const quota = statements.updateQuota.run(100 - remaining, remaining, unit, source, workspaceId, providerId);
        if (quota.changes !== 1) throw new Error("Provider quota record not found.");
        const snapshot = statements.insertMetricHistory.run(workspaceId, providerId, 100 - remaining, remaining,
          unit, source, monthCost, peakRpm);
        applyMetricAlerts(statements, { workspaceId, providerId, providerName: provider.name, remaining,
          source, snapshotId: snapshot.lastInsertRowid });
        statements.insertAudit.run(workspaceId, "Now", actor, "Recorded provider metrics", "Recorded",
          `${providerId} · ${remaining}% remaining · ${peakRpm} peak rpm · ${source}`);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    createCapabilityProposal: ({ workspaceId, capabilityId, label, description, primaryProviderId,
      fallbackProviderId, inputContract, outputContract, dataClassification, retentionPolicy, actor }) => {
      if (!statements.providerForContract.get(workspaceId, primaryProviderId)) throw new Error("Primary provider not found.");
      if (fallbackProviderId && !statements.providerForContract.get(workspaceId, fallbackProviderId)) throw new Error("Fallback provider not found.");
      statements.insertCapabilityProposal.run(workspaceId, capabilityId, label, description, primaryProviderId,
        fallbackProviderId || null, JSON.stringify(inputContract), JSON.stringify(outputContract),
        dataClassification, retentionPolicy, actor);
      statements.insertAudit.run(workspaceId, "Now", actor, "Proposed capability contract", "Candidate",
        `${capabilityId} · ${primaryProviderId} · explicit activation required`);
    },
    activateCapabilityProposal: ({ workspaceId, capabilityId, actor }) => {
      const proposal = statements.capabilityProposal.get(workspaceId, capabilityId);
      if (!proposal || proposal.status !== "candidate") throw new Error("Candidate capability proposal not found.");
      db.exec("BEGIN IMMEDIATE");
      try {
        statements.insertActivatedCapability.run(workspaceId, proposal.capabilityId, proposal.label,
          proposal.primaryProviderId, proposal.fallbackProviderId || "None");
        statements.insertCapabilityContract.run(workspaceId, proposal.capabilityId, proposal.description,
          proposal.primaryProviderId, proposal.fallbackProviderId || null, proposal.inputContract,
          proposal.outputContract, proposal.dataClassification, proposal.retentionPolicy);
        const updated = statements.activateCapabilityProposal.run(workspaceId, capabilityId);
        if (updated.changes !== 1) throw new Error("Capability proposal activation conflict.");
        statements.insertAudit.run(workspaceId, "Now", actor, "Activated capability contract", "Activated",
          `${capabilityId} · now available for explicit application grants`);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    createApplicationToken: ({ workspaceId, applicationId, tokenHash, tokenId, label, prefix, fingerprint, expiresAt, actor }) => {
      if (!statements.application.get(workspaceId, applicationId)) throw new Error("Application not found.");
      statements.insertApplicationToken.run(tokenHash, tokenId, workspaceId, applicationId, label, prefix, fingerprint, expiresAt || null);
      statements.insertAudit.run(workspaceId, "Now", actor, "Issued application token", "Recorded",
        `${applicationId} · ${label} · ${fingerprint}`);
    },
    createApplication: ({ workspaceId, id, name, environment, budget, capabilityIds = [], actor }) => {
      db.exec("BEGIN IMMEDIATE");
      try {
        capabilityIds.forEach((capabilityId) => {
          if (!statements.capability.get(workspaceId, capabilityId)) throw new Error(`Capability not found: ${capabilityId}`);
        });
        statements.insertApplication.run(workspaceId, id, name, environment, budget);
        capabilityIds.forEach((capabilityId) => statements.upsertGrant.run(workspaceId, id, capabilityId, 30, 1000, 1));
        statements.updateApplicationGrantCount.run(workspaceId, id);
        statements.insertAudit.run(workspaceId, "Now", actor, "Registered application", "Recorded",
          `${id} · ${environment} · budget ${budget} · ${capabilityIds.length} grants`);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    setCapabilityGrant: ({ workspaceId, applicationId, capabilityId, rpmLimit, dailyLimit, enabled, actor }) => {
      if (!statements.application.get(workspaceId, applicationId)) throw new Error("Application not found.");
      if (!statements.capability.get(workspaceId, capabilityId)) throw new Error("Capability not found.");
      db.exec("BEGIN IMMEDIATE");
      try {
        statements.upsertGrant.run(workspaceId, applicationId, capabilityId, rpmLimit, dailyLimit, enabled ? 1 : 0);
        statements.updateApplicationGrantCount.run(workspaceId, applicationId);
        statements.insertAudit.run(workspaceId, "Now", actor, enabled ? "Granted application capability" : "Revoked application capability", "Recorded",
          `${applicationId} · ${capabilityId} · ${rpmLimit} rpm · ${dailyLimit} daily`);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    revokeApplicationToken: ({ workspaceId, tokenId, actor }) => {
      const result = statements.revokeApplicationToken.run(workspaceId, tokenId);
      if (result.changes !== 1) throw new Error("Active application token not found.");
      statements.insertAudit.run(workspaceId, "Now", actor, "Revoked application token", "Recorded", tokenId);
    },
    findApplicationToken: (tokenHash) => statements.applicationTokenByHash.get(tokenHash) || null,
    touchApplicationToken: (tokenHash) => statements.touchApplicationToken.run(tokenHash),
    createAgent: ({ workspaceId, id, name, applicationId, capabilityIds, expiresAt, actor }) => {
      if (!statements.application.get(workspaceId, applicationId)) throw new Error("Application not found.");
      db.exec("BEGIN IMMEDIATE");
      try {
        capabilityIds.forEach((capabilityId) => {
          if (!statements.applicationEnabledGrant.get(workspaceId, applicationId, capabilityId)) {
            throw new Error(`Capability is not granted to the application: ${capabilityId}`);
          }
        });
        statements.insertAgent.run(workspaceId, id, name, applicationId, capabilityIds.length, expiresAt);
        capabilityIds.forEach((capabilityId) => statements.insertAgentGrant.run(workspaceId, id, capabilityId));
        statements.updateApplicationAgentCount.run(workspaceId, applicationId);
        statements.insertAudit.run(workspaceId, "Now", actor, "Registered delegated agent", "Recorded",
          `${id} · ${applicationId} · ${capabilityIds.length} grants · expires ${expiresAt}`);
        db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    },
    createAgentToken: ({ workspaceId, agentId, tokenHash, tokenId, label, prefix, fingerprint, expiresAt, actor }) => {
      const agent = statements.agent.get(workspaceId, agentId);
      if (!agent || agent.state !== "active") throw new Error("Active agent not found.");
      statements.insertAgentToken.run(tokenHash, tokenId, workspaceId, agentId, label, prefix, fingerprint, expiresAt);
      statements.insertAudit.run(workspaceId, "Now", actor, "Issued agent token", "Recorded", `${agentId} · ${label} · ${fingerprint}`);
    },
    revokeAgentToken: ({ workspaceId, tokenId, actor }) => {
      const result = statements.revokeAgentToken.run(workspaceId, tokenId);
      if (result.changes !== 1) throw new Error("Active agent token not found.");
      statements.insertAudit.run(workspaceId, "Now", actor, "Revoked agent token", "Recorded", tokenId);
    },
    findAgentToken: (tokenHash) => statements.agentTokenByHash.get(tokenHash) || null,
    touchAgentToken: (tokenHash) => statements.touchAgentToken.run(tokenHash),
    agentCapabilityIds: (workspaceId, agentId) => statements.agentCapabilityIds.all(workspaceId, agentId).map((item) => item.capabilityId),
    agentHasGrant: (workspaceId, agentId, capabilityId) => Boolean(statements.agentCapabilityIds.all(workspaceId, agentId).some((item) => item.capabilityId === capabilityId)),
    findGrant: (workspaceId, applicationId, capabilityId) => {
      const row = statements.grant.get(workspaceId, applicationId, capabilityId);
      return row ? mapContractGrant(row) : null;
    },
    usageForPolicy: (workspaceId, applicationId, capabilityId) => ({
      minute: statements.minuteUsage.get(workspaceId, applicationId, capabilityId).count,
      day: statements.dailyUsage.get(workspaceId, applicationId, capabilityId).count,
    }),
    recordInvocation: (item, idempotency = null) => {
      db.exec("BEGIN IMMEDIATE");
      try {
        statements.insertInvocation.run(item.requestId, item.workspaceId, item.applicationId,
          item.capabilityId, item.tokenId, item.decision, item.reason, item.providerRoute || null,
          item.executionMode, item.units || 0, item.latencyMs || 0, item.identityType || "application", item.agentId || null);
        if (idempotency) {
          const completed = statements.completeIdempotency.run(item.requestId, idempotency.responseStatus,
            JSON.stringify(idempotency.responseBody), item.workspaceId, item.identityType || "application",
            idempotency.identityId, idempotency.keyHash);
          if (completed.changes !== 1) throw new Error("Idempotency completion conflict.");
        }
        db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    },
    websiteVault: require('./website-vault').createWebsiteVault(db),
    createWebsiteLogin: key => require('./website-login').createWebsiteLogin(db, key),
    close: () => db.close(),
  };
}

function ensureColumn(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function seedIfEmpty(db, seed) {
  const count = db.prepare("SELECT COUNT(*) AS count FROM workspaces").get().count;
  if (count) return;

  const insertWorkspace = db.prepare("INSERT INTO workspaces (id, name, initials, role, plan, region) VALUES (?, ?, ?, ?, ?, ?)");
  const insertProvider = db.prepare(`INSERT INTO providers
    (workspace_id, id, name, category, website, docs_url, console_url, api_base_url, health, month_cost, peak_rpm)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertCredential = db.prepare(`INSERT INTO credentials
    (workspace_id, id, provider_id, label, status, fingerprint, environment) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const insertQuota = db.prepare(`INSERT INTO quota_snapshots
    (workspace_id, provider_id, used, remaining, unit, source, freshness) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const insertCapability = db.prepare(`INSERT INTO capabilities
    (workspace_id, id, label, primary_provider, fallback_provider, application_count, state) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const insertApplication = db.prepare(`INSERT INTO applications
    (workspace_id, id, name, environment, capability_count, spend, budget, agent_count, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertAgent = db.prepare(`INSERT INTO agents
    (workspace_id, id, name, application_id, grant_count, expires, state) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const insertAudit = db.prepare(`INSERT INTO audit_events
    (workspace_id, display_time, actor, action, outcome, detail) VALUES (?, ?, ?, ?, ?, ?)`);

  db.exec("BEGIN IMMEDIATE");
  try {
    seed.users.forEach((item) => insertWorkspace.run(item.id, item.name, item.initials, item.role, item.plan, item.region));
    seed.providers.forEach((item) => {
      insertProvider.run(item.userId, item.id, item.name, item.category, item.website, item.docs, item.console, item.apiBase,
        item.health, item.monthCost, Number.parseInt(item.peak, 10) || 0);
      insertCredential.run(item.userId, `credential-${item.id}`, item.id, `${item.name} ${item.credential.environment}`,
        item.credential.status, item.credential.fingerprint, item.credential.environment);
      insertQuota.run(item.userId, item.id, item.quota.used, item.quota.remaining, item.quota.unit, item.quota.source, item.quota.fresh);
    });
    seed.capabilities.forEach((item) => insertCapability.run(item.userId, item.id, item.label, item.primary, item.fallback, item.apps, item.state));
    seed.applications.forEach((item) => insertApplication.run(item.userId, item.id, item.name, item.environment,
      item.capabilities, item.spend, item.budget, item.agents, item.state));
    seed.agents.forEach((item) => insertAgent.run(item.userId, item.id, item.name, item.applicationId, item.grants, item.expires, item.state));
    seed.audits.forEach((item) => insertAudit.run(item.userId, item.time, item.actor, item.action, item.outcome, item.detail));
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function applyMetricAlerts(statements, { workspaceId, providerId, providerName, remaining, source, snapshotId }) {
  function upsert(kind, severity, message) {
    const updated = statements.updateOpenAlert.run(severity, message, snapshotId, workspaceId, providerId, kind);
    if (updated.changes === 0) statements.openAlert.run(workspaceId, providerId, kind, severity, message, snapshotId);
  }
  if (remaining <= 20) {
    upsert("quota_low", remaining <= 10 ? "critical" : "warning", `${providerName} has ${remaining}% remaining`);
  } else {
    statements.resolveAlert.run(workspaceId, providerId, "quota_low");
  }
  if (source === "unknown") {
    upsert("quota_source_unknown", "info", `${providerName} quota source is unknown`);
  } else {
    statements.resolveAlert.run(workspaceId, providerId, "quota_source_unknown");
  }
}

function parseContractJson(value) {
  return value ? JSON.parse(value) : { type: "object" };
}

function mapContractGrant(row) {
  return {
    ...row,
    inputContract: parseContractJson(row.inputContract),
    outputContract: parseContractJson(row.outputContract),
    dataClassification: row.dataClassification || "internal",
    retentionPolicy: row.retentionPolicy || "metadata_only",
  };
}

function mapProposal(row) {
  return {
    ...row,
    inputContract: parseContractJson(row.inputContract),
    outputContract: parseContractJson(row.outputContract),
  };
}

function seedMetricHistoryIfEmpty(db) {
  const count = db.prepare("SELECT COUNT(*) AS count FROM provider_metric_history").get().count;
  if (count) return;
  db.exec(`
    INSERT INTO provider_metric_history
      (workspace_id, provider_id, used, remaining, unit, source, month_cost, peak_rpm, captured_at)
    SELECT p.workspace_id, p.id, q.used, q.remaining, q.unit, q.source, p.month_cost, p.peak_rpm, q.captured_at
    FROM providers p JOIN quota_snapshots q ON q.workspace_id = p.workspace_id AND q.provider_id = p.id;

    INSERT INTO alerts (workspace_id, provider_id, kind, severity, status, message, source_snapshot_id)
    SELECT h.workspace_id, h.provider_id, 'quota_low',
      CASE WHEN h.remaining <= 10 THEN 'critical' ELSE 'warning' END, 'open',
      p.name || ' has ' || h.remaining || '% remaining', h.id
    FROM provider_metric_history h JOIN providers p ON p.workspace_id = h.workspace_id AND p.id = h.provider_id
    WHERE h.remaining <= 20;

    INSERT INTO alerts (workspace_id, provider_id, kind, severity, status, message, source_snapshot_id)
    SELECT h.workspace_id, h.provider_id, 'quota_source_unknown', 'info', 'open',
      p.name || ' quota source is unknown', h.id
    FROM provider_metric_history h JOIN providers p ON p.workspace_id = h.workspace_id AND p.id = h.provider_id
    WHERE h.source = 'unknown';
  `);
}

function seedCapabilityContractsIfEmpty(db) {
  const count = db.prepare("SELECT COUNT(*) AS count FROM capability_contracts").get().count;
  if (count) return;
  db.exec(`
    INSERT INTO capability_contracts
      (workspace_id, capability_id, description, primary_provider_id, fallback_provider_id,
       input_contract, output_contract, data_classification, retention_policy)
    SELECT c.workspace_id, c.id, 'Seeded capability contract',
      (SELECT p.id FROM providers p WHERE p.workspace_id = c.workspace_id AND lower(p.name) = lower(c.primary_provider) LIMIT 1),
      (SELECT p.id FROM providers p WHERE p.workspace_id = c.workspace_id AND lower(p.name) = lower(c.fallback_provider) LIMIT 1),
      '{"type":"object","additionalProperties":true}',
      '{"type":"object","additionalProperties":true}',
      'internal', 'metadata_only'
    FROM capabilities c;
  `);
}

function seedMissingSessionMetadata(db) {
  const missing = db.prepare(`SELECT s.token_hash AS tokenHash FROM auth_sessions s
    LEFT JOIN auth_session_metadata m ON m.token_hash = s.token_hash WHERE m.token_hash IS NULL`).all();
  if (!missing.length) return;
  const insert = db.prepare(`INSERT INTO auth_session_metadata
    (session_id, token_hash, device_label, client_hash) VALUES (?, ?, 'Legacy local session', ?)`);
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const item of missing) insert.run(crypto.randomUUID(), item.tokenHash, crypto.randomBytes(32).toString("hex"));
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function seedControlPlaneIfEmpty(db, seed) {
  const count = db.prepare("SELECT COUNT(*) AS count FROM application_capability_grants").get().count;
  if (count) return;
  const insert = db.prepare(`INSERT OR IGNORE INTO application_capability_grants
    (workspace_id, application_id, capability_id, rpm_limit, daily_limit, enabled)
    VALUES (?, ?, ?, ?, ?, 1)`);
  const capabilitiesByWorkspace = new Map();
  for (const capability of seed.capabilities) {
    const items = capabilitiesByWorkspace.get(capability.userId) || [];
    items.push(capability.id);
    capabilitiesByWorkspace.set(capability.userId, items);
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const application of seed.applications) {
      const available = capabilitiesByWorkspace.get(application.userId) || [];
      const selected = available.slice(0, Math.min(application.capabilities, available.length));
      selected.forEach((capabilityId) => insert.run(application.userId, application.id, capabilityId, 30, 1000));
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

module.exports = { createDatabase };
