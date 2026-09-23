'use strict';

// Migrate the stored EHS UI 0.4 catalog from documentation slices to one
// source-ordered validation cascade. The embedded stylesheets remain the
// source of truth, so the migration is repeatable and does not require HTML.
const fs = require('node:fs');
const path = require('node:path');

const extensionRoot = path.resolve(__dirname, '..');
const catalogPath = path.join(extensionRoot, 'ehs-ui-components-custome.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function findClosingBrace(source, opening) {
  let depth = 1;
  let quote = '';
  for (let index = opening + 1; index < source.length; index++) {
    const character = source[index];
    if (quote) {
      if (character === quote && source[index - 1] !== '\\') quote = '';
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '{') {
      depth++;
    } else if (character === '}' && --depth === 0) {
      return index;
    }
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

    const declarations = [];
    for (const match of body.matchAll(/(^|;)\s*(--[\w-]+|[a-zA-Z-]+)\s*:\s*([^;{}]+)/g)) {
      declarations.push([match[2], match[3].trim()]);
    }
    if (declarations.length) rules.push({ selector: header, declarations, atRules });
  }
  return rules;
}

function classNamesIn(value) {
  return [...value.matchAll(/\.(-?[_a-zA-Z]+[a-zA-Z0-9_-]*)/g)].map(match => match[1]);
}

function serializeRule(rule) {
  const body = rule.declarations.map(([property, value]) => `  ${property}: ${value};`).join('\n');
  let css = `${rule.selector} {\n${body}\n}`;
  for (const atRule of [...rule.atRules].reverse()) {
    css = `${atRule} {\n${css.split('\n').map(line => `  ${line}`).join('\n')}\n}`;
  }
  return css;
}

// The top-level inventory also includes runtime-created classes that are not
// present in static documentation recipes. Keep all of them in the unified
// cascade so the consolidated catalog does not lose those rules.
const documentedClasses = new Set(catalog.classes || []);
const rules = catalog.stylesheets.flatMap(stylesheet => parseCssRules(stylesheet.css));
const validationRules = rules.filter(rule =>
  classNamesIn(rule.selector).some(name => documentedClasses.has(name) || name === 'ehs-ui')
);

catalog.version = '1.5.1';
catalog.library.componentCount = 1;
catalog.components = [{
  id: 'ehs-ui-standard',
  name: 'EHS UI standard',
  type: 'component',
  componentType: 'custom',
  source: 'ehs-ui@0.4.0',
  styles: validationRules.map(serializeRule).join('\n\n'),
  classes: [...documentedClasses].sort()
}];

fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
