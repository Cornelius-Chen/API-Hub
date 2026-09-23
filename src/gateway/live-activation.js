const fs = require("node:fs");

const REQUIRED = Object.freeze({
  version: 1,
  status: "active",
  providerId: "deepseek",
  environment: "development",
  allowedOrigin: "https://api.deepseek.com",
});

function loadLiveActivation(activationPath) {
  const locked = { mode: "dry_run", liveGate: false, activation: null };
  if (!fs.existsSync(activationPath)) return locked;
  try {
    const record = JSON.parse(fs.readFileSync(activationPath, "utf8"));
    for (const [key, value] of Object.entries(REQUIRED)) if (record[key] !== value) return locked;
    if (record.authorizedBy !== "user" || Number.isNaN(Date.parse(record.authorizedAt))) return locked;
    if (!Array.isArray(record.capabilities) || record.capabilities.length === 0) return locked;
    if (record.capabilities.some((item) => !new Set(["ai.text.generate", "ai.structured.generate"]).has(item))) return locked;
    return { mode: "live", liveGate: true, activation: Object.freeze(record) };
  } catch {
    return locked;
  }
}

module.exports = { loadLiveActivation };
