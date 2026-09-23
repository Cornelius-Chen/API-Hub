const state = {
  currentUser: null, csrf: null, overview: {}, providers: [], capabilities: [],
  applications: [], agents: [], audits: [], tokens: [], agentTokens: [], grants: [], invocations: [],
  metricHistory: [], alerts: [], proposals: [], sessions: [], usage: null, analytics: null, analyticsRange: "24h", execution: null, activationRequirements: [], database: null, activeCollection: "providers",
};

const $ = (id) => document.getElementById(id);
const t = (value) => window.API_HUB_I18N?.t(value) ?? value;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) throw Object.assign(new Error(t(payload.error || `Request failed: ${response.status}`)), { status: response.status });
  return payload;
}

const getJson = (url) => requestJson(url);
const sendJson = (url, method, body, csrf = false) => requestJson(url, {
  method,
  headers: { "content-type": "application/json", ...(csrf ? { "x-csrf-token": state.csrf } : {}) },
  body: JSON.stringify(body),
});

function statusLabel(value) {
  const label = new Set(["operational", "ready", "active", "configured"]).has(value) ? "Ready" : String(value).replaceAll("_", " ").replace(/^./, (item) => item.toUpperCase());
  return t(label);
}

function renderIdentity() {
  $("userAvatar").textContent = state.currentUser?.initials || "U";
  $("userName").textContent = state.currentUser?.name || "Workspace";
}

function renderOverview() {
  const item = state.overview;
  $("healthSignal").innerHTML = `${Number(item.stable)} <em>/ ${Number(item.providers)} stable</em>`;
  $("spendSignal").textContent = `$${Number(item.spend || 0).toFixed(2)}`;
  $("budgetSignal").textContent = `${Number(item.budgetPercent || 0)}% of $${Number(item.budget || 0).toFixed(0)} workspace budget`;
  $("peakSignal").innerHTML = `${Number(item.peak || 0)} <em>req/min</em>`;
  $("runwaySignal").innerHTML = `${Number(item.runwayDays || 0)} <em>days</em>`;
}

function renderProviders(filter = "") {
  const query = filter.toLowerCase();
  $("providerPulse").innerHTML = state.providers.map((provider) => `<div class="pulse-row">
    <div class="provider-name"><span class="provider-icon">${escapeHtml(provider.name.slice(0, 2).toUpperCase())}</span><span><strong>${escapeHtml(provider.name)}</strong><small>${escapeHtml(provider.category)}</small></span></div>
    <span class="status ${escapeHtml(provider.health)}">${escapeHtml(statusLabel(provider.health))}</span>
    <div><small>${Number(provider.quota.remaining)}% remaining</small><div class="quota-track"><i style="width:${Number(provider.quota.remaining)}%"></i></div></div>
    <div><strong>$${Number(provider.monthCost).toFixed(2)}</strong><small>${escapeHtml(provider.peak)} peak</small></div>
  </div>`).join("");

  $("providerTable").innerHTML = state.providers
    .filter((provider) => `${provider.name} ${provider.category}`.toLowerCase().includes(query))
    .map((provider) => `<article class="provider-card">
      <div><h3>${escapeHtml(provider.name)}</h3><a href="${escapeHtml(provider.website)}" target="_blank" rel="noreferrer">${escapeHtml(provider.website)}</a></div>
      <div><span class="meta-label">Credential</span><span class="meta-value">${escapeHtml(provider.credential.fingerprint)}</span><small class="status ${provider.credential.status === "configured" ? "" : "attention"}">${escapeHtml(statusLabel(provider.credential.status))}</small></div>
      <div><span class="meta-label">API base</span><span class="meta-value">${escapeHtml(provider.apiBase)}</span></div>
      <div><span class="meta-label">Remaining</span><span class="meta-value">${Number(provider.quota.remaining)}%</span> <span class="source-pill">${escapeHtml(provider.quota.source)}</span></div>
      <div class="provider-actions">
        <a class="platform-link" href="${escapeHtml(provider.console || provider.website)}" target="_blank" rel="noopener noreferrer">Platform</a>
        <a class="docs-link" href="${escapeHtml(provider.docs)}" target="_blank" rel="noopener noreferrer">Docs</a>
        <button class="ghost" data-provider-metrics="${escapeHtml(provider.id)}">Update usage</button>
      </div>
    </article>`).join("");
  document.querySelectorAll("[data-provider-metrics]").forEach((button) => button.addEventListener("click", () => openMetricsDialog(button.dataset.providerMetrics)));
}

function renderCapabilities() {
  $("capabilityList").innerHTML = state.capabilities.map((item) => `<article class="capability-row">
    <div><strong>${escapeHtml(item.label)}</strong><code>${escapeHtml(item.id)}</code><small>${escapeHtml(item.description)}</small></div>
    <div><span class="meta-label">Primary route</span><strong>${escapeHtml(item.primary)}</strong></div>
    <div><span class="meta-label">Fallback</span><strong>${escapeHtml(item.fallback)}</strong></div>
    <div><span class="status ${escapeHtml(item.state)}">${escapeHtml(statusLabel(item.state))}</span><small>${escapeHtml(item.dataClassification)} · ${escapeHtml(item.retentionPolicy)}</small></div>
  </article>`).join("");
  $("capabilityProposalList").innerHTML = state.proposals.length ? state.proposals.map((item) => `<article class="proposal-row">
    <div><strong>${escapeHtml(item.label)}</strong><code>${escapeHtml(item.capabilityId)}</code><small>${escapeHtml(item.description)}</small></div>
    <div><strong>${escapeHtml(item.primaryProviderId)}</strong><small>${escapeHtml(item.dataClassification)} · ${escapeHtml(item.retentionPolicy)}</small></div>
    <span class="status ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span>
    ${item.status === "candidate" ? `<button class="primary" data-activate-capability="${escapeHtml(item.capabilityId)}">Review & activate</button>` : "<span></span>"}
  </article>`).join("") : `<div class="empty-state"><strong>No capability proposals</strong><small>New contracts remain candidates until explicitly activated.</small></div>`;
  document.querySelectorAll("[data-activate-capability]").forEach((button) => button.addEventListener("click", async () => {
    const capabilityId = button.dataset.activateCapability;
    const phrase = window.prompt(`${t("Activating publishes a new Gateway contract.")} ${t("Type exactly:")}\nACTIVATE ${capabilityId}`);
    if (phrase !== `ACTIVATE ${capabilityId}`) return;
    await sendJson(`/api/capability-proposals/${encodeURIComponent(capabilityId)}/activate`, "POST", { confirm: phrase }, true);
    await loadWorkspace();
  }));
}

function renderApplications() {
  $("applicationList").innerHTML = state.applications.map((item) => {
    const percent = Math.min(100, Math.round((item.spend / item.budget) * 100));
    const grantCount = state.grants.filter((grant) => grant.applicationId === item.id && grant.enabled).length;
    const tokenCount = state.tokens.filter((token) => token.applicationId === item.id && token.status === "active").length;
    const observed = state.usage?.applications.find((usage) => usage.applicationId === item.id) || { total: 0, denied: 0, peakRpm: 0 };
    return `<article class="application-row">
      <div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.id)} · ${escapeHtml(item.environment)}</small></div>
      <div><span class="meta-label">Today</span><strong>${Number(observed.total)} calls · ${Number(observed.peakRpm)} peak RPM</strong><small>${Number(observed.denied)} policy denials · ${Number(item.agents)} agents</small></div>
      <div><span class="meta-label">Budget</span><strong>$${Number(item.spend).toFixed(2)} / $${Number(item.budget)}</strong><div class="budget"><i style="width:${percent}%"></i></div></div>
      <div><span class="status ${escapeHtml(item.state)}">${escapeHtml(statusLabel(item.state))}</span><small>${tokenCount} active tokens</small></div>
      <button class="ghost issue-token" data-token-app="${escapeHtml(item.id)}">Issue token</button>
    </article>`;
  }).join("");
  document.querySelectorAll("[data-token-app]").forEach((button) => button.addEventListener("click", () => openTokenDialog(button.dataset.tokenApp)));
  renderTokenInventory();
  renderAgentInventory();
  renderUsage();
}

function renderUsage() {
  const usage = state.usage || { workspace: {}, applications: [], capabilities: [], agents: [] };
  const workspace = usage.workspace || {};
  const peak = Math.max(0, ...usage.applications.map((item) => Number(item.peakRpm || 0)));
  $("usageCapturedAt").textContent = usage.capturedAt ? `Observed ${new Date(usage.capturedAt).toLocaleTimeString()}` : "No observations";
  $("usageSummary").innerHTML = [
    [workspace.total || 0, "decisions today"], [workspace.allowed || 0, "allowed"],
    [workspace.denied || 0, "denied"], [workspace.replays || 0, "duplicate executions avoided"],
    [workspace.units || 0, "billable policy units"], [peak, "peak RPM"],
  ].map(([value, label]) => `<div><strong>${Number(value)}</strong><small>${escapeHtml(label)}</small></div>`).join("");
  $("capabilityUsage").innerHTML = usage.capabilities.length ? usage.capabilities.map((item) => `<span><strong>${escapeHtml(item.capabilityId)}</strong> · ${Number(item.allowed)} allowed / ${Number(item.denied)} denied</span>`).join("") : `<span>No Gateway decisions observed today</span>`;
}

function renderAgentInventory() {
  $("agentInventory").innerHTML = state.agents.length ? state.agents.map((agent) => {
    const activeTokens = state.agentTokens.filter((token) => token.agentId === agent.id && token.status === "active");
    const observed = state.usage?.agents.find((usage) => usage.agentId === agent.id) || { total: 0, denied: 0 };
    return `<article class="agent-row">
      <div><strong>${escapeHtml(agent.name)}</strong><small>${escapeHtml(agent.id)}</small></div>
      <div><strong>${escapeHtml(agent.applicationId)}</strong><small>Owning application</small></div>
      <div><strong>${Number(agent.grants)} grants · ${Number(observed.total)} calls</strong><small>${Number(observed.denied)} denied today</small></div>
      <div><strong>${escapeHtml(agent.expires)}</strong><small>${activeTokens.length} active token${activeTokens.length === 1 ? "" : "s"}</small></div>
      <div>${activeTokens.map((token) => `<button class="ghost" data-revoke-agent-token="${escapeHtml(token.tokenId)}">Revoke ${escapeHtml(token.label)}</button>`).join("") || `<span class="status ${escapeHtml(agent.state)}">${escapeHtml(statusLabel(agent.state))}</span>`}</div>
    </article>`;
  }).join("") : `<div class="empty-state"><strong>No delegated agents</strong><small>Register one with a subset of an application's capabilities.</small></div>`;
  document.querySelectorAll("[data-revoke-agent-token]").forEach((button) => button.addEventListener("click", async () => {
    if (!window.confirm(t("Revoke this agent token immediately?"))) return;
    await sendJson(`/api/agent-tokens/${encodeURIComponent(button.dataset.revokeAgentToken)}`, "DELETE", { confirm: "REVOKE" }, true);
    state.agentTokens = (await getJson("/api/agent-tokens")).tokens; renderAgentInventory();
  }));
}

function updateAgentCapabilityOptions() {
  const applicationId = $("agentApplication").value;
  const grants = state.grants.filter((item) => item.applicationId === applicationId && item.enabled);
  $("agentCapabilities").innerHTML = grants.map((item) => `<label><input type="checkbox" value="${escapeHtml(item.capabilityId)}" /> <span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.capabilityId)}</small></span></label>`).join("") || `<small>This application has no enabled grants.</small>`;
}

function openAgentDialog() {
  $("agentForm").reset(); $("agentError").textContent = "";
  $("agentCreateStage").classList.remove("hidden"); $("agentRevealStage").classList.add("hidden");
  $("agentApplication").innerHTML = state.applications.filter((item) => item.state === "active").map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} · ${escapeHtml(item.environment)}</option>`).join("");
  updateAgentCapabilityOptions(); $("agentDialog").showModal();
}

function renderTokenInventory() {
  $("tokenInventory").innerHTML = state.tokens.length ? state.tokens.map((token) => `<article class="token-row">
    <div><strong>${escapeHtml(token.label)}</strong><small>${escapeHtml(token.applicationId)}</small></div>
    <div><code>${escapeHtml(token.prefix)}••••</code><small>${escapeHtml(token.fingerprint)}</small></div>
    <div><strong>${token.lastUsedAt ? escapeHtml(new Date(token.lastUsedAt).toLocaleString()) : "Never"}</strong><small>Last used</small></div>
    <span class="status ${escapeHtml(token.status)}">${escapeHtml(statusLabel(token.status))}</span>
    ${token.status === "active" ? `<button class="ghost" data-revoke-token="${escapeHtml(token.tokenId)}">Revoke</button>` : "<span></span>"}
  </article>`).join("") : `<div class="empty-state"><strong>No application tokens issued</strong><small>Issue one from an application above. The plaintext is shown only once.</small></div>`;
  document.querySelectorAll("[data-revoke-token]").forEach((button) => button.addEventListener("click", async () => {
    if (!window.confirm(t("Revoke this application token now? Calls using it will stop immediately."))) return;
    await sendJson(`/api/application-tokens/${encodeURIComponent(button.dataset.revokeToken)}`, "DELETE", { confirm: "REVOKE" }, true);
    state.tokens = (await getJson("/api/application-tokens")).tokens;
    renderApplications();
  }));
}

function renderAudits() {
  const markup = (item, full) => full
    ? `<article class="audit-row"><span>${escapeHtml(item.time)}</span><span>${escapeHtml(item.actor)}</span><div><strong>${escapeHtml(item.action)}</strong><small>${escapeHtml(item.detail)}</small></div><strong>${escapeHtml(item.outcome)}</strong></article>`
    : `<article class="event"><time>${escapeHtml(item.time)}</time><div><strong>${escapeHtml(item.action)}</strong><small>${escapeHtml(item.actor)} · ${escapeHtml(item.detail)}</small></div></article>`;
  $("auditPreview").innerHTML = state.audits.slice(0, 3).map((item) => markup(item, false)).join("");
  $("auditList").innerHTML = state.audits.map((item) => markup(item, true)).join("");
}

function renderSecurity() {
  $("sessionCount").textContent = state.sessions.length;
  $("securitySessions").innerHTML = state.sessions.length ? state.sessions.map((item) => `<article class="session-row">
    <div><strong>${escapeHtml(item.deviceLabel)}</strong><small>${item.current ? "Current session" : "Authenticated session"}</small></div>
    <div><strong>${escapeHtml(new Date(`${item.lastSeenAt}Z`).toLocaleString())}</strong><small>Last seen · expires ${escapeHtml(new Date(item.expiresAt).toLocaleString())}</small></div>
    <button class="ghost" data-revoke-session="${escapeHtml(item.sessionId)}">${item.current ? "Sign out" : "Revoke"}</button>
  </article>`).join("") : `<div class="empty-state"><strong>No active sessions</strong><small>Sign in again to establish a session.</small></div>`;
  document.querySelectorAll("[data-revoke-session]").forEach((button) => button.addEventListener("click", async () => {
    if (!window.confirm(t("Revoke this control-plane session immediately?"))) return;
    const payload = await sendJson(`/api/security/sessions/${encodeURIComponent(button.dataset.revokeSession)}/revoke`, "POST", { confirm: "REVOKE SESSION" }, true);
    if (payload.current) {
      state.csrf = null; state.currentUser = null; $("appShell").classList.add("hidden"); await showAuth(false);
    } else {
      state.sessions = (await getJson("/api/security/sessions")).sessions; renderSecurity();
    }
  }));
  const execution = state.execution || {};
  const gatewayLimits = execution.gatewayLimits || {};
  $("executionGateLabel").textContent = execution.liveGate === "locked" ? "Locked · no provider traffic" : "Unlocked";
  $("executionPolicy").innerHTML = [
    ["Mode", execution.mode],
    ["Egress", execution.egressPolicy],
    ["Timeout", `${Number(execution.timeoutMs || 0)} ms`],
    ["Retries", Number(execution.maxRetries || 0)],
    ["Request body", `${Number(gatewayLimits.requestBodyBytes || 0) / 1024} KB max`],
    ["Concurrency", `${Number(gatewayLimits.maxConcurrentPerIdentity || 0)} per identity / ${Number(gatewayLimits.maxConcurrent || 0)} total`],
    ["Reviewed adapters", (execution.registeredProviders || []).join(", ") || "None"],
  ].map(([label, value]) => `<div><span class="meta-label">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
  $("executionRequirements").innerHTML = `<span class="meta-label">Required before live activation</span><ul>${state.activationRequirements.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderMetricsAndRisks() {
  $("riskCount").textContent = state.alerts.length;
  $("riskList").innerHTML = state.alerts.length ? state.alerts.map((alert) => `<button data-alert-provider="${escapeHtml(alert.providerId)}">
    <span class="risk-icon ${alert.severity === "critical" ? "red" : alert.severity === "warning" ? "amber" : "blue"}">${alert.severity === "critical" ? "!" : alert.severity === "warning" ? "↑" : "i"}</span>
    <span><strong>${escapeHtml(alert.providerName)}</strong><small>${escapeHtml(alert.message)}</small></span><em>${escapeHtml(alert.severity)}</em>
  </button>`).join("") : `<div class="empty-state"><strong>No open provider alerts</strong><small>Threshold and provenance checks are currently clear.</small></div>`;
  document.querySelectorAll("[data-alert-provider]").forEach((button) => button.addEventListener("click", () => { openView("providers"); openMetricsDialog(button.dataset.alertProvider); }));

  $("metricHistory").innerHTML = state.metricHistory.length ? state.metricHistory.slice(0, 20).map((item) => `<article class="metric-row">
    <div><strong>${escapeHtml(item.providerName)}</strong><small>${escapeHtml(item.providerId)}</small></div>
    <div><strong>${Number(item.remaining)}%</strong><small>remaining</small></div>
    <div><strong>$${Number(item.monthCost).toFixed(2)}</strong><small>month cost</small></div>
    <div><strong>${Number(item.peakRpm)}</strong><small>peak rpm</small></div>
    <span class="source-pill">${escapeHtml(item.source)}</span>
    <small>${escapeHtml(new Date(`${item.capturedAt}Z`).toLocaleString())}</small>
  </article>`).join("") : `<div class="empty-state"><strong>No metric snapshots</strong><small>Record a provider update to start the history.</small></div>`;
}

function displayValue(value) {
  if (value === null || value === undefined) return "—";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function renderDatabase() {
  if (!state.database) return;
  $("databaseOwner").textContent = `${state.database.user.name} · ${state.database.user.plan}`;
  $("collectionList").innerHTML = state.database.collections.map((collection) => `<button class="collection-item ${collection.id === state.activeCollection ? "active" : ""}" data-collection="${escapeHtml(collection.id)}">
    <span><strong>${escapeHtml(collection.label)}</strong><small>${escapeHtml(collection.relation)}</small></span><em>${Number(collection.count)}</em>
  </button>`).join("");
  document.querySelectorAll("[data-collection]").forEach((button) => button.addEventListener("click", () => { state.activeCollection = button.dataset.collection; renderDatabase(); }));
  const collection = state.database.collections.find((item) => item.id === state.activeCollection) || state.database.collections[0];
  const records = state.database.records[collection.id] || [];
  $("recordTitle").textContent = collection.label;
  $("recordRelation").textContent = collection.relation.toUpperCase();
  $("recordCount").textContent = records.length;
  if (!records.length) {
    $("recordTable").innerHTML = `<div class="empty-state"><strong>No records in this workspace</strong><small>The collection exists, but this user has not created an item yet.</small></div>`;
    return;
  }
  const keys = [...new Set(records.flatMap((record) => Object.keys(record)))].slice(0, 6);
  $("recordTable").innerHTML = `<div class="record-row record-columns">${keys.map((key) => `<strong>${escapeHtml(key.replaceAll(/([A-Z])/g, " $1"))}</strong>`).join("")}</div>${records.map((record) => `<div class="record-row">${keys.map((key) => { const value = escapeHtml(displayValue(record[key])); return `<span title="${value}">${value}</span>`; }).join("")}</div>`).join("")}`;
}

function renderBars() {
  const recent = state.metricHistory.slice(0, 30).reverse();
  const maximum = Math.max(1, ...recent.map((item) => Number(item.peakRpm)));
  $("bars").innerHTML = recent.length ? recent.map((item) => {
    const height = Math.max(4, Math.round((Number(item.peakRpm) / maximum) * 100));
    return `<i class="bar ${height > 80 ? "peak" : ""}" style="height:${height}%" title="${escapeHtml(item.providerName)} · ${Number(item.peakRpm)} rpm · $${Number(item.monthCost).toFixed(2)}"></i>`;
  }).join("") : `<span class="empty-state">No history yet</span>`;
}

function analyticsLocale() {
  return document.documentElement.lang === "zh-CN" ? "zh-CN" : "en-US";
}

function analyticsBucketKey(date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function analyticsBuckets(data) {
  const step = Number(data.bucketHours || 1) * 60 * 60 * 1000;
  const count = Number(data.bucketCount || 24);
  const captured = new Date(data.capturedAt || Date.now());
  const end = new Date(Math.floor(captured.getTime() / step) * step);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(end.getTime() - (count - index - 1) * step);
    return { date, key: analyticsBucketKey(date) };
  });
}

function analyticsTimeLabel(date, range) {
  const options = range === "24h"
    ? { hour: "2-digit", minute: "2-digit" }
    : range === "7d"
      ? { weekday: "short", hour: "2-digit" }
      : { month: "short", day: "numeric" };
  return new Intl.DateTimeFormat(analyticsLocale(), { ...options, timeZone: "UTC" }).format(date);
}

function analyticsEmpty(copy = "No Gateway calls in this range", detail = "New calls will appear here after they pass through API Hub.") {
  return `<div class="analytics-empty"><strong>${escapeHtml(t(copy))}</strong><small>${escapeHtml(t(detail))}</small></div>`;
}

function renderUsageTrend(data, providers) {
  const chart = $("usageTrendChart");
  if (!providers.length || !data.trend.length) {
    $("analyticsLegend").innerHTML = "";
    chart.innerHTML = analyticsEmpty();
    return;
  }
  const buckets = analyticsBuckets(data);
  const rows = new Map(data.trend.map((item) => [`${item.bucket}|${item.providerId}`, Number(item.calls || 0)]));
  const series = providers.map((provider, index) => ({ provider, index,
    values: buckets.map((bucket) => rows.get(`${bucket.key}|${provider.providerId}`) || 0) }));
  const maximum = Math.max(1, ...series.flatMap((item) => item.values));
  const width = 920; const height = 310; const left = 48; const right = 18; const top = 16; const bottom = 38;
  const plotWidth = width - left - right; const plotHeight = height - top - bottom;
  const x = (index) => left + (index / Math.max(1, buckets.length - 1)) * plotWidth;
  const y = (value) => top + plotHeight - (value / maximum) * plotHeight;
  const grid = Array.from({ length: 5 }, (_, index) => {
    const value = Math.round((maximum / 4) * index);
    const ypos = y(value);
    return `<line class="chart-grid-line" x1="${left}" y1="${ypos}" x2="${width - right}" y2="${ypos}"/><text class="chart-axis-label" x="${left - 9}" y="${ypos + 4}" text-anchor="end">${value}</text>`;
  }).join("");
  const tickIndexes = [...new Set([0, Math.round((buckets.length - 1) * .25), Math.round((buckets.length - 1) * .5), Math.round((buckets.length - 1) * .75), buckets.length - 1])];
  const xLabels = tickIndexes.map((index) => `<text class="chart-axis-label" x="${x(index)}" y="${height - 10}" text-anchor="${index === 0 ? "start" : index === buckets.length - 1 ? "end" : "middle"}">${escapeHtml(analyticsTimeLabel(buckets[index].date, data.range))}</text>`).join("");
  const paths = series.map(({ provider, index, values }) => {
    const points = values.map((value, pointIndex) => `${x(pointIndex).toFixed(2)},${y(value).toFixed(2)}`);
    const path = points.map((point, pointIndex) => `${pointIndex ? "L" : "M"}${point}`).join(" ");
    const marks = values.map((value, pointIndex) => value > 0
      ? `<circle class="chart-point" cx="${x(pointIndex)}" cy="${y(value)}" r="3.2"><title>${escapeHtml(provider.providerName)} · ${value} ${escapeHtml(t("calls"))} · ${escapeHtml(analyticsTimeLabel(buckets[pointIndex].date, data.range))}</title></circle>` : "").join("");
    return `<g class="series-${index % 6}"><path class="chart-line" d="${path}"/>${marks}</g>`;
  }).join("");
  $("analyticsLegend").innerHTML = providers.map((provider, index) => `<span class="series-${index % 6}"><i></i>${escapeHtml(provider.providerName)}</span>`).join("");
  chart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(t("API calls over time by provider"))}"><title>${escapeHtml(t("Calls by API provider"))}</title><desc>${escapeHtml(t("Each colored line represents one API provider. Values come from API Hub Gateway records."))}</desc>${grid}${xLabels}${paths}</svg>`;
}

function renderAnalyticsBars(targetId, providers, valueFor, formatValue) {
  const target = $(targetId);
  if (!providers.length) { target.innerHTML = analyticsEmpty(); return; }
  const maximum = Math.max(1, ...providers.map(valueFor));
  target.innerHTML = providers.map((provider, index) => {
    const value = valueFor(provider);
    return `<div class="analytics-bar-row series-${index % 6}"><span class="analytics-bar-label" title="${escapeHtml(provider.providerName)}">${escapeHtml(provider.providerName)}</span><span class="analytics-bar-track"><i class="analytics-bar-fill" style="width:${Math.max(value > 0 ? 2 : 0, (value / maximum) * 100)}%"></i></span><strong class="analytics-bar-value">${escapeHtml(formatValue(value, provider))}</strong></div>`;
  }).join("");
}

function renderAnalytics() {
  const data = state.analytics;
  document.querySelectorAll("[data-analytics-range]").forEach((button) => button.classList.toggle("active", button.dataset.analyticsRange === state.analyticsRange));
  if (!data) return;
  $("analyticsCapturedAt").textContent = `Observed ${new Date(data.capturedAt).toLocaleTimeString(analyticsLocale(), { hour: "2-digit", minute: "2-digit" })}`;
  const providers = [...data.providers].sort((a, b) => Number(b.total) - Number(a.total));
  renderUsageTrend(data, providers);
  renderAnalyticsBars("providerVolumeChart", providers, (provider) => Number(provider.total || 0), (value) => `${value} ${t("calls")}`);
  $("decisionChart").innerHTML = providers.length ? providers.map((provider) => {
    const total = Math.max(1, Number(provider.total || 0));
    const allowed = Number(provider.allowed || 0); const denied = Number(provider.denied || 0);
    return `<div class="analytics-bar-row"><span class="analytics-bar-label" title="${escapeHtml(provider.providerName)}">${escapeHtml(provider.providerName)}</span><span class="analytics-bar-track"><i class="decision-allowed" style="width:${(allowed / total) * 100}%"></i><i class="decision-denied" style="width:${(denied / total) * 100}%"></i></span><strong class="analytics-bar-value">${allowed}/${denied}</strong></div>`;
  }).join("") : analyticsEmpty();
  renderAnalyticsBars("latencyChart", providers, (provider) => Number(provider.averageLatencyMs || 0), (value) => `${value} ms`);
}

async function loadAnalyticsRange(range) {
  if (!["24h", "7d", "30d"].includes(range)) return;
  state.analyticsRange = range;
  document.querySelectorAll("[data-analytics-range]").forEach((button) => {
    button.classList.toggle("active", button.dataset.analyticsRange === range);
    button.disabled = true;
  });
  try {
    state.analytics = (await getJson(`/api/analytics?range=${encodeURIComponent(range)}`)).analytics;
    renderAnalytics();
  } catch (error) {
    $("usageTrendChart").innerHTML = analyticsEmpty("Analytics could not be loaded", "Refresh the page and try again.");
  } finally {
    document.querySelectorAll("[data-analytics-range]").forEach((button) => { button.disabled = false; });
  }
}

const titles = { overview: "Operational overview", analytics: "Usage analytics", providers: "Provider inventory", capabilities: "Capability contracts", applications: "Application access", database: "User database", audit: "Audit trail", security: "Security center" };
function openView(name) {
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === `${name}View`));
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === name));
  $("pageTitle").textContent = t(titles[name]);
  if (name === "analytics" && state.currentUser) void loadAnalyticsRange(state.analyticsRange);
}

function openTokenDialog(applicationId) {
  const application = state.applications.find((item) => item.id === applicationId);
  $("tokenApplicationId").value = applicationId;
  $("tokenApplicationName").textContent = `${application.name} · ${application.environment}`;
  $("tokenLabel").value = "";
  $("tokenError").textContent = "";
  $("issuedToken").value = "";
  $("tokenIssueStage").classList.remove("hidden");
  $("tokenRevealStage").classList.add("hidden");
  $("applicationTokenDialog").showModal();
}

function openMetricsDialog(providerId) {
  const provider = state.providers.find((item) => item.id === providerId);
  if (!provider) return;
  $("metricsProviderId").value = provider.id;
  $("metricsProviderName").textContent = provider.name;
  $("metricsRemaining").value = provider.quota.remaining;
  $("metricsUnit").value = provider.quota.unit;
  $("metricsSource").value = new Set(["manual", "estimated", "unknown"]).has(provider.quota.source) ? provider.quota.source : "manual";
  $("metricsMonthCost").value = Number(provider.monthCost).toFixed(2);
  $("metricsPeakRpm").value = Number.parseInt(provider.peak, 10) || 0;
  $("metricsError").textContent = "";
  $("providerMetricsDialog").showModal();
}

document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => openView(button.dataset.view)));
document.querySelectorAll("[data-jump]").forEach((button) => button.addEventListener("click", () => openView(button.dataset.jump)));
document.querySelectorAll("[data-analytics-range]").forEach((button) => button.addEventListener("click", () => loadAnalyticsRange(button.dataset.analyticsRange)));
window.addEventListener("api-hub:locale", () => { if (state.analytics) renderAnalytics(); });
$("providerSearch").addEventListener("input", (event) => renderProviders(event.target.value));

$("registerButton").addEventListener("click", () => {
  $("credentialProvider").innerHTML = state.providers.map((provider) => `<option value="${escapeHtml(provider.id)}">${escapeHtml(provider.name)}</option>`).join("");
  $("credentialError").textContent = "";
  $("providerDialog").showModal();
});
document.querySelectorAll(".close-dialog").forEach((button) => button.addEventListener("click", () => { $("credentialSecret").value = ""; $("providerDialog").close(); }));
$("providerDialog").querySelector("form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const secret = $("credentialSecret");
  try {
    await sendJson(`/api/providers/${encodeURIComponent($("credentialProvider").value)}/credential`, "PUT", { secret: secret.value }, true);
    secret.value = ""; $("providerDialog").close(); await loadWorkspace();
  } catch (error) { secret.value = ""; $("credentialError").textContent = error.message; }
});

$("addProviderButton").addEventListener("click", () => {
  $("newProviderForm").reset(); $("newProviderQuota").value = "100"; $("newProviderQuotaUnit").value = "% policy allowance"; $("newProviderError").textContent = ""; $("newProviderDialog").showModal();
});
document.querySelectorAll(".close-new-provider").forEach((button) => button.addEventListener("click", () => { $("newProviderSecret").value = ""; $("newProviderDialog").close(); }));
$("newProviderName").addEventListener("input", (event) => { $("newProviderId").value = event.target.value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50); });
$("newProviderForm").addEventListener("submit", async (event) => {
  event.preventDefault(); const secret = $("newProviderSecret");
  try {
    await sendJson("/api/providers", "POST", {
      id: $("newProviderId").value, name: $("newProviderName").value, category: $("newProviderCategory").value,
      website: $("newProviderWebsite").value, docs: $("newProviderDocs").value, consoleUrl: $("newProviderConsole").value,
      apiBase: $("newProviderApiBase").value, environment: $("newProviderEnvironment").value, secret: secret.value,
      quotaRemaining: Number($("newProviderQuota").value), quotaUnit: $("newProviderQuotaUnit").value, quotaSource: $("newProviderQuotaSource").value,
    }, true);
    secret.value = ""; $("newProviderDialog").close(); await loadWorkspace();
  } catch (error) { secret.value = ""; $("newProviderError").textContent = error.message; }
});
document.querySelectorAll(".close-provider-metrics").forEach((button) => button.addEventListener("click", () => $("providerMetricsDialog").close()));
$("providerMetricsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await sendJson(`/api/providers/${encodeURIComponent($("metricsProviderId").value)}/metrics`, "PUT", {
      remaining: Number($("metricsRemaining").value), unit: $("metricsUnit").value,
      source: $("metricsSource").value, monthCost: Number($("metricsMonthCost").value), peakRpm: Number($("metricsPeakRpm").value),
    }, true);
    $("providerMetricsDialog").close(); await loadWorkspace();
  } catch (error) { $("metricsError").textContent = error.message; }
});

document.querySelectorAll(".close-token-dialog").forEach((button) => button.addEventListener("click", () => { $("issuedToken").value = ""; $("applicationTokenDialog").close(); }));
$("applicationTokenForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = await sendJson(`/api/applications/${encodeURIComponent($("tokenApplicationId").value)}/tokens`, "POST", { label: $("tokenLabel").value }, true);
    $("issuedToken").value = payload.token; $("tokenIssueStage").classList.add("hidden"); $("tokenRevealStage").classList.remove("hidden");
    state.tokens = (await getJson("/api/application-tokens")).tokens; renderApplications();
  } catch (error) { $("tokenError").textContent = error.message; }
});
$("copyTokenButton").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("issuedToken").value); $("copyTokenButton").textContent = t("Copied"); }
  catch { $("issuedToken").select(); document.execCommand("copy"); $("copyTokenButton").textContent = t("Copied"); }
});

$("registerAgentButton").addEventListener("click", openAgentDialog);
$("agentApplication").addEventListener("change", updateAgentCapabilityOptions);
document.querySelectorAll(".close-agent-dialog").forEach((button) => button.addEventListener("click", () => {
  $("issuedAgentToken").value = ""; $("agentDialog").close();
}));
$("agentName").addEventListener("input", (event) => {
  $("agentId").value = event.target.value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
});
$("agentForm").addEventListener("submit", async (event) => {
  event.preventDefault(); $("agentError").textContent = "";
  try {
    const capabilityIds = [...$("agentCapabilities").querySelectorAll("input:checked")].map((item) => item.value);
    const agent = await sendJson("/api/agents", "POST", {
      id: $("agentId").value, name: $("agentName").value, applicationId: $("agentApplication").value,
      capabilityIds, expiresInHours: Number($("agentLifetime").value),
    }, true);
    const token = await sendJson(`/api/agents/${encodeURIComponent(agent.agent.id)}/tokens`, "POST", {
      label: "Initial agent runtime", expiresInHours: 24,
    }, true);
    $("issuedAgentToken").value = token.token;
    $("agentCreateStage").classList.add("hidden"); $("agentRevealStage").classList.remove("hidden");
    const [agents, tokens] = await Promise.all([getJson("/api/agents"), getJson("/api/agent-tokens")]);
    state.agents = agents.agents; state.agentTokens = tokens.tokens; renderApplications();
  } catch (error) { $("agentError").textContent = error.message; }
});
$("copyAgentTokenButton").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("issuedAgentToken").value); $("copyAgentTokenButton").textContent = t("Copied"); }
  catch { $("issuedAgentToken").select(); document.execCommand("copy"); $("copyAgentTokenButton").textContent = t("Copied"); }
});

$("registerApplicationButton").addEventListener("click", () => {
  $("applicationForm").reset(); $("applicationBudget").value = "25"; $("applicationError").textContent = "";
  $("applicationCapabilities").innerHTML = `<legend>Initial capability grants</legend>${state.capabilities.map((capability) => `<label><input type="checkbox" value="${escapeHtml(capability.id)}" /> <span><strong>${escapeHtml(capability.label)}</strong><small>${escapeHtml(capability.id)}</small></span></label>`).join("")}`;
  $("applicationDialog").showModal();
});

$("proposeCapabilityButton").addEventListener("click", () => {
  $("capabilityForm").reset();
  $("capabilityInputContract").value = '{"type":"object","additionalProperties":false,"required":[],"properties":{}}';
  $("capabilityOutputContract").value = '{"type":"object","properties":{}}';
  const options = state.providers.map((provider) => `<option value="${escapeHtml(provider.id)}">${escapeHtml(provider.name)} · ${escapeHtml(provider.id)}</option>`).join("");
  $("capabilityPrimaryProvider").innerHTML = options;
  $("capabilityFallbackProvider").innerHTML = `<option value="">None</option>${options}`;
  $("capabilityError").textContent = "";
  $("capabilityDialog").showModal();
});
document.querySelectorAll(".close-capability-dialog").forEach((button) => button.addEventListener("click", () => $("capabilityDialog").close()));
$("capabilityForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    let inputContract;
    let outputContract;
    try {
      inputContract = JSON.parse($("capabilityInputContract").value);
      outputContract = JSON.parse($("capabilityOutputContract").value);
    } catch { throw new Error(t("Input and output contracts must be valid JSON.")); }
    await sendJson("/api/capability-proposals", "POST", {
      capabilityId: $("capabilityId").value, label: $("capabilityLabel").value,
      description: $("capabilityDescription").value, primaryProviderId: $("capabilityPrimaryProvider").value,
      fallbackProviderId: $("capabilityFallbackProvider").value || null,
      inputContract, outputContract, dataClassification: $("capabilityDataClassification").value,
      retentionPolicy: $("capabilityRetention").value,
    }, true);
    $("capabilityDialog").close(); await loadWorkspace(); openView("capabilities");
  } catch (error) { $("capabilityError").textContent = error.message; }
});
document.querySelectorAll(".close-application-dialog").forEach((button) => button.addEventListener("click", () => $("applicationDialog").close()));
$("applicationName").addEventListener("input", (event) => { $("applicationId").value = event.target.value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50); });
$("applicationForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await sendJson("/api/applications", "POST", {
      id: $("applicationId").value, name: $("applicationName").value, environment: $("applicationEnvironment").value,
      budget: Number($("applicationBudget").value), capabilityIds: [...document.querySelectorAll("#applicationCapabilities input:checked")].map((input) => input.value),
    }, true);
    $("applicationDialog").close(); await loadWorkspace();
  } catch (error) { $("applicationError").textContent = error.message; }
});

$("logoutButton").addEventListener("click", async () => {
  await sendJson("/api/auth/logout", "POST", {}, true); state.csrf = null; state.currentUser = null; $("appShell").classList.add("hidden"); await showAuth(false);
});

$("passwordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const current = $("currentPassword");
  const next = $("newPassword");
  const confirmation = $("confirmPassword");
  $("passwordError").textContent = "";
  if (next.value !== confirmation.value) { $("passwordError").textContent = t("New password confirmation does not match."); return; }
  if (!window.confirm(t("Changing the password will revoke every API Hub control-plane session. Continue?"))) return;
  try {
    await sendJson("/api/security/password", "POST", { currentPassword: current.value, newPassword: next.value }, true);
    current.value = ""; next.value = ""; confirmation.value = "";
    state.csrf = null; state.currentUser = null; $("appShell").classList.add("hidden"); await showAuth(false);
  } catch (error) {
    current.value = ""; next.value = ""; confirmation.value = ""; $("passwordError").textContent = error.message;
  }
});

async function loadWorkspace() {
  const [overview, providers, capabilities, applications, agents, audits, tokens, agentTokens, grants, invocations, usage, analytics, metricHistory, alerts, proposals, sessions, executionPolicy, database] = await Promise.all([
    getJson("/api/overview"), getJson("/api/providers"), getJson("/api/capabilities"), getJson("/api/applications"),
    getJson("/api/agents"), getJson("/api/audit"), getJson("/api/application-tokens"), getJson("/api/agent-tokens"), getJson("/api/grants"),
    getJson("/api/invocations"), getJson("/api/usage"), getJson("/api/analytics?range=24h"), getJson("/api/provider-metrics"), getJson("/api/alerts"), getJson("/api/capability-proposals"), getJson("/api/security/sessions"), getJson("/api/security/execution"), getJson("/api/database"),
  ]);
  Object.assign(state, { overview: overview.overview, providers: providers.providers, capabilities: capabilities.capabilities,
    applications: applications.applications, agents: agents.agents, audits: audits.audits, tokens: tokens.tokens, agentTokens: agentTokens.tokens,
    grants: grants.grants, invocations: invocations.invocations, usage: usage.usage, analytics: analytics.analytics, analyticsRange: "24h", metricHistory: metricHistory.history, alerts: alerts.alerts, proposals: proposals.proposals, sessions: sessions.sessions,
    execution: executionPolicy.execution, activationRequirements: executionPolicy.activationRequirements, database });
  renderOverview(); renderProviders(); renderCapabilities(); renderApplications(); renderAudits(); renderMetricsAndRisks(); renderDatabase(); renderBars(); renderAnalytics(); renderSecurity(); await refreshWebsiteCredential();
}

async function enterApp(payload) {
  state.currentUser = payload.user; state.csrf = payload.csrf || state.csrf; $("authGate").classList.add("hidden"); $("appShell").classList.remove("hidden"); renderIdentity(); await loadWorkspace();
}

async function refreshWebsiteCredential() {
  const status = await getJson('/api/website-credential');
  $('websiteCredentialState').textContent = status.configured ? (status.enabled ? '已加密保存' : '已停用') : '尚未保存';
  $('disableWebsiteCredential').disabled = !status.enabled;
  await refreshWebsiteAccounts();
}
async function refreshWebsiteAccounts() {
  const data = await getJson('/api/website-login');
  const container = $('websiteAccounts'); container.replaceChildren();
  if (!data.accounts.length) { container.textContent = '尚无网站记录。'; return; }
  for (const account of data.accounts) {
    const row = document.createElement('p');
    row.textContent = `${account.origin} · ${account.username} · ${account.enabled ? '已保存' : '已停用'} `;
    const button = document.createElement('button'); button.className = 'ghost'; button.textContent = '停用'; button.disabled = !account.enabled;
    button.addEventListener('click',async()=>{
      try {await sendJson('/api/website-login','POST',{action:'disable',origin:account.origin,username:account.username},true);await refreshWebsiteAccounts();}
      catch {$('websiteCredentialMessage').textContent='停用失败，请重试。';}
    });
    row.appendChild(button);container.appendChild(row);
  }
}
$('refreshWebsiteAccounts').addEventListener('click',()=>refreshWebsiteAccounts().catch(()=>{$('websiteCredentialMessage').textContent='刷新失败，请检查登录。';}));
$('websiteCredentialForm').addEventListener('submit', async event => {
  event.preventDefault();
  const password = $('websiteDefaultPassword');
  const confirmation = $('websiteDefaultConfirm');
  const message = $('websiteCredentialMessage');
  if (password.value !== confirmation.value) { message.textContent = '两次输入不一致，请重新输入。'; password.value = ''; confirmation.value = ''; return; }
  const button = event.submitter; if (button) button.disabled = true;
  try {
    await sendJson('/api/website-credential', 'PUT', { secret: password.value }, true);
    message.textContent = '已加密保存。未授权任何网站自动使用。';
  } catch { message.textContent = '保存失败，请确认登录状态后重试。'; }
  finally { password.value = ''; confirmation.value = ''; if (button) button.disabled = false; }
  await refreshWebsiteCredential();
});
$('disableWebsiteCredential').addEventListener('click', async () => {
  try {
    await sendJson('/api/website-credential', 'POST', { action: 'disable' }, true);
    $('websiteCredentialMessage').textContent = '已停用。'; await refreshWebsiteCredential();
  } catch { $('websiteCredentialMessage').textContent = '停用失败，请重试。'; }
});

async function showAuth(needsSetup) {
  $("authGate").classList.remove("hidden"); $("authGate").dataset.mode = needsSetup ? "setup" : "login";
  $("authTitle").textContent = t(needsSetup ? "Create your API Hub administrator" : "Sign in to API Hub");
  $("authCopy").textContent = t(needsSetup ? "Choose a local username and a password of at least 12 characters. Only a hardened password hash is stored." : "Your workspace is selected by the authenticated server session, never by a browser query parameter.");
  $("authSubmit").textContent = t(needsSetup ? "Create administrator" : "Sign in");
  $("authPassword").autocomplete = needsSetup ? "new-password" : "current-password";
}

$("authForm").addEventListener("submit", async (event) => {
  event.preventDefault(); $("authError").textContent = ""; const password = $("authPassword");
  try {
    const payload = await sendJson(`/api/auth/${$("authGate").dataset.mode}`, "POST", { username: $("authUsername").value, password: password.value });
    password.value = ""; await enterApp(payload);
  } catch (error) { password.value = ""; $("authError").textContent = error.message; }
});

async function bootstrap() {
  const status = await getJson("/api/auth/status");
  if (!status.authenticated) return showAuth(status.needsSetup);
  return enterApp(await getJson("/api/auth/me"));
}

bootstrap().catch((error) => { $("authError").textContent = error.message; });
