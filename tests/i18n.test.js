const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { dictionaries, translateText } = require("../public/i18n.js");

const root = path.resolve(__dirname, "..");
const index = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");

assert.equal(translateText("Overview", "zh"), "概览");
assert.equal(translateText("Provider inventory", "zh"), "服务商清单");
assert.equal(translateText("6 calls · 2 peak RPM", "zh"), "6 次调用 · 峰值 2 RPM");
assert.equal(translateText("Revoke this agent token immediately?", "zh"), "立即撤销此 Agent 令牌？");
assert.equal(translateText("Overview", "en"), "Overview");
assert.equal(translateText("Platform", "zh"), "官方平台");
assert.equal(translateText("Analytics", "zh"), "分析");
assert.equal(translateText("Calls by API provider", "zh"), "各 API 服务商调用量");
assert.ok(Object.keys(dictionaries.zh).length > 100, "Chinese dictionary must cover the full control plane");
assert.equal((index.match(/data-locale="zh"/g) || []).length, 2);
assert.equal((index.match(/data-locale="en"/g) || []).length, 2);
assert.ok(index.indexOf("/i18n.js") < index.indexOf("/app.js"), "i18n must initialize before the application");
const app = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");
assert.ok(app.includes("provider.console || provider.website"), "provider cards must expose the official platform link");
assert.ok(app.includes('rel="noopener noreferrer"'), "external provider links must isolate the opener");
assert.ok(index.includes('id="analyticsView"'), "analytics must have a dedicated page");
assert.equal((index.match(/data-analytics-range=/g) || []).length, 3);
assert.ok(app.includes("renderUsageTrend"), "analytics must render a provider-colored time series");
console.log("selectable Chinese/English control-plane localization: passed");
