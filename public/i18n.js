(function initializeApiHubI18n(global) {
  "use strict";

  const zh = {
    "API Hub — Control plane": "API Hub — 控制面",
    "LOCAL SECURITY SETUP": "本地安全设置",
    "Create your API Hub administrator": "创建 API Hub 管理员",
    "Choose a local username and a password of at least 12 characters. Only a hardened password hash is stored.": "设置本地用户名和至少 12 位的密码。系统只保存加固后的密码哈希。",
    "Sign in to API Hub": "登录 API Hub",
    "Your workspace is selected by the authenticated server session, never by a browser query parameter.": "工作区由服务端认证会话确定，浏览器参数无法切换工作区。",
    "Username": "用户名", "Password": "密码", "Create administrator": "创建管理员", "Sign in": "登录",
    "Private control plane": "私有能力控制面", "Primary navigation": "主导航",
    "Overview": "概览", "Analytics": "分析", "Providers": "服务商", "Capabilities": "能力", "Applications": "应用", "Database": "数据库", "Audit": "审计", "Security": "安全",
    "Vault boundary intact": "Vault 边界正常", "No plaintext secrets exposed": "未暴露明文凭证",
    "CONTROL PLANE / DEVELOPMENT": "控制面 / 开发环境", "Operational overview": "运行概览",
    "Usage analytics": "用量分析", "Provider inventory": "服务商清单", "Capability contracts": "能力合同", "Application access": "应用访问", "User database": "用户数据库", "Audit trail": "审计轨迹", "Security center": "安全中心",
    "GATEWAY ANALYTICS": "网关分析", "Provider usage, reliability and latency": "服务商用量、可靠性与延迟", "Analytics range": "分析时间范围", "24 hours": "24 小时", "7 days": "7 天", "30 days": "30 天",
    "CALL VOLUME OVER TIME": "调用量趋势", "Calls by API provider": "各 API 服务商调用量", "Provider color legend": "服务商颜色图例", "PROVIDER SHARE": "服务商占比", "Calls by provider": "各服务商调用量", "Gateway observed": "网关实测",
    "DECISION QUALITY": "决策质量", "Allowed and denied": "允许与拒绝", "Allowed": "允许", "Denied": "拒绝", "RESPONSE PRESSURE": "响应压力", "Average latency by provider": "各服务商平均延迟", "Milliseconds": "毫秒",
    "No Gateway calls in this range": "该时间范围内暂无 Gateway 调用", "New calls will appear here after they pass through API Hub.": "新调用通过 API Hub 后会显示在这里。", "Analytics could not be loaded": "分析数据加载失败", "Refresh the page and try again.": "请刷新页面后重试。", "calls": "次调用", "API calls over time by provider": "各服务商 API 调用趋势", "Each colored line represents one API provider. Values come from API Hub Gateway records.": "每条彩色折线代表一个 API 服务商，数据来自 API Hub Gateway 记录。", "Policy / unrouted": "策略拒绝 / 未路由", "Unsupported analytics range": "不支持的分析时间范围",
    "Authenticated workspace": "已认证工作区", "Workspace": "工作区", "Log out": "退出登录", "Rotate credential": "轮换凭证",
    "Provider health": "服务商健康", "workspace-scoped health": "当前工作区健康度", "Month spend": "本月支出", "workspace budget": "工作区预算",
    "Request peak": "请求峰值", "highest provider peak": "服务商最高峰值", "Remaining runway": "剩余可用期", "estimated from current burn": "根据当前消耗估算",
    "LIVE PROVIDER MAP": "实时服务商地图", "Where your capabilities run": "能力实际运行位置", "Inspect inventory →": "查看清单 →",
    "NEEDS DECISION": "等待决策", "Risk queue": "风险队列", "30-DAY CONTROL": "30 天控制", "Spend and peak pressure": "支出与峰值压力",
    "Cost": "费用", "Peak": "峰值", "Latest snapshots": "最新快照", "RECENT CONTROL EVENTS": "近期控制事件", "What the gateway decided": "Gateway 做出的决策", "Open audit →": "打开审计 →",
    "PROVIDER ASSET REGISTER": "服务商资产登记", "Accounts, endpoints, credentials and quota truth": "账户、端点、凭证与配额真相",
    "Search providers": "搜索服务商", "Add provider": "添加服务商", "APPEND-ONLY EVIDENCE": "只追加证据", "Quota, spend and peak history": "配额、支出与峰值历史", "Source labeled": "已标明来源",
    "STABLE BUSINESS CONTRACTS": "稳定业务合同", "Applications ask for capabilities, never provider keys": "应用只请求能力，永不接触服务商密钥", "Propose capability": "提议能力",
    "REVIEW QUEUE": "审核队列", "Candidate capability contracts": "候选能力合同", "Explicit activation required": "必须显式启用",
    "APPLICATION ACCESS": "应用访问", "Budgets, agents, grants and gateway identities": "预算、Agent、授权与 Gateway 身份", "Register application": "注册应用",
    "GATEWAY OBSERVED · UTC DAY": "GATEWAY 观测 · UTC 当日", "Calls, policy denials and peak pressure": "调用、策略拒绝与峰值压力", "Loading": "加载中",
    "STANDARD INTEGRATION": "标准接入", "Every SaaS calls capabilities through one contract": "所有 SaaS 通过统一合同调用能力", "No provider keys leave the vault": "服务商密钥不会离开 Vault",
    "DELEGATED AGENT IDENTITIES": "委托 Agent 身份", "Short-lived, least-privilege Gateway access": "短期、最小权限 Gateway 访问", "Register agent": "注册 Agent",
    "USER DATA NAMESPACE": "用户数据命名空间", "One isolated workspace, governed relational collections": "一个隔离工作区，受治理的关系集合", "Loading workspace": "正在加载工作区",
    "Database collections": "数据库集合", "COLLECTION RELATION": "集合关系", "Select a collection": "选择一个集合",
    "IMMUTABLE INTENT TRAIL": "不可变意图轨迹", "Identity, policy, route, usage and outcome": "身份、策略、路由、用量与结果", "Metadata only": "仅元数据",
    "CONTROL-PLANE SECURITY": "控制面安全", "Sessions, password rotation and browser protections": "会话、密码轮换与浏览器保护", "Local administrator": "本地管理员",
    "ACTIVE SESSIONS": "活动会话", "Authenticated devices": "已认证设备", "PASSWORD ROTATION": "密码轮换", "Change administrator password": "修改管理员密码", "Revokes every session": "撤销全部会话",
    "Current password": "当前密码", "New password": "新密码", "Confirm new password": "确认新密码", "Change password and sign out": "修改密码并退出",
    "PROVIDER EXECUTION BOUNDARY": "服务商执行边界", "Live traffic activation gate": "真实流量启用门禁",
    "WRITE-ONLY VAULT": "只写 VAULT", "Store or rotate credential": "保存或轮换凭证", "The secret is encrypted server-side with AES-256-GCM. Only its status and fingerprint can be read back.": "凭证在服务端使用 AES-256-GCM 加密，只能读取状态和指纹。",
    "Provider": "服务商", "Secret value": "凭证值", "Write-only — never displayed again": "只写——不会再次显示", "Cancel": "取消", "Encrypt and store": "加密并保存", "Close": "关闭",
    "PROVIDER ONBOARDING": "服务商接入", "Add provider account": "添加服务商账户", "Metadata and quota provenance remain readable. The credential is write-only and encrypted in the local vault.": "元数据和配额来源保持可读，凭证只写并加密存入本地 Vault。",
    "Provider name": "服务商名称", "Provider ID": "服务商 ID", "Category": "类别", "Official website": "官方网站", "Documentation URL": "文档地址", "Developer console URL": "开发者控制台地址", "API base URL": "API 基础地址", "Environment": "环境",
    "Development": "开发", "Sandbox": "沙盒", "Remaining quota (%)": "剩余配额 (%)", "Quota unit": "配额单位", "Quota source": "配额来源", "Unknown": "未知", "Manual": "人工", "Estimated": "估算", "Encrypt and add provider": "加密并添加服务商",
    "METRIC SNAPSHOT": "指标快照", "Record provider usage": "记录服务商用量", "Each update preserves an immutable snapshot. Human entry cannot claim official provider API provenance.": "每次更新都会保留不可变快照；人工录入不能冒充服务商官方数据。",
    "Source": "来源", "Month cost": "本月费用", "Peak requests/min": "每分钟请求峰值", "Record snapshot": "记录快照",
    "APPLICATION IDENTITY": "应用身份", "Issue gateway token": "签发 Gateway 令牌", "The token is scoped to one application and its granted capabilities. It expires after 90 days.": "令牌仅属于一个应用及其获授权能力，90 天后过期。",
    "Application": "应用", "Token label": "令牌标签", "Issue one-time token": "签发一次性令牌", "Copy this token now.": "请立即复制此令牌。", "Copy token": "复制令牌", "Done": "完成",
    "NEW SAAS CONNECTION": "新 SaaS 连接", "Register application": "注册应用", "Create one server identity boundary for a SaaS product, then grant only the capabilities it needs.": "为一个 SaaS 产品创建独立服务端身份边界，只授予所需能力。",
    "Application name": "应用名称", "Application ID": "应用 ID", "Monthly policy budget": "每月策略预算", "Initial capability grants": "初始能力授权", "Register and grant": "注册并授权",
    "DELEGATED IDENTITY": "委托身份", "Register a short-lived agent": "注册短期 Agent", "An agent can receive only a subset of its application's enabled capabilities. Its first token is shown once.": "Agent 只能获得所属应用已启用能力的子集，首个令牌只显示一次。",
    "Agent name": "Agent 名称", "Agent ID": "Agent ID", "Agent lifetime (hours)": "Agent 有效期（小时）", "Delegated capabilities": "委托能力", "Register and issue token": "注册并签发令牌", "Copy this agent token now.": "请立即复制 Agent 令牌。", "Copy agent token": "复制 Agent 令牌",
    "CONTRACT CANDIDATE": "合同候选", "Propose capability": "提议能力", "A proposal is invisible to applications until you explicitly activate it after review.": "提议在人工审核并显式启用前，对应用不可见。",
    "Capability ID": "能力 ID", "Human label": "人类标题", "Description": "说明", "Primary provider": "主要服务商", "Fallback provider": "备用服务商", "None": "无", "Data classification": "数据分级", "Internal": "内部", "Public": "公开", "Confidential": "机密", "Restricted": "受限", "Retention policy": "保留策略", "Metadata only": "仅元数据", "Ephemeral": "临时", "Input contract (JSON)": "输入合同（JSON）", "Output contract (JSON)": "输出合同（JSON）", "Save candidate": "保存候选",
    "Ready": "就绪", "Attention": "需关注", "Active": "活动", "Configured": "已配置", "Operational": "运行正常", "Draft": "草稿", "Candidate": "候选", "Activated": "已启用", "Revoked": "已撤销", "Locked · no provider traffic": "已锁定 · 无服务商流量", "Unlocked": "已解锁",
    "Mode": "模式", "Egress": "外连", "Timeout": "超时", "Retries": "重试", "Request body": "请求体", "Concurrency": "并发", "Reviewed adapters": "已审核适配器", "Required before live activation": "真实调用启用前要求",
    "Credential": "凭证", "API base": "API 基础地址", "Remaining": "剩余", "Platform": "官方平台", "Docs": "文档", "Update usage": "更新用量", "Primary route": "主路由", "Fallback": "备用", "Review & activate": "审核并启用",
    "Today": "今日", "Budget": "预算", "Issue token": "签发令牌", "Last used": "上次使用", "Never": "从未", "Revoke": "撤销", "Owning application": "所属应用", "No delegated agents": "暂无委托 Agent", "No application tokens issued": "尚未签发应用令牌",
    "Current session": "当前会话", "Authenticated session": "已认证会话", "Last seen": "上次活动", "Sign out": "退出", "No active sessions": "没有活动会话",
    "No open provider alerts": "没有待处理的服务商告警", "Threshold and provenance checks are currently clear.": "阈值和来源检查当前正常。", "remaining": "剩余", "month cost": "本月费用", "peak rpm": "峰值 RPM", "No metric snapshots": "暂无指标快照", "Record a provider update to start the history.": "记录一次服务商更新以开始积累历史。",
    "No records in this workspace": "当前工作区没有记录", "The collection exists, but this user has not created an item yet.": "集合已经存在，但当前用户尚未创建记录。", "No history yet": "暂无历史",
    "No capability proposals": "暂无能力提议", "New contracts remain candidates until explicitly activated.": "新合同在显式启用前保持候选状态。", "No Gateway decisions observed today": "今日尚无 Gateway 决策",
    "Input and output contracts must be valid JSON.": "输入和输出合同必须是有效 JSON。", "New password confirmation does not match.": "两次输入的新密码不一致。", "Copied": "已复制",
    "Activating publishes a new Gateway contract.": "启用后将发布新的 Gateway 合同。", "Type exactly:": "请准确输入：",
    "Revoke this agent token immediately?": "立即撤销此 Agent 令牌？", "Revoke this application token now? Calls using it will stop immediately.": "立即撤销此应用令牌？使用它的调用将立刻停止。", "Revoke this control-plane session immediately?": "立即撤销此控制面会话？",
    "Changing the password will revoke every API Hub control-plane session. Continue?": "修改密码会撤销全部 API Hub 控制面会话，是否继续？",
    "Invalid gateway token": "Gateway 令牌无效", "Authentication required": "需要登录认证", "Invalid username or password": "用户名或密码错误", "Internal Server Error": "内部服务错误", "Request failed": "请求失败",
    "Oauth required": "需要 OAuth", "Needs review": "需要审核", "Sandbox": "沙盒", "Development": "开发"
  };

  const dictionaries = { en: {}, zh };

  function translateText(value, locale) {
    if (locale !== "zh") return value;
    const leading = value.match(/^\s*/)?.[0] || "";
    const trailing = value.match(/\s*$/)?.[0] || "";
    const text = value.trim();
    if (!text) return value;
    if (zh[text]) return `${leading}${zh[text]}${trailing}`;
    const patterns = [
      [/^(\d+) \/ (\d+) stable$/, (_, a, b) => `${a}/${b} 稳定`],
      [/^(\d+)% of \$(.+) workspace budget$/, (_, a, b) => `工作区预算 $${b} 的 ${a}%`],
      [/^(\d+) req\/min$/, (_, a) => `${a} 请求/分钟`],
      [/^(\d+) days$/, (_, a) => `${a} 天`],
      [/^(\d+) calls · (\d+) peak RPM$/, (_, a, b) => `${a} 次调用 · 峰值 ${b} RPM`],
      [/^(\d+) policy denials · (\d+) agents$/, (_, a, b) => `${a} 次策略拒绝 · ${b} 个 Agent`],
      [/^(\d+) active tokens$/, (_, a) => `${a} 个活动令牌`],
      [/^(\d+) grants · (\d+) calls$/, (_, a, b) => `${a} 项授权 · ${b} 次调用`],
      [/^(\d+) denied today$/, (_, a) => `今日拒绝 ${a} 次`],
      [/^Observed (.+)$/, (_, a) => `观测于 ${a}`],
      [/^Last seen · expires (.+)$/, (_, a) => `上次活动 · ${a} 过期`],
      [/^(\d+) per identity \/ (\d+) total$/, (_, a, b) => `每个身份 ${a} / 总计 ${b}`],
      [/^Revoke (.+)$/, (_, a) => `撤销 ${a}`]
    ];
    for (const [pattern, format] of patterns) if (pattern.test(text)) return `${leading}${text.replace(pattern, format)}${trailing}`;
    return value;
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { dictionaries, translateText };
  if (!global.document) return;

  const textState = new WeakMap();
  const attributeState = new WeakMap();
  let locale = (() => {
    try { return global.localStorage.getItem("api-hub-locale") || (global.navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en"); }
    catch { return "en"; }
  })();
  let applying = false;

  function translateNode(node) {
    const prior = textState.get(node);
    const original = !prior || node.nodeValue !== prior.rendered ? node.nodeValue : prior.original;
    const rendered = translateText(original, locale);
    textState.set(node, { original, rendered });
    if (node.nodeValue !== rendered) node.nodeValue = rendered;
  }

  function translateAttributes(element) {
    const names = ["placeholder", "aria-label", "title"];
    const state = attributeState.get(element) || {};
    for (const name of names) {
      if (!element.hasAttribute(name)) continue;
      const current = element.getAttribute(name);
      const prior = state[name];
      const original = !prior || current !== prior.rendered ? current : prior.original;
      const rendered = translateText(original, locale);
      state[name] = { original, rendered };
      if (current !== rendered) element.setAttribute(name, rendered);
    }
    attributeState.set(element, state);
  }

  function localize(root = global.document) {
    if (applying) return;
    applying = true;
    try {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (!node.parentElement || ["SCRIPT", "STYLE", "CODE", "PRE", "TEXTAREA"].includes(node.parentElement.tagName)) continue;
        translateNode(node);
      }
      const elements = root.querySelectorAll ? root.querySelectorAll("[placeholder], [aria-label], [title]") : [];
      elements.forEach(translateAttributes);
      document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
      document.title = locale === "zh" ? zh["API Hub — Control plane"] : "API Hub — Control plane";
      document.querySelectorAll("[data-locale]").forEach((button) => {
        const active = button.dataset.locale === locale;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
    } finally { applying = false; }
  }

  function setLocale(next) {
    if (!dictionaries[next]) return;
    locale = next;
    try { global.localStorage.setItem("api-hub-locale", next); } catch {}
    localize();
    global.dispatchEvent(new CustomEvent("api-hub:locale", { detail: { locale } }));
  }

  global.API_HUB_I18N = { get locale() { return locale; }, localize, setLocale, t: (value) => translateText(value, locale) };
  document.querySelectorAll("[data-locale]").forEach((button) => button.addEventListener("click", () => setLocale(button.dataset.locale)));
  const observer = new MutationObserver(() => queueMicrotask(() => localize()));
  observer.observe(document.body, { childList: true, characterData: true, subtree: true });
  localize();
})(typeof window !== "undefined" ? window : globalThis);
