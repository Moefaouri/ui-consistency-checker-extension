// Content script for UI Consistency Checker
// Component-Based Architecture (No Legacy Rules)
// @version 1.3.1

(function() {
  'use strict';
  
  if (window.uiCheckerInjected) return;
  window.uiCheckerInjected = true;

  console.log('[UI Checker] Content script injected');

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[UI Checker] Received message:', request.action);
    
    try {
      if (request.action === 'ping') {
        sendResponse({ success: true, message: 'pong' });
        return true;
      } else if (request.action === 'runCheck') {
        const result = runConsistencyCheck(request.components);
        sendResponse(result);
        return true;
      } else if (request.action === 'autoFix') {
        const result = autoFixViolations(request.components);
        sendResponse(result);
        return true;
      } else if (request.action === 'toggleGrid') {
        toggleSpacingGrid(request.active, request.gridSize || 32);
        sendResponse({ success: true });
        return true;
      } else if (request.action === 'scanPage') {
        const result = scanPageForComponents();
        sendResponse(result);
        return true;
      } else if (request.action === 'aiAnalysis') {
        const result = runAIAnalysis();
        sendResponse(result);
        return true;
      } else if (request.action === 'analyzeQuality') {
        const result = analyzePageQuality(request.components || []);
        sendResponse(result);
        return true;
      }
    } catch (error) {
      console.error('[UI Checker] Error:', error);
      sendResponse({ success: false, error: error.message });
      return true;
    }
    
    return true;
  });

  // ========================================
  // COMPONENT TYPE DETECTION
  // ========================================

  function detectElementType(el) {
    const classList = el.className ? el.className.split(/\s+/) : [];
    const tagName = el.tagName.toLowerCase();
    
    // Check data-ui attribute first
    if (el.dataset.ui) return el.dataset.ui;
    
    // Check tag names
    if (tagName === 'button') return 'button';
    if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') return 'input';
    if (tagName === 'nav') return 'navbar';
    if (tagName === 'dialog') return 'modal';
    
    // Check common class patterns
    if (classList.some(c => c.includes('btn') || c.includes('button'))) return 'button';
    if (classList.some(c => c.includes('input') || c.includes('form-control') || c.includes('textfield'))) return 'input';
    if (classList.some(c => c.includes('card'))) return 'card';
    if (classList.some(c => c.includes('modal') || c.includes('dialog'))) return 'modal';
    if (classList.some(c => c.includes('nav') || c.includes('navbar') || c.includes('header'))) return 'navbar';
    
    // Material Design Lite patterns
    if (classList.some(c => c.includes('mdl-button'))) return 'button';
    if (classList.some(c => c.includes('mdl-textfield'))) return 'input';
    if (classList.some(c => c.includes('mdl-card'))) return 'card';
    if (classList.some(c => c.includes('mdl-dialog'))) return 'modal';
    if (classList.some(c => c.includes('mdl-layout__header'))) return 'navbar';
    
    return 'custom';
  }

  // ========================================
  // RUN CONSISTENCY CHECK (Component-Based)
  // ========================================

  function runConsistencyCheck(components) {
    console.log('[UI Checker] Running check with components:', components ? components.length : 0);

    // Clear previous highlights
    document.querySelectorAll('.ui-check-error').forEach(el => el.classList.remove('ui-check-error'));

    if (!components || components.length === 0) {
      return { passed: 0, failed: 0, issues: [], totalChecked: 0, message: 'No components provided.' };
    }

    let totalPassed = 0;
    let totalFailed = 0;
    const allIssues = [];

    components.forEach(comp => {
      if (!comp.styles) return;

      // ── NEW SMART MODE ──────────────────────────────────────────────────────
      // If the CSS has selectors (curly braces), use each selector directly to
      // find the right element on the page and test only its own properties.
      //
      // This means the user can paste their FULL CSS block as-is:
      //
      //   .login_section { border-radius: 40px }        → finds section.login_section
      //   .login_title h1 { font-size: 24px }           → finds h1 inside .login_title
      //   .login_title i { background: #00a9d7 }        → finds i inside .login_title
      //
      // Each CSS rule maps to its own element automatically.
      // No need for htmlTag, parentSelector, or scopeToFirst.
      // ───────────────────────────────────────────────────────────────────────

      const hasSelectors = /\{/.test(comp.styles);

      if (hasSelectors) {
        // ── SMART MODE: selector-driven matching ──────────────────────────────
        const cssRules = parseBaseRules(comp.styles);

        // Group rules by selector so we test each element once
        const rulesBySelector = {};
        cssRules.forEach(rule => {
          if (!rule.selector) return;
          if (!rulesBySelector[rule.selector]) rulesBySelector[rule.selector] = [];
          rulesBySelector[rule.selector].push(rule);
        });

        Object.entries(rulesBySelector).forEach(([selector, rules]) => {

          // Skip selectors we can't reliably test:
          // - pseudo-states (:hover, :focus …)
          // - pseudo-elements (::before, ::after …)
          // - :has(), :is(), :not() with complex args
          // - @-rules
          if (/:(hover|focus|active|visited|checked|disabled|enabled|placeholder|:-webkit)/i.test(selector)) return;
          if (/::(before|after|placeholder|selection|first-line|first-letter)/i.test(selector)) return;
          if (selector.startsWith('@')) return;

          // ── Extract the ROOT element selector from the component's htmlTag ──
          // The htmlTag tells us the "scope" — we only look for elements that
          // are descendants of (or equal to) the root component element.
          //
          // e.g. htmlTag = <section id="login-box">
          //      CSS selector = ".login_title h1"
          //      → we search: section#login-box .login_title h1
          //
          // If no htmlTag provided, search the whole document.
          let searchSelector = selector;
          if (comp.htmlTag) {
            try {
              const parser = new DOMParser();
              const doc = parser.parseFromString(comp.htmlTag, 'text/html');
              const rootEl = doc.body.firstElementChild;
              if (rootEl) {
                // Build root selector from tag + id + classes
                let rootSelector = rootEl.tagName.toLowerCase();
                if (rootEl.id) rootSelector += '#' + rootEl.id;
                if (rootEl.className) {
                  rootEl.className.split(/\s+/).filter(c => c).forEach(c => {
                    rootSelector += '.' + c;
                  });
                }
                // Check if the selector already targets the root element itself
                // If so, search directly. Otherwise scope it as a descendant.
                try {
                  const rootOnPage = document.querySelector(rootSelector);
                  if (rootOnPage && rootOnPage.matches(selector)) {
                    searchSelector = selector; // selector IS the root
                  } else {
                    searchSelector = rootSelector + ' ' + selector;
                  }
                } catch(e) {
                  searchSelector = rootSelector + ' ' + selector;
                }
              }
            } catch(e) {}
          }

          // Find matching elements
          let matchingElements = [];
          try {
            matchingElements = Array.from(document.querySelectorAll(searchSelector));
          } catch(e) {
            console.warn('[UI Checker] Invalid selector:', searchSelector);
            return;
          }

          if (matchingElements.length === 0) return;

          // Check each matched element against this selector's rules
          matchingElements.forEach(el => {
            const violations = [];
            let isValid = true;
            const computedStyles = window.getComputedStyle(el);

            const CSS_WIDE_KEYWORDS = /^(unset|initial|inherit|revert|revert-layer|normal)$/i;

            rules.forEach(rule => {
              const expectedValue = rule.value.trim().replace(/\s*!important\s*/gi, '').trim();
              if (!expectedValue) return;
              if (CSS_WIDE_KEYWORDS.test(expectedValue)) return;
              if (expectedValue.includes('calc(')) return;

              const rawActual = getActualValue(rule.property, el, computedStyles);
              const passed = smartCompareValues(rule.property, expectedValue, rawActual, el);

              if (!passed) {
                violations.push(`${rule.property}: expected "${expectedValue}", found "${rawActual}"`);
                isValid = false;
              }
            });

            // Use the last part of the selector as the display name
            const displayName = selector.split(/\s+/).pop();

            if (isValid) {
              totalPassed++;
              el.classList.remove('ui-check-error');
            } else {
              totalFailed++;
              el.classList.add('ui-check-error');
              allIssues.push({
                type: displayName,
                violations,
                element: selector
              });
            }
          });
        });

      } else {
        // ── LEGACY MODE: flat properties, use htmlTag as selector ─────────────
        // Kept for backwards compatibility with old JSON configs that have
        // styles as flat "property: value" pairs without selectors.
        if (!comp.htmlTag) return;

        const parser = new DOMParser();
        const doc = parser.parseFromString(comp.htmlTag, 'text/html');
        const componentElement = doc.body.firstElementChild;
        if (!componentElement) return;

        const htmlTag = componentElement.tagName.toLowerCase();
        const htmlClasses = componentElement.className ? componentElement.className.split(/\s+/).filter(c => c) : [];
        const cssRules = parseBaseRules(comp.styles);
        if (cssRules.length === 0) return;

        let selector = htmlTag;
        if (htmlClasses.length > 0) selector += '.' + htmlClasses.join('.');

        let matchingElements = [];
        try {
          if (comp.parentSelector) {
            const parents = Array.from(document.querySelectorAll(comp.parentSelector));
            const found = new Set();
            parents.forEach(p => p.querySelectorAll(selector).forEach(el => found.add(el)));
            matchingElements = Array.from(found);
          } else {
            matchingElements = Array.from(document.querySelectorAll(selector));
          }
          if (comp.scopeToFirst && matchingElements.length > 1) matchingElements = [matchingElements[0]];
        } catch(e) { return; }

        if (matchingElements.length === 0) return;

        const CSS_WIDE_KEYWORDS = /^(unset|initial|inherit|revert|revert-layer|normal)$/i;

        matchingElements.forEach(el => {
          const violations = [];
          let isValid = true;
          const computedStyles = window.getComputedStyle(el);

          cssRules.forEach(rule => {
            const expectedValue = rule.value.trim().replace(/\s*!important\s*/gi, '').trim();
            if (!expectedValue) return;
            if (CSS_WIDE_KEYWORDS.test(expectedValue)) return;
            if (expectedValue.includes('calc(')) return;

            const rawActual = getActualValue(rule.property, el, computedStyles);
            const passed = smartCompareValues(rule.property, expectedValue, rawActual, el);
            if (!passed) {
              violations.push(`${rule.property}: expected "${expectedValue}", found "${rawActual}"`);
              isValid = false;
            }
          });

          if (isValid) {
            totalPassed++;
            el.classList.remove('ui-check-error');
          } else {
            totalFailed++;
            el.classList.add('ui-check-error');
            allIssues.push({
              type: htmlTag,
              violations,
              element: `${htmlTag}${htmlClasses.length > 0 ? '.' + htmlClasses.join('.') : ''}`
            });
          }
        });
      }
    });

    return { passed: totalPassed, failed: totalFailed, issues: allIssues, totalChecked: totalPassed + totalFailed };
  }

  // Parse CSS string to extract property-value pairs
  function parseCSSRules(css, baseOnly = false) {
    const rules = [];

    // Remove comments
    css = css.replace(/\/\*[\s\S]*?\*\//g, '');

    // Remove @keyframes blocks entirely (they contain CSS-like syntax that is not element rules)
    css = css.replace(/@keyframes\s+[\w-]+\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '');

    // Check if the CSS has no selector blocks at all (flat list of property: value pairs)
    // This handles configs like "height: 40px;\nborder-radius: 8px;" with no selectors
    const hasBlocks = /\{/.test(css);
    if (!hasBlocks) {
      const propRegex = /([a-zA-Z-]+)\s*:\s*([^;]+);?/g;
      let propMatch;
      while ((propMatch = propRegex.exec(css)) !== null) {
        const property = propMatch[1].trim();
        const value = propMatch[2].trim();
        if (property && value) rules.push({ selector: '', property, value, isBase: true });
      }
      return rules;
    }

    // Pseudo-state and pseudo-element patterns — these represent interactive or
    // generated states that CANNOT be compared against a static element's computed styles
    const PSEUDO_STATE_PATTERN = /:(hover|focus|focus-within|focus-visible|active|checked|disabled|enabled|visited|link|not\(|nth-child|first-child|last-child|empty|placeholder)/i;
    const PSEUDO_ELEMENT_PATTERN = /::(after|before|placeholder|selection|first-line|first-letter|marker)/i;

    // Parse using a manual index approach to handle nested braces correctly
    let i = 0;
    while (i < css.length) {
      const openIdx = css.indexOf('{', i);
      if (openIdx === -1) break;

      const selector = css.slice(i, openIdx).trim();

      // Find the matching closing brace
      let depth = 1;
      let j = openIdx + 1;
      while (j < css.length && depth > 0) {
        if (css[j] === '{') depth++;
        else if (css[j] === '}') depth--;
        j++;
      }
      const blockContent = css.slice(openIdx + 1, j - 1);
      i = j;

      // Skip at-rules like @media, @supports
      if (selector.startsWith('@')) continue;

      const isPseudoState = PSEUDO_STATE_PATTERN.test(selector);
      const isPseudoElement = PSEUDO_ELEMENT_PATTERN.test(selector);
      const isBase = !isPseudoState && !isPseudoElement;

      // In baseOnly mode, skip pseudo-state and pseudo-element rules
      if (baseOnly && !isBase) continue;

      const propRegex = /([a-zA-Z-]+)\s*:\s*([^;]+);?/g;
      let propMatch;
      while ((propMatch = propRegex.exec(blockContent)) !== null) {
        const property = propMatch[1].trim();
        const value = propMatch[2].trim();
        if (property && value) {
          rules.push({ selector, property, value, isBase });
        }
      }
    }

    return rules;
  }

  // Returns only base-selector rules (no pseudo-states) — used for checking and auto-fix
  function parseBaseRules(css) {
    return parseCSSRules(css, true);
  }


  // Convert color to hex format for comparison
  function colorToHex(color) {
    if (!color) return '';
    
    color = color.trim().toLowerCase();
    
    // If already hex, normalize it
    if (color.startsWith('#')) {
      // Expand shorthand hex (#abc -> #aabbcc)
      if (color.length === 4) {
        return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
      }
      return color;
    }
    
    // Handle named colors - comprehensive list of CSS named colors
    const namedColors = {
      'aliceblue': '#f0f8ff', 'antiquewhite': '#faebd7', 'aqua': '#00ffff', 'aquamarine': '#7fffd4',
      'azure': '#f0ffff', 'beige': '#f5f5dc', 'bisque': '#ffe4c4', 'black': '#000000',
      'blanchedalmond': '#ffebcd', 'blue': '#0000ff', 'blueviolet': '#8a2be2', 'brown': '#a52a2a',
      'burlywood': '#deb887', 'cadetblue': '#5f9ea0', 'chartreuse': '#7fff00', 'chocolate': '#d2691e',
      'coral': '#ff7f50', 'cornflowerblue': '#6495ed', 'cornsilk': '#fff8dc', 'crimson': '#dc143c',
      'cyan': '#00ffff', 'darkblue': '#00008b', 'darkcyan': '#008b8b', 'darkgoldenrod': '#b8860b',
      'darkgray': '#a9a9a9', 'darkgrey': '#a9a9a9', 'darkgreen': '#006400', 'darkkhaki': '#bdb76b',
      'darkmagenta': '#8b008b', 'darkolivegreen': '#556b2f', 'darkorange': '#ff8c00', 'darkorchid': '#9932cc',
      'darkred': '#8b0000', 'darksalmon': '#e9967a', 'darkseagreen': '#8fbc8f', 'darkslateblue': '#483d8b',
      'darkslategray': '#2f4f4f', 'darkslategrey': '#2f4f4f', 'darkturquoise': '#00ced1', 'darkviolet': '#9400d3',
      'deeppink': '#ff1493', 'deepskyblue': '#00bfff', 'dimgray': '#696969', 'dimgrey': '#696969',
      'dodgerblue': '#1e90ff', 'firebrick': '#b22222', 'floralwhite': '#fffaf0', 'forestgreen': '#228b22',
      'fuchsia': '#ff00ff', 'gainsboro': '#dcdcdc', 'ghostwhite': '#f8f8ff', 'gold': '#ffd700',
      'goldenrod': '#daa520', 'gray': '#808080', 'grey': '#808080', 'green': '#008000',
      'greenyellow': '#adff2f', 'honeydew': '#f0fff0', 'hotpink': '#ff69b4', 'indianred': '#cd5c5c',
      'indigo': '#4b0082', 'ivory': '#fffff0', 'khaki': '#f0e68c', 'lavender': '#e6e6fa',
      'lavenderblush': '#fff0f5', 'lawngreen': '#7cfc00', 'lemonchiffon': '#fffacd', 'lightblue': '#add8e6',
      'lightcoral': '#f08080', 'lightcyan': '#e0ffff', 'lightgoldenrodyellow': '#fafad2', 'lightgray': '#d3d3d3',
      'lightgrey': '#d3d3d3', 'lightgreen': '#90ee90', 'lightpink': '#ffb6c1', 'lightsalmon': '#ffa07a',
      'lightseagreen': '#20b2aa', 'lightskyblue': '#87cefa', 'lightslategray': '#778899', 'lightslategrey': '#778899',
      'lightsteelblue': '#b0c4de', 'lightyellow': '#ffffe0', 'lime': '#00ff00', 'limegreen': '#32cd32',
      'linen': '#faf0e6', 'magenta': '#ff00ff', 'maroon': '#800000', 'mediumaquamarine': '#66cdaa',
      'mediumblue': '#0000cd', 'mediumorchid': '#ba55d3', 'mediumpurple': '#9370db', 'mediumseagreen': '#48c3cd',
      'mediumslateblue': '#7b68ee', 'mediumspringgreen': '#00fa9a', 'mediumturquoise': '#48d1cc', 'mediumvioletred': '#c71585',
      'midnightblue': '#191970', 'mintcream': '#f5fffa', 'mistyrose': '#ffe4e1', 'moccasin': '#ffe4b5',
      'navajowhite': '#ffdead', 'navy': '#000080', 'oldlace': '#fdf5e6', 'olive': '#808000',
      'olivedrab': '#6b8e23', 'orange': '#ffa500', 'orangered': '#ff4500', 'orchid': '#da70d6',
      'palegoldenrod': '#eee8aa', 'palegreen': '#98fb98', 'paleturquoise': '#afeeee', 'palevioletred': '#db7093',
      'papayawhip': '#ffefd5', 'peachpuff': '#ffdab9', 'peru': '#cd853f', 'pink': '#ffc0cb',
      'plum': '#dda0dd', 'powderblue': '#1e90ff', 'purple': '#800080', 'rebeccapurple': '#663399',
      'red': '#ff0000', 'rosybrown': '#bc8f8f', 'royalblue': '#4169e1', 'saddlebrown': '#8b4513',
      'salmon': '#fa8072', 'sandybrown': '#f4a460', 'seagreen': '#2e8b57', 'seashell': '#fff5ee',
      'sienna': '#a0522d', 'silver': '#c0c0c0', 'skyblue': '#87ceeb', 'slateblue': '#6a5acd',
      'slategray': '#708090', 'slategrey': '#708090', 'snow': '#fffafa', 'springgreen': '#00ff7f',
      'steelblue': '#4682b4', 'tan': '#d2b48c', 'teal': '#008080', 'thistle': '#d8bfd8',
      'tomato': '#ff6347', 'turquoise': '#40e0d0', 'violet': '#8b00ff', 'wheat': '#f5deb3',
      'white': '#ffffff', 'whitesmoke': '#f5f5f5', 'yellow': '#ffff00', 'yellowgreen': '#9acd32',
      'transparent': 'transparent'
    };
    
    if (namedColors[color]) {
      return namedColors[color];
    }
    
    // Handle rgb/rgba - normalize spaces first
    color = color.replace(/\s+/g, ' ');
    const rgbMatch = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1]);
      const g = parseInt(rgbMatch[2]);
      const b = parseInt(rgbMatch[3]);
      const alpha = rgbMatch[4] ? parseFloat(rgbMatch[4]) : 1;
      
      // If fully opaque, convert to hex
      if (alpha === 1 || !rgbMatch[4]) {
        return '#' + [r, g, b].map(x => {
          const hex = x.toString(16);
          return hex.length === 1 ? '0' + hex : hex;
        }).join('');
      }
      // If transparent, return normalized rgba
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    
    // Handle hsl/hsla (convert to rgb first, then to hex)
    const hslMatch = color.match(/hsla?\((\d+),\s*(\d+)%,\s*(\d+)%(?:,\s*[\d.]+)?\)/);
    if (hslMatch) {
      const h = parseInt(hslMatch[1]) / 360;
      const s = parseInt(hslMatch[2]) / 100;
      const l = parseInt(hslMatch[3]) / 100;
      const alpha = hslMatch[4] ? parseFloat(hslMatch[4]) : 1;
      
      // Convert HSL to RGB
      let r, g, b;
      if (s === 0) {
        r = g = b = l;
      } else {
        const hue2rgb = (p, q, t) => {
          if (t < 0) t += 1;
          if (t > 1) t -= 1;
          if (t < 1/6) return p + (q - p) * 6 * t;
          if (t < 1/2) return q;
          if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
          return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
      }
      
      r = Math.round(r * 255);
      g = Math.round(g * 255);
      b = Math.round(b * 255);
      
      if (alpha === 1 || !hslMatch[4]) {
        return '#' + [r, g, b].map(x => {
          const hex = x.toString(16);
          return hex.length === 1 ? '0' + hex : hex;
        }).join('');
      }
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    
    return color;
  }

  // ========================================
  // SMART VALUE COMPARISON ENGINE
  // ========================================

  const NUMERIC_TOLERANCE = 0.5; // px tolerance

  /**
   * getActualValue – the single source of truth for "what value does this
   * element actually have for this property, as DevTools would show it".
   *
   * Strategy (3 layers, best wins):
   *  1. Reconstruct shorthands from individual computed sides (MOST RELIABLE)
   *     → preserves "auto", "none", keywords exactly as the browser resolved them
   *     → e.g. margin: "0px auto" from margin-top/right/bottom/left
   *  2. Cascade scan: read stylesheet rules + inline style (same as DevTools Styles panel)
   *     → returns the as-written value for properties not covered by layer 1
   *  3. Raw getComputedStyle (fallback for simple scalar properties)
   */
  function getActualValue(property, el, computedStyles) {
    // ── Layer 1: Inline style — highest priority, always authoritative ─────────
    try {
      const inlineVal = el.style.getPropertyValue(property).trim();
      if (inlineVal) return inlineVal;
    } catch(e) {}

    // ── Layer 2: Cascade scan — reads the stylesheet as-written ───────────────
    // This preserves "0 auto", "auto", keywords exactly as the developer wrote.
    // Must come BEFORE reconstruction because reconstruction reads computed
    // values which browser may have already resolved "auto" → "0px".
    const cascadeVal = getCascadeValue(property, el);
    if (cascadeVal !== null) return cascadeVal;

    // ── Layer 3: Reconstruct shorthands from individual computed sides ─────────
    // Fallback when stylesheet is inaccessible (cross-origin, shadow DOM, etc.)
    const reconstructed = reconstructShorthand(property, el, computedStyles);
    if (reconstructed !== null) return reconstructed;

    // ── Layer 4: Raw computed ─────────────────────────────────────────────────
    return computedStyles.getPropertyValue(property).trim();
  }

  /**
   * reconstructShorthand – rebuilds shorthand values from their longhands.
   * Returns the canonical string (e.g. "0px auto") or null if not a shorthand.
   * This perfectly mirrors what DevTools "Computed" tab shows.
   */
  function reconstructShorthand(property, el, cs) {
    switch (property) {
      case 'margin':
        return rebuildFourSides(
          cs.marginTop, cs.marginRight, cs.marginBottom, cs.marginLeft
        );
      case 'padding':
        return rebuildFourSides(
          cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft
        );
      case 'border-radius':
        return rebuildFourSides(
          cs.borderTopLeftRadius, cs.borderTopRightRadius,
          cs.borderBottomRightRadius, cs.borderBottomLeftRadius
        );
      case 'inset':
        return rebuildFourSides(cs.top, cs.right, cs.bottom, cs.left);
      case 'border-width':
        return rebuildFourSides(
          cs.borderTopWidth, cs.borderRightWidth,
          cs.borderBottomWidth, cs.borderLeftWidth
        );
      case 'border-color':
        return rebuildFourSides(
          cs.borderTopColor, cs.borderRightColor,
          cs.borderBottomColor, cs.borderLeftColor
        );
      case 'border-style':
        return rebuildFourSides(
          cs.borderTopStyle, cs.borderRightStyle,
          cs.borderBottomStyle, cs.borderLeftStyle
        );
      case 'background-position':
        return cs.backgroundPositionX + ' ' + cs.backgroundPositionY;
      default:
        return null; // not a reconstructable shorthand
    }
  }

  /**
   * rebuildFourSides – collapses [top, right, bottom, left] back into the
   * minimal CSS shorthand form, preserving keywords like "auto".
   * e.g. ["0px","auto","0px","auto"] → "0px auto"
   *      ["10px","10px","10px","10px"] → "10px"
   */
  function rebuildFourSides(top, right, bottom, left) {
    top = (top || '').trim();
    right = (right || '').trim();
    bottom = (bottom || '').trim();
    left = (left || '').trim();
    if (!top && !right && !bottom && !left) return null;

    // Collapse to shortest valid shorthand
    if (top === right && right === bottom && bottom === left) return top;
    if (top === bottom && right === left) return top + ' ' + right;
    if (right === left) return top + ' ' + right + ' ' + bottom;
    return top + ' ' + right + ' ' + bottom + ' ' + left;
  }

  /**
   * getCascadeValue – scans all stylesheets for rules matching `el` and
   * returns the winning (highest-specificity) as-written value.
   * Falls back to inline style. Returns null if nothing found.
   */
  function getCascadeValue(property, el) {
    let bestValue = null;
    let bestSpecificity = -1;

    try {
      for (const sheet of document.styleSheets) {
        let rules;
        try { rules = sheet.cssRules || sheet.rules; } catch (e) { continue; }
        if (!rules) continue;
        for (const rule of rules) {
          if (rule.type !== 1) continue;
          try {
            if (!el.matches(rule.selectorText)) continue;
          } catch (e) { continue; }
          const val = rule.style.getPropertyValue(property).trim();
          if (!val) continue;
          const spec = computeSpecificity(rule.selectorText);
          if (spec >= bestSpecificity) {
            bestSpecificity = spec;
            bestValue = val;
          }
        }
      }
    } catch (e) {}

    return bestValue; // null if nothing found
  }

  // Specificity score: id=100, class/attr/pseudo=10, tag=1
  function computeSpecificity(selector) {
    if (!selector) return 0;
    let score = 0;
    const clean = selector
      .replace(/::[a-z-]+/gi, '')
      .replace(/:[a-z-]+(\([^)]*\))?/gi, '');
    score += (clean.match(/#[a-zA-Z0-9_-]/g) || []).length * 100;
    score += (clean.match(/\.[a-zA-Z0-9_-]|\[[^\]]+\]/g) || []).length * 10;
    score += (clean.match(/[a-z][a-z0-9-]*/gi) || []).length;
    return score;
  }

  // Main router: choose the right comparator per property
  function smartCompareValues(property, expected, actual, el) {
    // Strip !important — computed styles never include it
    const e = expected.trim().replace(/\s*!important\s*/gi, '').trim();
    const a = actual.trim().replace(/\s*!important\s*/gi, '').trim();
    if (!e && !a) return true;

    const colorProperties = new Set(['color', 'background-color', 'border-color',
      'border-top-color', 'border-right-color', 'border-bottom-color',
      'border-left-color', 'outline-color', 'text-decoration-color', 'caret-color']);
    const shadowProperties = new Set(['box-shadow', 'text-shadow']);
    const numericSingle = new Set(['font-size', 'letter-spacing', 'word-spacing',
      'border-width', 'border-top-width', 'border-right-width',
      'border-bottom-width', 'border-left-width', 'outline-width']);
    const multiNumericProps = new Set(['margin', 'padding', 'border-radius',
      'background-position', 'transform-origin', 'inset']);
    const borderShorthands = new Set(['border', 'border-top', 'border-right',
      'border-bottom', 'border-left', 'outline']);

    if (colorProperties.has(property)) return compareColors(e, a);
    if (shadowProperties.has(property)) return compareBoxShadows(e, a);
    if (borderShorthands.has(property)) return compareBorder(e, a);
    if (multiNumericProps.has(property)) return compareMultiNumeric(e, a, el);
    if (numericSingle.has(property)) return compareNumericValue(e, a, el);

    // Background shorthand
    if (property === 'background') return compareBackground(e, a);

    // Transition and animation – browsers drop default "ease" easing from computed
    if (property === 'transition' || property === 'animation') {
      return compareTransition(e, a);
    }

    // Dimension properties – try numeric first, then string
    if (['width','height','min-width','max-width','min-height','max-height',
         'top','right','bottom','left','flex-basis','gap','row-gap','column-gap',
         'line-height',
         'padding-top','padding-right','padding-bottom','padding-left',
         'margin-top','margin-right','margin-bottom','margin-left',
         'border-top-width','border-right-width','border-bottom-width','border-left-width',
         'font-size','letter-spacing','word-spacing',
         'z-index','opacity','flex-grow','flex-shrink','order'].includes(property)) {
      return compareNumericValue(e, a, el);
    }

    // Generic: normalize then compare strings
    return normalizeCSSValue(e) === normalizeCSSValue(a);
  }

  // Resolve any length value → px number (returns null if not resolvable)
  function resolveLength(value, el) {
    if (!value) return null;
    value = value.trim();
    if (value === '0' || value === '0px') return 0;
    const num = parseFloat(value);
    if (isNaN(num)) return null;

    if (value.endsWith('px')) return num;
    if (value.endsWith('vw')) return (num / 100) * window.innerWidth;
    if (value.endsWith('vh')) return (num / 100) * window.innerHeight;
    if (value.endsWith('vmin')) return (num / 100) * Math.min(window.innerWidth, window.innerHeight);
    if (value.endsWith('vmax')) return (num / 100) * Math.max(window.innerWidth, window.innerHeight);
    if (value.endsWith('rem')) {
      const rootFs = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      return num * rootFs;
    }
    if (value.endsWith('em')) {
      const elFs = el ? parseFloat(getComputedStyle(el).fontSize) || 16 : 16;
      return num * elFs;
    }
    if (value.endsWith('pt')) return num * (96 / 72);
    if (/^[\d.]+$/.test(value)) return num; // unitless (e.g. line-height)
    return null;
  }

  function compareNumericValue(expected, actual, el) {
    const expN = resolveLength(expected, el);
    const actN = resolveLength(actual, el);
    if (expN !== null && actN !== null) return Math.abs(expN - actN) <= NUMERIC_TOLERANCE;
    return normalizeCSSValue(expected) === normalizeCSSValue(actual);
  }

  /**
   * compareMultiNumeric – handles shorthand layout props like margin/padding.
   * Crucially supports "0 auto", "auto", keyword parts alongside px values.
   * Works on both inspect-style values ("0px auto") and expected ("0 auto").
   */
  function compareMultiNumeric(expected, actual, el) {
    const expParts = expected.trim().split(/\s+/);
    const actParts = actual.trim().split(/\s+/);

    // Helper: compare a single part – aware of keywords like auto/none
    const comparePart = (ep, ap) => {
      ep = ep.toLowerCase(); ap = ap.toLowerCase();
      // Both same keyword (auto, none, normal …)
      if (ep === ap) return true;
      // "auto" in expected but browser computed it to "0px" (symmetric centering case):
      // When expected is "auto" and actual is a zero-value, treat as match.
      // Browser resolves "margin: 0 auto" → marginRight/Left as "0px" when element
      // has no explicit width or is not a block — the intent is still correct.
      if (ep === 'auto' && resolveLength(ap, el) === 0) return true;
      // One is a keyword and the other isn't → fail (e.g. "auto" vs "20px")
      if (/^[a-z]/.test(ep) || /^[a-z]/.test(ap)) return ep === ap;
      // Numeric comparison with tolerance
      const en = resolveLength(ep, el);
      const an = resolveLength(ap, el);
      if (en !== null && an !== null) return Math.abs(en - an) <= NUMERIC_TOLERANCE;
      return normalizeCSSValue(ep) === normalizeCSSValue(ap);
    };

    // CSS shorthand expansion: "X" → [X,X,X,X], "X Y" → [X,Y,X,Y], etc.
    function expandShorthand(parts) {
      if (parts.length === 1) return [parts[0], parts[0], parts[0], parts[0]];
      if (parts.length === 2) return [parts[0], parts[1], parts[0], parts[1]];
      if (parts.length === 3) return [parts[0], parts[1], parts[2], parts[1]];
      return parts.slice(0, 4);
    }

    // If part counts match exactly, compare directly
    if (expParts.length === actParts.length) {
      return expParts.every((ep, i) => comparePart(ep, actParts[i]));
    }

    // Try expanding both as CSS 4-value shorthands and compare
    if (expParts.length <= 4 && actParts.length <= 4) {
      const expExp = expandShorthand(expParts);
      const actExp = expandShorthand(actParts);
      return expExp.every((ep, i) => comparePart(ep, actExp[i]));
    }

    // Last resort: string normalisation
    return normalizeCSSValue(expected) === normalizeCSSValue(actual);
  }

  // Unified RGBA normalization for color comparison
  function normalizeColorToRGBA(color) {
    if (!color) return null;
    color = color.trim();
    if (color === 'transparent') return 'rgba(0,0,0,0)';

    // Normalize leading decimal before matching
    color = color.replace(/(^|[\s,(])\.( \d)/g, '$10.$2');

    const rgbaMatch = color.match(/rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/i);
    if (rgbaMatch) {
      return `rgba(${Math.round(parseFloat(rgbaMatch[1]))},${Math.round(parseFloat(rgbaMatch[2]))},${Math.round(parseFloat(rgbaMatch[3]))},${parseFloat(parseFloat(rgbaMatch[4]).toFixed(3))})`;
    }
    const rgbMatch = color.match(/rgb\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/i);
    if (rgbMatch) {
      return `rgba(${Math.round(parseFloat(rgbMatch[1]))},${Math.round(parseFloat(rgbMatch[2]))},${Math.round(parseFloat(rgbMatch[3]))},1)`;
    }
    if (color.startsWith('#')) {
      let hex = color.slice(1);
      if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
      if (hex.length === 6) {
        const [r, g, b] = [0,2,4].map(i => parseInt(hex.slice(i, i+2), 16));
        return `rgba(${r},${g},${b},1)`;
      }
      if (hex.length === 8) {
        const [r, g, b] = [0,2,4].map(i => parseInt(hex.slice(i, i+2), 16));
        const a = parseFloat((parseInt(hex.slice(6, 8), 16) / 255).toFixed(3));
        return `rgba(${r},${g},${b},${a})`;
      }
    }
    // Try named color via colorToHex
    const hex = colorToHex(color.toLowerCase());
    if (hex && hex !== color.toLowerCase()) return normalizeColorToRGBA(hex);
    return null;
  }

  function compareColors(expected, actual) {
    const eRGBA = normalizeColorToRGBA(expected);
    const aRGBA = normalizeColorToRGBA(actual);
    if (eRGBA && aRGBA) return eRGBA === aRGBA;
    return colorToHex(expected) === colorToHex(actual);
  }

  // Shadow helpers — paren-safe splitting
  function splitShadowLayers(value) {
    const layers = []; let depth = 0; let cur = '';
    for (const ch of value) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { layers.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    if (cur.trim()) layers.push(cur.trim());
    return layers;
  }

  function normalizeSingleShadow(shadow) {
    shadow = shadow.trim();
    let color = '';
    const numericParts = [];

    const tokenized = shadow.replace(/rgba?\([^)]+\)/gi, match => {
      color = normalizeColorToRGBA(match) || match;
      return '__COLOR__';
    });

    tokenized.split(/\s+/).filter(Boolean).forEach(part => {
      if (part === '__COLOR__') return;
      if (part.startsWith('#')) { color = normalizeColorToRGBA(part) || part; return; }
      if (part.toLowerCase() === 'inset') { numericParts.push('inset'); return; }
      const num = resolveLength(part, null);
      if (num !== null) { numericParts.push(Math.round(num * 100) / 100); return; }
      const colorAttempt = normalizeColorToRGBA(part);
      if (colorAttempt) { color = colorAttempt; return; }
    });

    return JSON.stringify({ color, nums: numericParts });
  }

  function compareBoxShadows(expected, actual) {
    if (!expected && !actual) return true;
    const e = (expected || '').trim().toLowerCase();
    const a = (actual || '').trim().toLowerCase();
    if (e === 'none' && a === 'none') return true;
    if (e === 'none' || a === 'none') return e === a;

    const expLayers = splitShadowLayers(expected).map(normalizeSingleShadow);
    const actLayers = splitShadowLayers(actual).map(normalizeSingleShadow);
    if (expLayers.length !== actLayers.length) return false;

    return expLayers.every((expStr, i) => {
      const expObj = JSON.parse(expStr);
      const actObj = JSON.parse(actLayers[i]);
      if (expObj.color && actObj.color && expObj.color !== actObj.color) return false;
      if (expObj.nums.length !== actObj.nums.length) return false;
      return expObj.nums.every((en, j) => {
        const an = actObj.nums[j];
        if (en === 'inset' || an === 'inset') return en === an;
        return typeof en === 'number' && typeof an === 'number'
          ? Math.abs(en - an) <= NUMERIC_TOLERANCE
          : en === an;
      });
    });
  }

  function compareBackground(expected, actual) {
    const eColor = normalizeColorToRGBA(expected.trim());
    const aColor = normalizeColorToRGBA(actual.trim());
    if (eColor && aColor) return eColor === aColor;
    return normalizePropertyWithColors(expected) === normalizePropertyWithColors(actual);
  }

  function compareBorder(expected, actual) {
    const tokenize = (val) => {
      const tokens = [];
      const colorMap = {};
      let idx = 0;
      const cleaned = val.trim().replace(/rgba?\([^)]+\)/gi, match => {
        const key = `__CLR${idx}__`;
        colorMap[key] = normalizeColorToRGBA(match) || match;
        idx++;
        return key;
      });
      cleaned.split(/\s+/).filter(Boolean).forEach(part => {
        if (colorMap[part] !== undefined) {
          tokens.push({ type: 'color', value: colorMap[part] });
        } else if (part.startsWith('#')) {
          tokens.push({ type: 'color', value: normalizeColorToRGBA(part) || part });
        } else {
          const num = resolveLength(part, null);
          if (num !== null) tokens.push({ type: 'number', value: num });
          else tokens.push({ type: 'keyword', value: part.toLowerCase() });
        }
      });
      return tokens;
    };
    const expT = tokenize(expected);
    const actT = tokenize(actual);
    if (expT.length !== actT.length) return normalizeCSSValue(expected) === normalizeCSSValue(actual);
    return expT.every((et, i) => {
      const at = actT[i];
      if (et.type !== at.type) return false;
      if (et.type === 'number') return Math.abs(et.value - at.value) <= NUMERIC_TOLERANCE;
      return et.value === at.value;
    });
  }

  // Legacy alias used by normalizePropertyWithColors callers
  function normalizeBoxShadow(value) {
    if (!value) return '';
    try {
      return splitShadowLayers(value).map(normalizeSingleShadow).join('|');
    } catch (e) { return normalizeCSSValue(value); }
  }

  // Normalize properties that contain colors (box-shadow, border, etc.)
  function normalizePropertyWithColors(value) {
    if (!value) return '';
    
    // First, normalize whitespace
    value = value.replace(/\s+/g, ' ').trim();
    
    // Normalize leading decimal: ".1" → "0.1"
    value = value.replace(/(^|[\s,(])\.( \d)/g, '$10.$2');

    // Extract and convert rgb/rgba colors
    value = value.replace(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/gi, (match, r, g, b, a) => {
      const alpha = a ? parseFloat(a) : 1;
      if (alpha === 1 || !a) {
        const hex = '#' + [parseInt(r), parseInt(g), parseInt(b)].map(x => {
          const h = x.toString(16);
          return h.length === 1 ? '0' + h : h;
        }).join('');
        return hex;
      }
      return match;
    });
    
    // Extract and convert named colors (but only if they're standalone, not part of other words)
    // Use the same comprehensive list from colorToHex function
    const namedColors = {
      'aliceblue': '#f0f8ff', 'antiquewhite': '#faebd7', 'aqua': '#00ffff', 'aquamarine': '#7fffd4',
      'azure': '#f0ffff', 'beige': '#f5f5dc', 'bisque': '#ffe4c4', 'black': '#000000',
      'blanchedalmond': '#ffebcd', 'blue': '#0000ff', 'blueviolet': '#8a2be2', 'brown': '#a52a2a',
      'burlywood': '#deb887', 'cadetblue': '#5f9ea0', 'chartreuse': '#7fff00', 'chocolate': '#d2691e',
      'coral': '#ff7f50', 'cornflowerblue': '#6495ed', 'cornsilk': '#fff8dc', 'crimson': '#dc143c',
      'cyan': '#00ffff', 'darkblue': '#00008b', 'darkcyan': '#008b8b', 'darkgoldenrod': '#b8860b',
      'darkgray': '#a9a9a9', 'darkgrey': '#a9a9a9', 'darkgreen': '#006400', 'darkkhaki': '#bdb76b',
      'darkmagenta': '#8b008b', 'darkolivegreen': '#556b2f', 'darkorange': '#ff8c00', 'darkorchid': '#9932cc',
      'darkred': '#8b0000', 'darksalmon': '#e9967a', 'darkseagreen': '#8fbc8f', 'darkslateblue': '#483d8b',
      'darkslategray': '#2f4f4f', 'darkslategrey': '#2f4f4f', 'darkturquoise': '#00ced1', 'darkviolet': '#9400d3',
      'deeppink': '#ff1493', 'deepskyblue': '#00bfff', 'dimgray': '#696969', 'dimgrey': '#696969',
      'dodgerblue': '#1e90ff', 'firebrick': '#b22222', 'floralwhite': '#fffaf0', 'forestgreen': '#228b22',
      'fuchsia': '#ff00ff', 'gainsboro': '#dcdcdc', 'ghostwhite': '#f8f8ff', 'gold': '#ffd700',
      'goldenrod': '#daa520', 'gray': '#808080', 'grey': '#808080', 'green': '#008000',
      'greenyellow': '#adff2f', 'honeydew': '#f0fff0', 'hotpink': '#ff69b4', 'indianred': '#cd5c5c',
      'indigo': '#4b0082', 'ivory': '#fffff0', 'khaki': '#f0e68c', 'lavender': '#e6e6fa',
      'lavenderblush': '#fff0f5', 'lawngreen': '#7cfc00', 'lemonchiffon': '#fffacd', 'lightblue': '#add8e6',
      'lightcoral': '#f08080', 'lightcyan': '#e0ffff', 'lightgoldenrodyellow': '#fafad2', 'lightgray': '#d3d3d3',
      'lightgrey': '#d3d3d3', 'lightgreen': '#90ee90', 'lightpink': '#ffb6c1', 'lightsalmon': '#ffa07a',
      'lightseagreen': '#20b2aa', 'lightskyblue': '#87cefa', 'lightslategray': '#778899', 'lightslategrey': '#778899',
      'lightsteelblue': '#b0c4de', 'lightyellow': '#ffffe0', 'lime': '#00ff00', 'limegreen': '#32cd32',
      'linen': '#faf0e6', 'magenta': '#ff00ff', 'maroon': '#800000', 'mediumaquamarine': '#66cdaa',
      'mediumblue': '#0000cd', 'mediumorchid': '#ba55d3', 'mediumpurple': '#9370db', 'mediumseagreen': '#48c3cd',
      'mediumslateblue': '#7b68ee', 'mediumspringgreen': '#00fa9a', 'mediumturquoise': '#48d1cc', 'mediumvioletred': '#c71585',
      'midnightblue': '#191970', 'mintcream': '#f5fffa', 'mistyrose': '#ffe4e1', 'moccasin': '#ffe4b5',
      'navajowhite': '#ffdead', 'navy': '#000080', 'oldlace': '#fdf5e6', 'olive': '#808000',
      'olivedrab': '#6b8e23', 'orange': '#ffa500', 'orangered': '#ff4500', 'orchid': '#da70d6',
      'palegoldenrod': '#eee8aa', 'palegreen': '#98fb98', 'paleturquoise': '#afeeee', 'palevioletred': '#db7093',
      'papayawhip': '#ffefd5', 'peachpuff': '#ffdab9', 'peru': '#cd853f', 'pink': '#ffc0cb',
      'plum': '#dda0dd', 'powderblue': '#1e90ff', 'purple': '#800080', 'rebeccapurple': '#663399',
      'red': '#ff0000', 'rosybrown': '#bc8f8f', 'royalblue': '#4169e1', 'saddlebrown': '#8b4513',
      'salmon': '#fa8072', 'sandybrown': '#f4a460', 'seagreen': '#2e8b57', 'seashell': '#fff5ee',
      'sienna': '#a0522d', 'silver': '#c0c0c0', 'skyblue': '#87ceeb', 'slateblue': '#6a5acd',
      'slategray': '#708090', 'slategrey': '#708090', 'snow': '#fffafa', 'springgreen': '#00ff7f',
      'steelblue': '#4682b4', 'tan': '#d2b48c', 'teal': '#008080', 'thistle': '#d8bfd8',
      'tomato': '#ff6347', 'turquoise': '#40e0d0', 'violet': '#8b00ff', 'wheat': '#f5deb3',
      'white': '#ffffff', 'whitesmoke': '#f5f5f5', 'yellow': '#ffff00', 'yellowgreen': '#9acd32'
    };
    
    // Replace named colors (as whole words)
    Object.keys(namedColors).forEach(colorName => {
      const regex = new RegExp(`\\b${colorName}\\b`, 'gi');
      value = value.replace(regex, namedColors[colorName]);
    });
    
    // Normalize numeric values with units
    value = value.replace(/\b0(px|em|rem|pt|pc|in|cm|mm|ex|ch|vw|vh|vmin|vmax|deg|rad|grad|ms|s|Hz|kHz)\b/g, '0');
    
    // Normalize commas
    value = value.replace(/\s*,\s*/g, ',');
    
    // Normalize spaces around operators and values
    value = value.replace(/\s+/g, ' ').trim();
    
    return value.toLowerCase();
  }

  /**
   * compareTransition – browsers omit default values from computed transition:
   *   "ease" is the default timing-function → dropped → "0.2s ease" becomes "0.2s"
   *   "0s"   is the default delay          → dropped
   * We normalize both sides by injecting defaults before comparing.
   */
  function normalizeTransitionValue(val) {
    // Split by comma (multiple transitions), normalize each layer
    return val.split(',').map(layer => {
      const parts = layer.trim().split(/\s+/);
      // A transition layer is: <property> <duration> [<easing>] [<delay>]
      // Defaults: easing=ease, delay=0s
      // Browsers output: <property> <duration> <easing> <delay>  (all 4, no defaults dropped)
      // BUT some browsers drop "ease" when it's the only easing token after duration
      // Strategy: collect tokens, identify what each is, fill in defaults

      let prop = '';
      let duration = '';
      let easing = '';
      let delay = '';

      parts.forEach(p => {
        const pl = p.toLowerCase();
        // timing functions: ease, linear, ease-in, ease-out, ease-in-out, step-*, cubic-bezier
        if (/^(ease|linear|ease-in|ease-out|ease-in-out|step-(start|end)|steps\(|cubic-bezier\()/.test(pl)) {
          easing = pl;
        } else if (/^\d*\.?\d+(ms|s)$/.test(pl)) {
          // first time-value = duration, second = delay
          if (!duration) duration = pl;
          else delay = pl;
        } else if (pl !== '') {
          prop = pl;
        }
      });

      // Fill defaults
      if (!easing) easing = 'ease';
      if (!delay) delay = '0s';

      // Normalize time: "200ms" === "0.2s"
      const toSeconds = (t) => {
        if (t.endsWith('ms')) return parseFloat(t) / 1000 + 's';
        return t;
      };
      duration = toSeconds(duration);
      delay = toSeconds(delay);

      return [prop, duration, easing, delay].join(' ').trim();
    }).sort().join(', ');
  }

  function compareTransition(expected, actual) {
    return normalizeTransitionValue(expected) === normalizeTransitionValue(actual);
  }

  // Normalize CSS values for string-level comparison (last resort)
  function normalizeCSSValue(value) {
    if (!value) return '';
    // Strip !important — computed styles never include it
    value = value.replace(/\s*!important\s*/gi, '');
    value = value.replace(/\s+/g, ' ').trim();
    value = value.replace(/\s*,\s*/g, ',');
    // Normalize leading decimal: ".1" → "0.1"
    value = value.replace(/(^|[\s,(])\.( \d)/g, '$10.$2');
    // Strip units from zero values
    value = value.replace(/\b0(px|em|rem|pt|pc|in|cm|mm|ex|ch|vw|vh|vmin|vmax|deg|rad|grad|turn|ms|s|Hz|kHz)\b/g, '0');
    return value.toLowerCase();
  }


  // ========================================
  // AUTO FIX (Component-Based)
  // ========================================

  function autoFixViolations(components) {
    console.log('[UI Checker] Running auto-fix with components:', components ? components.length : 0);
    
    if (!components || components.length === 0) {
      return { success: false, fixedCount: 0, fixes: [] };
    }

    let totalFixedCount = 0;
    const fixes = [];

    // Process each component
    components.forEach(comp => {
      if (!comp.htmlTag || !comp.styles) return;

      // Parse component HTML to get tag and classes
      const parser = new DOMParser();
      const doc = parser.parseFromString(comp.htmlTag, 'text/html');
      const componentElement = doc.body.firstElementChild;
      if (!componentElement) return;

      const htmlTag = componentElement.tagName.toLowerCase();
      const htmlClasses = componentElement.className ? componentElement.className.split(/\s+/).filter(c => c) : [];
      
      // Parse CSS to extract ONLY base (non-pseudo-state) properties and values
      const cssRules = parseBaseRules(comp.styles);
      if (cssRules.length === 0) return;
      
      // Build selector to find matching elements on the page
      let selector = htmlTag;
      if (htmlClasses.length > 0) {
        selector += '.' + htmlClasses.join('.');
      }

      // Find all matching elements with errors
      let errorElements = [];
      try {
        const allMatchingElements = Array.from(document.querySelectorAll(selector));
        errorElements = allMatchingElements.filter(el => el.classList.contains('ui-check-error'));
      } catch (e) {
        console.warn('[UI Checker] Invalid selector:', selector);
        return;
      }

      if (errorElements.length === 0) return;

      // Apply CSS properties directly to each element
      errorElements.forEach(el => {
        let cssText = '';
        
        cssRules.forEach(rule => {
          // Strip !important from value — setProperty handles priority separately
          const isImportant = /!important/i.test(rule.value);
          const applyValue = rule.value.replace(/\s*!important\s*/gi, '').trim();
          // Apply with correct priority so inline style beats existing !important stylesheet rules
          el.style.setProperty(rule.property, applyValue, isImportant ? 'important' : 'important');
          cssText += `${rule.property}: ${rule.value};\n`;
        });

        totalFixedCount++;
        fixes.push({
          element: `${htmlTag}${htmlClasses.length > 0 ? '.' + htmlClasses.join('.') : ''}`,
          css: cssText.trim()
        });

        // Add fixed animation
        el.classList.add('ui-check-fixed');
        el.classList.remove('ui-check-error');
        setTimeout(() => el.classList.remove('ui-check-fixed'), 500);
      });
    });

    console.log('[UI Checker] Auto-fix complete:', { fixedCount: totalFixedCount, fixes: fixes.length });
    return { success: true, fixedCount: totalFixedCount, fixes };
  }

  // ========================================
  // GRID OVERLAY
  // ========================================

  function toggleSpacingGrid(active, gridSize = 32) {
    let grid = document.getElementById('ui-checker-spacing-grid');
    if (active) {
      if (!grid) {
        grid = document.createElement('div');
        grid.id = 'ui-checker-spacing-grid';
      }
      const lineSize = gridSize - 1;
      grid.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        pointer-events: none; z-index: 999999;
        background-image: 
          repeating-linear-gradient(0deg, transparent, transparent ${lineSize}px, rgba(99, 102, 241, 0.35) ${lineSize}px, rgba(99, 102, 241, 0.35) ${gridSize}px),
          repeating-linear-gradient(90deg, transparent, transparent ${lineSize}px, rgba(99, 102, 241, 0.35) ${lineSize}px, rgba(99, 102, 241, 0.35) ${gridSize}px);
        background-size: ${gridSize}px ${gridSize}px;
      `;
      if (!grid.parentElement) {
        document.body.appendChild(grid);
      }
    } else {
      if (grid) grid.remove();
    }
  }

  // ========================================
  // PAGE SCANNING
  // ========================================

  function scanPageForComponents() {
    const selectors = [
      '[data-ui]', '.mdl-button', '.mdl-js-button', '.mdl-textfield',
      '.mdl-js-textfield', '.mdl-card', '.mdl-dialog', '.mdl-layout__header',
      '.btn', '.button', '.card', '.modal', '.navbar', 'nav', 'dialog',
      'button', 'input', 'textarea', 'select'
    ];
    
    const allElements = new Set();
    selectors.forEach(selector => {
      try { 
        document.querySelectorAll(selector).forEach(el => allElements.add(el)); 
      } catch (e) {}
    });
    
    const components = [];
    allElements.forEach(el => {
      const type = detectElementType(el);
      const styles = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      
      components.push({
        type, 
        tagName: el.tagName.toLowerCase(), 
        className: el.className, 
        id: el.id,
        dataUi: el.dataset.ui || null,
        styles: {
          height: parseInt(styles.height) || 0, 
          width: parseInt(styles.width) || 0,
          borderRadius: parseInt(styles.borderRadius) || 0, 
          padding: styles.padding,
          margin: styles.margin, 
          backgroundColor: styles.backgroundColor,
          color: styles.color, 
          fontSize: styles.fontSize, 
          fontWeight: styles.fontWeight
        },
        position: { top: rect.top, left: rect.left }
      });
    });
    
    return { 
      url: window.location.href, 
      title: document.title, 
      totalComponents: components.length, 
      components 
    };
  }

  // ========================================
  // AI ANALYSIS ENGINE (Preserved)
  // ========================================

  function runAIAnalysis() {
    console.log('[UI Checker] Running AI Analysis...');
    
    const pageData = collectPageData();
    const analysis = {
      overallScore: 0,
      uxSuggestions: [],
      bestPractices: [],
      modernization: [],
      details: pageData
    };
    
    analyzeAccessibility(pageData, analysis);
    analyzePerformance(pageData, analysis);
    analyzeResponsiveness(pageData, analysis);
    analyzeVisualHierarchy(pageData, analysis);
    analyzeConsistency(pageData, analysis);
    analyzeModernStandards(pageData, analysis);
    analyzeUXPatterns(pageData, analysis);
    analyzeTypography(pageData, analysis);
    analyzeColorUsage(pageData, analysis);
    analyzeInteractions(pageData, analysis);
    
    analysis.overallScore = calculateOverallScore(analysis);
    
    console.log('[UI Checker] AI Analysis complete:', analysis);
    return analysis;
  }

  function collectPageData() {
    return {
      url: window.location.href,
      title: document.title,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      elements: {
        total: document.querySelectorAll('*').length,
        buttons: document.querySelectorAll('button, .btn, [role="button"]').length,
        links: document.querySelectorAll('a').length,
        images: document.querySelectorAll('img').length,
        inputs: document.querySelectorAll('input, textarea, select').length,
        headings: document.querySelectorAll('h1, h2, h3, h4, h5, h6').length,
        forms: document.querySelectorAll('form').length,
        videos: document.querySelectorAll('video').length,
        iframes: document.querySelectorAll('iframe').length
      },
      hasMetaViewport: !!document.querySelector('meta[name="viewport"]'),
      hasMetaDescription: !!document.querySelector('meta[name="description"]'),
      hasTitle: !!document.title,
      hasFavicon: !!document.querySelector('link[rel*="icon"]'),
      hasLang: !!document.documentElement.lang,
      hasAriaLabels: document.querySelectorAll('[aria-label], [aria-labelledby]').length,
      hasAltTexts: document.querySelectorAll('img[alt]').length,
      imagesWithoutAlt: document.querySelectorAll('img:not([alt])').length,
      colorScheme: detectColorScheme(),
      fontFamilies: detectFontFamilies(),
      hasDarkMode: detectDarkMode(),
      hasServiceWorker: 'serviceWorker' in navigator,
      isHTTPS: window.location.protocol === 'https:',
      loadTime: performance.now(),
      domDepth: calculateDOMDepth(),
      inlineStyles: document.querySelectorAll('[style]').length,
      inlineScripts: document.querySelectorAll('script:not([src])').length
    };
  }

  function calculateDOMDepth() {
    let maxDepth = 0;
    const walk = (el, depth) => {
      maxDepth = Math.max(maxDepth, depth);
      Array.from(el.children).forEach(child => walk(child, depth + 1));
    };
    walk(document.body, 0);
    return maxDepth;
  }

  function detectColorScheme() {
    return {
      background: getComputedStyle(document.body).backgroundColor,
      text: getComputedStyle(document.body).color
    };
  }

  function detectFontFamilies() {
    const fonts = new Set();
    document.querySelectorAll('*').forEach(el => {
      const font = getComputedStyle(el).fontFamily;
      if (font) fonts.add(font.split(',')[0].replace(/["']/g, ''));
    });
    return Array.from(fonts).slice(0, 5);
  }

  function detectDarkMode() {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const hasDarkClass = document.documentElement.classList.contains('dark') || 
                         document.body.classList.contains('dark');
    return prefersDark || hasDarkClass;
  }

  // Analysis modules (preserved from original)
  function analyzeAccessibility(data, analysis) {
    if (data.imagesWithoutAlt > 0) {
      analysis.uxSuggestions.push({
        title: 'Missing Alt Text',
        description: `${data.imagesWithoutAlt} images lack alt text. Add descriptive alt text for screen readers and SEO.`,
        priority: 'high'
      });
    }
    
    const interactiveElements = data.elements.buttons + data.elements.inputs + data.elements.links;
    const ariaRatio = data.hasAriaLabels / interactiveElements;
    if (ariaRatio < 0.3 && interactiveElements > 10) {
      analysis.bestPractices.push({
        title: 'Improve ARIA Usage',
        description: 'Add ARIA labels to interactive elements for better accessibility.',
        priority: 'medium'
      });
    }
    
    if (!data.hasLang) {
      analysis.bestPractices.push({
        title: 'Add Lang Attribute',
        description: 'Add lang attribute to HTML tag for screen readers.',
        priority: 'medium'
      });
    }
    
    const inputsWithoutLabels = Array.from(document.querySelectorAll('input, select, textarea')).filter(el => {
      const id = el.id;
      const ariaLabel = el.getAttribute('aria-label');
      const ariaLabelledBy = el.getAttribute('aria-labelledby');
      const hasLabel = id && document.querySelector(`label[for="${id}"]`);
      return !hasLabel && !ariaLabel && !ariaLabelledBy && !el.placeholder;
    }).length;
    
    if (inputsWithoutLabels > 0) {
      analysis.uxSuggestions.push({
        title: 'Unlabeled Form Inputs',
        description: `${inputsWithoutLabels} form inputs lack labels.`,
        priority: 'high'
      });
    }
    
    const elementsWithBadFocus = Array.from(document.querySelectorAll('a, button, input, textarea, select')).filter(el => {
      const style = getComputedStyle(el);
      return style.outline === 'none' && !style.boxShadow.includes('inset');
    }).length;
    
    if (elementsWithBadFocus > 5) {
      analysis.uxSuggestions.push({
        title: 'Poor Focus Indicators',
        description: 'Many interactive elements lack visible focus indicators.',
        priority: 'high'
      });
    }
    
    const lowContrastElements = checkColorContrast();
    if (lowContrastElements > 0) {
      analysis.uxSuggestions.push({
        title: 'Low Color Contrast',
        description: `Detected ${lowContrastElements} elements with potentially low contrast.`,
        priority: 'high'
      });
    }
  }

  function checkColorContrast() {
    let count = 0;
    const textElements = document.querySelectorAll('p, span, a, button, h1, h2, h3, h4, h5, h6, li');
    textElements.forEach(el => {
      const style = getComputedStyle(el);
      const fontSize = parseInt(style.fontSize);
      if (fontSize < 12) count++;
    });
    return count;
  }

  function analyzePerformance(data, analysis) {
    if (data.elements.total > 1500) {
      analysis.modernization.push({
        title: 'Optimize DOM Size',
        description: `Page has ${data.elements.total} elements.`,
        priority: 'medium'
      });
    }
    
    if (data.domDepth > 15) {
      analysis.bestPractices.push({
        title: 'Reduce DOM Nesting',
        description: `DOM depth is ${data.domDepth} levels.`,
        priority: 'low'
      });
    }
    
    if (data.inlineStyles > 50) {
      analysis.bestPractices.push({
        title: 'Move Styles to CSS',
        description: `${data.inlineStyles} elements use inline styles.`,
        priority: 'low'
      });
    }
    
    if (data.inlineScripts > 10) {
      analysis.bestPractices.push({
        title: 'Externalize Scripts',
        description: 'Multiple inline scripts detected.',
        priority: 'low'
      });
    }
    
    const largeImages = Array.from(document.querySelectorAll('img')).filter(img => {
      return img.naturalWidth > 2000 || img.naturalHeight > 2000;
    }).length;
    
    if (largeImages > 0) {
      analysis.modernization.push({
        title: 'Optimize Images',
        description: `${largeImages} large images detected.`,
        priority: 'medium'
      });
    }
  }

  function analyzeResponsiveness(data, analysis) {
    if (!data.hasMetaViewport) {
      analysis.uxSuggestions.push({
        title: 'Missing Viewport Meta',
        description: 'Add viewport meta tag for proper mobile rendering.',
        priority: 'high'
      });
    }
    
    const fixedWidthElements = Array.from(document.querySelectorAll('div, section, article, aside, header, footer, main')).filter(el => {
      const style = getComputedStyle(el);
      return style.width.includes('px') && !style.maxWidth && parseInt(style.width) > 500;
    }).length;
    
    if (fixedWidthElements > 5) {
      analysis.modernization.push({
        title: 'Use Responsive Units',
        description: 'Many elements use fixed pixel widths.',
        priority: 'medium'
      });
    }
    
    const smallTouchTargets = Array.from(document.querySelectorAll('button, a, input[type="checkbox"], input[type="radio"]')).filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.width < 44 || rect.height < 44;
    }).length;
    
    if (smallTouchTargets > 5) {
      analysis.uxSuggestions.push({
        title: 'Small Touch Targets',
        description: `${smallTouchTargets} interactive elements are smaller than 44x44px.`,
        priority: 'medium'
      });
    }
    
    const hasMediaQueries = Array.from(document.styleSheets).some(sheet => {
      try {
        return Array.from(sheet.cssRules || []).some(rule => rule.type === CSSRule.MEDIA_RULE);
      } catch (e) { return false; }
    });
    
    if (!hasMediaQueries && data.viewport.width > 500) {
      analysis.modernization.push({
        title: 'Add Media Queries',
        description: 'No media queries detected.',
        priority: 'high'
      });
    }
  }

  function analyzeVisualHierarchy(data, analysis) {
    const h1s = document.querySelectorAll('h1').length;
    
    if (h1s === 0) {
      analysis.bestPractices.push({
        title: 'Missing H1 Tag',
        description: 'Page lacks an H1 heading.',
        priority: 'high'
      });
    } else if (h1s > 1) {
      analysis.bestPractices.push({
        title: 'Multiple H1 Tags',
        description: 'Page has multiple H1 tags.',
        priority: 'medium'
      });
    }
    
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    let skippedLevels = 0;
    let prevLevel = 0;
    headings.forEach(h => {
      const level = parseInt(h.tagName[1]);
      if (level > prevLevel + 1) skippedLevels++;
      prevLevel = level;
    });
    
    if (skippedLevels > 0) {
      analysis.bestPractices.push({
        title: 'Skipped Heading Levels',
        description: 'Heading hierarchy is not sequential.',
        priority: 'low'
      });
    }
    
    const fontSizes = new Set();
    document.querySelectorAll('p, span, a, button').forEach(el => {
      fontSizes.add(getComputedStyle(el).fontSize);
    });
    
    if (fontSizes.size > 15) {
      analysis.bestPractices.push({
        title: 'Inconsistent Font Sizes',
        description: `Detected ${fontSizes.size} different font sizes.`,
        priority: 'low'
      });
    }
  }

  function analyzeConsistency(data, analysis) {
    const borderRadii = new Set();
    document.querySelectorAll('button, input, .card, .modal, div').forEach(el => {
      const radius = getComputedStyle(el).borderRadius;
      if (radius !== '0px') borderRadii.add(radius);
    });
    
    if (borderRadii.size > 5) {
      analysis.bestPractices.push({
        title: 'Inconsistent Border Radius',
        description: 'Multiple border radius values detected.',
        priority: 'low'
      });
    }
    
    const colors = new Set();
    document.querySelectorAll('button, a, div, span').forEach(el => {
      const bg = getComputedStyle(el).backgroundColor;
      const color = getComputedStyle(el).color;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') colors.add(bg);
      if (color) colors.add(color);
    });
    
    if (colors.size > 20) {
      analysis.bestPractices.push({
        title: 'Too Many Colors',
        description: `Detected ${colors.size} different colors.`,
        priority: 'low'
      });
    }
    
    const paddings = new Set();
    document.querySelectorAll('div, section, article').forEach(el => {
      paddings.add(getComputedStyle(el).padding);
    });
    
    if (paddings.size > 15) {
      analysis.bestPractices.push({
        title: 'Inconsistent Spacing',
        description: 'Many different padding values.',
        priority: 'low'
      });
    }
  }

  function analyzeModernStandards(data, analysis) {
    if (!data.isHTTPS && !data.url.includes('localhost')) {
      analysis.modernization.push({
        title: 'Enable HTTPS',
        description: 'Site is not using HTTPS.',
        priority: 'high'
      });
    }
    
    const images = document.querySelectorAll('img');
    const hasWebP = Array.from(images).some(img => img.src.includes('.webp'));
    
    if (!hasWebP && images.length > 5) {
      analysis.modernization.push({
        title: 'Use WebP Images',
        description: 'Consider using WebP format.',
        priority: 'medium'
      });
    }
    
    const usesFlexbox = Array.from(document.styleSheets).some(sheet => {
      try {
        return Array.from(sheet.cssRules || []).some(rule => 
          rule.cssText && (rule.cssText.includes('display: flex') || rule.cssText.includes('display:flex'))
        );
      } catch (e) { return false; }
    });
    
    const usesGrid = Array.from(document.styleSheets).some(sheet => {
      try {
        return Array.from(sheet.cssRules || []).some(rule => 
          rule.cssText && (rule.cssText.includes('display: grid') || rule.cssText.includes('display:grid'))
        );
      } catch (e) { return false; }
    });
    
    const floatElements = document.querySelectorAll('[style*="float:"], [style*="float :"]').length;
    
    if (floatElements > 10 && !usesFlexbox && !usesGrid) {
      analysis.modernization.push({
        title: 'Modernize Layout',
        description: 'Using float-based layouts.',
        priority: 'medium'
      });
    }
    
    const usesCSSVariables = Array.from(document.styleSheets).some(sheet => {
      try {
        return Array.from(sheet.cssRules || []).some(rule => 
          rule.cssText && rule.cssText.includes('--')
        );
      } catch (e) { return false; }
    });
    
    if (!usesCSSVariables) {
      analysis.modernization.push({
        title: 'Use CSS Variables',
        description: 'No CSS custom properties detected.',
        priority: 'low'
      });
    }
  }

  function analyzeUXPatterns(data, analysis) {
    const hasLoadingIndicator = document.querySelector('.loading, .spinner, [class*="loading"], [class*="spinner"]');
    const hasAsyncContent = document.querySelector('[data-async], [data-loading]');
    
    if (hasAsyncContent && !hasLoadingIndicator) {
      analysis.uxSuggestions.push({
        title: 'Add Loading States',
        description: 'Async content detected without loading indicators.',
        priority: 'medium'
      });
    }
    
    const lists = document.querySelectorAll('ul, ol, table');
    const emptyLists = Array.from(lists).filter(list => list.children.length === 0).length;
    
    if (emptyLists > 0) {
      analysis.uxSuggestions.push({
        title: 'Handle Empty States',
        description: 'Empty lists/tables detected.',
        priority: 'low'
      });
    }
    
    const hasErrorMessages = document.querySelector('.error, .alert, [role="alert"]');
    const forms = document.querySelectorAll('form');
    
    if (forms.length > 0 && !hasErrorMessages) {
      analysis.uxSuggestions.push({
        title: 'Add Error Messages',
        description: 'Forms should have visible error message containers.',
        priority: 'medium'
      });
    }
    
    const hasBreadcrumbs = document.querySelector('.breadcrumb, [class*="breadcrumb"], nav[aria-label*="breadcrumb"]');
    const isDeepPage = data.url.split('/').length > 4;
    
    if (isDeepPage && !hasBreadcrumbs) {
      analysis.uxSuggestions.push({
        title: 'Add Breadcrumbs',
        description: 'Deep page structure detected.',
        priority: 'low'
      });
    }
    
    const hasSearch = document.querySelector('input[type="search"], [role="search"]');
    if (data.elements.total > 100 && !hasSearch) {
      analysis.uxSuggestions.push({
        title: 'Add Search',
        description: 'Large page with many elements.',
        priority: 'low'
      });
    }
    
    const hasBackToTop = document.querySelector('.back-to-top, [class*="back-to-top"], #back-to-top');
    const pageHeight = document.documentElement.scrollHeight;
    
    if (pageHeight > 3000 && !hasBackToTop) {
      analysis.uxSuggestions.push({
        title: 'Add Back-to-Top Button',
        description: 'Long page detected.',
        priority: 'low'
      });
    }
    
    const hasStickyHeader = Array.from(document.querySelectorAll('header, nav')).some(el => {
      const style = getComputedStyle(el);
      return style.position === 'sticky' || style.position === 'fixed';
    });
    
    if (pageHeight > 2000 && !hasStickyHeader) {
      analysis.uxSuggestions.push({
        title: 'Consider Sticky Navigation',
        description: 'Long page without sticky navigation.',
        priority: 'low'
      });
    }
  }

  function analyzeTypography(data, analysis) {
    const usesWebFonts = document.querySelector('link[href*="fonts"], link[rel="preconnect"]');
    const fontPreload = document.querySelector('link[rel="preload"][as="font"]');
    
    if (usesWebFonts && !fontPreload) {
      analysis.modernization.push({
        title: 'Preload Web Fonts',
        description: 'Preload critical web fonts.',
        priority: 'medium'
      });
    }
    
    const tightLineHeight = Array.from(document.querySelectorAll('p')).filter(p => {
      const lh = parseFloat(getComputedStyle(p).lineHeight);
      const fs = parseFloat(getComputedStyle(p).fontSize);
      return lh / fs < 1.4;
    }).length;
    
    if (tightLineHeight > 5) {
      analysis.uxSuggestions.push({
        title: 'Increase Line Height',
        description: 'Text has tight line height.',
        priority: 'low'
      });
    }
    
    const textOnImages = Array.from(document.querySelectorAll('h1, h2, h3, p')).filter(el => {
      const rect = el.getBoundingClientRect();
      const hasImageBehind = Array.from(document.querySelectorAll('img, video, [style*="background-image"]')).some(img => {
        const imgRect = img.getBoundingClientRect();
        return !(rect.right < imgRect.left || rect.left > imgRect.right || 
                 rect.bottom < imgRect.top || rect.top > imgRect.bottom);
      });
      return hasImageBehind;
    }).length;
    
    if (textOnImages > 3) {
      analysis.uxSuggestions.push({
        title: 'Text on Images',
        description: 'Text over images detected.',
        priority: 'medium'
      });
    }
  }

  function analyzeColorUsage(data, analysis) {
    if (!data.hasDarkMode) {
      analysis.modernization.push({
        title: 'Add Dark Mode',
        description: 'Consider adding dark mode support.',
        priority: 'low'
      });
    }
    
    const pureBlackText = Array.from(document.querySelectorAll('p, span, h1, h2, h3, h4, h5, h6')).filter(el => {
      return getComputedStyle(el).color === 'rgb(0, 0, 0)';
    }).length;
    
    if (pureBlackText > 10) {
      analysis.uxSuggestions.push({
        title: 'Use Off-Black Text',
        description: 'Pure black (#000) can cause eye strain.',
        priority: 'low'
      });
    }
  }

  function analyzeInteractions(data, analysis) {
    const hasHoverEffects = Array.from(document.styleSheets).some(sheet => {
      try {
        return Array.from(sheet.cssRules || []).some(rule => 
          rule.cssText && rule.cssText.includes(':hover')
        );
      } catch (e) { return false; }
    });
    
    const buttons = document.querySelectorAll('button, .btn');
    if (buttons.length > 5 && !hasHoverEffects) {
      analysis.uxSuggestions.push({
        title: 'Add Hover Effects',
        description: 'Buttons lack hover states.',
        priority: 'low'
      });
    }
    
    const hasTransitions = Array.from(document.styleSheets).some(sheet => {
      try {
        return Array.from(sheet.cssRules || []).some(rule => 
          rule.cssText && rule.cssText.includes('transition')
        );
      } catch (e) { return false; }
    });
    
    if (!hasTransitions) {
      analysis.modernization.push({
        title: 'Add CSS Transitions',
        description: 'No CSS transitions detected.',
        priority: 'low'
      });
    }
    
    const hasHeavyAnimations = Array.from(document.styleSheets).some(sheet => {
      try {
        return Array.from(sheet.cssRules || []).some(rule => 
          rule.cssText && (rule.cssText.includes('animation') && 
          (rule.cssText.includes('box-shadow') || rule.cssText.includes('filter')))
        );
      } catch (e) { return false; }
    });
    
    if (hasHeavyAnimations) {
      analysis.modernization.push({
        title: 'Optimize Animations',
        description: 'Avoid animating box-shadow and filter.',
        priority: 'medium'
      });
    }
  }

  function calculateOverallScore(analysis) {
    let score = 100;
    
    const highPriorityIssues = 
      analysis.uxSuggestions.filter(s => s.priority === 'high').length +
      analysis.bestPractices.filter(s => s.priority === 'high').length +
      analysis.modernization.filter(s => s.priority === 'high').length;
    score -= highPriorityIssues * 15;
    
    const mediumPriorityIssues = 
      analysis.uxSuggestions.filter(s => s.priority === 'medium').length +
      analysis.bestPractices.filter(s => s.priority === 'medium').length +
      analysis.modernization.filter(s => s.priority === 'medium').length;
    score -= mediumPriorityIssues * 8;
    
    const lowPriorityIssues = 
      analysis.uxSuggestions.filter(s => s.priority === 'low').length +
      analysis.bestPractices.filter(s => s.priority === 'low').length +
      analysis.modernization.filter(s => s.priority === 'low').length;
    score -= lowPriorityIssues * 3;
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  // ========================================
  // QUALITY ANALYSIS (Preserved)
  // ========================================

  function analyzePageQuality(savedComponents) {
    const scores = {
      performance: analyzePerformanceScore(),
      accessibility: analyzeAccessibilityScore(),
      bestPractices: analyzeBestPracticesScore(savedComponents),
      seo: analyzeSEOScore(),
      overall: 0
    };
    
    scores.overall = Math.round(
      (scores.performance + scores.accessibility + scores.bestPractices + scores.seo) / 4
    );
    
    return scores;
  }

  function analyzePerformanceScore() {
    let score = 100;
    
    const domSize = document.querySelectorAll('*').length;
    if (domSize > 1500) {
      score -= 20;
    } else if (domSize > 800) {
      score -= 10;
    }
    
    const inlineStyles = document.querySelectorAll('[style]').length;
    if (inlineStyles > 50) {
      score -= 15;
    } else if (inlineStyles > 20) {
      score -= 8;
    }
    
    const images = document.querySelectorAll('img');
    let unoptimizedImages = 0;
    images.forEach(img => {
      if (!img.loading || img.loading !== 'lazy') unoptimizedImages++;
      if (!img.srcset) unoptimizedImages++;
    });
    if (unoptimizedImages > images.length * 0.5) {
      score -= 15;
    }
    
    const scripts = document.querySelectorAll('script[src]').length;
    if (scripts > 15) {
      score -= 10;
    }
    
    const stylesheets = document.querySelectorAll('link[rel="stylesheet"]').length;
    if (stylesheets > 10) {
      score -= 10;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  function analyzeAccessibilityScore() {
    let score = 100;
    
    const images = document.querySelectorAll('img');
    let missingAlt = 0;
    images.forEach(img => {
      if (!img.alt || img.alt.trim() === '') missingAlt++;
    });
    if (missingAlt > 0) {
      score -= Math.min(30, missingAlt * 3);
    }
    
    const inputs = document.querySelectorAll('input, select, textarea');
    let unlabeledInputs = 0;
    inputs.forEach(input => {
      const id = input.id;
      const hasLabel = id && document.querySelector(`label[for="${id}"]`);
      const hasAriaLabel = input.getAttribute('aria-label');
      if (!hasLabel && !hasAriaLabel) unlabeledInputs++;
    });
    if (unlabeledInputs > 0) {
      score -= Math.min(25, unlabeledInputs * 5);
    }
    
    const buttons = document.querySelectorAll('button');
    let unnamedButtons = 0;
    buttons.forEach(btn => {
      const hasText = btn.textContent.trim() !== '';
      const hasAriaLabel = btn.getAttribute('aria-label');
      if (!hasText && !hasAriaLabel) unnamedButtons++;
    });
    if (unnamedButtons > 0) {
      score -= Math.min(20, unnamedButtons * 4);
    }
    
    const h1Count = document.querySelectorAll('h1').length;
    if (h1Count === 0) {
      score -= 15;
    } else if (h1Count > 1) {
      score -= 10;
    }
    
    const hasMain = document.querySelector('main, [role="main"]');
    if (!hasMain) {
      score -= 8;
    }
    
    if (!document.documentElement.lang) {
      score -= 10;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  function analyzeBestPracticesScore(savedComponents) {
    let score = 100;
    
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
      score -= 20;
    }
    
    const images = document.querySelectorAll('img[src]');
    let modernFormats = 0;
    images.forEach(img => {
      const src = img.src.toLowerCase();
      if (src.includes('.webp') || src.includes('.avif')) modernFormats++;
    });
    if (images.length > 0 && modernFormats / images.length < 0.3) {
      score -= 15;
    }
    
    const viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) {
      score -= 15;
    }
    
    if (savedComponents.length > 0) {
      const componentTypes = {};
      savedComponents.forEach(comp => {
        const type = comp.componentType || 'custom';
        if (!componentTypes[type]) componentTypes[type] = [];
        componentTypes[type].push(comp);
      });
      
      Object.entries(componentTypes).forEach(([type, comps]) => {
        if (comps.length > 1) {
          const styles = comps.map(c => c.styles || '');
          const uniqueStyles = new Set(styles);
          if (uniqueStyles.size > 1) {
            score -= 5;
          }
        }
      });
    }
    
    const stylesheets = Array.from(document.styleSheets);
    let usesModernCSS = false;
    try {
      stylesheets.forEach(sheet => {
        try {
          const rules = Array.from(sheet.cssRules || []);
          rules.forEach(rule => {
            if (rule.cssText && (
              rule.cssText.includes('display: grid') ||
              rule.cssText.includes('display: flex') ||
              rule.cssText.includes('var(--')
            )) {
              usesModernCSS = true;
            }
          });
        } catch (e) {}
      });
    } catch (e) {}
    
    if (!usesModernCSS) {
      score -= 10;
    }
    
    const deprecated = document.querySelectorAll('font, center, marquee, blink');
    if (deprecated.length > 0) {
      score -= 15;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  function analyzeSEOScore() {
    let score = 100;
    
    const title = document.querySelector('title');
    if (!title || title.textContent.trim() === '') {
      score -= 20;
    } else if (title.textContent.length < 30 || title.textContent.length > 60) {
      score -= 10;
    }
    
    const description = document.querySelector('meta[name="description"]');
    if (!description || !description.content) {
      score -= 20;
    } else if (description.content.length < 120 || description.content.length > 160) {
      score -= 10;
    }
    
    const h1 = document.querySelector('h1');
    if (!h1) {
      score -= 15;
    }
    
    const images = document.querySelectorAll('img');
    let missingAlt = 0;
    images.forEach(img => {
      if (!img.alt) missingAlt++;
    });
    if (missingAlt > 0) {
      score -= Math.min(20, missingAlt * 2);
    }
    
    const canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      score -= 10;
    }
    
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogDescription = document.querySelector('meta[property="og:description"]');
    const ogImage = document.querySelector('meta[property="og:image"]');
    if (!ogTitle || !ogDescription || !ogImage) {
      score -= 10;
    }
    
    const structuredData = document.querySelector('script[type="application/ld+json"]');
    if (!structuredData) {
      score -= 5;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  console.log('[UI Checker] Content script loaded successfully');
})();