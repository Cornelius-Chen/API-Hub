# Control-plane localization

API Hub supports selectable Simplified Chinese and English on both the login
screen and the authenticated control plane.

- English is the reviewable source copy in `public/index.html` and dynamic UI
  renderers.
- Chinese translations are explicit mappings in `public/i18n.js`.
- The selected locale is stored in browser `localStorage` under
  `api-hub-locale`; no account, credential, or provider data is stored there.
- Provider names, application names, IDs, URLs, user-authored values, and audit
  evidence remain unchanged. Localization affects interface meaning only.
- New dynamic DOM content is localized after rendering, while switching back to
  English restores the original source text.

The browser language chooses the first default when no preference exists.
Users can switch at any time with the `中文 / EN` control.
