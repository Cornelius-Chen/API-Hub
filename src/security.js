const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const SESSION_MS = 8 * 60 * 60 * 1000;

function hashToken(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hashPassword(password, salt = crypto.randomBytes(16)) {
  return { salt, hash: crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }) };
}

function verifyPassword(password, salt, expected) {
  const actual = hashPassword(password, salt).hash;
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function createSessionTokens() {
  const token = crypto.randomBytes(32).toString("base64url");
  const { csrf, csrfHash } = createCsrfToken();
  return {
    token,
    tokenHash: hashToken(token),
    sessionId: crypto.randomUUID(),
    csrf,
    csrfHash,
    expiresAt: new Date(Date.now() + SESSION_MS).toISOString(),
  };
}

function createCsrfToken() {
  const csrf = crypto.randomBytes(24).toString("base64url");
  return { csrf, csrfHash: hashToken(csrf) };
}

function createApplicationToken(environment = "development") {
  const environmentPrefix = environment === "production" ? "live" : environment === "sandbox" ? "test" : "dev";
  const token = `ah_${environmentPrefix}_${crypto.randomBytes(32).toString("base64url")}`;
  return {
    token,
    tokenHash: hashToken(token),
    tokenId: crypto.randomUUID(),
    prefix: token.slice(0, 12),
    fingerprint: `sha256:${hashToken(token).slice(0, 12)}`,
  };
}

function createAgentToken() {
  const token = `ah_agent_${crypto.randomBytes(32).toString("base64url")}`;
  return {
    token,
    tokenHash: hashToken(token),
    tokenId: crypto.randomUUID(),
    prefix: token.slice(0, 14),
    fingerprint: `sha256:${hashToken(token).slice(0, 12)}`,
  };
}

function readCookie(header, name) {
  const prefix = `${name}=`;
  return String(header || "").split(";").map((part) => part.trim())
    .find((part) => part.startsWith(prefix))?.slice(prefix.length) || null;
}

function sessionCookie(token, secure = false) {
  return `api_hub_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${secure ? "; Secure" : ""}`;
}

function expiredSessionCookie(secure = false) {
  return `api_hub_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure ? "; Secure" : ""}`;
}

function ensureVaultKey(keyPath) {
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  if (!fs.existsSync(keyPath)) {
    fs.writeFileSync(keyPath, crypto.randomBytes(32), { flag: "wx", mode: 0o600 });
  }
  const key = fs.readFileSync(keyPath);
  if (key.length !== 32) throw new Error("Vault key must be exactly 32 bytes.");
  return key;
}

function encryptSecret(secret, key, context) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const envelope = Buffer.from(JSON.stringify({
    v: 1,
    alg: "A256GCM",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  }));
  const fingerprint = `sha256:${crypto.createHash("sha256").update(secret).digest("hex").slice(0, 12)}`;
  return { envelope, fingerprint };
}

function decryptSecret(envelope, key, context) {
  try {
    const parsed = JSON.parse(Buffer.from(envelope).toString("utf8"));
    if (parsed.v !== 1 || parsed.alg !== "A256GCM") throw new Error("Unsupported envelope");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(parsed.iv, "base64"));
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(parsed.data, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Credential envelope could not be decrypted.");
  }
}

module.exports = {
  createAgentToken,
  createApplicationToken,
  createCsrfToken,
  createSessionTokens,
  decryptSecret,
  encryptSecret,
  ensureVaultKey,
  expiredSessionCookie,
  hashPassword,
  hashToken,
  readCookie,
  sessionCookie,
  verifyPassword,
};
