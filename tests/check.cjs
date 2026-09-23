'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const extensionRoot = path.resolve(__dirname, '..');
const referenceRoot = path.resolve(extensionRoot, '..', 'ehs-ui-bs');
const catalogPath = path.join(extensionRoot, 'ehs-ui-components-custome.json');
const bootstrapCatalogPath = path.join(extensionRoot, 'ehs-ui-bs-components.json');
const manifestPath = path.join(extensionRoot, 'manifest.json');
const generatorPath = path.join(extensionRoot, 'tools', 'generate-ehs-import.cjs');
const contentPath = path.join(extensionRoot, 'content.js');
const popupPath = path.join(extensionRoot, 'popup.js');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function directoryFingerprint(root) {
  assert.ok(fs.statSync(root).isDirectory(), `Missing reference directory: ${root}`);
  const entries = [];

  function walk(directory) {
    const children = fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const child of children) {
      const absolutePath = path.join(directory, child.name);
      if (child.isDirectory()) {
        walk(absolutePath);
      } else if (child.isFile()) {
        const relativePath = path.relative(root, absolutePath).replaceAll('\\', '/');
        const digest = crypto.createHash('sha256')
          .update(fs.readFileSync(absolutePath))
          .digest('hex');
        entries.push(`${relativePath}:${digest}`);
      } else if (child.isSymbolicLink()) {
        const relativePath = path.relative(root, absolutePath).replaceAll('\\', '/');
        entries.push(`${relativePath}:symlink:${fs.readlinkSync(absolutePath)}`);
      }
    }
  }

  walk(root);
  return entries;
}

const failures = [];
function check(name, test) {
  try {
    test();
  } catch (error) {
    failures.push({ name, error });
  }
}

const referenceBefore = directoryFingerprint(referenceRoot);
let catalog;
let bootstrapCatalog;
let manifest;

check('catalog and manifest are valid JSON', () => {
  catalog = readJson(catalogPath);
  bootstrapCatalog = readJson(bootstrapCatalogPath);
  manifest = readJson(manifestPath);
});

check('catalog declares the expected EHS UI library', () => {
  assert.ok(catalog && typeof catalog === 'object');
  assert.equal(catalog.kind, 'ui-checker-library');
  assert.equal(catalog.formatVersion, 3);
  assert.equal(catalog.version, '1.5.1');
  assert.deepEqual(catalog.library, {
    id: 'ehs-ui',
    name: 'EHS UI',
    version: '0.4.0',
    componentCount: 1,
    classCount: 3514,
    tokenCount: 343,
    referenceOnly: true
  });
});

check('EHS UI catalog preserves one complete CSS-only cascade', () => {
  assert.ok(Array.isArray(catalog.components));
  assert.equal(catalog.components.length, 1);

  const ids = new Set();
  for (const [index, component] of catalog.components.entries()) {
    const label = `components[${index}]`;
    assert.match(component.id, /^ehs-[a-z0-9][a-z0-9-]*$/, `${label}.id`);
    assert.ok(!ids.has(component.id), `Duplicate component id: ${component.id}`);
    ids.add(component.id);

    assert.ok(typeof component.name === 'string' && component.name.trim(), `${label}.name`);
    assert.equal(component.type, 'component', `${label}.type`);
    assert.ok(typeof component.componentType === 'string' && component.componentType.trim(), `${label}.componentType`);
    assert.equal(component.source, 'ehs-ui@0.4.0', `${label}.source`);
    assert.ok(typeof component.styles === 'string' && component.styles.includes('{'), `${label}.styles`);
    assert.ok(Array.isArray(component.classes) && component.classes.length > 0, `${label}.classes`);
    assert.ok(!('html' in component), `${label}.html must not be present`);
    assert.ok(!('htmlTag' in component), `${label}.htmlTag must not be present`);
    assert.ok(!('scopeCss' in component), `${label}.scopeCss must not be present`);
  }
});

check('Bootstrap EHS catalog preserves one complete CSS-only cascade', () => {
  assert.equal(bootstrapCatalog.kind, 'ui-checker-library');
  assert.equal(bootstrapCatalog.formatVersion, 3);
  assert.equal(bootstrapCatalog.version, '1.5.1');
  assert.deepEqual(bootstrapCatalog.library, {
    id: 'ehs-ui-bs',
    name: 'EHS UI Bootstrap',
    version: '0.5.0',
    componentCount: 1,
    classCount: 2216,
    tokenCount: 293,
    referenceOnly: true
  });
  assert.equal(bootstrapCatalog.components.length, 1);
  const classNames = new Set(bootstrapCatalog.classes);
  for (const [index, component] of bootstrapCatalog.components.entries()) {
    const label = `bootstrap components[${index}]`;
    assert.ok(!('scope' in component), `${label}.scope must not alter the library's authored selectors`);
    assert.ok(typeof component.styles === 'string' && component.styles.includes('{'), `${label}.styles`);
    assert.ok(!('html' in component), `${label}.html must not be present`);
    assert.ok(!('htmlTag' in component), `${label}.htmlTag must not be present`);
    assert.ok(!('scopeCss' in component), `${label}.scopeCss must not be present`);
    for (const className of component.classes) {
      assert.ok(classNames.has(className), `${label} references unknown class ${className}`);
    }
  }
  assert.deepEqual(bootstrapCatalog.stylesheets.map(sheet => sheet.source), [
    'bootstrap.css', 'ehs.css', 'ehs-arabic.css', 'ehs-widgets.css'
  ]);
  assert.match(bootstrapCatalog.components[0].styles,
    /nav\.md3-navigation-drawer\s*\{[^}]*flex-wrap:\s*nowrap;/s,
    'Desktop drawer override must not be dropped from the validation cascade');
});

check('both catalogs preserve responsive media queries', () => {
  const cases = [
    ['EHS UI', catalog.components.map(component => component.styles).join('\n')],
    ['EHS UI Bootstrap', bootstrapCatalog.components.map(component => component.styles).join('\n')]
  ];
  for (const [name, styles] of cases) {
    assert.match(styles, /@media\s*\(min-width:\s*576px\)/, `${name} small breakpoint`);
    assert.match(styles, /@media\s*\(min-width:\s*768px\)/, `${name} medium breakpoint`);
    assert.match(styles, /@media\s*\(min-width:\s*992px\)/, `${name} large breakpoint`);
    assert.match(styles, /@media\s*\(min-width:\s*1200px\)/, `${name} extra-large breakpoint`);
    assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)/, `${name} motion preference`);
  }
});

check('catalog has 3,514 unique EHS classes and shared stylesheet/runtime data', () => {
  assert.ok(Array.isArray(catalog.classes));
  assert.equal(catalog.classes.length, 3514);

  const names = new Set();
  for (const [index, className] of catalog.classes.entries()) {
    const label = `classes[${index}]`;
    assert.match(className, /^ehs-[a-zA-Z0-9_-]+$/, label);
    assert.ok(!names.has(className), `Duplicate class: ${className}`);
    names.add(className);
  }

  for (const component of catalog.components) {
    for (const className of component.classes) {
      assert.ok(names.has(className), `${component.id} references unknown class ${className}`);
    }
  }

  assert.deepEqual(catalog.stylesheets.map(sheet => sheet.source), [
    'ehs.css', 'ehs-arabic.css', 'ehs-widgets.css'
  ]);
  assert.match(catalog.components[0].styles, /\.ehs-picker-trigger\s*\{/,
    'Runtime-created component rules must be available to the checker');
  assert.match(catalog.components[0].styles, /html\[lang\^="ar"\]\s+\.ehs-ui/,
    'Root language context rules must be available to the checker');
  const stylesheetClasses = new Set();
  for (const sheet of catalog.stylesheets) {
    assert.ok(typeof sheet.css === 'string' && sheet.css.includes('{'), `${sheet.source} CSS`);
    for (const match of sheet.css.matchAll(/\.((?:ehs-)[a-zA-Z0-9_-]+)/g)) stylesheetClasses.add(match[1]);
  }
  assert.equal(stylesheetClasses.size, 3513);
  for (const className of stylesheetClasses) assert.ok(names.has(className));
  assert.ok(names.has('ehs-picker-drafts'), 'Runtime-created picker class must be audited as EHS UI');
  assert.ok(fs.statSync(catalogPath).size < 1024 * 1024, 'Catalog should stay below 1 MB');
});

check('catalog has 343 valid design tokens', () => {
  assert.ok(catalog.tokens && typeof catalog.tokens === 'object' && !Array.isArray(catalog.tokens));
  const tokens = Object.entries(catalog.tokens);
  assert.equal(tokens.length, 343);

  for (const [name, value] of tokens) {
    assert.match(name, /^--[a-zA-Z0-9_-]+$/, `Invalid token name: ${name}`);
    assert.ok(typeof value === 'string' && value.trim(), `Invalid value for token ${name}`);
  }
});

check('library count metadata matches the generated payload', () => {
  assert.equal(catalog.library.componentCount, catalog.components.length);
  assert.equal(catalog.library.classCount, catalog.classes.length);
  assert.equal(catalog.library.tokenCount, Object.keys(catalog.tokens).length);
});

check('Chrome extension manifest is at release 1.5.1', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, '1.5.1');
});

check('extension uses the native Chrome side panel', () => {
  const background = fs.readFileSync(path.join(extensionRoot, 'background.js'), 'utf8');
  const popup = fs.readFileSync(popupPath, 'utf8');
  const markup = fs.readFileSync(path.join(extensionRoot, 'popup.html'), 'utf8');
  assert.ok(manifest.permissions.includes('sidePanel'));
  assert.equal(manifest.minimum_chrome_version, '116');
  assert.deepEqual(manifest.side_panel, { default_path: 'popup.html' });
  assert.ok(!('default_popup' in manifest.action), 'Toolbar action must open the side panel, not a popup');
  assert.match(background, /setPanelBehavior\(\{ openPanelOnActionClick: true \}\)/);
  assert.match(background, /sidePanel\.open\(\{ windowId: tab\.windowId \}\)/);
  assert.match(popup, /chrome\.sidePanel\.getLayout/);
  assert.match(markup, /body\[data-panel-side="left"\]/);
  assert.match(markup, /backdrop-filter:\s*blur\(/);
});

check('AI browser companion provides persistent chat, selective context, and protected provider access', () => {
  const background = fs.readFileSync(path.join(extensionRoot, 'background.js'), 'utf8');
  const content = fs.readFileSync(contentPath, 'utf8');
  const popup = fs.readFileSync(popupPath, 'utf8');
  const markup = fs.readFileSync(path.join(extensionRoot, 'popup.html'), 'utf8');
  const chat = fs.readFileSync(path.join(extensionRoot, 'ai-chat.js'), 'utf8');

  assert.match(markup, /data-tab="ai"/);
  assert.match(markup, /id="aiTab"/);
  assert.match(markup, /id="aiChatApiKey"\s+type="password"/);
  assert.match(markup, /data-chat-provider="google"/);
  assert.match(markup, /id="aiChatModel"/);
  assert.match(markup, /id="aiHistoryList"/);
  assert.match(markup, /id="aiContextMode"/);
  assert.match(markup, /id="aiInspectElementBtn"/);
  assert.match(markup, /id="aiStopBtn"/);
  assert.match(markup, /id="aiSaveConnectionBtn"/);
  assert.match(markup, /class="ai-accordion-header"/);
  assert.doesNotMatch(markup, /Give an AI the page structure and real CSS context/);
  assert.match(markup, /id="aiChatIncludeText"/);
  assert.match(chat, /chrome\.storage\.session\.set\(\{ aiApiKeys: state\.apiKeys \}\)/);
  assert.doesNotMatch(chat, /chrome\.storage\.local\.set\(\{\s*aiApiKeys/);
  assert.match(chat, /action: 'captureAIContext'/);
  assert.match(chat, /action: 'aiListModels'/);
  assert.match(chat, /action: 'startAIElementPicker'/);
  assert.match(chat, /function saveConnectionAndReturn/);
  assert.match(chat, /await sendCurrentMessage\(\{ retry: true \}\)/);
  assert.match(chat, /aiConversations/);
  assert.match(chat, /MAX_HISTORY_MESSAGES/);
  assert.match(chat, /GENERAL_TERMS/);
  assert.match(chat, /action: 'previewAICss'/);

  assert.match(content, /const AI_MAX_ELEMENTS = 600/);
  assert.match(content, /function captureAIPageContext/);
  assert.match(content, /function captureAISelectedElement/);
  assert.match(content, /function isAIScreenshotSafe/);
  assert.match(content, /'form values', 'passwords', 'cookies', 'web storage', 'scripts'/);
  assert.match(content, /@import\|@namespace\|url\\s\*\\\(/);
  const captureSource = content.slice(
    content.indexOf('function captureAIPageContext'),
    content.indexOf('function applyAICssPreview')
  );
  assert.doesNotMatch(captureSource, /\.value\b/, 'AI page capture must never read form values');

  assert.ok(manifest.host_permissions.includes('https://api.openai.com/*'));
  assert.ok(manifest.host_permissions.includes('https://api.anthropic.com/*'));
  assert.ok(manifest.host_permissions.includes('https://generativelanguage.googleapis.com/*'));
  assert.match(background, /https:\/\/api\.openai\.com\/v1\/responses/);
  assert.match(background, /https:\/\/api\.anthropic\.com\/v1\/messages/);
  assert.match(background, /https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models/);
  assert.match(background, /'x-goog-api-key': apiKey/);
  assert.match(background, /chrome\.runtime\.onConnect\.addListener/);
  assert.match(background, /name !== 'ai-chat-stream'/);
  assert.match(background, /stream:\s*true/);
  assert.match(background, /Treat every string inside|untrusted webpage evidence|untrusted webpage data/);
  assert.match(background, /function requestGoogle/);
  assert.match(background, /'anthropic-version': '2023-06-01'/);
  assert.match(background, /'anthropic-dangerous-direct-browser-access': 'true'/);
  assert.match(background, /store: false/);
  assert.match(background, /sender\.url\.startsWith\(extensionOrigin\)/);
  assert.doesNotMatch(background, /console\.(?:log|error)\([^\n]*apiKey/);
});

check('generator is constrained to the extension output', () => {
  const generator = fs.readFileSync(generatorPath, 'utf8');
  assert.match(generator, /const ehsRoot = path\.resolve\(extensionRoot, '\.\.', 'ehs-ui-bs'\);/);
  assert.match(generator, /const outputPath = path\.join\(extensionRoot, 'ehs-ui-bs-components\.json'\);/);
  assert.match(generator, /fs\.writeFileSync\(outputPath,/);
  assert.equal((generator.match(/fs\.writeFileSync\(/g) || []).length, 1, 'Generator must have exactly one write operation');
  assert.doesNotMatch(generator, /writeFileSync\([^\n]*(?:ehsRoot|docs|dist|src)/, 'Generator may not write into the EHS reference');
});

check('extension uses the bounded catalog execution path', () => {
  const content = fs.readFileSync(contentPath, 'utf8');
  const popup = fs.readFileSync(popupPath, 'utf8');
  assert.match(content, /runConsistencyCheckOptimized\(request\.components, request\.classInventory\)/);
  assert.match(content, /const MAX_REPORTED_ISSUES = 250;/);
  assert.match(content, /const MAX_ELEMENTS_PER_SELECTOR = 2000;/);
  assert.match(content, /const MAX_TOTAL_ELEMENT_CHECKS = 10000;/);
  assert.match(content, /const MAX_CASCADE_ELEMENTS = 250;/);
  assert.match(content, /const MAX_CLASS_AUDIT_ELEMENTS = 50000;/);
  assert.match(content, /document\.querySelectorAll\('\[class\]'\)/);
  assert.match(content, /style\.setProperty\(failure\.property, value, 'important'\)/);
  assert.match(content, /\$\{failure\.property\}: \$\{value\} !important;/);
  assert.match(popup, /file\.size > 8 \* 1024 \* 1024/);
  assert.match(popup, /length > 4 \* 1024 \* 1024/);
  assert.match(popup, /importedClassInventory: classInventory/);
  assert.match(popup, /sendTabMessage\(tab\.id,[\s\S]*30000\)/);
});

check('element-level cascade chooses the most specific winning declaration', () => {
  const content = fs.readFileSync(contentPath, 'utf8');
  const source = content.match(/function setElementExpectation\(expectations, candidate\) \{[\s\S]*?\n  \}/);
  assert.ok(source, 'Missing element cascade helper');
  const setElementExpectation = vm.runInNewContext(`(${source[0]})`);
  const expectations = new Map();
  setElementExpectation(expectations, {
    property: 'gap', value: '.5rem', important: false, specificity: 10, sourceOrder: 1
  });
  setElementExpectation(expectations, {
    property: 'gap', value: '2rem', important: false, specificity: 20, sourceOrder: 2
  });
  setElementExpectation(expectations, {
    property: 'gap', value: '1rem', important: false, specificity: 10, sourceOrder: 3
  });
  assert.equal(expectations.get('gap').value, '2rem', 'a later base rule must not beat a modifier');
  setElementExpectation(expectations, {
    property: 'gap', value: '3rem !important', important: true, specificity: 10, sourceOrder: 4
  });
  assert.equal(expectations.get('gap').value, '3rem !important', '!important must win');
});

check('unit and color normalization cover EHS computed-value formats', () => {
  const content = fs.readFileSync(contentPath, 'utf8');
  const lengthSource = content.match(/function resolveLength\(value, el, property = ''\) \{[\s\S]*?\n  \}\n\n  function compareNumericValue/);
  assert.ok(lengthSource, 'Missing unit normalizer');
  const resolveLength = vm.runInNewContext(`(() => {
    let rootFontSizeCache = null;
    const window = { innerWidth: 1200, innerHeight: 800 };
    const document = { documentElement: {} };
    const getComputedStyle = () => ({ fontSize: '16px' });
    const getCachedComputedStyle = element => ({ fontSize: element.fontSize || '16px' });
    ${lengthSource[0].replace(/\n\n  function compareNumericValue$/, '')}
    return resolveLength;
  })()`);
  assert.equal(resolveLength('.5rem', null), 8);
  assert.equal(resolveLength('1in', null), 96);
  assert.equal(resolveLength('2.54cm', null), 96);
  assert.equal(resolveLength('1.5', { fontSize: '16px' }, 'line-height'), 24);

  const colorSource = content.match(/function normalizeColorToHex\(color\) \{[\s\S]*?\n  \}\n\n  function bytesToHex[\s\S]*?\n  \}/);
  assert.ok(colorSource, 'Missing color-to-hex normalizer');
  const normalizeColorToHex = vm.runInNewContext(`(() => {
    const colorHexCache = new Map();
    const colorToHex = value => value === 'red' ? '#ff0000' : value;
    ${colorSource[0]}
    return normalizeColorToHex;
  })()`);
  assert.equal(normalizeColorToHex('rgb(255 0 0 / 50%)'), '#ff000080');
  assert.equal(normalizeColorToHex('color(srgb 1 0 0)'), '#ff0000');
  assert.equal(normalizeColorToHex('red'), '#ff0000');
});

check('source syntax, animation, transition, and counter values compare semantically', () => {
  const content = fs.readFileSync(contentPath, 'utf8');
  const shadowSource = content.match(/function splitShadowLayers\(value\) \{[\s\S]*?\n  \}/);
  const comparisonSource = content.match(/function splitCssTokens\(value\) \{[\s\S]*?\n  function compareCounterList\(expected, actual, defaultValue\) \{[\s\S]*?\n  \}/);
  const normalizeSource = content.match(/function normalizeCSSValue\(value\) \{[\s\S]*?\n  \}/);
  assert.ok(shadowSource, 'Missing top-level CSS-list splitter');
  assert.ok(comparisonSource, 'Missing shorthand semantic comparators');
  assert.ok(normalizeSource, 'Missing generic CSS normalizer');

  const comparators = vm.runInNewContext(`(() => {
    ${shadowSource[0]}
    ${normalizeSource[0]}
    ${comparisonSource[0]}
    return { normalizeCSSValue, compareTransition, compareAnimation, compareCounterList };
  })()`);

  assert.equal(comparators.normalizeCSSValue('100.00000000%'), '100%');
  assert.ok(comparators.compareAnimation(
    'ehs-morph 1.8s ease-in-out infinite',
    '1.8s ease-in-out infinite ehs-morph'
  ));
  assert.ok(comparators.compareAnimation(
    'ehs-spin .8s linear infinite',
    '0.8s linear infinite ehs-spin'
  ));
  assert.ok(comparators.compareAnimation(
    'ehs-morph 1.8s ease-in-out infinite',
    '1.8s ease-in-out 0s infinite normal none running ehs-morph'
  ));
  assert.ok(comparators.compareTransition('width 200ms', '.2s width'));
  assert.ok(comparators.compareTransition('opacity 150ms', 'opacity .15s ease 0s'));
  assert.ok(!comparators.compareTransition(
    'background-color 150ms, width 200ms',
    'background-color 0.18s, color 0.18s, border-color 0.18s, box-shadow 0.18s, transform 0.18s'
  ));
  assert.ok(comparators.compareCounterList('ehs-step', 'ehs-step 0', 0));
  assert.ok(comparators.compareCounterList('chapter', 'chapter 1', 1));
});

check('layout source syntax is preferred over resolved pixel values', () => {
  const content = fs.readFileSync(contentPath, 'utf8');
  assert.match(content, /getSyntaxPreservingActualValue\(rule\.property, element, expectedValue\)/);
  assert.match(content, /typeof el\.computedStyleMap === 'function'/);
  assert.match(content, /return getCascadeValue\(property, el, true\);/);
  assert.match(content, /'grid-template-columns'/);
});

check('hidden elements and logical properties use the deferred normalized path', () => {
  const content = fs.readFileSync(contentPath, 'utf8');
  const popup = fs.readFileSync(popupPath, 'utf8');
  assert.match(content, /if \(isDisplayNone\(element\)\)/);
  assert.match(content, /hiddenSkippedCount: hiddenSkippedElements\.size/);
  assert.match(content, /'margin-block-start'/);
  assert.match(content, /'padding-block'/);
  assert.match(content, /resolveComparableValue\(expectedValue, computedStyles\)/);
  assert.match(popup, /display:none elements deferred until visible/);
});

check('compiled CSS keeps one cascade winner per property', () => {
  const content = fs.readFileSync(contentPath, 'utf8');
  const source = content.match(/function setWinningDeclaration\(ruleMap, rule\) \{[\s\S]*?\n  \}/);
  assert.ok(source, 'Missing cascade winner helper');
  const setWinningDeclaration = vm.runInNewContext(`(${source[0]})`);
  const rules = new Map();
  setWinningDeclaration(rules, { property: 'min-height', value: '40px' });
  setWinningDeclaration(rules, { property: 'min-height', value: '48px' });
  assert.equal(rules.size, 1);
  assert.equal(rules.get('min-height').value, '48px', 'later normal declaration must win');
  setWinningDeclaration(rules, { property: 'min-height', value: '44px !important' });
  setWinningDeclaration(rules, { property: 'min-height', value: '52px' });
  assert.equal(rules.get('min-height').value, '44px !important', 'normal declaration must not replace !important');
  setWinningDeclaration(rules, { property: 'min-height', value: '56px !important' });
  assert.equal(rules.get('min-height').value, '56px !important', 'later !important declaration must win');

  const orderedRules = new Map();
  setWinningDeclaration(orderedRules, { property: 'margin', value: '10px' });
  setWinningDeclaration(orderedRules, { property: 'margin-left', value: '20px' });
  setWinningDeclaration(orderedRules, { property: 'margin', value: '5px' });
  assert.deepEqual(Array.from(orderedRules.keys()), ['margin-left', 'margin'], 'replacement must retain CSS source order');

  const md3 = catalog.components[0];
  const realValues = Array.from(md3.styles.matchAll(/\.ehs-btn\s*\{([\s\S]*?)\}/g))
    .map(match => match[1].match(/min-height:\s*([^;]+);/))
    .filter(Boolean)
    .map(match => match[1]);
  assert.deepEqual(realValues.slice(0, 2), ['var(--ehs-control-height)', 'var(--ehs-button-height)']);
  const realRules = new Map();
  for (const value of realValues) setWinningDeclaration(realRules, { property: 'min-height', value });
  assert.equal(realRules.get('min-height').value, 'var(--ehs-button-height)');

  const addSource = content.match(/function addCompiledTask\(taskMap, task\) \{[\s\S]*?\n  \}\n\n  function setWinningDeclaration/);
  assert.ok(addSource, 'Missing compiled-task merge helper');
  const addCompiledTask = vm.runInNewContext(`(() => {
    const MAX_SELECTOR_TASKS = 2000;
    ${source[0]}
    ${addSource[0].replace(/\n\n  function setWinningDeclaration$/, '')}
    return addCompiledTask;
  })()`);
  const tasks = new Map();
  addCompiledTask(tasks, {
    searchSelector: '.ehs-chip', selector: '.ehs-chip',
    rules: [
      { property: 'background', value: 'var(--ehs-primary-soft)' },
      { property: 'background', value: 'transparent' },
      { property: 'border', value: '1px solid gray' },
      { property: 'font-size', value: '.875rem' }
    ]
  });
  addCompiledTask(tasks, {
    searchSelector: '.ehs-chip', selector: '.ehs-chip',
    rules: [
      { property: 'background', value: 'var(--ehs-primary-soft)' },
      { property: 'color', value: 'var(--ehs-primary)' }
    ]
  });
  assert.equal(tasks.get('.ehs-chip\n.ehs-chip').ruleMap.get('background').value, 'transparent');
  assert.equal(tasks.get('.ehs-chip\n.ehs-chip').ruleMap.get('color').value, 'var(--ehs-primary)');
});

check('selector-list splitting preserves functional pseudo arguments', () => {
  const content = fs.readFileSync(contentPath, 'utf8');
  const source = content.match(/function splitSelectorList\(selector\) \{[\s\S]*?\n  \}/);
  assert.ok(source, 'Missing selector-list splitter');
  const splitSelectorList = vm.runInNewContext(`(${source[0]})`);
  assert.deepEqual(
    Array.from(splitSelectorList('.base, :is(.one, .two), [data-value="a,b"]')),
    ['.base', ':is(.one, .two)', '[data-value="a,b"]']
  );
  assert.match(content, /baseSelectorParts\.join\(', '\)/, 'Base branches should survive mixed base/state rules');
});

check('explicit scopes compose generic selectors without duplicating scoped selectors', () => {
  const content = fs.readFileSync(contentPath, 'utf8');
  const splitSource = content.match(/function splitSelectorList\(selector\) \{[\s\S]*?\n  \}/);
  const scopeSource = content.match(/function scopeSelector\(selector, scope\) \{[\s\S]*?\n  \}/);
  assert.ok(splitSource && scopeSource, 'Missing explicit scope helpers');
  const scopeSelector = vm.runInNewContext(`(() => {
    ${splitSource[0]}
    ${scopeSource[0]}
    return scopeSelector;
  })()`);
  assert.equal(scopeSelector('.title', '.login'), '.login .title');
  assert.equal(scopeSelector('& > .title', '.login'), '.login > .title');
  assert.equal(scopeSelector('.md3 .btn', '.md3'), '.md3 .btn');
  assert.equal(scopeSelector('html[lang="ar"] .md3 .btn', '.md3'), 'html[lang="ar"] .md3 .btn');
});

check('popup exposes CSS and optional scope, not markup-derived fields', () => {
  const popup = fs.readFileSync(popupPath, 'utf8');
  const markup = fs.readFileSync(path.join(extensionRoot, 'popup.html'), 'utf8');
  assert.match(markup, /id="componentScope"/);
  assert.match(markup, /id="componentStyles"/);
  assert.doesNotMatch(markup, /id="componentHTMLTag"/);
  assert.doesNotMatch(popup, /componentHTMLTag/);
  assert.match(popup, /complete CSS selector blocks/);
  assert.doesNotMatch(markup, /id="librarySummary"/);
  assert.doesNotMatch(popup, /displayLibrarySummary/);
});

check('general importer accepts both bundled catalogs', () => {
  const popup = fs.readFileSync(popupPath, 'utf8');
  const normalizeStart = popup.indexOf('function normalizeImportedComponents');
  const normalizeEnd = popup.indexOf('function extractClassInventory', normalizeStart);
  const stringSource = popup.match(/function stringField\(value, maximumLength, label, allowEmpty = false\) \{[\s\S]*?\n\}/);
  assert.ok(normalizeStart >= 0 && normalizeEnd > normalizeStart && stringSource, 'Missing import normalizer');
  const normalizeSource = popup.slice(normalizeStart, normalizeEnd);
  const normalizeImportedComponents = vm.runInNewContext(`(() => {
    const document = { createDocumentFragment: () => ({ querySelector() {} }) };
    const detectComponentType = () => 'custom';
    ${stringSource[0]}
    ${normalizeSource}
    return normalizeImportedComponents;
  })()`);

  for (const [filename, importedCatalog] of [
    ['ehs-ui-components-custome.json', catalog],
    ['ehs-ui-bs-components.json', bootstrapCatalog]
  ]) {
    let normalized;
    assert.doesNotThrow(() => { normalized = normalizeImportedComponents(importedCatalog.components); }, filename);
    assert.equal(normalized.length, importedCatalog.components.length, filename);
  }
});

check('validation leaves the EHS reference byte-for-byte unchanged', () => {
  assert.deepEqual(directoryFingerprint(referenceRoot), referenceBefore);
});

if (failures.length) {
  throw new Error(failures.map(({ name, error }) => `${name}: ${error.message}`).join('\n'));
}
