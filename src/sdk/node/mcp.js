#!/usr/bin/env node
"use strict";

const readline = require("node:readline");
const { ApiHubClient, ApiHubError } = require("./index.js");

const protocolVersion = "2025-06-18";
const supportedVersions = new Set([protocolVersion, "2025-03-26", "2024-11-05"]);
const baseUrl = process.env.API_HUB_URL || "http://127.0.0.1:4310";
let token = process.env.API_HUB_APP_TOKEN;
if (!token && process.env.API_HUB_APP_TOKEN_FILE) {
  try {
    token = require("node:fs").readFileSync(process.env.API_HUB_APP_TOKEN_FILE, "utf8").trim();
  } catch {
    process.stderr.write("Unable to load API Hub application token file.\n");
    process.exitCode = 1;
    return;
  }
}
const timeoutMs = Number(process.env.API_HUB_TIMEOUT_MS || 30_000);

if (!token) {
  process.stderr.write("API_HUB_APP_TOKEN or API_HUB_APP_TOKEN_FILE is required.\n");
  process.exitCode = 1;
  return;
}

let client;
try {
  client = new ApiHubClient({ baseUrl, token, timeoutMs });
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
  return;
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function result(id, value) {
  send({ jsonrpc: "2.0", id, result: value });
}

function protocolError(id, code, message, data) {
  send({ jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data ? { data } : {}) } });
}

function toolFromCapability(capability) {
  const inputSchema = capability.inputContract && capability.inputContract.type === "object"
    ? capability.inputContract
    : { type: "object", additionalProperties: true };
  return {
    name: capability.capabilityId,
    title: capability.label || capability.capabilityId,
    description: [
      capability.description || `Invoke ${capability.capabilityId} through API Hub.`,
      `Execution is governed by the ${capability.dataClassification || "internal"} data policy.`,
      `Remaining allowance: ${capability.usage?.minute?.remaining ?? "unknown"}/minute and ${capability.usage?.day?.remaining ?? "unknown"}/day.`,
    ].join(" "),
    inputSchema,
  };
}

function toolFailure(error) {
  const details = error instanceof ApiHubError ? {
    status: error.status,
    reason: error.reason,
    requestId: error.requestId,
    retryAfter: error.retryAfter,
    retryable: error.retryable,
  } : { reason: "mcp_bridge_error", retryable: false };
  const safe = Object.fromEntries(Object.entries(details).filter(([, value]) => value !== undefined));
  return {
    content: [{ type: "text", text: JSON.stringify(safe) }],
    structuredContent: safe,
    isError: true,
  };
}

async function handle(message) {
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    protocolError(message?.id, -32600, "Invalid JSON-RPC request");
    return;
  }
  if (message.method === "notifications/initialized" || message.method === "notifications/cancelled") return;
  if (message.method === "initialize") {
    const requested = message.params?.protocolVersion;
    result(message.id, {
      protocolVersion: supportedVersions.has(requested) ? requested : protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "api-hub-mcp", title: "API Hub Governed Capabilities", version: "0.1.0" },
      instructions: "Use only the granted tools shown by tools/list. Provider credentials are never exposed. Preserve requestId when reporting failures.",
    });
    return;
  }
  if (message.method === "ping") {
    result(message.id, {});
    return;
  }
  if (message.method === "tools/list") {
    try {
      const manifest = await client.capabilities();
      result(message.id, { tools: manifest.capabilities.map(toolFromCapability) });
    } catch (error) {
      protocolError(message.id, -32603, "Unable to discover API Hub capabilities", toolFailure(error).structuredContent);
    }
    return;
  }
  if (message.method === "tools/call") {
    const name = message.params?.name;
    if (typeof name !== "string" || !message.params || (message.params.arguments !== undefined && (typeof message.params.arguments !== "object" || message.params.arguments === null || Array.isArray(message.params.arguments)))) {
      protocolError(message.id, -32602, "Invalid tool name or arguments");
      return;
    }
    try {
      const manifest = await client.capabilities();
      if (!manifest.capabilities.some((item) => item.capabilityId === name)) {
        protocolError(message.id, -32602, `Unknown or ungranted tool: ${name}`);
        return;
      }
      const invocation = await client.invoke(name, message.params.arguments || {});
      result(message.id, {
        content: [{ type: "text", text: JSON.stringify(invocation) }],
        structuredContent: invocation,
        isError: false,
      });
    } catch (error) {
      result(message.id, toolFailure(error));
    }
    return;
  }
  protocolError(message.id, -32601, `Method not found: ${message.method}`);
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let queue = Promise.resolve();
input.on("line", (line) => {
  if (!line.trim()) return;
  queue = queue.then(async () => {
    let message;
    try { message = JSON.parse(line); }
    catch { protocolError(null, -32700, "Parse error"); return; }
    await handle(message);
  }).catch(() => protocolError(null, -32603, "Internal MCP bridge error"));
});
input.on("close", () => {
  queue.catch(() => {}).finally(() => { process.exitCode = process.exitCode || 0; });
});
