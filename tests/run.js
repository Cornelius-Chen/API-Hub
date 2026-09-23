const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const testRunId = `${process.pid}-${Date.now()}`;
const base = path.join(os.tmpdir(), `api-hub-test-security-${testRunId}`);
let status = 0;
for (const testFile of ["browser-extension.test.js", "website-login.test.js", "internal-boundary.test.js", "isolation.test.js", "execution-engine.test.js", "deepseek-adapter.test.js", "i18n.test.js", "sdk-package.test.js"]) {
  const result = childProcess.spawnSync(process.execPath, [path.join(__dirname, testFile)], {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, API_HUB_TEST_RUN_ID: testRunId },
    encoding: "utf8",
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    status = result.status ?? 1;
    break;
  }
}
for (const suffix of [".sqlite", ".sqlite-wal", ".sqlite-shm", ".key"]) {
  fs.rmSync(`${base}${suffix}`, { force: true, maxRetries: 10, retryDelay: 100 });
}
process.exitCode = status;
