const fs = require("node:fs");
const crypto = require("node:crypto");
const network = require("./src/network.js");
const path = require("node:path");
const { createDatabase } = require("./src/database.js");
const { createExecutionEngine } = require("./src/gateway/execution-engine.js");
const { createDeepSeekAdapter } = require("./src/gateway/adapters/deepseek.js");
const { loadLiveActivation } = require("./src/gateway/live-activation.js");
const {
  createSessionTokens,
  createCsrfToken,
  createAgentToken,
  createApplicationToken,
  decryptSecret,
  encryptSecret,
  ensureVaultKey,
  expiredSessionCookie,
  hashPassword,
  hashToken,
  readCookie,
  sessionCookie,
  verifyPassword,
} = require("./src/security.js");

const networkSettings = network.networkConfig();
const port = networkSettings.port;
const root = path.join(__dirname, "public");

const users = [
  {
    id: "owner",
    name: "Personal Workspace",
    initials: "CR",
    role: "Owner",
    plan: "Private",
    region: "Local",
  },
  {
    id: "client-lab",
    name: "Client Lab",
    initials: "CL",
    role: "Workspace admin",
    plan: "Sandbox",
    region: "Isolated",
  },
];

const providers = [
  {
    userId: "owner",
    id: "openai",
    name: "OpenAI",
    category: "AI models",
    website: "https://openai.com",
    docs: "https://platform.openai.com/docs",
    console: "https://platform.openai.com",
    apiBase: "https://api.openai.com/v1",
    health: "operational",
    credential: { status: "configured", fingerprint: "•••• 7C2A", environment: "development" },
    quota: { used: 38, remaining: 62, unit: "% monthly budget", source: "estimated", fresh: "4 min ago" },
    monthCost: 18.42,
    peak: "42 req/min",
  },
  {
    userId: "owner",
    id: "deepseek",
    name: "DeepSeek",
    category: "AI models",
    website: "https://www.deepseek.com",
    docs: "https://api-docs.deepseek.com",
    console: "https://platform.deepseek.com",
    apiBase: "https://api.deepseek.com",
    health: "operational",
    credential: { status: "configured", fingerprint: "•••• E91F", environment: "development" },
    quota: { used: 21, remaining: 79, unit: "% prepaid balance", source: "manual", fresh: "today" },
    monthCost: 4.86,
    peak: "18 req/min",
  },
  {
    userId: "owner",
    id: "spotify",
    name: "Spotify",
    category: "Music",
    website: "https://spotify.com",
    docs: "https://developer.spotify.com/documentation/web-api",
    console: "https://developer.spotify.com/dashboard",
    apiBase: "https://api.spotify.com/v1",
    health: "attention",
    credential: { status: "oauth_required", fingerprint: "Client •••• A813", environment: "development" },
    quota: { used: 67, remaining: 33, unit: "% local request policy", source: "response_headers", fresh: "1 min ago" },
    monthCost: 0,
    peak: "56 req/min",
  },
  {
    userId: "owner",
    id: "google",
    name: "Google Calendar",
    category: "Context",
    website: "https://developers.google.com/calendar",
    docs: "https://developers.google.com/calendar/api/guides/overview",
    console: "https://console.cloud.google.com",
    apiBase: "https://www.googleapis.com/calendar/v3",
    health: "operational",
    credential: { status: "configured", fingerprint: "OAuth •••• 2D0B", environment: "development" },
    quota: { used: 8, remaining: 92, unit: "% daily quota", source: "provider_api", fresh: "7 min ago" },
    monthCost: 0,
    peak: "7 req/min",
  },
  {
    userId: "client-lab",
    id: "anthropic",
    name: "Anthropic",
    category: "AI models",
    website: "https://www.anthropic.com",
    docs: "https://docs.anthropic.com",
    console: "https://console.anthropic.com",
    apiBase: "https://api.anthropic.com",
    health: "operational",
    credential: { status: "configured", fingerprint: "•••• 4B71", environment: "sandbox" },
    quota: { used: 12, remaining: 88, unit: "% sandbox budget", source: "estimated", fresh: "11 min ago" },
    monthCost: 2.16,
    peak: "9 req/min",
  },
  {
    userId: "client-lab",
    id: "resend",
    name: "Resend",
    category: "Email",
    website: "https://resend.com",
    docs: "https://resend.com/docs",
    console: "https://resend.com/emails",
    apiBase: "https://api.resend.com",
    health: "operational",
    credential: { status: "configured", fingerprint: "•••• 0F28", environment: "sandbox" },
    quota: { used: 5, remaining: 95, unit: "% monthly messages", source: "manual", fresh: "today" },
    monthCost: 0,
    peak: "3 req/min",
  },
];

const capabilities = [
  { userId: "owner", id: "ai.text.generate", label: "Generate text", primary: "OpenAI", fallback: "DeepSeek", apps: 3, state: "ready" },
  { userId: "owner", id: "ai.structured.generate", label: "Generate structured data", primary: "DeepSeek", fallback: "OpenAI", apps: 2, state: "ready" },
  { userId: "owner", id: "music.catalog.search", label: "Search music catalog", primary: "Spotify", fallback: "None", apps: 1, state: "attention" },
  { userId: "owner", id: "calendar.events.read", label: "Read calendar context", primary: "Google Calendar", fallback: "None", apps: 1, state: "ready" },
  { userId: "client-lab", id: "ai.text.generate", label: "Generate text", primary: "Anthropic", fallback: "None", apps: 1, state: "ready" },
  { userId: "client-lab", id: "email.transactional.send", label: "Send transactional email", primary: "Resend", fallback: "None", apps: 1, state: "ready" },
];

const applications = [
  { userId: "owner", id: "mnemo", name: "Mnemo AI Radio", environment: "development", capabilities: 4, spend: 7.14, budget: 30, agents: 2, state: "active" },
  { userId: "owner", id: "api-hub-console", name: "API Hub Console", environment: "development", capabilities: 1, spend: 0.32, budget: 5, agents: 1, state: "active" },
  { userId: "owner", id: "future-saas", name: "Next SaaS Template", environment: "sandbox", capabilities: 2, spend: 0, budget: 3, agents: 0, state: "draft" },
  { userId: "client-lab", id: "client-portal", name: "Client Portal", environment: "sandbox", capabilities: 2, spend: 1.42, budget: 12, agents: 1, state: "active" },
];

const agents = [
  { userId: "owner", id: "mnemo-dj", name: "Mnemo DJ", applicationId: "mnemo", grants: 2, expires: "30 days", state: "active" },
  { userId: "owner", id: "codex-builder", name: "Codex Builder", applicationId: "api-hub-console", grants: 1, expires: "7 days", state: "active" },
  { userId: "owner", id: "future-worker", name: "Future SaaS Worker", applicationId: "future-saas", grants: 1, expires: "not issued", state: "draft" },
  { userId: "client-lab", id: "portal-worker", name: "Portal Worker", applicationId: "client-portal", grants: 2, expires: "12 hours", state: "active" },
];

const audits = [
  { userId: "owner", time: "10:42", actor: "mnemo-dj", action: "Invoked Generate text", outcome: "Allowed", detail: "OpenAI · 2.1s · $0.018" },
  { userId: "owner", time: "10:39", actor: "policy-engine", action: "Applied fallback route", outcome: "Completed", detail: "OpenAI → DeepSeek · provider timeout" },
  { userId: "owner", time: "09:18", actor: "owner", action: "Updated Spotify credential", outcome: "Recorded", detail: "Secret stayed write-only · fingerprint changed" },
  { userId: "owner", time: "Yesterday", actor: "budget-guard", action: "Raised usage warning", outcome: "Needs review", detail: "Mnemo reached 80% daily soft limit" },
  { userId: "client-lab", time: "11:08", actor: "portal-worker", action: "Invoked Send transactional email", outcome: "Allowed", detail: "Resend · 420ms · sandbox" },
  { userId: "client-lab", time: "10:57", actor: "workspace-admin", action: "Granted Generate text", outcome: "Recorded", detail: "Client Portal · sandbox only" },
];

const dbPath = process.env.API_HUB_DB_PATH
  ? path.resolve(process.env.API_HUB_DB_PATH)
  : path.join(__dirname, "data", "runtime", "api-hub.sqlite");
const storage = createDatabase({
  dbPath,
  seed: { users, providers, capabilities, applications, agents, audits },
});
const vaultKeyPath = process.env.API_HUB_VAULT_KEY_PATH
  ? path.resolve(process.env.API_HUB_VAULT_KEY_PATH)
  : path.join(__dirname, "data", "runtime", "vault.key");
const vaultKey = ensureVaultKey(vaultKeyPath);
const websiteLogin = storage.createWebsiteLogin(vaultKey);
const launcherToken = process.env.API_HUB_LAUNCHER_TOKEN || "";
const dummyLoginPassword = hashPassword(crypto.randomBytes(32).toString("hex"));
const liveActivationPath = process.env.API_HUB_LIVE_ACTIVATION_PATH
  ? path.resolve(process.env.API_HUB_LIVE_ACTIVATION_PATH)
  : path.join(path.dirname(dbPath), "live-activation.json");
// Live execution requires both a reviewed, fixed adapter and a local activation
// record created after explicit user authorization. A casual environment switch
// cannot unlock provider egress.
const liveState = loadLiveActivation(liveActivationPath);
const executionEngine = createExecutionEngine({
  mode: liveState.mode,
  liveGate: liveState.liveGate,
  adapters: [createDeepSeekAdapter()],
});
const gatewayConcurrency = { total: 0, identities: new Map(), maxTotal: 16, maxPerIdentity: 4 };
const testGatewayDelayMs = process.env.NODE_ENV === "test" ? Math.min(2_000, Math.max(0, Number(process.env.API_HUB_TEST_GATEWAY_DELAY_MS) || 0)) : 0;

function tokenTimeValid(value) {
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? value.replace(' ', 'T') + 'Z' : value;
  return Date.parse(normalized) > Date.now();
}

function publicUser(user) {
  return { ...user };
}

function requestSession(request) {
  const token = readCookie(request.headers.cookie, "api_hub_session");
  if (!token) return null;
  return storage.findSession(hashToken(token));
}

function sessionUser(session) {
  return session ? {
    id: session.workspaceId,
    name: session.name,
    initials: session.initials,
    role: session.role,
    plan: session.plan,
    region: session.region,
  } : null;
}

function gatewayIdentity(rawToken) {
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);
  const application = storage.findApplicationToken(tokenHash);
  if (application) return { ...application, identityType: "application", agentId: null, agentName: null };
  const agent = storage.findAgentToken(tokenHash);
  return agent ? { ...agent, identityType: "agent" } : null;
}

function resolveProviderCredential(workspaceId, providerId, environment) {
  const record = storage.findCredentialEnvelope(workspaceId, providerId, environment);
  if (!record) throw new Error("Provider credential is unavailable.");
  return decryptSecret(record.ciphertext, vaultKey, `${workspaceId}:${providerId}:credential:v1`);
}

const SAFE_EXECUTION_FAILURES = new Set([
  "adapter_capability_denied", "adapter_input_invalid", "adapter_timeout", "egress_origin_denied",
  "provider_auth_failed", "provider_credential_unavailable", "provider_network_failed",
  "provider_rate_limited", "provider_request_rejected", "provider_response_invalid", "provider_unavailable",
]);

function safeExecutionFailure(error) {
  return SAFE_EXECUTION_FAILURES.has(error?.reason) ? error.reason : "execution_boundary_rejected";
}

function touchGatewayIdentity(identity) {
  if (identity.identityType === "agent") storage.touchAgentToken(identity.tokenHash);
  else storage.touchApplicationToken(identity.tokenHash);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function privateFingerprint(label, value) {
  return crypto.createHmac("sha256", vaultKey).update(label).update("\0").update(value).digest("hex");
}

function sameOrigin(request) {
  return network.sameOrigin(request, networkSettings);
}

function normalizedHttpsUrl(value, { apiBase = false } = {}) {
  const parsed = new URL(String(value || ""));
  if (parsed.protocol !== "https:") throw new Error("Provider URLs must use HTTPS");
  if (parsed.username || parsed.password) throw new Error("Provider URLs cannot contain credentials");
  if (apiBase && (parsed.search || parsed.hash)) throw new Error("API base URL cannot contain query or fragment");
  return parsed.toString().replace(/\/$/, "");
}

function contractSchema(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} contract must be a JSON object`);
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized) > 16_384) throw new Error(`${label} contract is too large`);
  if (value.type && value.type !== "object") throw new Error(`${label} root type must be object`);
  return value;
}

function inputContractValid(value, schema) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const properties = schema?.properties && typeof schema.properties === "object" ? schema.properties : {};
  if (Array.isArray(schema?.required) && schema.required.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) return false;
  if (schema?.additionalProperties === false && Object.keys(value).some((key) => !Object.prototype.hasOwnProperty.call(properties, key))) return false;
  for (const [key, rule] of Object.entries(properties)) {
    if (!Object.prototype.hasOwnProperty.call(value, key) || !rule || typeof rule !== "object") continue;
    const item = value[key];
    if (rule.type === "string" && typeof item !== "string") return false;
    if (rule.type === "number" && (typeof item !== "number" || !Number.isFinite(item))) return false;
    if (rule.type === "integer" && !Number.isInteger(item)) return false;
    if (rule.type === "boolean" && typeof item !== "boolean") return false;
    if (rule.type === "array" && !Array.isArray(item)) return false;
    if (rule.type === "object" && (!item || typeof item !== "object" || Array.isArray(item))) return false;
    if (typeof item === "string" && Number.isInteger(rule.maxLength) && item.length > rule.maxLength) return false;
  }
  return true;
}

function csrfValid(request, session) {
  const token = request.headers["x-csrf-token"];
  return typeof token === "string" && hashToken(token) === session.csrfHash;
}

function launcherAuthorized(request) {
  if (!launcherToken || !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.socket.remoteAddress)) return false;
  const supplied = Buffer.from(String(request.headers["x-api-hub-launcher-token"] || ""));
  const expected = Buffer.from(launcherToken);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

class RequestBodyError extends Error {
  constructor(message, status, reason) { super(message); this.status = status; this.reason = reason; }
}

function readJson(request, { maxBytes = 32_768, timeoutMs = 5_000 } = {}) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let settled = false;
    const contentLength = Number(request.headers["content-length"] || 0);
    const finish = (callback, value) => { if (settled) return; settled = true; clearTimeout(timer); callback(value); };
    const timer = setTimeout(() => finish(reject, new RequestBodyError("Request body timed out.", 408, "request_body_timeout")), timeoutMs);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      request.resume();
      finish(reject, new RequestBodyError(`Request body exceeds ${maxBytes} bytes.`, 413, "request_body_too_large"));
      return;
    }
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      if (settled) return;
      raw += chunk;
      if (Buffer.byteLength(raw) > maxBytes) {
        raw = "";
        finish(reject, new RequestBodyError(`Request body exceeds ${maxBytes} bytes.`, 413, "request_body_too_large"));
      }
    });
    request.on("end", () => {
      if (settled) return;
      try { finish(resolve, raw ? JSON.parse(raw) : {}); }
      catch { finish(reject, new RequestBodyError("Invalid JSON body.", 400, "invalid_json")); }
    });
    request.on("error", (error) => finish(reject, error));
  });
}

function requestBodyFailure(response, error, requestId = crypto.randomUUID()) {
  return json(response, error.status || 400, { ok: false, requestId, error: error.message, reason: error.reason || "invalid_request_body" });
}

function acquireGateway(identity) {
  const identityId = `${identity.workspaceId}:${identity.identityType}:${identity.agentId || identity.applicationId}`;
  const count = gatewayConcurrency.identities.get(identityId) || 0;
  if (gatewayConcurrency.total >= gatewayConcurrency.maxTotal || count >= gatewayConcurrency.maxPerIdentity) return null;
  gatewayConcurrency.total += 1;
  gatewayConcurrency.identities.set(identityId, count + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    gatewayConcurrency.total -= 1;
    const remaining = (gatewayConcurrency.identities.get(identityId) || 1) - 1;
    if (remaining > 0) gatewayConcurrency.identities.set(identityId, remaining); else gatewayConcurrency.identities.delete(identityId);
  };
}

function deviceLabelFromRequest(request) {
  const agent = String(request.headers["user-agent"] || "Unknown client");
  const browser = agent.includes("Edg/") ? "Edge" : agent.includes("Chrome/") ? "Chrome" : agent.includes("Firefox/") ? "Firefox" : agent.includes("node") ? "Node client" : "Browser";
  const system = agent.includes("Windows") ? "Windows" : agent.includes("Mac OS") ? "macOS" : agent.includes("Linux") ? "Linux" : "local device";
  return `${browser} on ${system}`;
}

function clientHashFromRequest(request) {
  return hashToken(`${request.socket.remoteAddress || "unknown"}|${String(request.headers["user-agent"] || "unknown")}`);
}

function loginKeyHash(request, username) {
  return hashToken(`${request.socket.remoteAddress || "unknown"}|${String(username || "").trim().toLowerCase()}`);
}

function establishSession(response, account, request) {
  const tokens = createSessionTokens();
  storage.createSession({ ...tokens, accountId: account.id, deviceLabel: deviceLabelFromRequest(request), clientHash: clientHashFromRequest(request) });
  response.setHeader("Set-Cookie", sessionCookie(tokens.token, networkSettings.secureCookies));
  return tokens.csrf;
}

function setSecurityHeaders(response) {
  response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
}

function databaseFor(user) {
  const userProviders = storage.listProviders(user.id);
  const userCapabilities = storage.listCapabilities(user.id);
  const userApplications = storage.listApplications(user.id);
  const userAgents = storage.listAgents(user.id);
  const userAudits = storage.listAudits(user.id);
  const credentials = storage.listCredentials(user.id);
  const applicationTokens = storage.listApplicationTokens(user.id);
  const agentTokens = storage.listAgentTokens(user.id);
  const grants = storage.listGrants(user.id);
  const invocations = storage.listInvocations(user.id);
  const metricHistory = storage.listMetricHistory(user.id);
  const alerts = storage.listAlerts(user.id, "all");
  const capabilityProposals = storage.listCapabilityProposals(user.id);
  const usageAnalytics = storage.usageAnalytics(user.id);
  const idempotency = storage.listIdempotency(user.id);
  return {
    user: publicUser(user),
    collections: [
      { id: "providers", label: "Provider accounts", count: userProviders.length, relation: "owns credentials and quota snapshots" },
      { id: "credentials", label: "Credential records", count: credentials.length, relation: "belongs to provider; value is write-only" },
      { id: "capabilities", label: "Capability grants", count: userCapabilities.length, relation: "routes applications to providers" },
      { id: "applications", label: "Applications", count: userApplications.length, relation: "owns agents, budgets and grants" },
      { id: "agents", label: "Agent identities", count: userAgents.length, relation: "delegated by an application" },
      { id: "applicationTokens", label: "Application tokens", count: applicationTokens.length, relation: "hashed identity belongs to application" },
      { id: "agentTokens", label: "Agent tokens", count: agentTokens.length, relation: "short-lived hashed identity belongs to delegated agent" },
      { id: "grants", label: "Capability grants", count: grants.length, relation: "authorizes application capability use" },
      { id: "invocations", label: "Invocation records", count: invocations.length, relation: "metadata-only policy decision trail" },
      { id: "usage", label: "Gateway usage", count: usageAnalytics.applications.length, relation: "derived UTC-day application and capability metrics" },
      { id: "idempotency", label: "Idempotency records", count: idempotency.length, relation: "metadata-only replay safety; no keys or inputs" },
      { id: "metricHistory", label: "Provider metric history", count: metricHistory.length, relation: "append-only quota, cost and peak snapshots" },
      { id: "alerts", label: "Alerts", count: alerts.length, relation: "threshold decisions derived from snapshots" },
      { id: "capabilityProposals", label: "Capability proposals", count: capabilityProposals.length, relation: "candidate contracts require explicit activation" },
      { id: "audit", label: "Audit events", count: userAudits.length, relation: "append-only metadata trail" },
    ],
    records: {
      providers: userProviders.map(({ credential, quota, ...provider }) => ({ ...provider, credentialStatus: credential.status, quotaRemaining: quota.remaining })),
      credentials,
      capabilities: userCapabilities,
      applications: userApplications,
      agents: userAgents,
      applicationTokens,
      agentTokens,
      grants,
      invocations,
      usage: usageAnalytics.applications,
      idempotency,
      metricHistory,
      alerts,
      capabilityProposals,
      audit: userAudits,
    },
  };
}

function overviewFor(user) {
  const userProviders = storage.listProviders(user.id);
  const userApplications = storage.listApplications(user.id);
  const stable = userProviders.filter((provider) => provider.health === "operational").length;
  const spend = userProviders.reduce((sum, provider) => sum + provider.monthCost, 0);
  const budget = userApplications.reduce((sum, application) => sum + application.budget, 0);
  const peaks = userProviders.map((provider) => Number.parseInt(provider.peak, 10) || 0);
  return {
    stable,
    providers: userProviders.length,
    spend,
    budget,
    budgetPercent: budget ? Math.round((spend / budget) * 100) : 0,
    peak: Math.max(0, ...peaks),
    runwayDays: spend ? Math.max(1, Math.round((budget - spend) / (spend / 30))) : 30,
  };
}

function gatewayGrants(identity) {
  const delegated = identity.identityType === "agent" ? new Set(storage.agentCapabilityIds(identity.workspaceId, identity.agentId)) : null;
  return storage.listGrants(identity.workspaceId)
    .filter((grant) => grant.applicationId === identity.applicationId && grant.enabled && (!delegated || delegated.has(grant.capabilityId)))
    .map(({ applicationId, enabled, ...grant }) => {
      const usage = storage.usageForPolicy(identity.workspaceId, identity.applicationId, grant.capabilityId);
      return { ...grant, usage: {
        source: "gateway_observed",
        minute: { used: usage.minute, limit: grant.rpmLimit, remaining: Math.max(0, grant.rpmLimit - usage.minute) },
        day: { used: usage.day, limit: grant.dailyLimit, remaining: Math.max(0, grant.dailyLimit - usage.day) },
      } };
    });
}

function openApiFor(identity, grants) {
  const invocationVariants = grants.map((grant) => ({
    type: "object",
    title: grant.label || grant.capabilityId,
    properties: {
      capability: { type: "string", const: grant.capabilityId },
      input: grant.inputContract || { type: "object", additionalProperties: true },
    },
    required: ["capability", "input"],
    additionalProperties: false,
  }));
  return {
    openapi: "3.1.0",
    info: {
      title: `API Hub Gateway · ${identity.applicationName}`,
      version: "1.0.0",
      description: "Token-scoped governed capability contract. Provider credentials and arbitrary provider URLs are never accepted.",
    },
    servers: [{ url: `http://127.0.0.1:${port}`, description: "Local API Hub" }],
    security: [{ apiHubToken: [] }],
    paths: {
      "/gateway/v1/capabilities": {
        get: {
          operationId: "listGrantedCapabilities",
          summary: "Discover the caller's live capability grants and remaining allowance",
          responses: { "200": { description: "Token-scoped capability manifest", content: { "application/json": { schema: { type: "object" } } } }, "401": { $ref: "#/components/responses/Unauthorized" } },
        },
      },
      "/gateway/v1/openapi.json": {
        get: {
          operationId: "getTokenScopedOpenApi",
          summary: "Export this token's live OpenAPI contract",
          responses: { "200": { description: "OpenAPI 3.1 document" }, "401": { $ref: "#/components/responses/Unauthorized" } },
        },
      },
      "/gateway/v1/invoke": {
        post: {
          operationId: "invokeGrantedCapability",
          summary: "Invoke one governed capability",
          parameters: [{ name: "Idempotency-Key", in: "header", required: false, schema: { type: "string", minLength: 8, maxLength: 200 }, description: "Reuse for retries of the same logical operation." }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: invocationVariants.length ? { oneOf: invocationVariants } : { type: "object", not: {} } } },
          },
          responses: {
            "200": { description: "Governed invocation result", content: { "application/json": { schema: { type: "object" } } } },
            "400": { $ref: "#/components/responses/PolicyError" },
            "401": { $ref: "#/components/responses/Unauthorized" },
            "403": { $ref: "#/components/responses/PolicyError" },
            "409": { $ref: "#/components/responses/PolicyError" },
            "413": { $ref: "#/components/responses/PolicyError" },
            "429": { $ref: "#/components/responses/PolicyError" },
          },
          "x-api-hub-capabilities": grants.map((grant) => ({
            capabilityId: grant.capabilityId,
            outputContract: grant.outputContract,
            dataClassification: grant.dataClassification,
            retentionPolicy: grant.retentionPolicy,
            rpmLimit: grant.rpmLimit,
            dailyLimit: grant.dailyLimit,
          })),
        },
      },
    },
    components: {
      securitySchemes: { apiHubToken: { type: "http", scheme: "bearer", bearerFormat: identity.identityType === "agent" ? "ah_agent_..." : "ah_dev_..." } },
      schemas: {
        PolicyError: {
          type: "object",
          properties: { ok: { type: "boolean", const: false }, error: { type: "string" }, reason: { type: "string" }, requestId: { type: "string", format: "uuid" } },
          required: ["ok", "error"],
        },
      },
      responses: {
        Unauthorized: { description: "Missing, expired, revoked, or inactive token", content: { "application/json": { schema: { $ref: "#/components/schemas/PolicyError" } } } },
        PolicyError: { description: "Governed policy or resilience rejection", content: { "application/json": { schema: { $ref: "#/components/schemas/PolicyError" } } } },
      },
    },
    "x-api-hub-identity": { type: identity.identityType, applicationId: identity.applicationId, agentId: identity.agentId || undefined },
    "x-api-hub-execution": { ...executionEngine.describe(), registeredProviders: undefined },
  };
}

function json(response, status, value) {
  if (value?.requestId && !response.hasHeader("X-Request-Id")) response.setHeader("X-Request-Id", value.requestId);
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(value));
}

function serveStatic(url, response) {
  const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const target = path.resolve(root, `.${pathname}`);
  if (!target.startsWith(root)) return json(response, 403, { ok: false, error: "Forbidden" });
  fs.readFile(target, (error, content) => {
    if (error) return json(response, 404, { ok: false, error: "Not found" });
    const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
    response.writeHead(200, { "content-type": types[path.extname(target)] || "application/octet-stream" });
    response.end(content);
  });
}

const server = network.createServer(networkSettings, async (request, response) => {
    setSecurityHeaders(response);
    if (!network.allowedHost(request, networkSettings)) return json(response, 421, { ok: false, error: "Host rejected" });
    const url = new URL(request.url, networkSettings.origin || `http://127.0.0.1:${port}`);
    // Serve also connects from loopback. In shared mode never expose launcher
    // control, regardless of source address, HTTP method, or launcher token.
    if (network.blocksInternalPath(url.pathname, networkSettings)) return json(response, 404, { ok: false, error: "Not found" });
    if (networkSettings.origin && storage.accountCount() === 0) return json(response, 503, { ok: false, error: "Initialize administrator over local-only access before enabling remote access" });
    if (url.pathname === "/api/health") return json(response, 200, { ok: true, mode: "authenticated-sqlite-mvp", storage: "sqlite", vault: "aes-256-gcm", secretExposure: false, execution: executionEngine.describe() });
    if (url.pathname === "/api/auth/status") return json(response, 200, { ok: true, needsSetup: storage.accountCount() === 0, authenticated: Boolean(requestSession(request)) });
    if (request.method === "POST" && url.pathname === "/internal/launcher/shutdown") {
      if (!launcherAuthorized(request)) return json(response, 404, { ok: false, error: "Not found" });
      json(response, 200, { ok: true, stopping: true });
      setImmediate(shutdown);
      return;
    }

    if (request.method === "GET" && url.pathname === "/gateway/v1/capabilities") {
      const authorization = String(request.headers.authorization || "");
      const rawToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
      const identity = gatewayIdentity(rawToken);
      if (!identity || identity.tokenStatus !== "active") return json(response, 401, { ok: false, error: "Invalid gateway token" });
      if (identity.expiresAt && !tokenTimeValid(identity.expiresAt)) return json(response, 401, { ok: false, error: "Gateway token expired" });
      if (identity.identityType === "agent" && identity.agentState !== "active") return json(response, 401, { ok: false, error: "Agent identity inactive" });
      const grants = gatewayGrants(identity);
      touchGatewayIdentity(identity);
      return json(response, 200, {
        ok: true,
        identity: { type: identity.identityType, agentId: identity.agentId, agentName: identity.agentName },
        application: { id: identity.applicationId, name: identity.applicationName, environment: identity.environment },
        gateway: { version: "v1", executionMode: executionEngine.describe().mode, liveGate: executionEngine.describe().liveGate, invocationPath: "/gateway/v1/invoke" },
        capabilities: grants,
      });
    }

    if (request.method === "GET" && url.pathname === "/gateway/v1/openapi.json") {
      const authorization = String(request.headers.authorization || "");
      const rawToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
      const identity = gatewayIdentity(rawToken);
      if (!identity || identity.tokenStatus !== "active") return json(response, 401, { ok: false, error: "Invalid gateway token" });
      if (identity.expiresAt && !tokenTimeValid(identity.expiresAt)) return json(response, 401, { ok: false, error: "Gateway token expired" });
      if (identity.identityType === "agent" && identity.agentState !== "active") return json(response, 401, { ok: false, error: "Agent identity inactive" });
      const document = openApiFor(identity, gatewayGrants(identity));
      touchGatewayIdentity(identity);
      return json(response, 200, document);
    }

    if (request.method === "POST" && url.pathname === "/gateway/v1/invoke") {
      const startedAt = Date.now();
      const authorization = String(request.headers.authorization || "");
      const rawToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
      const identity = gatewayIdentity(rawToken);
      if (!identity || identity.tokenStatus !== "active") return json(response, 401, { ok: false, error: "Invalid gateway token" });
      if (identity.expiresAt && !tokenTimeValid(identity.expiresAt)) return json(response, 401, { ok: false, error: "Gateway token expired" });
      let body;
      try { body = await readJson(request); } catch (error) { return requestBodyFailure(response, error); }
      const releaseGateway = acquireGateway(identity);
      if (!releaseGateway) {
        const requestId = crypto.randomUUID();
        response.setHeader("Retry-After", "1");
        return json(response, 429, { ok: false, requestId, error: "Gateway concurrency limit reached", reason: "gateway_overloaded" });
      }
      response.once("finish", releaseGateway);
      response.once("close", releaseGateway);
      if (testGatewayDelayMs) await new Promise((resolve) => setTimeout(resolve, testGatewayDelayMs));
      const capabilityId = String(body.capability || "");
      let idempotency = null;
      const idempotencyKey = String(request.headers["idempotency-key"] || "").trim();
      if (idempotencyKey && executionEngine.describe().mode === "live") {
        return json(response, 400, { ok: false, error: "Live responses use metadata-only retention and cannot be persisted for replay", reason: "live_idempotency_disabled" });
      }
      if (idempotencyKey) {
        if (!/^[\x21-\x7E]{8,200}$/.test(idempotencyKey)) return json(response, 400, { ok: false, error: "Idempotency-Key must be 8-200 visible ASCII characters" });
        const identityId = identity.identityType === "agent" ? identity.agentId : identity.applicationId;
        const keyHash = privateFingerprint("idempotency-key", idempotencyKey);
        const requestFingerprint = privateFingerprint("idempotency-request", `${capabilityId}\0${stableJson(body.input || {})}`);
        const claim = storage.claimIdempotency({ workspaceId: identity.workspaceId, identityType: identity.identityType,
          identityId, keyHash, requestFingerprint, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
        if (!claim.owned) {
          if (claim.record.requestFingerprint !== requestFingerprint) return json(response, 409, { ok: false, error: "Idempotency-Key was already used for a different request", reason: "idempotency_conflict" });
          if (claim.record.state === "pending") return json(response, 409, { ok: false, error: "The idempotent request is still in progress", reason: "idempotency_in_progress" });
          const replay = JSON.parse(claim.record.responseJson);
          storage.markIdempotencyReplay({ workspaceId: identity.workspaceId, identityType: identity.identityType, identityId, keyHash });
          response.setHeader("Idempotency-Replayed", "true");
          if (claim.record.responseStatus === 429) response.setHeader("Retry-After", replay.reason === "rpm_limit_exceeded" ? "60" : "3600");
          touchGatewayIdentity(identity);
          return json(response, claim.record.responseStatus, { ...replay, replayed: true });
        }
        idempotency = { identityId, keyHash };
      }
      const grant = storage.findGrant(identity.workspaceId, identity.applicationId, capabilityId);
      const requestId = crypto.randomUUID();
      let decision = "allowed";
      let reason = "policy_allowed";
      if (identity.applicationState !== "active") { decision = "denied"; reason = "application_inactive"; }
      else if (identity.identityType === "agent" && identity.agentState !== "active") { decision = "denied"; reason = "agent_inactive"; }
      else if (identity.spend >= identity.budget) { decision = "denied"; reason = "application_budget_exhausted"; }
      else if (!grant || !grant.enabled) { decision = "denied"; reason = "capability_not_granted"; }
      else if (identity.identityType === "agent" && !storage.agentHasGrant(identity.workspaceId, identity.agentId, capabilityId)) { decision = "denied"; reason = "agent_capability_not_granted"; }
      else if (grant.state !== "ready") { decision = "denied"; reason = "capability_not_ready"; }
      else if (executionEngine.describe().mode === "live" && identity.environment !== liveState.activation?.environment) { decision = "denied"; reason = "live_environment_not_authorized"; }
      else if (executionEngine.describe().mode === "live" && grant.primaryProviderId !== liveState.activation?.providerId) { decision = "denied"; reason = "live_provider_not_authorized"; }
      else if (executionEngine.describe().mode === "live" && !liveState.activation?.capabilities.includes(capabilityId)) { decision = "denied"; reason = "live_capability_not_authorized"; }
      else if (!inputContractValid(body.input || {}, grant.inputContract)) { decision = "denied"; reason = "input_contract_violation"; }
      else if (!grant.primaryProviderId || !grant.providerApiBase) { decision = "denied"; reason = "provider_route_not_configured"; }
      else {
        const usage = storage.usageForPolicy(identity.workspaceId, identity.applicationId, capabilityId);
        if (usage.minute >= grant.rpmLimit) { decision = "denied"; reason = "rpm_limit_exceeded"; }
        else if (usage.day >= grant.dailyLimit) { decision = "denied"; reason = "daily_limit_exceeded"; }
      }
      const route = grant ? grant.primaryProvider : null;
      let execution = null;
      if (decision === "allowed") {
        try {
          execution = await executionEngine.execute({
            providerId: grant.primaryProviderId,
            apiBaseUrl: grant.providerApiBase,
            capabilityId,
            input: body.input || {},
            credentialResolver: (providerId) => resolveProviderCredential(identity.workspaceId, providerId, identity.environment),
          });
        } catch (error) {
          decision = "denied";
          reason = safeExecutionFailure(error);
        }
      }
      const retryAfter = reason === "rpm_limit_exceeded" ? 60 : reason === "daily_limit_exceeded" ? 3600 : null;
      if (retryAfter) response.setHeader("Retry-After", String(retryAfter));
      const providerFailure = reason.startsWith("provider_") || reason === "adapter_timeout";
      const responseStatus = decision === "denied" ? (retryAfter ? 429 : providerFailure ? 502 : 403) : 200;
      const responseBody = decision === "denied" ? {
        ok: false, requestId, decision, reason, executionMode: executionEngine.describe().mode,
        ...(idempotency ? { replayed: false } : {}),
      } : {
        ok: true,
        requestId,
        decision,
        executionMode: executionEngine.describe().mode,
        identity: { type: identity.identityType, agentId: identity.agentId },
        application: { id: identity.applicationId, environment: identity.environment },
        capability: { id: capabilityId, route, fallback: grant.fallbackProvider },
        result: {
          status: execution.status,
          externalRequestSent: execution.externalRequestSent,
          ...(execution.result ? { provider: execution.providerId, attempts: execution.attempts, output: execution.result } : {}),
        },
        ...(idempotency ? { replayed: false } : {}),
      };
      storage.recordInvocation({
        requestId,
        workspaceId: identity.workspaceId,
        applicationId: identity.applicationId,
        capabilityId: capabilityId || "unknown",
        tokenId: identity.tokenId,
        identityType: identity.identityType,
        agentId: identity.agentId,
        decision,
        reason,
        providerRoute: decision === "allowed" ? route : null,
        executionMode: executionEngine.describe().mode,
        units: decision === "allowed" ? 1 : 0,
        latencyMs: Date.now() - startedAt,
      }, idempotency ? { ...idempotency, responseStatus, responseBody } : null);
      touchGatewayIdentity(identity);
      return json(response, responseStatus, responseBody);
    }

    if (request.method === "POST" && url.pathname === "/api/auth/setup") {
      if (!sameOrigin(request)) return json(response, 403, { ok: false, error: "Origin rejected" });
      if (storage.accountCount() !== 0) return json(response, 409, { ok: false, error: "Initial account already exists" });
      try {
        const body = await readJson(request);
        if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(body.username || "")) return json(response, 400, { ok: false, error: "Username must be 3-40 safe characters" });
        if (typeof body.password !== "string" || body.password.length < 6 || body.password.length > 128) return json(response, 400, { ok: false, error: "Password must be 6-128 characters" });
        const password = hashPassword(body.password);
        const accountId = storage.createAccount({ workspaceId: "owner", username: body.username, passwordSalt: password.salt, passwordHash: password.hash });
        const account = { id: accountId };
        const csrf = establishSession(response, account, request);
        return json(response, 201, { ok: true, csrf, user: publicUser(storage.findUser("owner")) });
      } catch (error) {
        return json(response, 400, { ok: false, error: error.message });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/auth/login") {
      if (!sameOrigin(request)) return json(response, 403, { ok: false, error: "Origin rejected" });
      try {
        const body = await readJson(request);
        const username = String(body.username || "");
        const loginKey = loginKeyHash(request, username);
        // Owner-approved personal deployment: failed attempts do not lock login.
        // Password verification and Gateway rate/budget policies remain enforced.
        const account = storage.findAccountByUsername(username);
        const suppliedPassword = typeof body.password === "string" ? body.password : "";
        const passwordValid = verifyPassword(suppliedPassword,
          account?.passwordSalt || dummyLoginPassword.salt,
          account?.passwordHash || dummyLoginPassword.hash);
        if (!account || !passwordValid) {
          storage.recordLoginFailure(loginKey);
          return json(response, 401, { ok: false, error: "Invalid username or password" });
        }
        storage.clearLoginFailures(loginKey);
        const csrf = establishSession(response, account, request);
        return json(response, 200, { ok: true, csrf, user: publicUser(storage.findUser(account.workspaceId)) });
      } catch (error) {
        return json(response, 400, { ok: false, error: error.message });
      }
    }

    const session = requestSession(request);
    const user = sessionUser(session);
    if (url.pathname.startsWith("/api/") && !session) return json(response, 401, { ok: false, error: "Authentication required" });
    if (url.pathname === '/api/website-login') {
      if (request.method === 'GET') return json(response,200,{ok:true,accounts:websiteLogin.list(user.id)});
      if (request.method !== 'POST') return json(response,405,{ok:false});
      if (!sameOrigin(request) || !csrfValid(request,session)) return json(response,403,{ok:false,error:'CSRF validation failed'});
      try {
        const body = await readJson(request);
        if (!['begin','finish','disable'].includes(body.action)) return json(response,400,{ok:false,error:'Unsupported action'});
        return json(response,200,websiteLogin[body.action](user.id,session.username,body));
      } catch { return json(response,400,{ok:false,error:'Website login unavailable; check origin, account, default state or attempt expiry'}); }
    }
    if (url.pathname === '/api/website-credential') {
      if (request.method === 'GET') return json(response, 200, { ok: true, ...storage.websiteVault.status(user.id) });
      if (!['PUT', 'POST'].includes(request.method)) return json(response, 405, { ok: false, error: 'Method not allowed' });
      if (!sameOrigin(request) || !csrfValid(request, session)) return json(response, 403, { ok: false, error: 'CSRF validation failed' });
      try {
        const body = await readJson(request);
        if (request.method === 'POST') {
          if (body.action !== 'disable') return json(response, 400, { ok: false, error: 'Unsupported action' });
          return json(response, 200, { ok: true, ...storage.websiteVault.disable(user.id, session.username) });
        }
        if (typeof body.secret !== 'string' || body.secret.length < 6 || body.secret.length > 128) return json(response, 400, { ok: false, error: 'Password must be 6-128 characters' });
        const encrypted = encryptSecret(body.secret, vaultKey, `${user.id}:website-default:v1`);
        body.secret = '';
        return json(response, 200, { ok: true, ...storage.websiteVault.save(user.id, encrypted.envelope, session.username) });
      } catch { return json(response, 400, { ok: false, error: 'Unable to save website credential' }); }
    }
    if (url.pathname === "/api/auth/me") {
      const freshCsrf = createCsrfToken();
      storage.updateSessionCsrf(session.tokenHash, freshCsrf.csrfHash);
      return json(response, 200, { ok: true, user: publicUser(user), csrf: freshCsrf.csrf });
    }
    if (request.method === "POST" && url.pathname === "/api/auth/logout") {
      if (!sameOrigin(request) || !csrfValid(request, session)) return json(response, 403, { ok: false, error: "CSRF validation failed" });
      storage.deleteSession(session.tokenHash);
      response.setHeader("Set-Cookie", expiredSessionCookie(networkSettings.secureCookies));
      return json(response, 200, { ok: true });
    }
    if (request.method === "GET" && url.pathname === "/api/security/sessions") {
      return json(response, 200, { ok: true, sessions: storage.listSessions(session.accountId).map((item) => ({
        ...item, current: item.sessionId === session.sessionId, clientHash: undefined,
      })) });
    }
    if (request.method === "GET" && url.pathname === "/api/security/execution") {
      return json(response, 200, {
        ok: true,
        execution: {
          ...executionEngine.describe(),
          gatewayLimits: {
            requestBodyBytes: 32_768,
            requestBodyTimeoutMs: 5_000,
            maxConcurrent: gatewayConcurrency.maxTotal,
            maxConcurrentPerIdentity: gatewayConcurrency.maxPerIdentity,
          },
        },
        activationRequirements: [
          "reviewed provider-specific adapter",
          "exact HTTPS origin allowlist",
          "server-side credential resolver",
          "output validation and redaction review",
          "explicit production invocation confirmation",
        ],
      });
    }
    if (request.method === "POST" && /^\/api\/security\/sessions\/[^/]+\/revoke$/.test(url.pathname)) {
      if (!sameOrigin(request) || !csrfValid(request, session)) return json(response, 403, { ok: false, error: "CSRF validation failed" });
      try {
        const body = await readJson(request);
        if (body.confirm !== "REVOKE SESSION") return json(response, 400, { ok: false, error: "Explicit session revocation confirmation required" });
        const sessionId = decodeURIComponent(url.pathname.split("/")[4]);
        const revokedHash = storage.revokeSession({ accountId: session.accountId, sessionId });
        const current = revokedHash === session.tokenHash;
        if (current) response.setHeader("Set-Cookie", expiredSessionCookie(networkSettings.secureCookies));
        return json(response, 200, { ok: true, sessionId, current });
      } catch (error) {
        return json(response, 404, { ok: false, error: error.message });
      }
    }
    if (request.method === "POST" && url.pathname === "/api/security/password") {
      if (!sameOrigin(request) || !csrfValid(request, session)) return json(response, 403, { ok: false, error: "CSRF validation failed" });
      try {
        const body = await readJson(request);
        const account = storage.findAccountByUsername(session.username);
        if (typeof body.currentPassword !== "string" || !verifyPassword(body.currentPassword, account.passwordSalt, account.passwordHash)) {
          return json(response, 401, { ok: false, error: "Current password is incorrect" });
        }
        if (typeof body.newPassword !== "string" || body.newPassword.length < 6 || body.newPassword.length > 128) {
          return json(response, 400, { ok: false, error: "New password must be 6-128 characters" });
        }
        if (verifyPassword(body.newPassword, account.passwordSalt, account.passwordHash)) return json(response, 400, { ok: false, error: "New password must be different" });
        const nextPassword = hashPassword(body.newPassword);
        storage.changePasswordAndRevokeSessions({ accountId: session.accountId, passwordSalt: nextPassword.salt,
          passwordHash: nextPassword.hash, workspaceId: user.id, actor: session.username });
        response.setHeader("Set-Cookie", expiredSessionCookie(networkSettings.secureCookies));
        return json(response, 200, { ok: true, sessionsRevoked: true });
      } catch (error) {
        return json(response, 400, { ok: false, error: error.message });
      }
    }
    if (request.method === "PUT" && /^\/api\/providers\/[^/]+\/credential$/.test(url.pathname)) {
      if (!sameOrigin(request) || !csrfValid(request, session)) return json(response, 403, { ok: false, error: "CSRF validation failed" });
      try {
        const body = await readJson(request);
        if (typeof body.secret !== "string" || body.secret.length < 8 || body.secret.length > 8192) return json(response, 400, { ok: false, error: "Secret must be 8-8192 characters" });
        const providerId = decodeURIComponent(url.pathname.split("/")[3]);
        const encrypted = encryptSecret(body.secret, vaultKey, `${user.id}:${providerId}:credential:v1`);
        storage.storeCredentialCiphertext({ workspaceId: user.id, providerId, ciphertext: encrypted.envelope, fingerprint: encrypted.fingerprint, actor: session.username });
        return json(response, 200, { ok: true, credential: { providerId, status: "configured", fingerprint: encrypted.fingerprint } });
      } catch (error) {
        return json(response, 400, { ok: false, error: error.message });
      }
    }
    if (request.method === "POST" && url.pathname === "/api/providers") {
      if (!sameOrigin(request) || !csrfValid(request, session)) return json(response, 403, { ok: false, error: "CSRF validation failed" });
      try {
        const body = await readJson(request);
        const id = String(body.id || "").trim();
        const name = String(body.name || "").trim();
        const category = String(body.category || "").trim();
        const environment = String(body.environment || "development");
        const quotaRemaining = Number(body.quotaRemaining);
        const quotaUnit = String(body.quotaUnit || "% policy allowance").trim();
        const quotaSource = String(body.quotaSource || "unknown");
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.length > 50) return json(response, 400, { ok: false, error: "Provider ID must be a lowercase slug" });
        if (name.length < 2 || name.length > 100) return json(response, 400, { ok: false, error: "Provider name must be 2-100 characters" });
        if (category.length < 2 || category.length > 80) return json(response, 400, { ok: false, error: "Category must be 2-80 characters" });
        if (!new Set(["development", "sandbox"]).has(environment)) return json(response, 400, { ok: false, error: "MVP credentials must use development or sandbox" });
        if (typeof body.secret !== "string" || body.secret.length < 8 || body.secret.length > 8192) return json(response, 400, { ok: false, error: "Secret must be 8-8192 characters" });
        if (!Number.isInteger(quotaRemaining) || quotaRemaining < 0 || quotaRemaining > 100) return json(response, 400, { ok: false, error: "Remaining quota must be an integer from 0 to 100" });
        if (quotaUnit.length < 2 || quotaUnit.length > 80) return json(response, 400, { ok: false, error: "Quota unit must be 2-80 characters" });
        if (!new Set(["manual", "estimated", "unknown"]).has(quotaSource)) return json(response, 400, { ok: false, error: "Initial quota source must be manual, estimated, or unknown" });
        const website = normalizedHttpsUrl(body.website);
        const docs = normalizedHttpsUrl(body.docs);
        const consoleUrl = normalizedHttpsUrl(body.consoleUrl);
        const apiBase = normalizedHttpsUrl(body.apiBase, { apiBase: true });
        const encrypted = encryptSecret(body.secret, vaultKey, `${user.id}:${id}:credential:v1`);
        storage.createProvider({ workspaceId: user.id, id, name, category, website, docs, consoleUrl, apiBase,
          environment, ciphertext: encrypted.envelope, fingerprint: encrypted.fingerprint,
          quotaRemaining, quotaUnit, quotaSource, actor: session.username });
        return json(response, 201, {
          ok: true,
          provider: { id, name, category, website, docs, console: consoleUrl, apiBase, health: "attention",
            credential: { status: "configured", fingerprint: encrypted.fingerprint, environment },
            quota: { used: 100 - quotaRemaining, remaining: quotaRemaining, unit: quotaUnit, source: quotaSource, fresh: "just recorded" } },
        });
      } catch (error) {
        const duplicate = String(error.message).includes("UNIQUE constraint");
        return json(response, duplicate ? 409 : 400, { ok: false, error: duplicate ? "Provider ID already exists" : error.message });
      }
    }
    if (request.method === "PUT" && /^\/api\/providers\/[^/]+\/metrics$/.test(url.pathname)) {
      if (!sameOrigin(request) || !csrfValid(request, session)) return json(response, 403, { ok: false, error: "CSRF validation failed" });
      try {
        const body = await readJson(request);
        const providerId = decodeURIComponent(url.pathname.split("/")[3]);
        const remaining = Number(body.remaining);
        const unit = String(body.unit || "").trim();
        const source = String(body.source || "unknown");
        const monthCost = Number(body.monthCost);
        const peakRpm = Number(body.peakRpm);
        if (!Number.isInteger(remaining) || remaining < 0 || remaining > 100) return json(response, 400, { ok: false, error: "Remaining quota must be an integer from 0 to 100" });
        if (unit.length < 2 || unit.length > 80) return json(response, 400, { ok: false, error: "Metric unit must be 2-80 characters" });
        if (!new Set(["manual", "estimated", "unknown"]).has(source)) return json(response, 400, { ok: false, error: "Human updates may use only manual, estimated, or unknown source" });
        if (!Number.isFinite(monthCost) || monthCost < 0 || monthCost > 1_000_000_000) return json(response, 400, { ok: false, error: "Month cost is outside the accepted range" });
        if (!Number.isInteger(peakRpm) || peakRpm < 0 || peakRpm > 1_000_000) return json(response, 400, { ok: false, error: "Peak RPM must be an integer from 0 to 1000000" });
        storage.recordProviderMetrics({ workspaceId: user.id, providerId, remaining, unit, source, monthCost, peakRpm, actor: session.username });
        return json(response, 201, { ok: true, snapshot: { providerId, used: 100 - remaining, remaining, unit, source, monthCost, peakRpm } });
      } catch (error) {
        return json(response, error.message === "Provider not found." ? 404 : 400, { ok: false, error: error.message });
      }
    }
    if (request.method === "POST" && /^\/api\/applications\/[^/]+\/tokens$/.test(url.pathname)) {
      if (!sameOrigin(request) || !csrfValid(request, session)) return json(response, 403, { ok: false, error: "CSRF validation failed" });
      try {
        const body = await readJson(request);
        const applicationId = decodeURIComponent(url.pathname.split("/")[3]);
        const application = storage.listApplications(user.id).find((item) => item.id === applicationId);
        if (!application) return json(response, 404, { ok: false, error: "Application not found" });
        const label = String(body.label || "Default integration").trim().slice(0, 80);
        if (label.length < 2) return json(response, 400, { ok: false, error: "Token label is required" });
        const token = createApplicationToken(application.environment);
        const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
        storage.createApplicationToken({ workspaceId: user.id, applicationId, ...token, label, expiresAt, actor: session.username });
        return json(response, 201, {
          ok: true,
          token: token.token,
          metadata: { tokenId: token.tokenId, applicationId, label, prefix: token.prefix, fingerprint: token.fingerprint, expiresAt },
          warning: "Copy this token now. It will not be shown again.",
        });
      } catch (error) {
        return json(response, 400, { ok: false, error: error.message });
      }
    }
    if (request.method === "POST" && url.pathname === "/api/agents") {
      if (!sameOrigin(request) || !csrfValid(request, session)) return json(response, 403, { ok: false, error: "CSRF validation failed" });
      try {
        const body = await readJson(request);
        const id = String(body.id || "").trim();
        const name = String(body.name || "").trim();
        const applicationId = String(body.applicationId || "").trim();
        const capabilityIds = Array.isArray(body.capabilityIds) ? [...new Set(body.capabilityIds.map(String))] : [];
        const expiresInHours = Number(body.expiresInHours);
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.length > 60) return json(response, 400, { ok: false, error: "Agent ID must be a lowercase slug" });
        if (name.length < 2 || name.length > 100) return json(response, 400, { ok: false, error: "Agent name must be 2-100 characters" });
        if (!applicationId) return json(response, 400, { ok: false, error: "Application is required" });
        if (!capabilityIds.length || capabilityIds.length > 50) return json(response, 400, { ok: false, error: "Choose 1-50 delegated capabilities" });
        if (!Number.isInteger(expiresInHours) || expiresInHours < 1 || expiresInHours > 720) return json(response, 400, { ok: false, error: "Agent lifetime must be 1-720 hours" });
        const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();
        storage.createAgent({ workspaceId: user.id, id, name, applicationId, capabilityIds, expiresAt, actor: session.username });
        return json(response, 201, { ok: true, agent: { id, name, applicationId, capabilityIds, expiresAt, state: "active" } });
      } catch (error) {
        const duplicate = String(error.message).includes("UNIQUE constraint");
        return json(response, duplicate ? 409 : 400, { ok: false, error: duplicate ? "Agent ID already exists" : error.message });
      }
    }
    if (request.method === "POST" && /^\/api\/agents\/[^/]+\/tokens$/.test(url.pathname)) {
      if (!sameOrigin(request) || !csrfValid(request, session)) return json(response, 403, { ok: false, error: "CSRF validation failed" });
      try {
        const body = await readJson(request);
        const agentId = decodeURIComponent(url.pathname.split("/")[3]);
        const agent = storage.listAgents(user.id).find((item) => item.id === agentId);
        if (!agent) return json(response, 404, { ok: false, error: "Agent not found" });
        const label = String(body.label || "Agent runtime").trim().slice(0, 80);
        const expiresInHours = Number(body.expiresInHours || 24);
        if (label.length < 2) return json(response, 400, { ok: false, error: "Token label is required" });
        if (!Number.isInteger(expiresInHours) || expiresInHours < 1 || expiresInHours > 168) return json(response, 400, { ok: false, error: "Agent token lifetime must be 1-168 hours" });
        const agentExpiry = Date.parse(agent.expires);
        if (!Number.isFinite(agentExpiry) || agentExpiry <= Date.now()) return json(response, 400, { ok: false, error: "Agent identity is expired" });
        const expiresAt = new Date(Math.min(Date.now() + expiresInHours * 60 * 60 * 1000, agentExpiry)).toISOString();
        const token = createAgentToken();
        storage.createAgentToken({ workspaceId: user.id, agentId, ...token, label, expiresAt, actor: session.username });
        return json(response, 201, { ok: true, token: token.token,
          metadata: { tokenId: token.tokenId, agentId, applicationId: agent.applicationId, label, prefix: token.prefix, fingerprint: token.fingerprint, expiresAt },
          warning: "Copy this agent token now. It will not be shown again." });
      } catch (error) { return json(response, 400, { ok: false, error: error.message }); }
    }
    if (request.method === "POST" && url.pathname === "/api/applications") {
      if (!sameOrigin(request) || !csrfValid(request, session)) return json(response, 403, { ok: false, error: "CSRF validation failed" });
      try {
        const body = await readJson(request);
        const id = String(body.id || "").trim();
        const name = String(body.name || "").trim();
        const environment = String(body.environment || "development");
        const budget = Number(body.budget);
        const capabilityIds = Array.isArray(body.capabilityIds) ? [...new Set(body.capabilityIds.map(String))] : [];
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.length > 50) return json(response, 400, { ok: false, error: "Application ID must be a lowercase slug" });
        if (name.length < 2 || name.length > 100) return json(response, 400, { ok: false, error: "Application name must be 2-100 characters" });
        if (!new Set(["development", "sandbox"]).has(environment)) return json(response, 400, { ok: false, error: "MVP applications must use development or sandbox" });
        if (!Number.isFinite(budget) || budget < 1 || budget > 1_000_000) return json(response, 400, { ok: false, error: "Budget must be between 1 and 1000000" });
        if (capabilityIds.length > 50) return json(response, 400, { ok: false, error: "Too many initial capability grants" });
        storage.createApplication({ workspaceId: user.id, id, name, environment, budget, capabilityIds, actor: session.username });
        return json(response, 201, { ok: true, application: { id, name, environment, budget, capabilities: capabilityIds.length, state: "active" } });
      } catch (error) {
        const duplicate = String(error.message).includes("UNIQUE constraint");
        return json(response, duplicate ? 409 : 400, { ok: false, error: duplicate ? "Application ID already exists" : error.message });
      }
    }
    if (request.method === "POST" && url.pathname === "/api/capability-proposals") {
      if (!sameOrigin(request) || !csrfValid(request, session)) return json(response, 403, { ok: false, error: "CSRF validation failed" });
      try {
        const body = await readJson(request);
        const capabilityId = String(body.capabilityId || "").trim();
        const label = String(body.label || "").trim();
        const description = String(body.description || "").trim();
        const primaryProviderId = String(body.primaryProviderId || "").trim();
        const fallbackProviderId = body.fallbackProviderId ? String(body.fallbackProviderId).trim() : null;
        const dataClassification = String(body.dataClassification || "internal");
        const retentionPolicy = String(body.retentionPolicy || "metadata_only");
        if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)+$/.test(capabilityId) || capabilityId.length > 100) return json(response, 400, { ok: false, error: "Capability ID must be a stable dotted identifier" });
        if (label.length < 2 || label.length > 100) return json(response, 400, { ok: false, error: "Capability label must be 2-100 characters" });
        if (description.length < 10 || description.length > 1000) return json(response, 400, { ok: false, error: "Capability description must be 10-1000 characters" });
        if (!new Set(["public", "internal", "confidential", "restricted"]).has(dataClassification)) return json(response, 400, { ok: false, error: "Invalid data classification" });
        if (!new Set(["none", "metadata_only", "ephemeral"]).has(retentionPolicy)) return json(response, 400, { ok: false, error: "Invalid retention policy" });
        const inputContract = contractSchema(body.inputContract, "Input");
        const outputContract = contractSchema(body.outputContract, "Output");
        storage.createCapabilityProposal({ workspaceId: user.id, capabilityId, label, description,
          primaryProviderId, fallbackProviderId, inputContract, outputContract, dataClassification,
          retentionPolicy, actor: session.username });
        return json(response, 201, { ok: true, proposal: { capabilityId, label, description, primaryProviderId,
          fallbackProviderId, inputContract, outputContract, dataClassification, retentionPolicy, status: "candidate" } });
      } catch (error) {
        const duplicate = String(error.message).includes("UNIQUE constraint");
        return json(response, duplicate ? 409 : 400, { ok: false, error: duplicate ? "Capability proposal or active ID already exists" : error.message });
      }
    }
    if (request.method === "POST" && /^\/api\/capability-proposals\/[^/]+\/activate$/.test(url.pathname)) {
      if (!sameOrigin(request) || !csrfValid(request, session)) return json(response, 403, { ok: false, error: "CSRF validation failed" });
      try {
        const body = await readJson(request);
        const capabilityId = decodeURIComponent(url.pathname.split("/")[3]);
        if (body.confirm !== `ACTIVATE ${capabilityId}`) return json(response, 400, { ok: false, error: "Explicit capability activation confirmation required" });
        storage.activateCapabilityProposal({ workspaceId: user.id, capabilityId, actor: session.username });
        return json(response, 200, { ok: true, capabilityId, status: "activated" });
      } catch (error) {
        return json(response, 400, { ok: false, error: error.message });
      }
    }
    if (request.method === "PUT" && /^\/api\/applications\/[^/]+\/grants\/[^/]+$/.test(url.pathname)) {
      if (!sameOrigin(request) || !csrfValid(request, session)) return json(response, 403, { ok: false, error: "CSRF validation failed" });
      try {
        const body = await readJson(request);
        const segments = url.pathname.split("/");
        const applicationId = decodeURIComponent(segments[3]);
        const capabilityId = decodeURIComponent(segments[5]);
        const rpmLimit = Number(body.rpmLimit);
        const dailyLimit = Number(body.dailyLimit);
        if (!Number.isInteger(rpmLimit) || rpmLimit < 1 || rpmLimit > 10_000) return json(response, 400, { ok: false, error: "RPM limit must be 1-10000" });
        if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 10_000_000) return json(response, 400, { ok: false, error: "Daily limit must be 1-10000000" });
        storage.setCapabilityGrant({ workspaceId: user.id, applicationId, capabilityId, rpmLimit, dailyLimit, enabled: body.enabled !== false, actor: session.username });
        return json(response, 200, { ok: true, grant: { applicationId, capabilityId, rpmLimit, dailyLimit, enabled: body.enabled !== false } });
      } catch (error) {
        return json(response, 400, { ok: false, error: error.message });
      }
    }
    if (request.method === "DELETE" && /^\/api\/application-tokens\/[^/]+$/.test(url.pathname)) {
      if (!sameOrigin(request) || !csrfValid(request, session)) return json(response, 403, { ok: false, error: "CSRF validation failed" });
      try {
        const body = await readJson(request);
        if (body.confirm !== "REVOKE") return json(response, 400, { ok: false, error: "Explicit revoke confirmation required" });
        const tokenId = decodeURIComponent(url.pathname.split("/")[3]);
        storage.revokeApplicationToken({ workspaceId: user.id, tokenId, actor: session.username });
        return json(response, 200, { ok: true, tokenId, status: "revoked" });
      } catch (error) {
        return json(response, 404, { ok: false, error: error.message });
      }
    }
    if (request.method === "DELETE" && /^\/api\/agent-tokens\/[^/]+$/.test(url.pathname)) {
      if (!sameOrigin(request) || !csrfValid(request, session)) return json(response, 403, { ok: false, error: "CSRF validation failed" });
      try {
        const body = await readJson(request);
        if (body.confirm !== "REVOKE") return json(response, 400, { ok: false, error: "Explicit revoke confirmation required" });
        const tokenId = decodeURIComponent(url.pathname.split("/")[3]);
        storage.revokeAgentToken({ workspaceId: user.id, tokenId, actor: session.username });
        return json(response, 200, { ok: true, tokenId, status: "revoked" });
      } catch (error) { return json(response, 404, { ok: false, error: error.message }); }
    }
    if (url.pathname === "/api/users") return json(response, 200, { ok: true, users: [publicUser(user)] });
    if (url.pathname === "/api/overview") return json(response, 200, { ok: true, user: publicUser(user), overview: overviewFor(user) });
    if (url.pathname === "/api/providers") return json(response, 200, { ok: true, user: publicUser(user), providers: storage.listProviders(user.id) });
    if (url.pathname === "/api/capabilities") return json(response, 200, { ok: true, user: publicUser(user), capabilities: storage.listCapabilities(user.id) });
    if (url.pathname === "/api/applications") return json(response, 200, { ok: true, user: publicUser(user), applications: storage.listApplications(user.id) });
    if (url.pathname === "/api/application-tokens") return json(response, 200, { ok: true, tokens: storage.listApplicationTokens(user.id) });
    if (url.pathname === "/api/agent-tokens") return json(response, 200, { ok: true, tokens: storage.listAgentTokens(user.id) });
    if (url.pathname === "/api/grants") return json(response, 200, { ok: true, grants: storage.listGrants(user.id) });
    if (url.pathname === "/api/invocations") return json(response, 200, { ok: true, invocations: storage.listInvocations(user.id) });
    if (url.pathname === "/api/usage") return json(response, 200, { ok: true, usage: storage.usageAnalytics(user.id) });
    if (url.pathname === "/api/analytics") {
      const range = url.searchParams.get("range") || "24h";
      if (!["24h", "7d", "30d"].includes(range)) return json(response, 400, { ok: false, error: "Unsupported analytics range" });
      return json(response, 200, { ok: true, analytics: storage.usageAnalyticsRange(user.id, range) });
    }
    if (url.pathname === "/api/idempotency") return json(response, 200, { ok: true, records: storage.listIdempotency(user.id) });
    if (url.pathname === "/api/provider-metrics") return json(response, 200, { ok: true, history: storage.listMetricHistory(user.id) });
    if (url.pathname === "/api/alerts") return json(response, 200, { ok: true, alerts: storage.listAlerts(user.id, url.searchParams.get("status") || "open") });
    if (url.pathname === "/api/capability-proposals") return json(response, 200, { ok: true, proposals: storage.listCapabilityProposals(user.id) });
    if (url.pathname === "/api/agents") return json(response, 200, { ok: true, user: publicUser(user), agents: storage.listAgents(user.id) });
    if (url.pathname === "/api/audit") return json(response, 200, { ok: true, user: publicUser(user), audits: storage.listAudits(user.id) });
    if (url.pathname === "/api/database") return json(response, 200, { ok: true, ...databaseFor(user) });
    if (url.pathname.startsWith("/api/")) return json(response, 404, { ok: false, error: "Unknown API route" });
    serveStatic(url, response);
  });

server.listen(port, networkSettings.host, () => console.log(`API Hub running with ${networkSettings.tls ? "TLS" : "loopback HTTP"} and authenticated SQLite storage on port ${port}`));

function shutdown() {
  server.close(() => {
    storage.close();
    process.exit(0);
  });
  server.closeAllConnections();
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
