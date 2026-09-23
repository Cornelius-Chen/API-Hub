const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ApiHubClient } = require("../src/api-hub-client.js");

const port = 4311;
const root = path.resolve(__dirname, "..");
const testRunId = process.env.API_HUB_TEST_RUN_ID || String(process.pid);
const runtimeBase = path.join(os.tmpdir(), `api-hub-test-security-${testRunId}`);
const dbPath = `${runtimeBase}.sqlite`;
const vaultPath = `${runtimeBase}.key`;
const testPassword = "synthetic-only-password-4311";
const testLauncherToken = "synthetic-launcher-control-token";
let server;
let cookie;
let csrf;

function startServer() {
  server = childProcess.spawn(process.execPath, [path.join(root, "server.js")], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      API_HUB_DB_PATH: dbPath,
      API_HUB_VAULT_KEY_PATH: vaultPath,
      API_HUB_LAUNCHER_TOKEN: testLauncherToken,
      API_HUB_TEST_GATEWAY_DELAY_MS: "75",
    },
    stdio: "ignore",
    windowsHide: true,
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (!server || server.exitCode !== null) return resolve();
    server.once("exit", resolve);
    server.kill();
    setTimeout(() => {
      if (server.exitCode === null) server.kill("SIGKILL");
    }, 2_000).unref();
    setTimeout(resolve, 5_000).unref();
  });
}

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Test server did not start.");
}

async function request(pathname, options = {}) {
  const headers = { ...(options.body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}), ...options.headers };
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { ...options, headers });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";", 1)[0];
  return { response, payload: await response.json() };
}

async function run() {
  startServer();
  await waitForServer();

  const unauthorized = await request("/api/providers");
  assert.equal((await request('/api/website-credential')).response.status, 401);
  assert.equal(unauthorized.response.status, 401, "workspace data must require authentication");
  const status = await request("/api/auth/status");
  assert.equal(status.payload.needsSetup, true);
  assert.match(status.response.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.equal(status.response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(status.response.headers.get("referrer-policy"), "no-referrer");

  const setup = await request("/api/auth/setup", {
    method: "POST",
    body: JSON.stringify({ username: "local-owner", password: testPassword }),
  });
  assert.equal(setup.response.status, 201);
  csrf = setup.payload.csrf;
  assert.equal(typeof csrf, "string");
  assert.equal(setup.payload.user.id, "owner");

  const executionPolicy = await request("/api/security/execution");
  assert.equal(executionPolicy.response.status, 200);
  assert.equal(executionPolicy.payload.execution.mode, "dry_run");
  assert.equal(executionPolicy.payload.execution.liveGate, "locked");
  assert.deepEqual(executionPolicy.payload.execution.registeredProviders, ["deepseek"]);
  assert.equal(executionPolicy.payload.activationRequirements.length, 5);

  const originalCookie = cookie;
  const websiteSecret = '@#￥%中文';
  assert.equal((await request('/api/website-credential', { method: 'PUT', headers: { 'x-csrf-token': 'invalid' }, body: JSON.stringify({ secret: websiteSecret }) })).response.status, 403);
  const websiteSave = await request('/api/website-credential', { method: 'PUT', headers: { 'x-csrf-token': csrf }, body: JSON.stringify({ secret: websiteSecret }) });
  assert.equal(websiteSave.response.status, 200);
  assert.equal(websiteSave.payload.configured, true);
  assert.equal(websiteSave.payload.automaticLogin, false);
  assert.ok(!JSON.stringify(websiteSave.payload).includes(websiteSecret));
  const websiteRead = await request('/api/website-credential');
  assert.deepEqual(Object.keys(websiteRead.payload).sort(), ['automaticLogin','configured','enabled','ok','updatedAt'].sort());
  const websiteDisable = await request('/api/website-credential', { method: 'POST', headers: { 'x-csrf-token': csrf }, body: JSON.stringify({ action: 'disable' }) });
  assert.equal(websiteDisable.payload.enabled, false);
  const secondLogin = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: "local-owner", password: testPassword }),
  });
  assert.equal(secondLogin.response.status, 200);
  csrf = secondLogin.payload.csrf;
  const secondCookie = cookie;
  const sessionInventory = await request("/api/security/sessions");
  assert.equal(sessionInventory.payload.sessions.length, 2);
  assert.equal(JSON.stringify(sessionInventory.payload).includes("tokenHash"), false);
  assert.equal(JSON.stringify(sessionInventory.payload).includes("clientHash"), false);
  const originalSession = sessionInventory.payload.sessions.find((item) => !item.current);
  assert.ok(originalSession.sessionId);
  const wrongSessionRevoke = await request(`/api/security/sessions/${originalSession.sessionId}/revoke`, {
    method: "POST",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ confirm: "yes" }),
  });
  assert.equal(wrongSessionRevoke.response.status, 400);
  const revokedSession = await request(`/api/security/sessions/${originalSession.sessionId}/revoke`, {
    method: "POST",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ confirm: "REVOKE SESSION" }),
  });
  assert.equal(revokedSession.response.status, 200);
  cookie = originalCookie;
  const revokedCookieUse = await request("/api/providers");
  assert.equal(revokedCookieUse.response.status, 401);
  cookie = secondCookie;

  const duplicateSetup = await request("/api/auth/setup", {
    method: "POST",
    body: JSON.stringify({ username: "another", password: testPassword }),
  });
  assert.equal(duplicateSetup.response.status, 409, "bootstrap setup must close after first account");

  const owner = await request("/api/database?user=client-lab");
  assert.equal(owner.payload.user.id, "owner", "query parameters must not override authenticated workspace");
  assert.deepEqual(owner.payload.records.providers.map((item) => item.id), ["openai", "deepseek", "spotify", "google"]);
  assert.equal(/"userId"\s*:/.test(JSON.stringify(owner.payload)), false);

  const rejectedWrite = await request("/api/providers/openai/credential", {
    method: "PUT",
    headers: { "x-csrf-token": "wrong-token" },
    body: JSON.stringify({ secret: "synthetic-provider-credential-value" }),
  });
  assert.equal(rejectedWrite.response.status, 403);

  const plaintext = "synthetic-provider-credential-value";
  const stored = await request("/api/providers/openai/credential", {
    method: "PUT",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ secret: plaintext }),
  });
  assert.equal(stored.response.status, 200);
  assert.equal(stored.payload.credential.status, "configured");
  assert.equal(JSON.stringify(stored.payload).includes(plaintext), false);

  const providerSecret = "synthetic-new-provider-credential";
  const createdProvider = await request("/api/providers", {
    method: "POST",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({
      workspaceId: "client-lab",
      id: "synthetic-ai",
      name: "Synthetic AI",
      category: "Text generation",
      website: "https://example.com",
      docs: "https://example.com/docs",
      consoleUrl: "https://example.com/console",
      apiBase: "https://api.example.com/v1",
      environment: "sandbox",
      secret: providerSecret,
      quotaRemaining: 74,
      quotaUnit: "% synthetic allowance",
      quotaSource: "estimated",
    }),
  });
  assert.equal(createdProvider.response.status, 201, JSON.stringify(createdProvider.payload));
  assert.equal(JSON.stringify(createdProvider.payload).includes(providerSecret), false);
  const providersAfterCreate = await request("/api/providers");
  assert.equal(providersAfterCreate.payload.user.id, "owner", "body workspace ID must not override session scope");
  assert.equal(providersAfterCreate.payload.providers.at(-1).id, "synthetic-ai");

  const duplicateProvider = await request("/api/providers", {
    method: "POST",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ id: "synthetic-ai", name: "Duplicate", category: "AI", website: "https://example.com",
      docs: "https://example.com/docs", consoleUrl: "https://example.com/console", apiBase: "https://api.example.com/v1",
      environment: "sandbox", secret: providerSecret, quotaRemaining: 50, quotaUnit: "% allowance", quotaSource: "manual" }),
  });
  assert.equal(duplicateProvider.response.status, 409);
  const unsafeProviderUrl = await request("/api/providers", {
    method: "POST",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ id: "unsafe-provider", name: "Unsafe", category: "AI", website: "http://example.com",
      docs: "https://example.com/docs", consoleUrl: "https://example.com/console", apiBase: "https://api.example.com/v1",
      environment: "sandbox", secret: providerSecret, quotaRemaining: 50, quotaUnit: "% allowance", quotaSource: "manual" }),
  });
  assert.equal(unsafeProviderUrl.response.status, 400);

  const forbiddenOfficialSource = await request("/api/providers/synthetic-ai/metrics", {
    method: "PUT",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ remaining: 9, unit: "% synthetic allowance", source: "provider_api", monthCost: 12.34, peakRpm: 87 }),
  });
  assert.equal(forbiddenOfficialSource.response.status, 400, "human input must not claim official provider API provenance");

  const lowMetric = await request("/api/providers/synthetic-ai/metrics", {
    method: "PUT",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ remaining: 9, unit: "% synthetic allowance", source: "manual", monthCost: 12.34, peakRpm: 87 }),
  });
  assert.equal(lowMetric.response.status, 201);
  let openAlerts = await request("/api/alerts");
  const lowAlert = openAlerts.payload.alerts.find((item) => item.providerId === "synthetic-ai" && item.kind === "quota_low");
  assert.equal(lowAlert.severity, "critical");

  const recoveredMetric = await request("/api/providers/synthetic-ai/metrics", {
    method: "PUT",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ remaining: 55, unit: "% synthetic allowance", source: "estimated", monthCost: 13.25, peakRpm: 102 }),
  });
  assert.equal(recoveredMetric.response.status, 201);
  openAlerts = await request("/api/alerts");
  assert.equal(openAlerts.payload.alerts.some((item) => item.providerId === "synthetic-ai" && item.kind === "quota_low"), false);
  const allAlerts = await request("/api/alerts?status=all");
  assert.equal(allAlerts.payload.alerts.some((item) => item.providerId === "synthetic-ai" && item.kind === "quota_low" && item.status === "resolved"), true);
  const metricHistory = await request("/api/provider-metrics");
  const syntheticHistory = metricHistory.payload.history.filter((item) => item.providerId === "synthetic-ai");
  assert.equal(syntheticHistory.length, 3, "provider create plus two updates should create three immutable snapshots");
  assert.equal(syntheticHistory[0].remaining, 55);
  assert.equal(syntheticHistory[0].peakRpm, 102);
  assert.equal(syntheticHistory[0].monthCost, 13.25);

  const crossWorkspaceProposal = await request("/api/capability-proposals", {
    method: "POST",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ capabilityId: "email.bulk.send", label: "Bulk email", description: "Send a governed bulk email batch.",
      primaryProviderId: "resend", inputContract: { type: "object" }, outputContract: { type: "object" },
      dataClassification: "confidential", retentionPolicy: "metadata_only" }),
  });
  assert.equal(crossWorkspaceProposal.response.status, 400, "proposal cannot route to another workspace provider");

  const capabilityId = "research.web.search";
  const proposed = await request("/api/capability-proposals", {
    method: "POST",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({
      capabilityId,
      label: "Search governed research sources",
      description: "Search approved research sources through a governed provider route.",
      primaryProviderId: "google",
      fallbackProviderId: null,
      inputContract: { type: "object", additionalProperties: false, required: ["query"], properties: { query: { type: "string", maxLength: 200 } } },
      outputContract: { type: "object", required: ["results"], properties: { results: { type: "array" } } },
      dataClassification: "confidential",
      retentionPolicy: "ephemeral",
    }),
  });
  assert.equal(proposed.response.status, 201, JSON.stringify(proposed.payload));
  let activeCapabilities = await request("/api/capabilities");
  assert.equal(activeCapabilities.payload.capabilities.some((item) => item.id === capabilityId), false, "candidate must not enter active catalog");
  const candidateGrant = await request(`/api/applications/api-hub-console/grants/${capabilityId}`, {
    method: "PUT",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ enabled: true, rpmLimit: 5, dailyLimit: 20 }),
  });
  assert.equal(candidateGrant.response.status, 400, "candidate must not be grantable");
  const unconfirmedActivation = await request(`/api/capability-proposals/${capabilityId}/activate`, {
    method: "POST",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ confirm: "yes" }),
  });
  assert.equal(unconfirmedActivation.response.status, 400);
  const activated = await request(`/api/capability-proposals/${capabilityId}/activate`, {
    method: "POST",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ confirm: `ACTIVATE ${capabilityId}` }),
  });
  assert.equal(activated.response.status, 200);
  activeCapabilities = await request("/api/capabilities");
  const activeResearch = activeCapabilities.payload.capabilities.find((item) => item.id === capabilityId);
  assert.equal(activeResearch.dataClassification, "confidential");
  assert.equal(activeResearch.inputContract.required[0], "query");
  const proposalInventory = await request("/api/capability-proposals");
  assert.equal(proposalInventory.payload.proposals.find((item) => item.capabilityId === capabilityId).status, "activated");

  const crossWorkspaceToken = await request("/api/applications/client-portal/tokens", {
    method: "POST",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ label: "forbidden workspace" }),
  });
  assert.equal(crossWorkspaceToken.response.status, 404);

  const issued = await request("/api/applications/api-hub-console/tokens", {
    method: "POST",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ label: "synthetic integration test" }),
  });
  assert.equal(issued.response.status, 201);
  const applicationToken = issued.payload.token;
  assert.match(applicationToken, /^ah_dev_[A-Za-z0-9_-]+$/);
  const tokenInventory = await request("/api/application-tokens");
  assert.equal(JSON.stringify(tokenInventory.payload).includes(applicationToken), false, "application token must be returned only once");

  const client = new ApiHubClient({ baseUrl: `http://127.0.0.1:${port}`, token: applicationToken });
  const manifest = await client.capabilities();
  assert.equal(manifest.application.id, "api-hub-console");
  assert.deepEqual(manifest.capabilities.map((item) => item.capabilityId), ["ai.text.generate"]);
  assert.equal(manifest.gateway.executionMode, "dry_run");
  assert.deepEqual(manifest.capabilities[0].usage, {
    source: "gateway_observed",
    minute: { used: 0, limit: 30, remaining: 30 },
    day: { used: 0, limit: 1000, remaining: 1000 },
  });
  const applicationOpenApi = await client.openapi();
  assert.equal(applicationOpenApi.openapi, "3.1.0");
  assert.equal(applicationOpenApi["x-api-hub-identity"].type, "application");
  assert.equal(applicationOpenApi["x-api-hub-identity"].applicationId, "api-hub-console");
  const applicationVariants = applicationOpenApi.paths["/gateway/v1/invoke"].post.requestBody.content["application/json"].schema.oneOf;
  assert.deepEqual(applicationVariants.map((item) => item.properties.capability.const), ["ai.text.generate"]);
  assert.equal(applicationVariants[0].properties.input.type, "object");
  assert.equal(JSON.stringify(applicationOpenApi).includes(applicationToken), false);
  assert.equal(JSON.stringify(applicationOpenApi).includes("providerApiBase"), false);
  assert.equal(JSON.stringify(applicationOpenApi).includes("credential"), true, "security description may explain that credentials are never accepted");

  const missingGatewayToken = await request("/gateway/v1/invoke", {
    method: "POST",
    body: JSON.stringify({ capability: "ai.text.generate", input: { prompt: "synthetic private input" } }),
  });
  assert.equal(missingGatewayToken.response.status, 401);

  const oversizedGateway = await request("/gateway/v1/invoke", {
    method: "POST",
    headers: { authorization: `Bearer ${applicationToken}` },
    body: JSON.stringify({ capability: "ai.text.generate", input: { prompt: "x".repeat(33_000) } }),
  });
  assert.equal(oversizedGateway.response.status, 413);
  assert.equal(oversizedGateway.payload.reason, "request_body_too_large");
  assert.equal(oversizedGateway.response.headers.get("x-request-id"), oversizedGateway.payload.requestId);

  const invalidJsonResponse = await fetch(`http://127.0.0.1:${port}/gateway/v1/invoke`, {
    method: "POST",
    headers: { authorization: `Bearer ${applicationToken}`, "content-type": "application/json" },
    body: "{not-json",
  });
  const invalidJson = await invalidJsonResponse.json();
  assert.equal(invalidJsonResponse.status, 400);
  assert.equal(invalidJson.reason, "invalid_json");
  assert.equal(invalidJsonResponse.headers.get("x-request-id"), invalidJson.requestId);

  const allowedGateway = await request("/gateway/v1/invoke", {
    method: "POST",
    headers: { authorization: `Bearer ${applicationToken}` },
    body: JSON.stringify({ capability: "ai.text.generate", input: { prompt: "synthetic private input" } }),
  });
  assert.equal(allowedGateway.response.status, 200);
  assert.equal(allowedGateway.payload.executionMode, "dry_run");
  assert.equal(allowedGateway.payload.result.externalRequestSent, false);
  assert.equal(allowedGateway.payload.application.id, "api-hub-console");

  const deniedGateway = await request("/gateway/v1/invoke", {
    method: "POST",
    headers: { authorization: `Bearer ${applicationToken}` },
    body: JSON.stringify({ capability: "music.playback.control", input: {} }),
  });
  assert.equal(deniedGateway.response.status, 403);
  assert.equal(deniedGateway.payload.reason, "capability_not_granted");

  const invocations = await request("/api/invocations");
  assert.equal(invocations.payload.invocations.length, 2);
  assert.equal(JSON.stringify(invocations.payload).includes("synthetic private input"), false, "gateway input must not enter audit records");

  for (let index = 0; index < 29; index += 1) {
    const withinLimit = await request("/gateway/v1/invoke", {
      method: "POST",
      headers: { authorization: `Bearer ${applicationToken}` },
      body: JSON.stringify({ capability: "ai.text.generate", input: {} }),
    });
    assert.equal(withinLimit.response.status, 200, `request ${index + 2} should remain inside RPM policy`);
  }
  const rateLimited = await request("/gateway/v1/invoke", {
    method: "POST",
    headers: { authorization: `Bearer ${applicationToken}` },
    body: JSON.stringify({ capability: "ai.text.generate", input: {} }),
  });
  assert.equal(rateLimited.response.status, 429);
  assert.equal(rateLimited.payload.reason, "rpm_limit_exceeded");
  assert.equal(rateLimited.response.headers.get("retry-after"), "60");
  const observedUsage = await request("/api/usage");
  assert.equal(observedUsage.response.status, 200);
  assert.equal(observedUsage.payload.usage.source, "gateway_observed");
  const consoleUsage = observedUsage.payload.usage.applications.find((item) => item.applicationId === "api-hub-console");
  assert.equal(consoleUsage.total, 32);
  assert.equal(consoleUsage.allowed, 30);
  assert.equal(consoleUsage.denied, 2);
  assert.equal(consoleUsage.peakRpm, 30);
  const analytics = await request("/api/analytics?range=24h");
  assert.equal(analytics.response.status, 200);
  assert.equal(analytics.payload.analytics.source, "gateway_observed");
  assert.equal(analytics.payload.analytics.bucketHours, 1);
  assert.equal(analytics.payload.analytics.bucketCount, 24);
  assert.equal(analytics.payload.analytics.providers.reduce((total, item) => total + item.total, 0), 32);
  assert.equal(analytics.payload.analytics.providers.find((item) => item.providerName === "OpenAI").allowed, 30);
  assert.equal(analytics.payload.analytics.providers.find((item) => item.providerId === "unrouted").denied, 2);
  const weeklyAnalytics = await request("/api/analytics?range=7d");
  assert.equal(weeklyAnalytics.payload.analytics.bucketHours, 6);
  assert.equal(weeklyAnalytics.payload.analytics.bucketCount, 28);
  const invalidAnalytics = await request("/api/analytics?range=year");
  assert.equal(invalidAnalytics.response.status, 400);
  const textUsage = observedUsage.payload.usage.capabilities.find((item) => item.applicationId === "api-hub-console" && item.capabilityId === "ai.text.generate");
  assert.equal(textUsage.allowed, 30);
  assert.equal(textUsage.denied, 1);
  const exhaustedManifest = await client.capabilities();
  assert.equal(exhaustedManifest.capabilities[0].usage.minute.used, 30);
  assert.equal(exhaustedManifest.capabilities[0].usage.minute.remaining, 0);
  assert.equal(exhaustedManifest.capabilities[0].usage.day.used, 30);
  assert.equal(exhaustedManifest.capabilities[0].usage.day.remaining, 970);

  const newApplication = await request("/api/applications", {
    method: "POST",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ id: "new-saas", name: "New SaaS", environment: "sandbox", budget: 25, capabilityIds: ["ai.structured.generate"] }),
  });
  assert.equal(newApplication.response.status, 201);
  const duplicateApplication = await request("/api/applications", {
    method: "POST",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ id: "new-saas", name: "Duplicate", environment: "sandbox", budget: 25 }),
  });
  assert.equal(duplicateApplication.response.status, 409);

  const grant = await request("/api/applications/new-saas/grants/calendar.events.read", {
    method: "PUT",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ enabled: true, rpmLimit: 12, dailyLimit: 250 }),
  });
  assert.equal(grant.response.status, 200, JSON.stringify(grant.payload));
  const researchGrant = await request(`/api/applications/new-saas/grants/${capabilityId}`, {
    method: "PUT",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ enabled: true, rpmLimit: 8, dailyLimit: 100 }),
  });
  assert.equal(researchGrant.response.status, 200);
  const crossWorkspaceAgent = await request("/api/agents", {
    method: "POST",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ id: "forbidden-agent", name: "Forbidden agent", applicationId: "client-portal",
      capabilityIds: [capabilityId], expiresInHours: 24 }),
  });
  assert.equal(crossWorkspaceAgent.response.status, 400, "agent cannot bind to another workspace application");

  const delegatedAgent = await request("/api/agents", {
    method: "POST",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ id: "research-worker", name: "Research worker", applicationId: "new-saas",
      capabilityIds: ["calendar.events.read", capabilityId], expiresInHours: 48 }),
  });
  assert.equal(delegatedAgent.response.status, 201, JSON.stringify(delegatedAgent.payload));
  const duplicateAgent = await request("/api/agents", {
    method: "POST",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ id: "research-worker", name: "Duplicate worker", applicationId: "new-saas",
      capabilityIds: [capabilityId], expiresInHours: 24 }),
  });
  assert.equal(duplicateAgent.response.status, 409);
  const agentPrivilegeEscalation = await request("/api/agents", {
    method: "POST",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ id: "overpowered-agent", name: "Overpowered", applicationId: "new-saas",
      capabilityIds: ["music.playback.control"], expiresInHours: 24 }),
  });
  assert.equal(agentPrivilegeEscalation.response.status, 400, "agent grant must be a subset of application grants");

  const issuedAgent = await request("/api/agents/research-worker/tokens", {
    method: "POST",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ label: "research runtime", expiresInHours: 24 }),
  });
  assert.equal(issuedAgent.response.status, 201, JSON.stringify(issuedAgent.payload));
  const agentTokenPlaintext = issuedAgent.payload.token;
  assert.match(agentTokenPlaintext, /^ah_agent_[A-Za-z0-9_-]+$/);
  const delegatedClient = new ApiHubClient({ baseUrl: `http://127.0.0.1:${port}`, token: agentTokenPlaintext });
  const delegatedManifest = await delegatedClient.capabilities();
  assert.equal(delegatedManifest.identity.type, "agent");
  assert.equal(delegatedManifest.identity.agentId, "research-worker");
  assert.deepEqual(delegatedManifest.capabilities.map((item) => item.capabilityId), ["calendar.events.read", capabilityId]);
  const delegatedOpenApi = await delegatedClient.openapi();
  assert.equal(delegatedOpenApi["x-api-hub-identity"].type, "agent");
  assert.equal(delegatedOpenApi["x-api-hub-identity"].agentId, "research-worker");
  const delegatedVariants = delegatedOpenApi.paths["/gateway/v1/invoke"].post.requestBody.content["application/json"].schema.oneOf;
  assert.deepEqual(delegatedVariants.map((item) => item.properties.capability.const), ["calendar.events.read", capabilityId]);
  const delegatedInvocation = await delegatedClient.invoke(capabilityId, { query: "synthetic delegated research" });
  assert.equal(delegatedInvocation.identity.type, "agent");
  assert.equal(delegatedInvocation.result.externalRequestSent, false);
  const agentOverreach = await request("/gateway/v1/invoke", {
    method: "POST",
    headers: { authorization: `Bearer ${agentTokenPlaintext}` },
    body: JSON.stringify({ capability: "ai.structured.generate", input: {} }),
  });
  assert.equal(agentOverreach.response.status, 403);
  assert.equal(agentOverreach.payload.reason, "agent_capability_not_granted");

  const revokedAgentToken = await request(`/api/agent-tokens/${issuedAgent.payload.metadata.tokenId}`, {
    method: "DELETE",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ confirm: "REVOKE" }),
  });
  assert.equal(revokedAgentToken.response.status, 200);
  const revokedAgentUse = await request("/gateway/v1/capabilities", { headers: { authorization: `Bearer ${agentTokenPlaintext}` } });
  assert.equal(revokedAgentUse.response.status, 401, "revoked agent token must stop immediately");
  const revokedAgentOpenApi = await request("/gateway/v1/openapi.json", { headers: { authorization: `Bearer ${agentTokenPlaintext}` } });
  assert.equal(revokedAgentOpenApi.response.status, 401, "revoked agent token must not export a contract");
  const expiringAgent = await request("/api/agents/research-worker/tokens", {
    method: "POST",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ label: "expiry proof", expiresInHours: 1 }),
  });
  assert.equal(expiringAgent.response.status, 201);
  const expireMutation = childProcess.spawnSync(process.execPath, ["-e", `
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(process.env.DB_PATH);
    db.prepare("UPDATE agent_tokens SET expires_at = datetime('now', '-1 minute') WHERE token_id = ?").run(process.env.TOKEN_ID);
    db.close();
  `], { cwd: root, env: { ...process.env, DB_PATH: dbPath, TOKEN_ID: expiringAgent.payload.metadata.tokenId }, encoding: "utf8" });
  assert.equal(expireMutation.status, 0, expireMutation.stderr);
  const expiredAgentUse = await request("/gateway/v1/capabilities", { headers: { authorization: `Bearer ${expiringAgent.payload.token}` } });
  assert.equal(expiredAgentUse.response.status, 401, "expired agent token must stop automatically");
  const agentTokenInventory = await request("/api/agent-tokens");
  assert.equal(JSON.stringify(agentTokenInventory.payload).includes(agentTokenPlaintext), false);
  const newToken = await request("/api/applications/new-saas/tokens", {
    method: "POST",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ label: "new SaaS server" }),
  });
  assert.equal(newToken.response.status, 201);
  const newClient = new ApiHubClient({ baseUrl: `http://127.0.0.1:${port}`, token: newToken.payload.token });
  const newManifest = await newClient.capabilities();
  assert.deepEqual(newManifest.capabilities.map((item) => item.capabilityId), ["ai.structured.generate", "calendar.events.read", capabilityId]);
  const concurrent = await Promise.all(Array.from({ length: 5 }, (_, index) => request("/gateway/v1/invoke", {
    method: "POST",
    headers: { authorization: `Bearer ${newToken.payload.token}` },
    body: JSON.stringify({ capability: "calendar.events.read", input: { sequence: index } }),
  })));
  assert.deepEqual(concurrent.map((item) => item.response.status).sort(), [200, 200, 200, 200, 429]);
  const overloaded = concurrent.find((item) => item.response.status === 429);
  assert.equal(overloaded.payload.reason, "gateway_overloaded");
  assert.equal(overloaded.response.headers.get("retry-after"), "1");
  assert.equal(overloaded.response.headers.get("x-request-id"), overloaded.payload.requestId);
  const invalidContractCall = await request("/gateway/v1/invoke", {
    method: "POST",
    headers: { authorization: `Bearer ${newToken.payload.token}` },
    body: JSON.stringify({ capability: capabilityId, input: {} }),
  });
  assert.equal(invalidContractCall.response.status, 403);
  assert.equal(invalidContractCall.payload.reason, "input_contract_violation");
  const validContractCall = await newClient.invoke(capabilityId, { query: "synthetic governed research" });
  assert.equal(validContractCall.result.externalRequestSent, false);
  const newInvocation = await newClient.invoke("calendar.events.read", { calendar: "synthetic" });
  assert.equal(newInvocation.result.externalRequestSent, false);

  const replayTokenIssue = await request("/api/applications/new-saas/tokens", {
    method: "POST",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ label: "persistent idempotency proof" }),
  });
  assert.equal(replayTokenIssue.response.status, 201);
  const replayClient = new ApiHubClient({ baseUrl: `http://127.0.0.1:${port}`, token: replayTokenIssue.payload.token });
  const idempotencyKey = `synthetic-order-${crypto.randomUUID()}`;
  const beforeIdempotency = await request("/api/invocations");
  const firstIdempotent = await replayClient.invoke("calendar.events.read", { calendar: "idempotency proof" }, { idempotencyKey });
  assert.equal(firstIdempotent.replayed, false);
  const replayedIdempotent = await replayClient.invoke("calendar.events.read", { calendar: "idempotency proof" }, { idempotencyKey });
  assert.equal(replayedIdempotent.replayed, true);
  assert.equal(replayedIdempotent.requestId, firstIdempotent.requestId);
  const afterIdempotency = await request("/api/invocations");
  assert.equal(afterIdempotency.payload.invocations.length, beforeIdempotency.payload.invocations.length + 1, "replay must not create another invocation");
  const replayUsage = await request("/api/usage");
  assert.equal(replayUsage.payload.usage.workspace.replays, 1);
  const idempotencyInventory = await request("/api/idempotency");
  assert.equal(idempotencyInventory.payload.records[0].replayCount, 1);
  assert.equal(/keyHash|requestFingerprint|idempotencyKey/i.test(JSON.stringify(idempotencyInventory.payload)), false);
  await assert.rejects(
    () => replayClient.invoke("calendar.events.read", { calendar: "different input" }, { idempotencyKey }),
    (error) => error.status === 409 && error.reason === "idempotency_conflict",
  );

  const revoked = await request(`/api/application-tokens/${newToken.payload.metadata.tokenId}`, {
    method: "DELETE",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ confirm: "REVOKE" }),
  });
  assert.equal(revoked.response.status, 200);
  const revokedUse = await request("/gateway/v1/capabilities", {
    headers: { authorization: `Bearer ${newToken.payload.token}` },
  });
  assert.equal(revokedUse.response.status, 401, "revoked application token must stop working immediately");

  const wrongLauncherShutdown = await request("/internal/launcher/shutdown", {
    method: "POST",
    headers: { "x-api-hub-launcher-token": "wrong-launcher-token" },
  });
  assert.equal(wrongLauncherShutdown.response.status, 404);
  const launcherShutdown = await request("/internal/launcher/shutdown", {
    method: "POST",
    headers: { "x-api-hub-launcher-token": testLauncherToken },
  });
  assert.equal(launcherShutdown.response.status, 200);
  await stopServer();
  const inspection = childProcess.spawnSync(process.execPath, ["-e", `
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(process.env.DB_PATH, { readOnly: true });
    const row = db.prepare("SELECT ciphertext, password_hash AS passwordHash FROM credentials CROSS JOIN auth_accounts WHERE provider_id = 'openai'").get();
    const tokenRow = db.prepare("SELECT token_hash AS tokenHash FROM application_tokens LIMIT 1").get();
    const agentTokenRow = db.prepare("SELECT token_hash AS tokenHash FROM agent_tokens LIMIT 1").get();
    const idempotencyRow = db.prepare("SELECT key_hash AS keyHash, request_fingerprint AS requestFingerprint, state, replay_count AS replayCount FROM gateway_idempotency LIMIT 1").get();
    const providerRow = db.prepare("SELECT ciphertext FROM credentials WHERE provider_id = 'synthetic-ai'").get();
    const result = {
      ciphertextIsBuffer: Buffer.isBuffer(row.ciphertext),
      ciphertextContainsPlaintext: row.ciphertext.includes(Buffer.from(process.env.PLAIN)),
      newProviderCiphertextContainsPlaintext: providerRow.ciphertext.includes(Buffer.from(process.env.PROVIDER_SECRET)),
      passwordHashContainsPassword: row.passwordHash.includes(Buffer.from(process.env.PASS)),
      tokenHashContainsToken: tokenRow.tokenHash.includes(process.env.APP_TOKEN),
      agentTokenHashContainsToken: agentTokenRow.tokenHash.includes(process.env.AGENT_TOKEN),
      agentInvocationIdentities: db.prepare("SELECT COUNT(*) AS count FROM invocation_records WHERE identity_type = 'agent' AND agent_id = 'research-worker'").get().count,
      idempotencyKeyContainsPlaintext: idempotencyRow.keyHash.includes(process.env.IDEMPOTENCY_KEY),
      idempotencyState: idempotencyRow.state,
      idempotencyReplayCount: idempotencyRow.replayCount,
      idempotencyInputColumns: db.prepare("PRAGMA table_info(gateway_idempotency)").all().filter((item) => /input|prompt|payload/i.test(item.name)).length,
      invocationInputColumns: db.prepare("PRAGMA table_info(invocation_records)").all().filter((item) => /input|prompt|payload/i.test(item.name)).length,
      syntheticMetricSnapshots: db.prepare("SELECT COUNT(*) AS count FROM provider_metric_history WHERE provider_id = 'synthetic-ai'").get().count,
      syntheticResolvedAlerts: db.prepare("SELECT COUNT(*) AS count FROM alerts WHERE provider_id = 'synthetic-ai' AND status = 'resolved'").get().count,
      sessionsWithoutMetadata: db.prepare("SELECT COUNT(*) AS count FROM auth_sessions s LEFT JOIN auth_session_metadata m ON m.token_hash = s.token_hash WHERE m.token_hash IS NULL").get().count,
      foreignKeyViolations: db.prepare("PRAGMA foreign_key_check").all().length,
    };
    db.close();
    process.stdout.write(JSON.stringify(result));
  `], { cwd: root, env: { ...process.env, DB_PATH: dbPath, PLAIN: plaintext, PROVIDER_SECRET: providerSecret, PASS: testPassword, APP_TOKEN: applicationToken, AGENT_TOKEN: agentTokenPlaintext, IDEMPOTENCY_KEY: idempotencyKey }, encoding: "utf8" });
  assert.equal(inspection.status, 0, inspection.stderr);
  const inspected = JSON.parse(inspection.stdout);
  assert.deepEqual(inspected, {
    ciphertextIsBuffer: true,
    ciphertextContainsPlaintext: false,
    newProviderCiphertextContainsPlaintext: false,
    passwordHashContainsPassword: false,
    tokenHashContainsToken: false,
    agentTokenHashContainsToken: false,
    agentInvocationIdentities: 2,
    idempotencyKeyContainsPlaintext: false,
    idempotencyState: "completed",
    idempotencyReplayCount: 1,
    idempotencyInputColumns: 0,
    invocationInputColumns: 0,
    syntheticMetricSnapshots: 3,
    syntheticResolvedAlerts: 1,
    sessionsWithoutMetadata: 0,
    foreignKeyViolations: 0,
  });

  startServer();
  await waitForServer();
  const afterRestart = await request("/api/providers");
  assert.equal(afterRestart.response.status, 200, "hashed persistent session should survive restart");
  assert.deepEqual(afterRestart.payload.providers.map((item) => item.id), ["openai", "deepseek", "spotify", "google", "synthetic-ai"]);
  const restoredSynthetic = afterRestart.payload.providers.find((item) => item.id === "synthetic-ai");
  assert.equal(restoredSynthetic.quota.remaining, 55);
  assert.equal(restoredSynthetic.monthCost, 13.25);
  assert.equal(restoredSynthetic.peak, "102 req/min");
  const serialized = JSON.stringify(afterRestart.payload);
  assert.equal(serialized.includes(plaintext), false);
  assert.equal(/"(secret|ciphertext|apiKey|accessToken|refreshToken|secretValue)"\s*:/.test(serialized), false);
  const replayAfterRestart = await replayClient.invoke("calendar.events.read", { calendar: "idempotency proof" }, { idempotencyKey });
  assert.equal(replayAfterRestart.replayed, true, "completed idempotency result must survive service restart");
  assert.equal(replayAfterRestart.requestId, firstIdempotent.requestId);
  const idempotencyAfterRestart = await request("/api/idempotency");
  assert.equal(idempotencyAfterRestart.payload.records.find((item) => item.requestId === firstIdempotent.requestId).replayCount, 2);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const failedLogin = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: "rate-limit-target", password: "synthetic-wrong-password" }),
    });
    assert.equal(failedLogin.response.status, 401);
  }
  const throttledLogin = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: "rate-limit-target", password: "synthetic-wrong-password" }),
  });
  assert.equal(throttledLogin.response.status, 401, "repeated bad passwords remain denied without locking login");
  assert.equal(throttledLogin.response.headers.get("retry-after"), null);

  const wrongPasswordChange = await request("/api/security/password", {
    method: "POST",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ currentPassword: "synthetic-wrong-password", newPassword: "synthetic-new-password-4311" }),
  });
  assert.equal(wrongPasswordChange.response.status, 401);
  const newPassword = "synthetic-new-password-4311";
  const passwordChange = await request("/api/security/password", {
    method: "POST",
    headers: { "x-csrf-token": csrf },
    body: JSON.stringify({ currentPassword: testPassword, newPassword }),
  });
  assert.equal(passwordChange.response.status, 200);
  const afterPasswordChange = await request("/api/providers");
  assert.equal(afterPasswordChange.response.status, 401, "password change must revoke the current session");
  const oldPasswordLogin = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: "local-owner", password: testPassword }),
  });
  assert.equal(oldPasswordLogin.response.status, 401);
  const newPasswordLogin = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: "local-owner", password: newPassword }),
  });
  assert.equal(newPasswordLogin.response.status, 200);
  csrf = newPasswordLogin.payload.csrf;
  const sessionsAfterPassword = await request("/api/security/sessions");
  assert.equal(sessionsAfterPassword.payload.sessions.length, 1);
  assert.equal(sessionsAfterPassword.payload.sessions[0].current, true);

  await stopServer();
  startServer();
  await waitForServer();
  const newSessionAfterRestart = await request("/api/providers");
  assert.equal(newSessionAfterRestart.response.status, 200);
}

run()
  .then(() => console.log("authentication, CSRF, encrypted vault, isolation, and restart: passed"))
  .finally(async () => {
    await stopServer();
    await new Promise((resolve) => setTimeout(resolve, 500));
    for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${dbPath}${suffix}`, { force: true, maxRetries: 5, retryDelay: 100 });
    fs.rmSync(vaultPath, { force: true, maxRetries: 5, retryDelay: 100 });
  });
