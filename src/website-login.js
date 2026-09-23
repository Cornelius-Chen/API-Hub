'use strict';
const crypto = require('node:crypto');
const { encryptSecret, decryptSecret } = require('./security');
function originOf(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.origin === 'null') throw new Error('HTTPS origin required');
  return url.origin;
}
function createWebsiteLogin(db, key) {
  db.exec(`CREATE TABLE IF NOT EXISTS website_accounts (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id), origin TEXT NOT NULL,
    username TEXT NOT NULL, ciphertext BLOB NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(workspace_id,origin,username)
  ) STRICT`);
  // Short-lived candidate snapshots never reach disk before success confirmation.
  const attempts = new Map();
  const context = (w,o,u) => JSON.stringify(['website-account-v1',w,o,u]);
  const audit = (w, actor, action, origin) => db.prepare('INSERT INTO audit_events(workspace_id,display_time,actor,action,outcome,detail) VALUES(?,?,?,?,?,?)')
    .run(w,'Now',actor,action,'Recorded',origin);
  function prune() { for (const [id,a] of attempts) if (a.expires <= Date.now()) attempts.delete(id); }
  return {
    list(w) { return db.prepare('SELECT origin,username,enabled,updated_at AS updatedAt FROM website_accounts WHERE workspace_id=?').all(w); },
    begin(w, actor, body) {
      prune();
      const origin = originOf(body.origin);
      if (body.confirmOrigin !== origin) throw new Error('Confirm exact origin');
      const username = String(body.username || '').trim();
      if (!username || username.length > 254) throw new Error('Username required');
      if (attempts.size >= 100) throw new Error('Too many pending attempts');
      const publicKey = crypto.createPublicKey({ key: body.publicKey, format:'jwk' });
      if (publicKey.asymmetricKeyType !== 'rsa' || publicKey.asymmetricKeyDetails.modulusLength < 4096) throw new Error('RSA-4096 key required');
      const saved = db.prepare('SELECT ciphertext,enabled FROM website_accounts WHERE workspace_id=? AND origin=? AND username=?').get(w,origin,username);
      let secret, source;
      if (body.manualSecret !== undefined) {
        if (typeof body.manualSecret !== 'string' || !body.manualSecret.length || body.manualSecret.length > 128) throw new Error('Invalid user password');
        secret = body.manualSecret; source = 'user';
      } else if (saved) {
        if (!saved.enabled) throw new Error('Saved account disabled; user action required');
        secret = decryptSecret(saved.ciphertext,key,context(w,origin,username)); source = 'saved';
      } else {
        const fallback = db.prepare('SELECT ciphertext,enabled FROM website_default_credentials WHERE workspace_id=?').get(w);
        if (!fallback?.enabled) throw new Error('No enabled default; user action required');
        secret = decryptSecret(fallback.ciphertext,key,`${w}:website-default:v1`); source = 'default';
      }
      const id = crypto.randomUUID();
      const snapshot = encryptSecret(secret,key,context(w,origin,username)).envelope;
      const sealed = crypto.publicEncrypt({key:publicKey,oaepHash:'sha256',padding:crypto.constants.RSA_PKCS1_OAEP_PADDING}, Buffer.from(secret,'utf8')).toString('base64');
      secret = '';
      attempts.set(id,{w,origin,username,snapshot,source,expires:Date.now()+300000});
      audit(w,actor,'Prepared one website fill',origin);
      return { attemptId:id, origin, username, source, sealed, expiresInSeconds:300 };
    },
    finish(w,actor,body) {
      prune(); const a = attempts.get(body.attemptId);
      if (!a || a.w !== w) throw new Error('Attempt missing or expired');
      if (originOf(body.origin) !== a.origin) throw new Error('Origin mismatch');
      if (body.success !== true && body.success !== false) throw new Error('Outcome required');
      if (body.success && body.confirm !== 'LOGIN_CONFIRMED') throw new Error('Explicit success confirmation required');
      if (body.success && a.source === 'default' && !db.prepare('SELECT enabled FROM website_default_credentials WHERE workspace_id=?').get(w)?.enabled) throw new Error('Default disabled');
      if (body.success) {
        db.exec('BEGIN IMMEDIATE');
        try {
          db.prepare(`INSERT INTO website_accounts(workspace_id,origin,username,ciphertext,enabled) VALUES(?,?,?,?,1)
            ON CONFLICT(workspace_id,origin,username) DO UPDATE SET ciphertext=excluded.ciphertext,enabled=1,updated_at=CURRENT_TIMESTAMP`).run(w,a.origin,a.username,a.snapshot);
          audit(w,actor,'Confirmed website login and saved account',a.origin); db.exec('COMMIT');
        } catch(e) { db.exec('ROLLBACK'); throw e; }
      } else audit(w,actor,'Website login stopped without saving',a.origin);
      attempts.delete(body.attemptId);
      return {ok:true,saved:body.success};
    },
    disable(w,actor,body) {
      const origin = originOf(body.origin);
      db.prepare('UPDATE website_accounts SET enabled=0 WHERE workspace_id=? AND origin=? AND username=?').run(w,origin,body.username);
      for(const [id,a] of attempts) if(a.w===w && a.origin===origin && a.username===body.username) attempts.delete(id);
      audit(w,actor,'Disabled website account',origin); return {ok:true};
    }
  };
}
module.exports = {createWebsiteLogin,originOf};
