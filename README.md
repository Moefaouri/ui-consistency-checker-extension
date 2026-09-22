# UI Consistency Checker

Chrome extension for checking a page against shared CSS and class standards.

The toolbar icon opens a persistent native Chrome side panel. Chrome 116 or
newer is required. The panel follows Chrome's user-selected left/right side;
the extension reads that placement when Chrome 140+ exposes it and mirrors its
edge lighting automatically.

## AI browser companion

The **Chat** tab is a continuous, general-purpose assistant connected to
OpenAI, Claude, or Google AI Studio. Google uses the user's API key; OpenAI
and Claude can use either an API key or the provider CLI's existing account
session through the optional local companion. It supports
streaming responses, cancellation, retry/regenerate, Markdown and code blocks,
multiple saved conversations, automatic titles, rename/delete, and persistent
local history. A user can ask a normal question without opening or analyzing a
page first.

Page access has three modes:

- **Auto** includes bounded page evidence only for page-related requests.
- **On** includes the active page with every new request.
- **Off** is normal AI chat and never inspects the page.

For page-aware requests, the context selector chooses a focused,
accessibility, form, or broad capture. Captures can include semantic DOM,
visible text, ARIA attributes, geometry, computed styles, authored CSS, design
tokens, viewport details, and an optional visible-tab screenshot. Screenshots
are omitted whenever an editable field is visible because pixels cannot be
reliably redacted. Context is cached briefly, invalidated after DOM mutations,
and can be refreshed manually.

**Inspect element** adds a hover-and-click picker to the page. The selected
element's sanitized HTML, selector, dimensions, accessibility metadata,
computed styles, and parent context become a removable chat attachment.

Chat, History, and Settings are independent screens. Chat stays focused on the
conversation; provider, appearance, privacy, context-budget, and retention
controls live in Settings. Missing credentials leave Chat visible and preserve
the draft. **Open Settings** leads to a single **Save key & return to chat**
action that validates the key, chooses an available model when necessary, and
returns to the same draft. Each provider also supports key-authenticated model
discovery and a custom model ID.

Before every page-aware request, raw capture data is cleaned, ranked for the
current prompt, deduplicated, and fitted to the selected Compact, Balanced, or
Detailed token budget. Conversation history is independently bounded. If a
provider still rejects the context, the error offers three recovery actions:
retry with reduced context, send without page context, or select one element.

API keys are stored only in `chrome.storage.session`, are cleared when Chrome
closes, and are sent directly to the selected provider. The capture excludes
form values, passwords, cookies, web storage, scripts, URL queries and
fragments, cross-origin frame contents, and CSS asset URLs. Page content is
wrapped as untrusted data and cannot replace the assistant's system rules.

When **Enforce imported components as the UI standard** is enabled, the
assistant receives a small relevance-ranked subset of the imported component
library with every request. It treats established selectors, scopes, tokens,
responsive rules, and CSS values as authoritative instead of inventing a
second design language. The complete library is never sent blindly, and
sensitive-looking strings are redacted first.

Account mode requires an installed Codex or Claude CLI plus the native
messaging companion documented in [`native-host/README.md`](native-host/README.md).
The extension can ask that companion to open the provider's official OAuth
page in the default browser, check login status, run a bounded prompt, or stop it. No terminal window is shown. It
cannot read or copy provider tokens, and it does not accept arbitrary shell
commands. The provider CLI owns and reuses its authenticated session.

Direct BYOK is intended for personal/local use. Before distributing the
extension to other users, replace direct provider calls with an authenticated
backend relay so long-lived provider credentials never live in a client app.

When a response contains a fenced CSS patch, the user may preview it
temporarily. Preview CSS rejects network-loading and executable syntax and is
removed by reloading the page. No AI change is applied automatically.

### Internal AI architecture

- `ai-chat.js`: chat UI, separate History/Settings screens, drafts, sessions,
  relevant history, context routing, Markdown rendering, and page tools.
- `context-budget.js`: deterministic relevance scoring, cleaning,
  deduplication, model-aware context budgets, and hard-size reduction.
- `background.js`: provider/model discovery and cancellable SSE streaming.
- `native-host/`: optional Windows native-messaging bridge for Codex and Claude
  account sessions.
- `content.js`: bounded page capture, privacy filtering, element inspection,
  and safe CSS preview.

## CSS-only component format

Each component requires complete CSS selector blocks. `scope` is optional and
limits generic selectors to an explicit component root—no sample HTML is used.

```json
{
  "id": "login-title",
  "name": "Login title",
  "scope": ".login",
  "styles": ".title { font-size: 1.5rem; }"
}
```

The example above checks `.login .title`. Without `scope`, `.title` is checked
globally. A selector containing `&` uses it as the scope placeholder.

## Test catalogs

- `ehs-ui-components-custome.json` is the migrated EHS UI 0.4 catalog. It keeps
  its documented selectors in one source-ordered validation cascade.
- `ehs-ui-bs-components.json` is generated from the sibling EHS UI 0.5 / Bootstrap
  5.3.8 source. It keeps the complete authored cascade in one validation
  component so Bootstrap utilities and MD3 overrides retain their source order.

Import either file from **Components → Configuration → Import**. Live style
checks use only component CSS. Class inventories are audited separately against
classes found on the page. Original `@media` blocks remain inside both catalogs;
the checker evaluates them against the active tab's current viewport and media
preferences.

To regenerate the Bootstrap catalog after `ehs-ui-bs` changes:

```powershell
node tools\generate-ehs-import.cjs
```

The generator writes only `ehs-ui-bs-components.json` inside this extension.
To reconsolidate the embedded EHS UI 0.4 stylesheets, run
`node tools\consolidate-ehs-custom.cjs`.

## Validation

```powershell
node tests\check.cjs
```

Validation checks both catalog schemas and counts, explicit scope behavior,
extension release metadata, generator write confinement, and verifies that the
EHS Bootstrap reference remains byte-for-byte unchanged.
