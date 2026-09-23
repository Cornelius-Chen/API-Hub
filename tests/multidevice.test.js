const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const https = require('node:https');
const { networkConfig } = require('../src/network');
const { ApiHubClient } = require('../src/sdk/node');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'api-hub-multidevice-'));
const port = 14319;
const origin = `https://localhost:${port}`;
const secret = 'synthetic-multidevice-provider-secret';
const password = 'synthetic-multidevice-admin-password';
let child, logs = '', remote = false, cookie = '', csrf = '';
const delay = ms => new Promise(r => setTimeout(r, ms));
function start() {
  child = cp.spawn(process.execPath, [path.join(root, 'server.js')], { cwd: root, windowsHide: true,
    env: { ...process.env, PORT: String(port), API_HUB_HOST: '127.0.0.1',
      API_HUB_DB_PATH: path.join(temp, 'test.sqlite'), API_HUB_VAULT_KEY_PATH: path.join(temp, 'vault.key'),
      API_HUB_LIVE_ACTIVATION_PATH: path.join(temp, 'absent-activation.json'),
      API_HUB_PUBLIC_ORIGIN: remote ? origin : '',
      API_HUB_TLS_CERT_PATH: remote ? path.join(temp, 'cert.pem') : '',
      API_HUB_TLS_KEY_PATH: remote ? path.join(temp, 'tls.key') : '' } });
  child.stdout.on('data', b => { logs += b; });
  child.stderr.on('data', b => { logs += b; });
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise(r => child.once('exit', r));
  child.kill(); await exited;
}
async function request(route, method = 'GET', body, extra = {}) {
  const headers = { ...(cookie ? { cookie } : {}), ...(csrf ? { 'x-csrf-token': csrf } : {}),
    ...(body ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(JSON.stringify(body)) } : {}), ...(remote ? { origin } : {}), ...extra };
  let status, responseHeaders, text;
  if (remote) {
    ({ status, responseHeaders, text } = await new Promise((resolve, reject) => {
      const r = https.request(origin + route, { method, headers, servername: 'localhost', ca: fs.readFileSync(path.join(temp, 'cert.pem')) }, res => {
        let text = ''; res.on('data', b => { text += b; });
        res.on('end', () => resolve({ status: res.statusCode, responseHeaders: res.headers, text }));
      }); r.on('error', reject); r.end(body ? JSON.stringify(body) : undefined);
    }));
  } else {
    const res = await fetch(`http://127.0.0.1:${port}${route}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    status = res.status; responseHeaders = Object.fromEntries(res.headers); text = await res.text();
  }
  assert.equal(text.includes(secret), false, 'provider secret must never appear in response');
  const value = responseHeaders['set-cookie'];
  if (value) cookie = (Array.isArray(value) ? value[0] : value).split(';')[0];
  const payload = JSON.parse(text);
  if (payload.csrf) csrf = payload.csrf;
  return { status, payload, headers: responseHeaders };
}
async function ready(expected = 200) {
  for (let i = 0; i < 100; i++) {
    try { if ((await request('/api/health')).status === expected) return; } catch {}
    if (child.exitCode !== null) throw new Error('Isolated server exited');
    await delay(100);
  } throw new Error('Isolated server timeout');
}
async function run() {
  assert.throws(() => networkConfig({ API_HUB_HOST: '0.0.0.0' }));
  assert.throws(() => networkConfig({ API_HUB_PUBLIC_ORIGIN: 'http://example.test' }));
  assert.throws(() => new ApiHubClient({ baseUrl: 'http://example.test', token: 'synthetic' }));
  assert.throws(() => new ApiHubClient({ baseUrl: 'https://user:pass@example.test', token: 'synthetic' }));
  const cert = cp.spawnSync(process.env.OPENSSL_BIN || 'openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', path.join(temp, 'tls.key'), '-out', path.join(temp, 'cert.pem'), '-days', '1', '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=DNS:localhost'], { windowsHide: true, encoding: 'utf8' });
  assert.equal(cert.status, 0, 'OpenSSL is required for isolated TLS tests');
  remote = true; start(); await ready(503); await stop(); // remote setup cannot claim administrator
  remote = false; start(); await ready();
  assert.equal((await request('/api/providers')).status, 401);
  assert.equal((await request('/api/auth/setup', 'POST', { username: 'test-owner', password })).status, 201);
  assert.equal((await request('/api/providers/openai/credential', 'PUT', { secret })).status, 200);
  await stop(); remote = true; start(); await ready();
  cookie = ''; csrf = '';
  const login = await request('/api/auth/login', 'POST', { username: 'test-owner', password });
  assert.equal(login.status, 200);
  assert.match(String(login.headers['set-cookie']), /; Secure/);
  const firstCookie = cookie;
  const providers = await request('/api/providers');
  assert.equal(providers.status, 200);
  assert.ok(JSON.stringify(providers.payload).includes('configured'));
  assert.equal((await request('/api/auth/login', 'POST', { username: 'test-owner', password }, { origin: 'https://evil.test' })).status, 403);
  assert.equal((await request('/api/health', 'GET', null, { host: 'evil.test' })).status, 421);
  cookie = ''; csrf = '';
  assert.equal((await request('/api/auth/login', 'POST', { username: 'test-owner', password })).status, 200);
  assert.notEqual(cookie, firstCookie, 'two device sessions');
  const updated = await request('/api/providers/openai/credential', 'PUT', { secret: secret + '-rotated' });
  assert.equal(updated.status, 200);
  const firstDeviceRead = await request('/api/providers', 'GET', null, { cookie: firstCookie });
  assert.equal(firstDeviceRead.status, 200);
  assert.ok(JSON.stringify(firstDeviceRead.payload).includes(updated.payload.credential.fingerprint), 'first device sees the second device credential update');
  assert.equal((await request('/gateway/v1/capabilities')).status, 401);
  const issue = await request('/api/applications/api-hub-console/tokens', 'POST', { label: 'Synthetic Mac' });
  assert.equal(issue.status, 201);
  const token = issue.payload.token;
  const tokenFile = path.join(temp, 'app-token'); fs.writeFileSync(tokenFile, token, { mode: 0o600 });
  // Run the exact platform-neutral bridge that Mac will run, against TLS and same DB.
  const bridge = cp.spawn(process.execPath, [path.join(root, 'src/sdk/node/mcp.js')], { windowsHide: true,
    env: { ...process.env, API_HUB_APP_TOKEN: '', API_HUB_APP_TOKEN_FILE: tokenFile, API_HUB_URL: origin,
      NODE_EXTRA_CA_CERTS: path.join(temp, 'cert.pem') } });
  let output = ''; bridge.stdout.on('data', b => { output += b; }); bridge.stderr.on('data', b => { output += b; });
  const finished = new Promise(r => bridge.once('exit', r));
  bridge.stdin.end([
    { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'ai.text.generate', arguments: { prompt: 'Synthetic MCP call' } } },
  ].map(x => JSON.stringify(x)).join('\n') + '\n');
  assert.equal(await finished, 0); assert.ok(output.includes('ai.text.generate')); assert.ok(!output.includes(token) && !output.includes(secret));
  const callResult = output.trim().split('\n').map(x => JSON.parse(x)).find(x => x.id === 2);
  assert.ok(callResult.result && !callResult.result.isError, 'MCP invocation succeeds through shared HTTPS gateway');
  const invoked = await request('/gateway/v1/invoke', 'POST', { capability: 'ai.text.generate', input: { prompt: 'Synthetic test only' } }, { authorization: `Bearer ${token}` });
  assert.equal(invoked.status, 200);
  assert.equal((await request(`/api/application-tokens/${issue.payload.metadata.tokenId}`, 'DELETE', { confirm: 'REVOKE' })).status, 200);
  assert.equal((await request('/gateway/v1/capabilities', 'GET', null, { authorization: `Bearer ${token}` })).status, 401);
  assert.equal((await request('/gateway/v1/invoke', 'POST', { capability: 'ai.text.generate', input: { prompt: 'Synthetic' } }, { authorization: `Bearer ${token}` })).status, 401);
  await stop(); start(); await ready();
  assert.equal((await request('/api/providers')).status, 200, 'same durable session and data after test-server restart');
  assert.equal((await request('/gateway/v1/capabilities', 'GET', null, { authorization: `Bearer ${token}` })).status, 401);
  assert.ok(!logs.includes(secret) && !logs.includes(token) && !logs.includes(password));
  console.log('multidevice: TLS, two sessions, shared vault, persistence, MCP token-file bridge, dry-run call, revocation, origin/host rejection and log secrecy passed');
}
run().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  await stop();
  // Only the unique synthetic directory created by this test is removed.
  fs.rmSync(temp, { recursive: true, force: true });
});
