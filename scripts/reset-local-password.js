'use strict';
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const { hashPassword } = require('../src/security');

// Local OS-authorized recovery only. No network route, old hash read, or vault access.
function reset(dbPath, username, password) {
  if (typeof password !== 'string' || password.length < 6 || password.length > 128) throw new Error('Invalid password length');
  if (!fs.existsSync(dbPath)) throw new Error('Database not found');
  const db = new DatabaseSync(dbPath);
  try {
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; BEGIN IMMEDIATE');
    const account = db.prepare('SELECT id, workspace_id FROM auth_accounts WHERE username=?').get(username);
    if (!account) throw new Error('Account not found');
    const next = hashPassword(password);
    db.prepare('UPDATE auth_accounts SET password_salt=?, password_hash=? WHERE id=?').run(next.salt, next.hash, account.id);
    db.prepare('DELETE FROM auth_sessions WHERE account_id=?').run(account.id);
    db.prepare('INSERT INTO audit_events (workspace_id, display_time, actor, action, outcome, detail) VALUES (?, ?, ?, ?, ?, ?)')
      .run(account.workspace_id, 'Now', username, 'Local administrator password recovery', 'Recorded', 'User submitted replacement; control-plane sessions revoked; provider credentials unchanged');
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  } finally { db.close(); }
}
module.exports = { reset };
if (require.main === module) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; if (input.length > 4096) process.exit(1); });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input); input = '';
      reset(path.resolve(__dirname, '../data/runtime/api-hub.sqlite'), 'corneliuschen', data.password);
      data.password = '';
      process.stdout.write('RESET_OK');
    } catch { process.stderr.write('Reset failed; no password or internal details are logged.'); process.exitCode = 1; }
  });
}
