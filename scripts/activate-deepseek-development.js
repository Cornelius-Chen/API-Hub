const fs = require("node:fs");
const path = require("node:path");
const { createDatabase } = require("../src/database.js");
const { createApplicationToken, encryptSecret, ensureVaultKey } = require("../src/security.js");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function readEnvSecret(filePath, variable) {
  const source = fs.readFileSync(filePath, "utf8");
  const line = source.split(/\r?\n/).find((item) => item.trimStart().startsWith(`${variable}=`));
  if (!line) throw new Error(`${variable} was not found in the source environment file.`);
  let value = line.slice(line.indexOf("=") + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  if (value.length < 8 || /\s/.test(value)) throw new Error(`${variable} is not a valid non-empty credential.`);
  return value;
}

function atomicWrite(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, content, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporary, filePath);
}

function upsertEnv(filePath, values) {
  const lines = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8").split(/\r?\n/) : [];
  const remaining = lines.filter((line) => !Object.keys(values).some((key) => line.startsWith(`${key}=`)));
  while (remaining.length && remaining[remaining.length - 1] === "") remaining.pop();
  if (remaining.length) remaining.push("");
  remaining.push("# API Hub development identity (server-side only; never expose to browser code)");
  for (const [key, value] of Object.entries(values)) remaining.push(`${key}=${value}`);
  remaining.push("");
  atomicWrite(filePath, remaining.join("\n"));
}

function main() {
  const sourceEnv = path.resolve(argument("--source-env") || "");
  const targetEnv = path.resolve(argument("--target-env") || "");
  const root = path.resolve(__dirname, "..");
  if (!argument("--source-env") || !argument("--target-env")) throw new Error("--source-env and --target-env are required.");
  const dbPath = path.join(root, "data", "runtime", "api-hub.sqlite");
  const vaultKeyPath = path.join(root, "data", "runtime", "vault.key");
  const activationPath = path.join(root, "data", "runtime", "live-activation.json");
  const secret = readEnvSecret(sourceEnv, "DEEPSEEK_API_KEY");
  const vaultKey = ensureVaultKey(vaultKeyPath);
  const encrypted = encryptSecret(secret, vaultKey, "owner:deepseek:credential:v1");
  const storage = createDatabase({
    dbPath,
    seed: { users: [], providers: [], capabilities: [], applications: [], agents: [], audits: [] },
  });

  try {
    storage.storeCredentialCiphertext({
      workspaceId: "owner",
      providerId: "deepseek",
      ciphertext: encrypted.envelope,
      fingerprint: encrypted.fingerprint,
      actor: "authorized-local-migration",
    });

    const appId = "specmirror";
    if (!storage.listApplications("owner").some((item) => item.id === appId)) {
      storage.createApplication({
        workspaceId: "owner",
        id: appId,
        name: "映构 SpecMirror",
        environment: "development",
        budget: 5,
        capabilityIds: ["ai.structured.generate"],
        actor: "authorized-local-migration",
      });
    }
    storage.setCapabilityGrant({
      workspaceId: "owner",
      applicationId: appId,
      capabilityId: "ai.structured.generate",
      rpmLimit: 10,
      dailyLimit: 100,
      enabled: true,
      actor: "authorized-local-migration",
    });

    for (const item of storage.listApplicationTokens("owner")) {
      if (item.applicationId === appId && item.status === "active") {
        storage.revokeApplicationToken({ workspaceId: "owner", tokenId: item.tokenId, actor: "authorized-local-migration" });
      }
    }
    const issued = createApplicationToken("development");
    storage.createApplicationToken({
      workspaceId: "owner",
      applicationId: appId,
      tokenHash: issued.tokenHash,
      tokenId: issued.tokenId,
      label: "SpecMirror local development",
      prefix: issued.prefix,
      fingerprint: issued.fingerprint,
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      actor: "authorized-local-migration",
    });
    upsertEnv(targetEnv, {
      API_HUB_URL: "http://127.0.0.1:4310",
      API_HUB_APP_TOKEN: issued.token,
    });

    const activation = {
      version: 1,
      status: "active",
      providerId: "deepseek",
      environment: "development",
      allowedOrigin: "https://api.deepseek.com",
      capabilities: ["ai.structured.generate"],
      authorizedBy: "user",
      authorizedAt: new Date().toISOString(),
      authorizationRef: "explicit-user-authorization-2026-07-21",
      purpose: "SpecMirror structured generation in local development",
    };
    atomicWrite(activationPath, `${JSON.stringify(activation, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({
      ok: true,
      providerId: "deepseek",
      environment: "development",
      credentialFingerprint: encrypted.fingerprint,
      applicationId: appId,
      tokenFingerprint: issued.fingerprint,
      capability: "ai.structured.generate",
      liveGate: "activated",
    })}\n`);
  } finally {
    storage.close();
  }
}

try { main(); } catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
  process.exitCode = 1;
}
