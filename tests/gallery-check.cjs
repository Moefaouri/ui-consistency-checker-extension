'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const extensionRoot = path.resolve(__dirname, '..');
const galleryRoot = path.resolve(extensionRoot, '..', 'ehs-ui-bs');
const chromeCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
];
const browser = chromeCandidates.find(candidate => fs.existsSync(candidate));
assert.ok(browser, 'Chrome or Edge is required for the gallery check.');

const catalog = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'ehs-ui-bs-components.json'), 'utf8'));
const checker = fs.readFileSync(path.join(extensionRoot, 'content.js'), 'utf8').replaceAll('</script', '<\\/script');
let gallery = fs.readFileSync(path.join(galleryRoot, 'index.html'), 'utf8');
const base = pathToFileURL(`${galleryRoot}${path.sep}`).href;
gallery = gallery.replace(/<head>/i, `<head><base href="${base}">`);
gallery = gallery.replace(/<\/body>/i, `<script>
window.__UI_CHECKER_TEST__ = true;
window.chrome = { runtime: { onMessage: { addListener(listener) { window.__checkerListener = listener; } } } };
</script><script>${checker}</script><script>
window.addEventListener('load', () => setTimeout(() => {
  window.__checkerListener(
    { action: 'runCheck', components: ${JSON.stringify(catalog.components)}, classInventory: ${JSON.stringify(catalog.classes)} },
    null,
    result => {
      const output = document.createElement('pre');
      output.id = 'ui-checker-gallery-result';
      output.textContent = JSON.stringify(result);
      document.body.append(output);
    }
  );
}, 500));
</script></body>`);

const harnessPath = path.join(__dirname, '.gallery-check.html');
fs.writeFileSync(harnessPath, gallery);
try {
  const execution = spawnSync(browser, [
    '--headless=new',
    '--disable-gpu',
    '--allow-file-access-from-files',
    '--window-size=1440,1000',
    '--run-all-compositor-stages-before-draw',
    '--virtual-time-budget=4000',
    '--dump-dom',
    pathToFileURL(harnessPath).href
  ], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  assert.equal(execution.status, 0, execution.stderr || 'Headless browser failed.');
  const match = execution.stdout.match(/<pre id="ui-checker-gallery-result">([\s\S]*?)<\/pre>/);
  assert.ok(match, 'Gallery checker did not return results.');
  const decoded = match[1]
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
  const result = JSON.parse(decoded);
  assert.equal(result.failed, 0, `Expected zero failures, received ${result.failed}.`);
} finally {
  fs.rmSync(harnessPath, { force: true });
}
