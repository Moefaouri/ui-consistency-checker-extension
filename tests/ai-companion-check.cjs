const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const budget = require('../context-budget.js');

const root = path.resolve(__dirname, '..');
const markup = fs.readFileSync(path.join(root, 'popup.html'), 'utf8');
const chat = fs.readFileSync(path.join(root, 'ai-chat.js'), 'utf8');
const content = fs.readFileSync(path.join(root, 'content.js'), 'utf8');
const contextBudgetSource = fs.readFileSync(path.join(root, 'context-budget.js'), 'utf8');
const background = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const nativeHost = fs.readFileSync(path.join(root, 'native-host', 'NativeHost.cs'), 'utf8');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function hugeContext() {
  const elements = [];
  for (let index = 0; index < 12000; index++) {
    elements.push({
      selector: `.catalog-row-${index} .product-card`, tag: index % 20 === 0 ? 'button' : 'div',
      text: `${index % 20 === 0 ? 'Buy product checkout button' : 'Repeated catalog item'} ${index} ${'description '.repeat(12)}`,
      box: { x: 0, y: index * 40, width: 900, height: 36 },
      style: { display: 'flex', color: 'rgb(10 20 30)', padding: '12px', 'font-size': '16px' },
      semantics: index % 20 === 0 ? { 'aria-label': `Buy item ${index}` } : {}
    });
  }
  return {
    page: { title: 'Huge shop', url: 'https://example.test/shop', viewport: { width: 1440, height: 900 } },
    summary: { totalElements: 100000 }, privacy: { screenshotSafe: true }, elements,
    designTokens: Object.fromEntries(Array.from({ length: 1000 }, (_, index) => [`--token-${index}`, `${index}px`])),
    authoredCSS: Array.from({ length: 10000 }, (_, index) => `.catalog-row-${index}{padding:${index}px;color:red}`).join('\n')
  };
}

test('large page context is reduced below every configured page budget', () => {
  const raw = hugeContext();
  for (const preference of ['compact', 'balanced', 'detailed']) {
    const result = budget.processPageContext(raw, 'Why is the checkout button misaligned?', { model: 'gpt-6-astra', preference, profile: 'focused' });
    assert.ok(result.context);
    assert.ok(result.stats.reduced);
    assert.ok(result.stats.estimatedTokens <= result.stats.maxTokens, `${preference} exceeded its token budget`);
    assert.ok(JSON.stringify(result.context).length < JSON.stringify(raw).length / 20);
  }
});

test('relevance ranking keeps requested controls and removes duplicate noise', () => {
  const raw = hugeContext();
  const result = budget.processPageContext(raw, 'Inspect the checkout button accessibility', { preference: 'compact', profile: 'accessibility' });
  assert.ok(result.context.elements.some(element => /button/.test(element.tag)));
  const keys = result.context.elements.map(element => `${element.selector}|${element.text || ''}`);
  assert.equal(new Set(keys).size, keys.length);
});

test('selected element survives aggressive reduction', () => {
  const selectedElement = { selector: '#checkout', tag: 'button', text: 'Pay now', html: `<button>${'x'.repeat(20000)}</button>`, style: { display: 'flex' }, semantics: { 'aria-label': 'Pay now' } };
  const result = budget.processPageContext(hugeContext(), 'Why is this button overflowing?', { preference: 'compact', profile: 'focused', selectedElement });
  assert.equal(result.context.selectedElement.selector, '#checkout');
  assert.ok(result.stats.estimatedTokens <= result.stats.maxTokens);
});

test('final context boundary redacts credentials, URL queries, and inline image data', () => {
  const raw = hugeContext();
  raw.page.url = 'https://example.test/account?token=top-secret#profile';
  raw.page.title = 'Account password=hunter2';
  raw.elements.unshift({ selector: '#profile', tag: 'div', text: 'Bearer abcdefghijklmnopqrstuvwxyz password=hunter2 user@example.test data:image/png;base64,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' });
  raw.authoredCSS = '.profile { background: url(data:image/png;base64,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA); }';
  const result = budget.processPageContext(raw, 'Inspect profile', { preference: 'compact', profile: 'focused' });
  const serialized = JSON.stringify(result.context);
  assert.doesNotMatch(serialized, /hunter2|top-secret|user@example\.test|AAAAAAAAAAAAAAAAAAAAAAAA/);
  assert.match(serialized, /redacted/);
  assert.equal(result.context.page.url, 'https://example.test/account');
});

test('representative article, dashboard, form, SPA, and repeated-list captures stay bounded', () => {
  const scenarios = [
    ['article', 'Summarize this article', 'article'],
    ['dashboard', 'Review this dashboard accessibility', 'accessibility'],
    ['checkout-form', 'Find the validation problem in this form', 'form'],
    ['single-page-app', 'Improve this page UX', 'broad'],
    ['repeated-table', 'Why is the action button misaligned?', 'focused']
  ];
  for (const [title, prompt, profile] of scenarios) {
    const raw = hugeContext(); raw.page.title = title;
    const result = budget.processPageContext(raw, prompt, { preference: 'balanced', profile });
    assert.ok(result.context.elements.length > 0, `${title} lost all useful elements`);
    assert.ok(result.stats.estimatedTokens <= result.stats.maxTokens, `${title} exceeded budget`);
  }
});

test('conversation history is bounded and retains the latest follow-up', () => {
  const messages = Array.from({ length: 120 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `message ${index} ${'detail '.repeat(500)}` }));
  const result = budget.selectConversationHistory(messages, 'Earlier summary', 'gpt-6-astra', 'compact');
  assert.ok(result.estimatedTokens <= result.maxTokens + 100);
  assert.match(result.messages.at(-1).content, /message 119/);
  assert.match(result.messages[0].content, /Earlier conversation summary/);
});

test('imported components are relevance-ranked, redacted, and size-bounded', () => {
  const components = Array.from({ length: 180 }, (_, index) => ({
    id: `component-${index}`,
    name: index === 91 ? 'Checkout primary button' : `Catalog card ${index}`,
    scope: index === 91 ? '.checkout' : `.catalog-${index}`,
    componentType: index === 91 ? 'button' : 'card',
    styles: index === 91
      ? `.checkout .btn-primary { color: #fff; background: #00538e; padding: 12px; } .secret { content: "password=hunter2"; }`
      : `.catalog-${index} { display:grid; padding:${index}px; } `.repeat(80)
  }));
  const result = budget.processComponentLibrary(components, { name: 'EHS UI', componentCount: components.length }, 'Improve the checkout primary button', { preference: 'compact' });
  assert.equal(result.matchedComponents[0].name, 'Checkout primary button');
  assert.ok(JSON.stringify(result).length < 9000);
  assert.doesNotMatch(JSON.stringify(result), /hunter2/);
});

test('global settings and history are separate screens outside the chat shell', () => {
  const tab = markup.slice(markup.indexOf('<!-- AI browser companion -->'), markup.indexOf('<!-- Add Component Modal -->'));
  const shellEnd = tab.indexOf('</div>\n\n    <section class="ai-global-screen');
  assert.ok(shellEnd > 0, 'chat shell must close before global screens');
  assert.match(tab, /class="ai-global-screen ai-settings-screen"/);
  assert.match(tab, /class="ai-global-screen ai-history-screen"/);
  const shell = tab.slice(0, shellEnd);
  assert.doesNotMatch(shell, /AI connection|Context &amp; privacy|aiChatApiKey|aiChatModel/);
  assert.match(chat, /function showScreen\(screen\)/);
  assert.match(chat, /showScreen\('chat'\)/);
});

test('AI settings enforce imported components as the design standard', () => {
  assert.match(markup, /id="aiUseComponentLibrary"/);
  assert.match(markup, /Enforce imported components as the UI standard/);
  assert.match(chat, /processComponentLibrary/);
  assert.doesNotMatch(chat, /COMPONENT_REFERENCE_TERMS/);
  assert.match(background, /<component_reference/);
  assert.match(background, /authoritative UI standard/);
});

test('missing credentials preserve the draft and expose a settings action', () => {
  assert.match(markup, /Connect an AI provider in Settings to send messages/);
  assert.match(markup, /id="aiNoticeSettingsBtn"/);
  assert.match(chat, /\(!accountMode && apiKey\.length < 16\).*\|\| !model/);
  assert.match(chat, /el\.configNotice\.hidden = false/);
  const guard = chat.indexOf('if ((!accountMode && apiKey.length < 16)');
  const consume = chat.indexOf("el.chatInput.value = ''", guard);
  assert.ok(guard > 0 && consume > guard, 'credential guard must run before consuming the draft');
});

test('OpenAI and Claude account mode uses a bounded native bridge', () => {
  assert.ok(manifest.permissions.includes('nativeMessaging'));
  assert.match(markup, /id="aiAuthMode"/);
  assert.match(markup, /id="aiAccountLoginBtn"/);
  assert.match(markup, /Sign in with browser/);
  assert.match(chat, /action: 'aiNativeLogin'/);
  assert.match(chat, /action: 'aiNativeStatus'/);
  assert.match(background, /connectNative\(AI_NATIVE_HOST\)/);
  assert.match(background, /authMode === 'account'/);
  assert.match(nativeHost, /action == "login"/);
  assert.match(nativeHost, /action == "status"/);
  assert.match(nativeHost, /action == "chat"/);
  assert.match(nativeHost, /action == "stop"/);
  assert.match(nativeHost, /codex login/);
  assert.match(nativeHost, /claude auth login/);
  assert.match(nativeHost, /CreateNoWindow = true/);
  assert.doesNotMatch(nativeHost, /"\/k /);
  assert.match(nativeHost, /MaxPromptChars = 240000/);
  assert.match(nativeHost, /--model " \+ model/);
  assert.doesNotMatch(nativeHost, /Value\(message, "command"\)/);
});

test('privacy and recovery safeguards remain present', () => {
  const capture = content.slice(content.indexOf('function captureAIPageContext'), content.indexOf('function applyAICssPreview'));
  assert.doesNotMatch(capture, /\.value\b/);
  assert.match(content, /screenshotSafe: isAIScreenshotSafe\(\)/);
  assert.match(chat, /Retry with reduced context/);
  assert.match(chat, /Send without page context/);
  assert.match(chat, /Select a specific element/);
  assert.doesNotMatch(background, /selected page context is too large/i);
  assert.match(background, /truncation: 'auto'/);
});

test('CSS preview has a one-click undo that restores the previous page style', () => {
  assert.match(chat, /`Undo \$\{part\.toUpperCase\(\)\}`/);
  assert.match(chat, /action: 'clearAICssPreview'/);
  assert.match(chat, /previous page style is restored/);
  assert.match(content, /function clearAICssPreview\(\)/);
  assert.match(content, /forceAIPreviewPriority/);
  assert.match(content, /applyAIPreviewInlineOverrides/);
  assert.match(content, /element\.style\.setProperty\(property, rule\.style\.getPropertyValue\(property\), 'important'\)/);
  assert.match(content, /mutation\.priority/);
});

test('AI frontend answers safely apply HTML and CSS while JavaScript remains copy-only', () => {
  assert.match(background, /semantic HTML for structure, CSS for appearance and responsive behavior, and vanilla JavaScript for interaction/);
  assert.match(background, /machine-readable fenced preview block/);
  assert.match(chat, /function extractFrontendBundle\(text\)/);
  assert.match(chat, /availableParts = \['html', 'css'\]/);
  assert.match(chat, /`Apply \$\{part\.toUpperCase\(\)\}`/);
  assert.match(chat, /Copy JS/);
  assert.doesNotMatch(chat, /Run JS|Apply JS/);
  assert.match(chat, /Apply all/);
  assert.match(chat, /Undo all/);
  assert.match(chat, /action: 'previewAIFrontend'/);
  assert.match(chat, /action: 'clearAIFrontendPreview'/);
  assert.match(content, /function applyAILiveHTML/);
  assert.match(content, /AI-generated JavaScript is copy-only and was not executed/);
  assert.doesNotMatch(content, /function applyAILiveScript|function buildAILiveScript|AI_FRONTEND_SCRIPT_ID/);
  assert.match(content, /function sanitizeAIHTML/);
  assert.match(content, /function normalizeAIPreviewSelector/);
  assert.match(content, /aiSelectedElement\?\.isConnected/);
  assert.match(content, /function collectAISelectedCSS/);
  assert.match(contextBudgetSource, /authoredCSS: element\.authoredCSS/);
  assert.match(contextBudgetSource, /descendantStyles:/);
  assert.match(content, /function captureAIThemeProfile/);
  assert.match(contextBudgetSource, /theme: cleanTheme\(raw\.theme\)/);
  assert.match(chat, /selectedReferenceTerms/);
  assert.doesNotMatch(content, /createElement\('iframe'\)/);
  assert.doesNotMatch(content.slice(content.indexOf('function describeAIElement'), content.indexOf('function sanitizeAIIdentifier')), /!name\.startsWith\('ui-check-'\)/);
});

test('Check tab emulates content viewports and highlights responsive risks without resizing the window', () => {
  assert.match(markup, /id="responsivePlaygroundTitle"/);
  assert.match(markup, /data-responsive-width="390"/);
  assert.match(markup, /data-responsive-width="820"/);
  assert.match(markup, /data-responsive-width="1440"/);
  assert.match(markup, /id="responsiveCustomApply"/);
  assert.match(markup, /id="responsiveIssues"/);
  assert.match(chat + content, /getViewportSize/);
  const popup = fs.readFileSync(path.join(root, 'popup.js'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.ok(manifest.permissions.includes('debugger'));
  assert.match(popup, /function applyResponsiveViewport\(button, custom = false\)/);
  assert.match(popup, /action: 'responsiveEmulate'/);
  assert.doesNotMatch(popup, /permissions\.request\([\s\S]*debugger/);
  assert.match(popup, /await runCheckV14\(\)/);
  assert.match(background, /Emulation\.setDeviceMetricsOverride/);
  assert.match(background, /Emulation\.clearDeviceMetricsOverride/);
  assert.match(content, /function auditResponsiveLayout\(\)/);
  assert.match(content, /viewport-overflow/);
  assert.match(content, /small-target/);
  assert.match(content, /function focusResponsiveIssue/);
  assert.match(content, /mediaSignature = `\$\{window\.innerWidth\}x\$\{window\.innerHeight\}/);
});

const failures = [];
for (const entry of tests) {
  try { entry.fn(); }
  catch (error) { failures.push(`${entry.name}: ${error.message}`); }
}
if (failures.length) throw new Error(failures.join('\n'));
