/**
 * Build an importable CSS-only UI Checker library from the sibling, read-only
 * ehs-ui-bs reference.
 * reference. This script writes only inside the Chrome extension.
 */
const fs = require('node:fs');
const path = require('node:path');

const extensionRoot = path.resolve(__dirname, '..');
const ehsRoot = path.resolve(extensionRoot, '..', 'ehs-ui-bs');
const outputPath = path.join(extensionRoot, 'ehs-ui-bs-components.json');

const read = relativePath => fs.readFileSync(path.join(ehsRoot, relativePath), 'utf8');

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function findClosingBrace(source, opening) {
  let depth = 1;
  let quote = '';
  for (let index = opening + 1; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (char === quote && source[index - 1] !== '\\') quote = '';
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) return index;
  }
  return source.length - 1;
}

function parseCssRules(css, atRules = []) {
  const rules = [];
  css = stripComments(css);
  let cursor = 0;
  while (cursor < css.length) {
    const opening = css.indexOf('{', cursor);
    if (opening < 0) break;
    const header = css.slice(cursor, opening).trim();
    const closing = findClosingBrace(css, opening);
    const body = css.slice(opening + 1, closing);
    cursor = closing + 1;
    if (!header) continue;

    if (/^@(media|supports|container|layer)\b/i.test(header)) {
      rules.push(...parseCssRules(body, [...atRules, header]));
      continue;
    }
    if (header.startsWith('@')) continue;

    const declarations = {};
    for (const match of body.matchAll(/(^|;)\s*(--[\w-]+|[a-zA-Z-]+)\s*:\s*([^;{}]+)/g)) {
      declarations[match[2]] = match[3].trim();
    }
    if (Object.keys(declarations).length) {
      rules.push({ selector: header, declarations, atRules });
    }
  }
  return rules;
}

function classNamesIn(value) {
  const names = new Set();
  for (const match of value.matchAll(/\.(-?[_a-zA-Z]+[a-zA-Z0-9_-]*)/g)) names.add(match[1]);
  return names;
}

function markupClassNames(markup) {
  const names = new Set();
  for (const attribute of markup.matchAll(/\bclass\s*=\s*["']([^"']+)["']/gi)) {
    attribute[1].split(/\s+/).filter(Boolean).forEach(name => names.add(name));
  }
  return names;
}

function runtimeClassNames(source) {
  const names = new Set();
  for (const match of source.matchAll(/(?<![-\w])(?:md3|ehs)-[a-zA-Z0-9_-]+/g)) {
    if (!match[0].endsWith('-')) names.add(match[0]);
  }
  return names;
}

function extractDocumentedComponents(markdown) {
  const components = [];
  const pattern = /^##\s+(.+?)\r?\n[\s\S]*?```html\r?\n([\s\S]*?)\r?\n```/gm;
  for (const match of markdown.matchAll(pattern)) {
    const name = match[1].replace(/^\d+\s*\/\s*/, '').trim();
    const id = name.toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    components.push({ id, name, markup: match[2].trim() });
  }
  return components;
}

function detectComponentType(name, markup) {
  const title = name.toLowerCase();
  if (/button|\bfab\b/.test(title)) return 'button';
  if (/input|form|picker|slider|checkbox|radio|field|search/.test(title)) return 'input';
  if (/card/.test(title)) return 'card';
  if (/dialog|sheet|modal|drawer|dropdown/.test(title)) return 'modal';
  if (/table/.test(title)) return 'table';
  if (/nav|app bar|toolbar|\btabs?\b|menu|breadcrumb|list/.test(title)) return 'navbar';
  if (/alert|badge|snackbar|toast|loading|progress|feedback/.test(title)) return 'feedback';
  return 'custom';
}

const cssSources = [
  ['bootstrap.css', read('bootstrap-5.3.8-dist/css/bootstrap.css')],
  ['ehs.css', read('dist/ehs.css')],
  ['ehs-arabic.css', read('dist/ehs-arabic.css')],
  ['ehs-widgets.css', read('dist/ehs-widgets.css')]
];
const parsedRules = cssSources.flatMap(([source, css]) =>
  parseCssRules(css).map(rule => ({ ...rule, source }))
);
const referencePageRules = parseCssRules(read('docs/demo.css'))
  .map(rule => ({ ...rule, source: 'docs/demo.css' }));

const documentedClasses = JSON.parse(read('docs/classes.json'));
const classesWithRules = new Set();
for (const rule of parsedRules) {
  for (const className of classNamesIn(rule.selector)) {
    classesWithRules.add(className);
  }
}
const missingClasses = documentedClasses.filter(name => !classesWithRules.has(name));
const knownExtractorArtifacts = new Set(['com', 'css', 'map', 'org', 'w3', 'x']);
const unexplainedMissingClasses = missingClasses.filter(name => !knownExtractorArtifacts.has(name));
if (unexplainedMissingClasses.length) {
  throw new Error(`Classes missing from EHS stylesheets: ${unexplainedMissingClasses.join(', ')}`);
}
const stylesheetClasses = documentedClasses.filter(name => classesWithRules.has(name));

const runtimeSources = [read('dist/ehs.js'), read('dist/ehs-widgets.js')];
const runtimeClasses = new Set(runtimeSources.flatMap(source => [...runtimeClassNames(source)]));
const catalogClasses = new Set([...stylesheetClasses, ...runtimeClasses]);

const recipeComponents = extractDocumentedComponents(read('docs/COMPONENTS.md')).map((component, componentIndex) => {
  const usedClasses = [...markupClassNames(component.markup)].filter(name => catalogClasses.has(name)).sort();
  const usedSet = new Set(usedClasses);
  const componentRules = parsedRules.filter(rule => {
    const selectorClasses = classNamesIn(rule.selector);
    for (const name of selectorClasses) if (usedSet.has(name)) return true;
    // Runtime-created elements (for example .ehs-picker-trigger) do not occur
    // in the static documentation markup, and root language/direction rules
    // target the surrounding .md3 context. Include those global rules once
    // so the checker knows their intentional overrides without duplicating
    // them across all 30 component payloads.
    if (componentIndex === 0) {
      for (const name of selectorClasses) {
        if (runtimeClasses.has(name) || name === 'md3') return true;
      }
    }
    return false;
  });
  const seenRules = new Set();
  const styles = componentRules.filter(rule => {
    const key = `${rule.atRules.join('\n')}\n${rule.selector}\n${JSON.stringify(rule.declarations)}`;
    if (seenRules.has(key)) return false;
    seenRules.add(key);
    return true;
  }).map(rule => {
    const declarations = Object.entries(rule.declarations)
      .map(([property, value]) => `  ${property}: ${value};`).join('\n');
    let css = `${rule.selector} {\n${declarations}\n}`;
    for (const atRule of [...rule.atRules].reverse()) {
      css = `${atRule} {\n${css.split('\n').map(line => `  ${line}`).join('\n')}\n}`;
    }
    return css;
  }).join('\n\n');

  return {
    id: `ehs-${component.id}`,
    name: component.name,
    type: 'component',
    componentType: detectComponentType(component.name, component.markup),
    source: 'ehs-ui-bs@0.5.0',
    scope: '.md3',
    styles,
    classes: usedClasses
  };
});

// Validation must preserve the library's one true cascade. Splitting one
// stylesheet across documentation recipes changes source order when shared
// Bootstrap utilities and MD3 overrides target the same element. Keep a single
// CSS-only validation component; selectors still identify the exact failing
// rule and the class inventory remains independently searchable.
const referencePageClasses = markupClassNames(read('index.html'));
const validationClasses = new Set([
  ...recipeComponents.flatMap(component => component.classes),
  // COMPONENTS.md is descriptive rather than exhaustive. The official test
  // gallery contains valid compositions (for example the standard navigation
  // drawer) that must also retain all of their winning cascade rules.
  ...[...referencePageClasses].filter(name => catalogClasses.has(name))
]);
const selectsValidationClass = rule => {
  const selectorClasses = classNamesIn(rule.selector);
  for (const name of selectorClasses) {
    if (validationClasses.has(name) || runtimeClasses.has(name) || name === 'md3') return true;
  }
  return false;
};
const selectsCatalogClass = rule => {
  for (const name of classNamesIn(rule.selector)) {
    if (catalogClasses.has(name)) return true;
  }
  return false;
};
const selectsReferenceContext = rule => {
  const selectorClasses = classNamesIn(rule.selector);
  for (const name of selectorClasses) if (name.startsWith('demo-')) return true;
  return selectsCatalogClass(rule);
};
const validationRules = [
  ...parsedRules.filter(selectsValidationClass),
  // The import is also the fixture used to validate the official gallery.
  // Keep contextual demo overrides after the library cascade, exactly where
  // index.html loads them. Selectors remain context-bound (for example,
  // .demo-hero .text-primary), so they cannot affect ordinary application
  // markup that does not use the documentation wrappers.
  ...referencePageRules.filter(selectsReferenceContext)
];
const completeStyles = validationRules.map(rule => {
  const declarations = Object.entries(rule.declarations)
    .map(([property, value]) => `  ${property}: ${value};`).join('\n');
  let css = `${rule.selector} {\n${declarations}\n}`;
  for (const atRule of [...rule.atRules].reverse()) {
    css = `${atRule} {\n${css.split('\n').map(line => `  ${line}`).join('\n')}\n}`;
  }
  return css;
}).join('\n\n');

const components = [{
  id: 'ehs-ui-bs-standard',
  name: 'EHS UI Bootstrap standard',
  type: 'component',
  componentType: 'custom',
  source: 'ehs-ui-bs@0.5.0',
  styles: completeStyles,
  classes: [...validationClasses].sort()
}];

const tokens = {};
for (const rule of parsedRules) {
  if (!/(^|,)\s*:root\b/.test(rule.selector)) continue;
  for (const [property, value] of Object.entries(rule.declarations)) {
    if (property.startsWith('--')) tokens[property] = value;
  }
}

const classes = [...new Set([
  ...catalogClasses
])].sort((left, right) => left.localeCompare(right));
const stylesheets = cssSources.map(([source, css]) => ({
  id: source.replace(/\.css$/i, ''),
  source,
  css
}));

const output = {
  kind: 'ui-checker-library',
  formatVersion: 3,
  version: '1.5.1',
  library: {
    id: 'ehs-ui-bs',
    name: 'EHS UI Bootstrap',
    version: '0.5.0',
    componentCount: components.length,
    classCount: classes.length,
    tokenCount: Object.keys(tokens).length,
    referenceOnly: true
  },
  components,
  classes,
  stylesheets,
  tokens
};

fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Generated ${components.length} components, ${classes.length} classes, and ${Object.keys(tokens).length} tokens.`);
