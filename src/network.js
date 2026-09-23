"use strict";
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");

// No forwarded header is trusted. Remote HTTP is never a supported transport.
function networkConfig(env = process.env) {
  const host = env.API_HUB_HOST || "127.0.0.1";
  const port = Number(env.PORT || 4310);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid API Hub port");
  const loopback = ["127.0.0.1", "::1", "localhost"].includes(host);
  const certPath = env.API_HUB_TLS_CERT_PATH;
  const keyPath = env.API_HUB_TLS_KEY_PATH;
  if (Boolean(certPath) !== Boolean(keyPath)) throw new Error("Both TLS certificate and key paths are required");
  const tls = Boolean(certPath);
  let origin = null;
  if (env.API_HUB_PUBLIC_ORIGIN) {
    const url = new URL(env.API_HUB_PUBLIC_ORIGIN);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      throw new Error("API_HUB_PUBLIC_ORIGIN must be a bare HTTPS origin");
    }
    origin = url.origin;
  }
  if ((!loopback || tls) && !origin) throw new Error("HTTPS origin is required for remote or TLS access");
  if (!loopback && !tls) throw new Error("Non-loopback listeners require native TLS");
  return { host, port, loopback, tls, origin, certPath, keyPath, secureCookies: Boolean(origin) };
}

function sameOrigin(request, config) {
  const origin = request.headers.origin;
  if (!origin) return true; // CLI authentication still requires application tokens.
  if (config.origin) return origin === config.origin;
  return origin === `http://${request.headers.host}`;
}

function allowedHost(request, config) {
  if (config.origin) return request.headers.host === new URL(config.origin).host;
  return [`127.0.0.1:${config.port}`, `localhost:${config.port}`, `[::1]:${config.port}`].includes(request.headers.host);
}

function blocksInternalPath(pathname, config) {
  if (!config.origin) return false;
  let decoded;
  try { decoded = decodeURIComponent(pathname).replace(/\\/g, "/").toLowerCase(); }
  catch { return true; }
  return decoded === "/internal" || decoded.startsWith("/internal/");
}

function createServer(config, handler) {
  return config.tls
    ? https.createServer({ cert: fs.readFileSync(config.certPath), key: fs.readFileSync(config.keyPath), minVersion: "TLSv1.2" }, handler)
    : http.createServer(handler);
}

module.exports = { networkConfig, sameOrigin, allowedHost, blocksInternalPath, createServer };
