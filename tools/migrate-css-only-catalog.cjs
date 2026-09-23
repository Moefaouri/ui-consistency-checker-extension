/** Remove legacy markup-derived validation fields from the existing catalog. */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const extensionRoot = path.resolve(__dirname, '..');
const catalogPath = path.join(extensionRoot, 'ehs-ui-components-custome.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

if (!Array.isArray(catalog.components)) throw new Error('Catalog components are missing.');

catalog.formatVersion = 3;
catalog.version = '1.5.1';
catalog.components = catalog.components.map(component => {
  const { html, htmlTag, scopeCss, parentSelector, scopeToFirst, ...cssOnlyComponent } = component;
  if (typeof cssOnlyComponent.styles !== 'string' || !/[^{}]+\{[^{}]*\}/s.test(cssOnlyComponent.styles)) {
    throw new Error(`${cssOnlyComponent.id || cssOnlyComponent.name} does not contain selector-based CSS.`);
  }
  return cssOnlyComponent;
});

fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
