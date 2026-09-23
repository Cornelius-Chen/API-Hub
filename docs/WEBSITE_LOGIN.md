# Website login with API Hub

This is an optional website-password component, separate from provider APIs.
The original API SDK/MCP and provider credentials are unchanged.

## Install once, Windows or Mac

Use Chrome or Edge. Open chrome://extensions (Edge: edge://extensions), enable
developer mode, choose Load unpacked and select the `browser-extension` directory
from `dist/api-hub-website-login.zip`. Pin API Hub Website Login to the toolbar.
Do not load the entire Hub project. No secrets or runtime files are in this ZIP.
The unpacked extension is not installed automatically by adding the Skill.
This does not install into Codex's in-app browser or Safari.

Copy `api-hub-website-login/SKILL.md` from the ZIP into the same directory under
`~/.codex/skills` on Mac. The MSI copy is already installed there; a new Codex
turn/task may be needed for discovery. The Skill coordinates actions; it does
not add an MCP password-retrieval tool.

Permissions are activeTab, scripting, session storage, and access to the exact
Hub HTTPS origin. No <all_urls>, cookies permission, browsing history, debugger,
or persistent password store is requested. Clicking the extension on the website
grants that page temporarily. Keep an authenticated Hub tab open in the same
browser. The extension uses that existing session; it does not require a new API
token. All website routes reject ordinary API tokens without a browser session.

## Use

1. Open the intended HTTPS login page, then the extension. Confirm exact origin
   and username. Click the saved/default fill button once.
2. Submit on the website. The extension does not click Submit or bypass OTP,
   CAPTCHA, browser certificate warnings or security checks.
3. On verified success, open the extension again and confirm success within five
   minutes. This saves the actual candidate password under origin + username.
4. On failure, mark failure; it saves nothing and will not retry the default.
   The user may privately enter the correct password in the extension manual
   section and fill once, then confirm success. No agent reads the field.
5. Inspect/disable saved accounts in the Hub's Security view under Saved website accounts. Disabling
   a saved account blocks fallback to the default. Replacing the default does not
   overwrite previously confirmed site passwords.

The user asked for saved-first, default-once, confirm-and-save, otherwise wait.
This first version requires an explicit extension gesture and reliable success
confirmation. It cannot reliably infer arbitrary site login success. Username-
first/SSO/iframes/shadow-DOM/multiple password forms are manual fallbacks.

## Data and trust

All durable records stay in the existing MSI SQLite database with AES-256-GCM,
workspace and exact-origin/account context. UI lists only account metadata.
The authenticated begin endpoint returns a sealed RSA-OAEP response, not a
plaintext password. RSA-4096 keys are generated ephemerally by the extension.
Its private key is never sent to Hub, stored or returned to the AI. A five-minute
server-memory attempt holds only a candidate ciphertext until confirmation.
The extension keeps only attempt metadata in chrome.storage.session.

This is NOT protection against a compromised Hub owner session, local OS account,
or malicious authorized website. Filling necessarily exposes the password to
that website and to browser memory. Do not authorize unknown sites. No existing
default or website password was read or tested against a real site during build.

## Implementation and evidence

Reuses Hub authentication/CSRF, SQLite, AES encryption and audit conventions.
Browser design follows Chrome's activeTab/scripting APIs and official samples:
https://developer.chrome.com/docs/extensions/develop/concepts/activeTab
https://developer.chrome.com/docs/extensions/reference/api/scripting
https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/api-samples/scripting

Tests: `node tests/website-login.test.js`, `node tests/browser-extension.test.js`,
and `npm test`. Core tests cover sealed delivery, saved-first lookup, fallback,
failure without saving, explicit confirmation, isolation, expiry, disabling,
and manual replacement. The extension test executes popup code with simulated
Chrome APIs/DOM and the real crypto/core. It checks Unicode-safe fill, failure,
manual retry, success/save and cross-origin form rejection. It is NOT an actual
installed-extension or macOS/real-site end-to-end test. Those require the browser
installation and a user-authorized test site/account. No real login attempted.

Uninstall the extension and remove the Skill to stop browser integration. The
Hub data remains preserved. Disable individual saved accounts via Security.
