// Separate namespace from API providers. No plaintext read/decrypt interface.
function createWebsiteVault(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS website_default_credentials (
    workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id),
    ciphertext BLOB NOT NULL,
    enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) STRICT`);
  return {
    status(workspace) {
      const row = db.prepare('SELECT enabled, updated_at AS updatedAt FROM website_default_credentials WHERE workspace_id=?').get(workspace);
      return { configured: Boolean(row), enabled: Boolean(row?.enabled), updatedAt: row?.updatedAt || null, automaticLogin: false };
    },
    save(workspace, ciphertext, actor) {
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare(`INSERT INTO website_default_credentials(workspace_id,ciphertext,enabled) VALUES(?,?,1)
          ON CONFLICT(workspace_id) DO UPDATE SET ciphertext=excluded.ciphertext, enabled=1, updated_at=CURRENT_TIMESTAMP`).run(workspace,ciphertext);
        db.prepare('INSERT INTO audit_events(workspace_id,display_time,actor,action,outcome,detail) VALUES(?,?,?,?,?,?)')
          .run(workspace,'Now',actor,'Saved default website credential','Recorded','Encrypted; no automatic website permission granted');
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      return this.status(workspace);
    },
    disable(workspace, actor) {
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('UPDATE website_default_credentials SET enabled=0, updated_at=CURRENT_TIMESTAMP WHERE workspace_id=?').run(workspace);
        db.prepare('INSERT INTO audit_events(workspace_id,display_time,actor,action,outcome,detail) VALUES(?,?,?,?,?,?)')
          .run(workspace,'Now',actor,'Disabled default website credential','Recorded','No plaintext returned');
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      return this.status(workspace);
    }
  };
}
module.exports = { createWebsiteVault };
