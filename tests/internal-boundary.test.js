const assert = require('node:assert/strict');
const http = require('node:http');
const { networkConfig, blocksInternalPath } = require('../src/network');
const shared = networkConfig({ API_HUB_PUBLIC_ORIGIN: 'https://hub.example.test' });
const local = networkConfig({});
const paths = ['/internal', '/internal/', '/internal/launcher/shutdown', '/internal/future', '/%69nternal/launcher/shutdown', '/internal%2Flauncher/shutdown'];
for (const path of paths) assert.equal(blocksInternalPath(path, shared), true);
assert.equal(blocksInternalPath('/internal/launcher/shutdown', local), false);
assert.equal(blocksInternalPath('/api/health', shared), false);
let reachedHandler = 0;
const server = http.createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (blocksInternalPath(path, shared)) { res.writeHead(404); res.end(); return; }
  reachedHandler++; res.end('ok');
});
server.listen(0, '127.0.0.1', async () => {
  try {
    for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS']) {
      for (const path of paths) {
        const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method });
        assert.equal(res.status, 404); await res.arrayBuffer();
      }
    }
    assert.equal(reachedHandler, 0);
    console.log('internal boundary: 36 loopback requests rejected before handlers; local-only behavior preserved');
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { server.close(); server.closeAllConnections(); }
});
