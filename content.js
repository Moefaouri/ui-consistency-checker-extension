// Content script for UI Consistency Checker
// Component-Based Architecture (No Legacy Rules)
// @version 1.5.1

(function() {
  'use strict';
  
  if (window.uiCheckerInjected) return;
  window.uiCheckerInjected = true;

  const MAX_REPORTED_ISSUES = 250;
  const MAX_VIOLATIONS_PER_ISSUE = 12;
  const MAX_ELEMENTS_PER_SELECTOR = 2000;
  const MAX_TOTAL_ELEMENT_CHECKS = 10000;
  const MAX_SELECTOR_TASKS = 5000;
  const MAX_CASCADE_ELEMENTS = 250;
  const MAX_REPORTED_FIXES = 200;
  const MAX_FIX_DECLARATIONS = 5000;
  const MAX_SCANNED_COMPONENTS = 1000;
  const MAX_CLASS_AUDIT_ELEMENTS = 50000;
  const AI_MAX_ELEMENTS = 600;
  const AI_MAX_TEXT_CHARS = 14000;
  const AI_MAX_CSS_CHARS = 70000;
  const AI_MAX_TOKENS = 240;
  const AI_PREVIEW_STYLE_ID = 'ui-checker-ai-preview';
  const AI_PICKER_STYLE_ID = 'ui-checker-ai-picker-style';
  let aiPickerCleanup = null;
  let aiPageMutationVersion = 0;
  const CSS_WIDE_KEYWORDS = /^(unset|initial|inherit|revert|revert-layer|normal)$/i;
  const UNTESTABLE_SELECTOR = /:(hover|focus|focus-within|focus-visible|active|visited|has\(|-webkit)|::[a-z-]+/i;
  const parsedCssCache = new Map();
  let computedStyleCache = new WeakMap();
  let displayNoneCache = new WeakMap();
  let matchedCascadeRulesCache = new WeakMap();
  let flattenedCascadeRules = null;
  let rootFontSizeCache = null;
  let cascadeElementCount = 0;
  let lastFailedDeclarations = [];
  let lastOmittedFixDeclarationCount = 0;
  let lastCheckedCatalogSignature = '';
  let namedColorsCache = null;
  let namedColorPatternCache = null;
  let declarationExpansionStyle = null;
  const colorHexCache = new Map();

  console.log('[UI Checker] Content script injected');

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[UI Checker] Received message:', request.action);
    
    try {
      if (request.action === 'ping') {
        sendResponse({ success: true, message: 'pong' });
        return true;
      } else if (request.action === 'runCheck') {
        const result = runConsistencyCheckOptimized(request.components, request.classInventory);
        sendResponse(result);
        return true;
      } else if (request.action === 'autoFix') {
        const result = autoFixViolationsOptimized(request.components);
        sendResponse(result);
        return true;
      } else if (request.action === 'toggleGrid') {
        toggleSpacingGrid(request.active, request.gridSize || 32);
        sendResponse({ success: true });
        return true;
      } else if (request.action === 'scanPage') {
        const result = scanPageForComponentsOptimized();
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
      } else if (request.action === 'captureAIContext') {
        const result = captureAIPageContext(request.options || {});
        sendResponse({ success: true, context: result });
        return true;
      } else if (request.action === 'getAIPageVersion') {
        sendResponse({ success: true, mutationVersion: aiPageMutationVersion, url: safeAIPageUrl(location.href) });
        return true;
      } else if (request.action === 'startAIElementPicker') {
        startAIElementPicker();
        sendResponse({ success: true });
        return true;
      } else if (request.action === 'cancelAIElementPicker') {
        stopAIElementPicker();
        sendResponse({ success: true });
        return true;
      } else if (request.action === 'previewAICss') {
        const css = applyAICssPreview(request.css);
        sendResponse({ success: true, bytes: css.length });
        return true;
      } else if (request.action === 'clearAICssPreview') {
        clearAICssPreview();
        sendResponse({ success: true });
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
  // AI DESIGN CONTEXT + SAFE CSS PREVIEW
  // ========================================

  const aiMutationObserver = new MutationObserver(() => { aiPageMutationVersion++; });
  aiMutationObserver.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });

  function captureAIPageContext(options = {}) {
    const includeText = options.includeText === true;
    const profile = ['focused', 'accessibility', 'form', 'article', 'broad'].includes(options.profile) ? options.profile : 'broad';
    const capturedText = new Set();
    const hasArticleRoot = Boolean(document.querySelector('main,article,[role="main"]'));
    const rootStyles = window.getComputedStyle(document.documentElement);
    const tokens = {};
    for (const property of Array.from(rootStyles)) {
      if (!property.startsWith('--') || Object.keys(tokens).length >= AI_MAX_TOKENS) continue;
      const value = sanitizeCSSValue(rootStyles.getPropertyValue(property));
      if (value) tokens[property] = value.slice(0, 300);
    }

    const elements = [];
    let includedTextChars = 0;
    let visited = 0;
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_ELEMENT);
    let element = walker.currentNode;
    while (element && elements.length < AI_MAX_ELEMENTS && visited < AI_MAX_ELEMENTS * 20) {
      visited++;
      if (isUsefulAIElement(element)) {
        const styles = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const inRelevantRegion = profile === 'article'
          ? (hasArticleRoot ? Boolean(element.closest('main,article,[role="main"]')) : rect.bottom > -window.innerHeight && rect.top < window.innerHeight * 6)
          : profile === 'form'
            ? Boolean(element.closest('form,[role="form"]')) || (rect.bottom > -window.innerHeight && rect.top < window.innerHeight * 3)
            : profile === 'accessibility'
              ? element.matches('h1,h2,h3,h4,h5,h6,header,nav,main,aside,footer,button,a,input,textarea,select,label,[role],[aria-label]')
              : rect.bottom > -window.innerHeight && rect.top < window.innerHeight * 3;
        if (styles.display !== 'none' && styles.visibility !== 'hidden' && rect.width > 0 && rect.height > 0 && inRelevantRegion) {
          const record = {
            selector: describeAIElement(element),
            tag: element.tagName.toLowerCase(),
            role: element.getAttribute('role') || undefined,
            box: {
              x: roundAI(rect.x + window.scrollX),
              y: roundAI(rect.y + window.scrollY),
              width: roundAI(rect.width),
              height: roundAI(rect.height)
            },
            style: pickAIComputedStyles(styles)
          };
          const semantics = collectAISemantics(element);
          if (Object.keys(semantics).length) record.semantics = semantics;
          if (includeText && includedTextChars < AI_MAX_TEXT_CHARS && !isSensitiveFormControl(element)) {
            const text = getAIDirectText(element).slice(0, Math.min(220, AI_MAX_TEXT_CHARS - includedTextChars));
            if (text && !capturedText.has(text.toLowerCase())) {
              record.text = text;
              includedTextChars += text.length;
              capturedText.add(text.toLowerCase());
            }
          }
          elements.push(record);
        }
      }
      element = walker.nextNode();
    }

    const stylesheetResult = profile === 'accessibility'
      ? { css: '', sources: [] }
      : collectAIStylesheets(profile === 'focused' ? 26000 : AI_MAX_CSS_CHARS);
    const allElements = document.getElementsByTagName('*').length;
    return {
      schemaVersion: 1,
      profile,
      mutationVersion: aiPageMutationVersion,
      capturedAt: new Date().toISOString(),
      page: {
        title: redactSensitiveText(document.title || '').slice(0, 240),
        url: safeAIPageUrl(location.href),
        language: document.documentElement.lang || 'unknown',
        direction: document.documentElement.dir || rootStyles.direction || 'ltr',
        colorScheme: rootStyles.colorScheme || 'normal',
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio || 1,
          scrollX: roundAI(window.scrollX),
          scrollY: roundAI(window.scrollY)
        },
        document: {
          width: Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0),
          height: Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)
        }
      },
      summary: {
        totalElements: allElements,
        capturedElements: elements.length,
        omittedElements: Math.max(0, allElements - elements.length),
        headings: document.querySelectorAll('h1,h2,h3,h4,h5,h6').length,
        landmarks: document.querySelectorAll('header,nav,main,aside,footer,[role="main"],[role="navigation"]').length,
        links: document.links.length,
        buttons: document.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"]').length,
        formControls: document.querySelectorAll('input,textarea,select').length,
        images: document.images.length,
        includeVisibleText: includeText,
        visibleTextCharacters: includedTextChars,
        stylesheetCharacters: stylesheetResult.css.length
      },
      privacy: {
        screenshotSafe: isAIScreenshotSafe(),
        excluded: [
          'form values', 'passwords', 'cookies', 'web storage', 'scripts',
          'URL query strings', 'URL fragments', 'cross-origin frame contents', 'CSS URLs'
        ]
      },
      designTokens: tokens,
      elements,
      stylesheets: stylesheetResult.sources,
      authoredCSS: stylesheetResult.css
    };
  }

  function isAIScreenshotSafe() {
    return !Array.from(document.querySelectorAll('input,textarea,[contenteditable="true"]')).some(control => {
      const styles = window.getComputedStyle(control);
      const rect = control.getBoundingClientRect();
      if (styles.display === 'none' || styles.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) return false;
      // A screenshot cannot redact pixels reliably. If any editable control is
      // visible, omit the screenshot and rely on the already-sanitized DOM.
      return true;
    });
  }

  function collectAISemantics(element) {
    const result = {};
    for (const name of ['aria-label', 'aria-labelledby', 'aria-describedby', 'aria-expanded', 'aria-pressed', 'aria-current', 'aria-live', 'alt', 'title', 'type', 'name', 'for']) {
      if (!element.hasAttribute(name)) continue;
      if (name === 'name' && element.matches('input,textarea,select')) continue;
      const value = redactSensitiveText(element.getAttribute(name) || '').slice(0, 240);
      if (value) result[name] = value;
    }
    if (element.matches('input,textarea,select')) {
      result.control = element.tagName.toLowerCase();
      result.disabled = element.disabled === true;
      result.required = element.required === true;
      result.valid = typeof element.checkValidity === 'function' ? element.checkValidity() : undefined;
    }
    return result;
  }

  function isUsefulAIElement(element) {
    if (!(element instanceof Element)) return false;
    const tag = element.tagName.toLowerCase();
    if (['script', 'style', 'noscript', 'template', 'iframe', 'object', 'embed', 'source', 'track', 'path', 'option'].includes(tag)) return false;
    if (element.id === AI_PREVIEW_STYLE_ID) return false;
    if (element.closest && element.closest('.ui-check-grid-overlay,.ui-check-tooltip')) return false;
    const marker = `${element.id || ''} ${element.className || ''} ${element.getAttribute('data-testid') || ''}`;
    if (/\b(?:analytics|tracking|tracker|pixel|advert|cookie-banner|telemetry)\b/i.test(marker)) return false;
    return true;
  }

  function isSensitiveFormControl(element) {
    return element.matches('input,textarea,select,option') || Boolean(element.closest('input,textarea,select'));
  }

  function describeAIElement(element) {
    const parts = [];
    let current = element;
    for (let depth = 0; current && current.nodeType === Node.ELEMENT_NODE && depth < 3; depth++) {
      let part = current.tagName.toLowerCase();
      if (current.id) {
        part += `#${sanitizeAIIdentifier(current.id)}`;
        parts.unshift(part);
        break;
      }
      const classes = Array.from(current.classList || [])
        .filter(name => name && !name.startsWith('ui-check-'))
        .slice(0, 5)
        .map(sanitizeAIIdentifier)
        .filter(Boolean);
      if (classes.length) part += `.${classes.join('.')}`;
      parts.unshift(part);
      current = current.parentElement;
    }
    return parts.join(' > ').slice(0, 320);
  }

  function sanitizeAIIdentifier(value) {
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  }

  function getAIDirectText(element) {
    const direct = Array.from(element.childNodes)
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent || '')
      .join(' ');
    const fallback = direct.trim() || element.getAttribute('aria-label') || element.getAttribute('title') || '';
    return redactSensitiveText(fallback).replace(/\s+/g, ' ').trim();
  }

  function redactSensitiveText(value) {
    return String(value)
      .replace(/\b(?:sk|sk-ant|rk)-[a-zA-Z0-9_-]{12,}\b/g, '[redacted-api-key]')
      .replace(/\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g, '[redacted-token]')
      .replace(/\bBearer\s+[a-zA-Z0-9._~-]{12,}\b/gi, 'Bearer [redacted]')
      .replace(/\b(?:password|passwd|secret|token)\s*[:=]\s*\S+/gi, '$1=[redacted]')
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
      .replace(/\b(?:\+?\d[\d ().-]{7,}\d)\b/g, '[redacted-phone]')
      .replace(/\b(?:\d[ -]*?){13,19}\b/g, '[redacted-number]');
  }

  function pickAIComputedStyles(styles) {
    const names = [
      'display', 'position', 'flex-direction', 'flex-wrap', 'align-items', 'justify-content',
      'grid-template-columns', 'gap', 'padding', 'margin', 'overflow', 'z-index',
      'color', 'background-color', 'border', 'border-radius', 'box-shadow', 'opacity',
      'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-align'
    ];
    const result = {};
    for (const name of names) {
      const value = styles.getPropertyValue(name).trim();
      if (value && value !== 'none' && value !== 'normal' && value !== 'auto' && value !== '0px') {
        result[name] = sanitizeCSSValue(value).slice(0, 240);
      }
    }
    return result;
  }

  function collectAIStylesheets(maxCharacters = AI_MAX_CSS_CHARS) {
    const sources = [];
    let css = '';
    for (const sheet of Array.from(document.styleSheets)) {
      if (css.length >= maxCharacters) break;
      const source = safeAIPageUrl(sheet.href || 'inline');
      if (source.startsWith('chrome-extension:')) continue;
      let rules;
      try {
        rules = Array.from(sheet.cssRules || []);
      } catch (error) {
        sources.push({ source, accessible: false, reason: 'cross-origin stylesheet' });
        continue;
      }
      let added = 0;
      for (const rule of rules) {
        const ruleText = sanitizeAICSSForContext(rule.cssText || '');
        if (!ruleText) continue;
        const remaining = maxCharacters - css.length;
        css += `${ruleText.slice(0, remaining)}\n`;
        added++;
        if (css.length >= maxCharacters) break;
      }
      sources.push({ source, accessible: true, capturedRules: added });
    }
    return { css: css.trim(), sources };
  }

  function sanitizeAICSSForContext(value) {
    return String(value)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/url\s*\([^)]*\)/gi, 'url([redacted])')
      .replace(/sourceMappingURL\s*=\s*\S+/gi, 'sourceMappingURL=[redacted]')
      .trim();
  }

  function sanitizeCSSValue(value) {
    return String(value).replace(/url\s*\([^)]*\)/gi, 'url([redacted])').trim();
  }

  function safeAIPageUrl(value) {
    if (!value || value === 'inline') return value || 'inline';
    try {
      const parsed = new URL(value, location.href);
      if (!['http:', 'https:', 'file:'].includes(parsed.protocol)) return parsed.protocol;
      return `${parsed.origin}${parsed.pathname}`.slice(0, 500);
    } catch (error) {
      return 'unavailable';
    }
  }

  function roundAI(value) {
    return Math.round(Number(value) * 10) / 10;
  }

  function startAIElementPicker() {
    stopAIElementPicker();
    const style = document.createElement('style');
    style.id = AI_PICKER_STYLE_ID;
    style.textContent = `
      .ui-checker-ai-picked-hover { outline: 2px solid #8bd0ef !important; outline-offset: 2px !important; cursor: crosshair !important; }
      #ui-checker-ai-picker-label { position: fixed; z-index: 2147483647; pointer-events: none; max-width: min(360px, calc(100vw - 16px)); padding: 6px 9px; border: 1px solid rgba(139,208,239,.7); border-radius: 5px; color: #e1e2e8; background: rgba(17,20,24,.94); box-shadow: 0 8px 24px rgba(0,0,0,.28); font: 12px/1.35 Arial,sans-serif; }
    `;
    (document.head || document.documentElement).appendChild(style);
    const label = document.createElement('div');
    label.id = 'ui-checker-ai-picker-label';
    label.textContent = 'Click an element to attach it · Esc to cancel';
    document.documentElement.appendChild(label);
    let hovered = null;

    const move = event => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target === label || target.closest('#ui-checker-ai-picker-label')) return;
      if (hovered && hovered !== target) hovered.classList.remove('ui-checker-ai-picked-hover');
      hovered = target;
      hovered.classList.add('ui-checker-ai-picked-hover');
      const rect = target.getBoundingClientRect();
      label.textContent = `${describeAIElement(target)} · ${Math.round(rect.width)} × ${Math.round(rect.height)}`;
      label.style.left = `${Math.max(8, Math.min(event.clientX + 12, window.innerWidth - label.offsetWidth - 8))}px`;
      label.style.top = `${Math.max(8, Math.min(event.clientY + 12, window.innerHeight - label.offsetHeight - 8))}px`;
    };
    const click = event => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target === label) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const element = captureAISelectedElement(target);
      stopAIElementPicker();
      chrome.runtime.sendMessage({ action: 'aiElementSelected', element }).catch(() => {});
    };
    const keydown = event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      stopAIElementPicker();
      chrome.runtime.sendMessage({ action: 'aiElementPickerCancelled' }).catch(() => {});
    };
    document.addEventListener('mousemove', move, true);
    document.addEventListener('click', click, true);
    document.addEventListener('keydown', keydown, true);
    aiPickerCleanup = () => {
      document.removeEventListener('mousemove', move, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('keydown', keydown, true);
      if (hovered) hovered.classList.remove('ui-checker-ai-picked-hover');
      label.remove();
      style.remove();
    };
  }

  function stopAIElementPicker() {
    if (!aiPickerCleanup) return;
    const cleanup = aiPickerCleanup;
    aiPickerCleanup = null;
    cleanup();
  }

  function captureAISelectedElement(element) {
    const rect = element.getBoundingClientRect();
    const styles = window.getComputedStyle(element);
    const clone = element.cloneNode(true);
    clone.querySelectorAll?.('script,style,iframe,object,embed').forEach(node => node.remove());
    const controls = [clone, ...Array.from(clone.querySelectorAll?.('input,textarea,select,option,[contenteditable]') || [])]
      .filter(node => node.matches?.('input,textarea,select,option,[contenteditable]'));
    controls.forEach(control => {
      control.removeAttribute('value');
      control.textContent = '';
    });
    for (const node of [clone, ...Array.from(clone.querySelectorAll?.('*') || [])]) {
      for (const attribute of Array.from(node.attributes || [])) {
        if (/(?:value|token|secret|password|passwd|auth|session|cookie)/i.test(attribute.name)) node.removeAttribute(attribute.name);
        else if (attribute.name === 'href' || attribute.name === 'src' || attribute.name === 'action') node.setAttribute(attribute.name, safeAIPageUrl(attribute.nodeValue));
        else node.setAttribute(attribute.name, redactSensitiveText(attribute.nodeValue));
      }
    }
    return {
      selector: describeAIElement(element),
      tag: element.tagName.toLowerCase(),
      text: isSensitiveFormControl(element) ? '' : redactSensitiveText((element.innerText || '').replace(/\s+/g, ' ').trim()).slice(0, 1000),
      html: redactSensitiveText(clone.outerHTML).slice(0, 10000),
      box: { x: roundAI(rect.x + scrollX), y: roundAI(rect.y + scrollY), width: roundAI(rect.width), height: roundAI(rect.height) },
      semantics: collectAISemantics(element),
      style: pickAIComputedStyles(styles),
      parent: element.parentElement ? {
        selector: describeAIElement(element.parentElement),
        style: pickAIComputedStyles(window.getComputedStyle(element.parentElement))
      } : null,
      page: { title: redactSensitiveText(document.title).slice(0, 240), url: safeAIPageUrl(location.href) }
    };
  }

  function applyAICssPreview(value) {
    const css = validateAIPreviewCSS(value);
    let style = document.getElementById(AI_PREVIEW_STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = AI_PREVIEW_STYLE_ID;
      style.dataset.owner = 'ui-consistency-checker';
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = css;
    return css;
  }

  function validateAIPreviewCSS(value) {
    const css = typeof value === 'string' ? value.trim() : '';
    if (!css) throw new Error('No CSS patch was found in the AI response.');
    if (css.length > 60000) throw new Error('The CSS patch is too large to preview safely.');
    if (/@import|@namespace|url\s*\(|(?:-webkit-)?image-set\s*\(|expression\s*\(|javascript\s*:|behavior\s*:|-moz-binding|<\/style/gi.test(css)) {
      throw new Error('The CSS patch contains network-loading or unsafe syntax and was not applied.');
    }
    return css;
  }

  function clearAICssPreview() {
    const style = document.getElementById(AI_PREVIEW_STYLE_ID);
    if (style) style.remove();
  }

  // ========================================
  // COMPONENT TYPE DETECTION
  // ========================================

  function detectElementType(el) {
    const classList = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
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

  /**
   * Compiles the imported standards once, caches DOM/style reads for the run,
   * and delays highlight writes until checking has finished. The original
   * checker is kept below for backwards source compatibility, but messages use
   * this bounded implementation.
   */
  function runConsistencyCheckOptimized(components, classInventory = []) {
    document.querySelectorAll('.ui-check-error, .ui-check-fixed').forEach(element => {
      element.classList.remove('ui-check-error', 'ui-check-fixed');
    });

    if (!Array.isArray(components) || components.length === 0) {
      return { passed: 0, failed: 0, issues: [], totalChecked: 0, message: 'No components provided.' };
    }

    computedStyleCache = new WeakMap();
    displayNoneCache = new WeakMap();
    matchedCascadeRulesCache = new WeakMap();
    flattenedCascadeRules = null;
    rootFontSizeCache = null;
    cascadeElementCount = 0;
    lastFailedDeclarations = [];
    lastOmittedFixDeclarationCount = 0;
    const mediaSignature = `${window.innerWidth}x${window.innerHeight}:${window.devicePixelRatio || 1}`;
    const nextCatalogSignature = `${catalogSignature(components)}:${mediaSignature}`;
    if (nextCatalogSignature !== lastCheckedCatalogSignature) parsedCssCache.clear();
    lastCheckedCatalogSignature = nextCatalogSignature;

    const queryCache = new Map();
    const expectationsByElement = new Map();
    const failedElements = new Set();
    const issues = [];
    let passed = 0;
    let failed = 0;
    let omittedElements = 0;
    let omittedViolations = 0;
    let omittedFixDeclarations = 0;
    let processedElementChecks = 0;
    let elementCheckLimitReached = false;
    const hiddenSkippedElements = new Set();
    let sourceOrder = 0;

    for (const task of compileCheckTasks(components)) {
      let elements;
      try {
        if (!queryCache.has(task.searchSelector)) {
          queryCache.set(task.searchSelector, Array.from(document.querySelectorAll(task.searchSelector)));
        }
        elements = queryCache.get(task.searchSelector);
      } catch (error) {
        console.warn('[UI Checker] Invalid selector:', task.searchSelector);
        continue;
      }

      const remainingBudget = MAX_TOTAL_ELEMENT_CHECKS - processedElementChecks;
      if (remainingBudget <= 0) {
        elementCheckLimitReached = true;
        break;
      }
      const taskLimit = Math.min(MAX_ELEMENTS_PER_SELECTOR, remainingBudget);
      if (elements.length > taskLimit) {
        omittedElements += elements.length - taskLimit;
        elements = elements.slice(0, taskLimit);
        if (taskLimit === remainingBudget) elementCheckLimitReached = true;
      }
      processedElementChecks += elements.length;

      for (const element of elements) {
        if (isDisplayNone(element)) {
          hiddenSkippedElements.add(element);
          continue;
        }
        if (!expectationsByElement.has(element)) expectationsByElement.set(element, new Map());
        const expectations = expectationsByElement.get(element);
        const specificity = computeMatchingSpecificity(task.selector, element);
        for (const rule of task.rules) {
          sourceOrder++;
          const candidate = {
            selector: task.selector,
            displayName: task.displayName,
            componentName: task.componentName,
            property: rule.property,
            value: rule.value,
            important: /!important/i.test(rule.value),
            specificity,
            sourceOrder
          };
          for (const expanded of expandExpectedDeclaration(candidate)) {
            setElementExpectation(expectations, expanded);
          }
        }
      }
    }

    for (const [element, expectations] of expectationsByElement) {
      const computedStyles = getCachedComputedStyle(element);
      const violations = [];
      const selectors = new Set();
      const componentNames = new Set();

      for (const rule of expectations.values()) {
        const expectedValue = rule.value.trim().replace(/\s*!important\s*/gi, '').trim();
        if (!expectedValue || CSS_WIDE_KEYWORDS.test(expectedValue) || expectedValue.includes('calc(')) continue;
        // Normal inline declarations legitimately outrank normal stylesheet
        // declarations. They are commonly used for per-instance progress,
        // dimensions and positions and must not be reported as a library
        // inconsistency. An !important catalog rule still wins the cascade.
        if (!rule.important && element.style && element.style.getPropertyValue(rule.property).trim()) continue;
        // Vendor-prefixed properties are browser implementation details. Some
        // engines alias them to an unprefixed property and return a different
        // computed value even when the authored cascade is correct.
        if (rule.property.startsWith('-') && !rule.property.startsWith('--')) continue;
        if (!rule.property.startsWith('--') && window.CSS && typeof window.CSS.supports === 'function') {
          try {
            if (!window.CSS.supports(rule.property, expectedValue)) continue;
          } catch (error) {}
        }

        const resolvedExpectedValue = resolveComparableValue(expectedValue, computedStyles);
        // Some computed properties expose a used pixel value and discard the
        // authored syntax. For example, width: 100% becomes "1320px" and a
        // 1fr grid track becomes "1304px". Prefer a syntax-preserving value for
        // those declarations so we compare 100% with 100%, not source syntax
        // with the result of layout.
        const syntaxActualValue = getSyntaxPreservingActualValue(rule.property, element, expectedValue);
        let actualValue = syntaxActualValue === null
          ? getActualValue(rule.property, element, computedStyles)
          : syntaxActualValue;
        let resolvedActualValue = resolveComparableValue(actualValue, computedStyles);
        let matches = smartCompareValues(rule.property, resolvedExpectedValue, resolvedActualValue, element);
        if (!matches && resolvedExpectedValue !== expectedValue) {
          matches = smartCompareValues(rule.property, expectedValue, resolvedActualValue, element);
        }

        // Consult authored values only after the rendered comparison fails. This
        // handles shorthands whose individual computed sides were validly
        // changed by a more-specific longhand declaration.
        if (!matches) {
          const authoredValue = getCascadeValue(rule.property, element);
          if (authoredValue !== null) {
            const resolvedAuthoredValue = resolveComparableValue(authoredValue, computedStyles);
            if (smartCompareValues(rule.property, resolvedExpectedValue, resolvedAuthoredValue, element)) {
              matches = true;
              actualValue = authoredValue;
              resolvedActualValue = resolvedAuthoredValue;
            }
          }
        }

        if (matches) continue;
        selectors.add(rule.selector);
        if (rule.componentName) componentNames.add(rule.componentName);
        if (violations.length < MAX_VIOLATIONS_PER_ISSUE) {
          violations.push(`${rule.property}: expected "${summarizeValue(resolvedExpectedValue)}", found "${summarizeValue(resolvedActualValue)}"`);
        } else {
          omittedViolations++;
        }
        if (lastFailedDeclarations.length < MAX_FIX_DECLARATIONS) {
          lastFailedDeclarations.push({
            element,
            selector: rule.selector,
            property: rule.property,
            value: rule.value
          });
        } else {
          omittedFixDeclarations++;
        }
      }

      if (violations.length) {
        failed++;
        failedElements.add(element);
        if (issues.length < MAX_REPORTED_ISSUES) {
          const selectorSummary = Array.from(selectors).slice(0, 4).join(', ');
          const componentSummary = Array.from(componentNames).slice(0, 3).join(' / ');
          issues.push({
            type: summarizeValue(componentSummary || selectorSummary || 'CSS rule', 180),
            violations,
            selector: summarizeValue(selectorSummary, 500),
            element: summarizeValue(describeElement(element), 180)
          });
        }
      } else {
        passed++;
      }
    }

    failedElements.forEach(element => element.classList.add('ui-check-error'));
    lastOmittedFixDeclarationCount = omittedFixDeclarations;
    const classAudit = auditClassInventory(classInventory);

    return {
      passed,
      failed,
      issues,
      totalChecked: passed + failed,
      omittedIssueCount: Math.max(0, failed - issues.length),
      omittedViolationCount: omittedViolations,
      omittedFixDeclarationCount: omittedFixDeclarations,
      omittedElementCount: omittedElements,
      elementCheckLimitReached,
      hiddenSkippedCount: hiddenSkippedElements.size,
      classAudit
    };
  }

  function setElementExpectation(expectations, candidate) {
    const property = candidate.property.startsWith('--')
      ? candidate.property
      : candidate.property.toLowerCase();
    candidate.property = property;
    const current = expectations.get(property);
    const wins = !current ||
      (candidate.important && !current.important) ||
      (candidate.important === current.important && candidate.specificity > current.specificity) ||
      (candidate.important === current.important &&
        candidate.specificity === current.specificity &&
        candidate.sourceOrder >= current.sourceOrder);
    if (wins) expectations.set(property, candidate);
  }

  const EXPECTATION_SHORTHANDS = {
    margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
    padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
    'margin-block': ['margin-block-start', 'margin-block-end'],
    'margin-inline': ['margin-inline-start', 'margin-inline-end'],
    'padding-block': ['padding-block-start', 'padding-block-end'],
    'padding-inline': ['padding-inline-start', 'padding-inline-end'],
    'border-radius': ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'],
    border: ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
      'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
      'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'],
    'border-width': ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width'],
    'border-style': ['border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style'],
    'border-color': ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'],
    'border-block': ['border-block-start-width', 'border-block-end-width', 'border-block-start-style', 'border-block-end-style', 'border-block-start-color', 'border-block-end-color'],
    'border-inline': ['border-inline-start-width', 'border-inline-end-width', 'border-inline-start-style', 'border-inline-end-style', 'border-inline-start-color', 'border-inline-end-color'],
    'border-block-start': ['border-block-start-width', 'border-block-start-style', 'border-block-start-color'],
    'border-block-end': ['border-block-end-width', 'border-block-end-style', 'border-block-end-color'],
    'border-inline-start': ['border-inline-start-width', 'border-inline-start-style', 'border-inline-start-color'],
    'border-inline-end': ['border-inline-end-width', 'border-inline-end-style', 'border-inline-end-color'],
    'border-top': ['border-top-width', 'border-top-style', 'border-top-color'],
    'border-right': ['border-right-width', 'border-right-style', 'border-right-color'],
    'border-bottom': ['border-bottom-width', 'border-bottom-style', 'border-bottom-color'],
    'border-left': ['border-left-width', 'border-left-style', 'border-left-color'],
    overflow: ['overflow-x', 'overflow-y'],
    'list-style': ['list-style-position', 'list-style-image', 'list-style-type'],
    font: ['font-style', 'font-variant', 'font-weight', 'font-stretch', 'font-size', 'line-height', 'font-family'],
    background: ['background-color', 'background-image', 'background-repeat', 'background-position', 'background-size', 'background-origin', 'background-clip', 'background-attachment']
  };

  function expandExpectedDeclaration(candidate) {
    const property = candidate.property.toLowerCase();
    const longhands = EXPECTATION_SHORTHANDS[property];
    if (!longhands) return [candidate];
    declarationExpansionStyle = declarationExpansionStyle || document.createElement('div').style;
    declarationExpansionStyle.cssText = '';
    const value = candidate.value.replace(/\s*!important\s*/gi, '').trim();
    declarationExpansionStyle.setProperty(property, value);
    const expanded = [];
    for (const longhand of longhands) {
      const longhandValue = declarationExpansionStyle.getPropertyValue(longhand).trim();
      if (!longhandValue) continue;
      expanded.push({
        ...candidate,
        property: longhand,
        value: `${longhandValue}${candidate.important ? ' !important' : ''}`
      });
    }
    // A shorthand containing unresolved var()/calc() may not be expandable by
    // CSSStyleDeclaration. Do not retain the shorthand as a separate
    // expectation because a later longhand can validly override only one side.
    return expanded;
  }

  function isDisplayNone(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
    if (displayNoneCache.has(element)) return displayNoneCache.get(element);
    const hidden = Boolean(element.hidden || getCachedComputedStyle(element).display === 'none' ||
      (element.parentElement && isDisplayNone(element.parentElement)));
    displayNoneCache.set(element, hidden);
    return hidden;
  }

  function describeElement(element) {
    const segment = target => {
      let value = target.tagName ? target.tagName.toLowerCase() : 'element';
      if (target.id) value += `#${target.id}`;
      const targetClasses = Array.from(target.classList || [])
        .filter(name => !name.startsWith('ui-check-')).slice(0, 6);
      if (targetClasses.length) value += `.${targetClasses.join('.')}`;
      return { value, hasIdentity: Boolean(target.id || targetClasses.length) };
    };

    const own = segment(element);
    // Include enough classes to expose contextual modifiers such as
    // .ehs-picker-trigger; hiding the fourth class made genuine overrides look
    // as though they came from the three displayed base classes.
    if (own.hasIdentity) return own.value;

    // A bare tag such as "div" is not an actionable locator. Add its sibling
    // position and nearest identifiable ancestor without requiring catalog
    // HTML or inventing a component name.
    const positionedSegment = target => {
      const targetSegment = segment(target);
      if (targetSegment.hasIdentity || !target.parentElement) return targetSegment.value;
      const siblings = Array.from(target.parentElement.children)
        .filter(sibling => sibling.tagName === target.tagName);
      return `${targetSegment.value}:nth-of-type(${Math.max(1, siblings.indexOf(target) + 1)})`;
    };
    const path = [positionedSegment(element)];
    let ancestor = element.parentElement;
    let depth = 0;
    while (ancestor && depth < 4) {
      const parentSegment = segment(ancestor);
      path.unshift(positionedSegment(ancestor));
      if (parentSegment.hasIdentity) return path.join(' > ');
      ancestor = ancestor.parentElement;
      depth++;
    }
    return path.join(' > ');
  }

  function compileCheckTasks(components) {
    const tasks = [];
    const seenRuleBlocks = new Set();

    for (const component of components) {
      if (!component || typeof component.styles !== 'string' || !component.styles.trim()) continue;
      // CSS-only components must provide complete selector blocks. An optional
      // explicit scope keeps generic selectors such as `.title` local to a
      // component without requiring sample HTML.
      if (!/\{/.test(component.styles)) continue;
      const rules = getParsedBaseRules(component.styles);
      if (!rules.length) continue;

      const grouped = new Map();
      for (const rule of rules) {
        if (!rule.selector || rule.selector.startsWith('@')) continue;
        for (const selector of splitSelectorList(rule.selector)) {
          if (UNTESTABLE_SELECTOR.test(selector)) continue;
          const groupKey = `${rule.group}\n${selector}`;
          if (!grouped.has(groupKey)) grouped.set(groupKey, { selector, rules: [] });
          grouped.get(groupKey).rules.push({ ...rule, selector });
        }
      }

      const scope = typeof component.scope === 'string' ? component.scope.trim() : '';
      for (const { selector, rules: selectorRules } of grouped.values()) {
        const signature = `${scope}\n${selector}\n${selectorRules.map(rule => `${rule.property}:${rule.value}`).join(';')}`;
        if (seenRuleBlocks.has(signature)) continue;
        seenRuleBlocks.add(signature);
        if (tasks.length >= MAX_SELECTOR_TASKS) break;
        tasks.push({
          selector,
          searchSelector: scope ? scopeSelector(selector, scope) : selector,
          displayName: selector.split(/\s+/).pop() || component.name || 'component',
          componentName: component.name || component.id || 'Component',
          rules: selectorRules
        });
      }
      if (tasks.length >= MAX_SELECTOR_TASKS) break;
    }

    return tasks;
  }

  function addCompiledTask(taskMap, task) {
    // Keep authored selectors separate even when explicit scope makes them
    // search the same elements. `.btn` and `.md3 .btn` have different cascade
    // specificity and must not be collapsed into one declaration set.
    const key = `${task.searchSelector}\n${task.selector}`;
    const existing = taskMap.get(key);
    if (!existing && taskMap.size >= MAX_SELECTOR_TASKS) return;
    if (!existing) {
      task.ruleMap = new Map();
      for (const rule of task.rules) setWinningDeclaration(task.ruleMap, rule);
      task.authoritativeRuleCount = task.ruleMap.size;
      task.rules = Array.from(task.ruleMap.values());
      taskMap.set(key, task);
      return;
    }
    // Each generated component carries a self-contained slice of the same
    // library cascade. A later component can contain only an older shared
    // branch (for example `.ehs-badge,.ehs-chip`) and must not overwrite the
    // final `.ehs-chip` declaration already compiled from the chip component.
    // It may still contribute properties the current slice did not contain.
    // If this slice has more distinct declarations, it is the more complete
    // representation and becomes authoritative for overlapping properties.
    const incomingRuleMap = new Map();
    for (const rule of task.rules) setWinningDeclaration(incomingRuleMap, rule);
    const incomingIsMoreComplete = incomingRuleMap.size > existing.authoritativeRuleCount;
    for (const [property, rule] of incomingRuleMap) {
      if (incomingIsMoreComplete || !existing.ruleMap.has(property)) existing.ruleMap.set(property, rule);
    }
    if (incomingIsMoreComplete) existing.authoritativeRuleCount = incomingRuleMap.size;
    existing.rules = Array.from(existing.ruleMap.values());
  }

  function setWinningDeclaration(ruleMap, rule) {
    const key = rule.property.startsWith('--') ? rule.property : rule.property.toLowerCase();
    if (key !== rule.property) rule = { ...rule, property: key };
    const current = ruleMap.get(key);
    const currentImportant = current && /!important/i.test(current.value);
    const nextImportant = /!important/i.test(rule.value);
    if (!current || nextImportant || !currentImportant) {
      if (current) ruleMap.delete(key);
      ruleMap.set(key, rule);
    }
  }

  function getParsedBaseRules(styles) {
    if (parsedCssCache.has(styles)) return parsedCssCache.get(styles);
    const parsed = parseBaseRules(styles);
    if (parsedCssCache.size >= 100) parsedCssCache.delete(parsedCssCache.keys().next().value);
    parsedCssCache.set(styles, parsed);
    return parsed;
  }

  function scopeSelector(selector, scope) {
    return splitSelectorList(selector).map(part => {
      if (part.includes('&')) return part.replaceAll('&', scope);
      // Scope values are validated CSS selectors at import time. If the
      // authored selector already contains that explicit scope anywhere in
      // its ancestor chain, do not prepend it again.
      if (part.includes(scope)) return part;
      return `${scope} ${part}`;
    }).join(', ');
  }

  function splitSelectorList(selector) {
    const parts = [];
    let start = 0;
    let depth = 0;
    let quote = '';
    for (let index = 0; index < selector.length; index++) {
      const character = selector[index];
      if (quote) {
        if (character === quote && selector[index - 1] !== '\\') quote = '';
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === '(' || character === '[') {
        depth++;
      } else if (character === ')' || character === ']') {
        depth = Math.max(0, depth - 1);
      } else if (character === ',' && depth === 0) {
        parts.push(selector.slice(start, index).trim());
        start = index + 1;
      }
    }
    parts.push(selector.slice(start).trim());
    return parts.filter(Boolean);
  }

  function catalogSignature(components) {
    let hash = 2166136261;
    for (const component of components) {
      const value = `${component && component.id || ''}\u0000${component && component.scope || ''}\u0000${component && component.styles || ''}`;
      for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
    }
    return `${components.length}:${hash >>> 0}`;
  }

  function getCachedComputedStyle(element) {
    if (!computedStyleCache.has(element)) computedStyleCache.set(element, window.getComputedStyle(element));
    return computedStyleCache.get(element);
  }

  function resolveCssVariables(value, computedStyles) {
    let resolved = String(value || '');
    for (let pass = 0; pass < 10 && resolved.includes('var('); pass++) {
      let output = '';
      let cursor = 0;
      let changed = false;
      while (cursor < resolved.length) {
        const start = resolved.indexOf('var(', cursor);
        if (start === -1) {
          output += resolved.slice(cursor);
          break;
        }
        output += resolved.slice(cursor, start);
        let depth = 1;
        let end = start + 4;
        for (; end < resolved.length && depth > 0; end++) {
          if (resolved[end] === '(') depth++;
          else if (resolved[end] === ')') depth--;
        }
        if (depth !== 0) {
          output += resolved.slice(start);
          cursor = resolved.length;
          break;
        }
        const body = resolved.slice(start + 4, end - 1);
        let comma = -1;
        let bodyDepth = 0;
        for (let index = 0; index < body.length; index++) {
          if (body[index] === '(') bodyDepth++;
          else if (body[index] === ')') bodyDepth--;
          else if (body[index] === ',' && bodyDepth === 0) { comma = index; break; }
        }
        const name = (comma === -1 ? body : body.slice(0, comma)).trim();
        const fallback = comma === -1 ? '' : body.slice(comma + 1).trim();
        const customValue = /^--[\w-]+$/.test(name)
          ? computedStyles.getPropertyValue(name).trim()
          : '';
        const replacement = customValue || fallback;
        if (replacement) {
          output += replacement;
          changed = true;
        } else {
          output += resolved.slice(start, end);
        }
        cursor = end;
      }
      if (!changed || output === resolved) break;
      resolved = output;
    }
    return resolved.trim();
  }

  function resolveComparableValue(value, computedStyles) {
    const resolved = resolveCssVariables(value, computedStyles);
    if (!/\bcurrentcolor\b/i.test(resolved)) return resolved;
    const currentColor = computedStyles.getPropertyValue('color').trim();
    return currentColor ? resolved.replace(/\bcurrentcolor\b/gi, currentColor) : resolved;
  }

  function summarizeValue(value, maximumLength = 240) {
    const text = String(value ?? '');
    return text.length > maximumLength ? `${text.slice(0, maximumLength - 1)}…` : text;
  }

  function auditClassInventory(classInventory) {
    if (!Array.isArray(classInventory) || classInventory.length === 0) return null;
    const known = new Set(classInventory);
    const used = new Set();
    const unknown = new Set();
    const elements = document.querySelectorAll('[class]');
    let scannedElementCount = 0;
    let hiddenUnknownElementCount = 0;
    for (const element of elements) {
      if (scannedElementCount >= MAX_CLASS_AUDIT_ELEMENTS) break;
      scannedElementCount++;
      const unknownClasses = [];
      for (const className of element.classList) {
        if (known.has(className)) used.add(className);
        // Unknown-class reporting is limited to library-owned namespaces.
        // Known Bootstrap classes are still counted, while arbitrary product
        // classes are not incorrectly reported as framework violations.
        else if (/^(?:ehs|md3)-/.test(className)) unknownClasses.push(className);
      }
      if (unknownClasses.length) {
        if (isDisplayNone(element)) hiddenUnknownElementCount++;
        else unknownClasses.forEach(className => unknown.add(className));
      }
    }
    return {
      knownCount: known.size,
      usedCount: used.size,
      unknownCount: unknown.size,
      unknownClasses: Array.from(unknown).sort().slice(0, 100).map(name => summarizeValue(name, 200)),
      omittedUnknownCount: Math.max(0, unknown.size - 100),
      hiddenUnknownElementCount,
      scannedElementCount,
      omittedElementCount: Math.max(0, elements.length - scannedElementCount)
    };
  }

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
    const PSEUDO_STATE_PATTERN = /:(hover|focus|focus-within|focus-visible|active|visited|has\(|-webkit)/i;
    const PSEUDO_ELEMENT_PATTERN = /::[a-z-]+/i;

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

      const selectorParts = splitSelectorList(selector);
      const baseSelectorParts = selectorParts.filter(part =>
        !PSEUDO_STATE_PATTERN.test(part) && !PSEUDO_ELEMENT_PATTERN.test(part)
      );
      const isBase = baseSelectorParts.length === selectorParts.length;
      if (baseOnly && baseSelectorParts.length === 0) continue;
      const effectiveSelector = baseOnly ? baseSelectorParts.join(', ') : selector;

      const propRegex = /([a-zA-Z-]+)\s*:\s*([^;]+);?/g;
      let propMatch;
      while ((propMatch = propRegex.exec(blockContent)) !== null) {
        const property = propMatch[1].trim();
        const value = propMatch[2].trim();
        if (property && value) {
          rules.push({ selector: effectiveSelector, property, value, isBase });
        }
      }
    }

    return rules;
  }

  // Returns only base-selector rules (no pseudo-states) — used for checking and auto-fix
  function parseActiveCSSRules(css) {
    const rules = [];
    let group = 0;
    const pseudoState = /:(hover|focus|focus-within|focus-visible|active|visited|has\(|-webkit)/i;
    const pseudoElement = /::[a-z-]+/i;
    css = css.replace(/\/\*[\s\S]*?\*\//g, '');

    const findClosingBrace = (source, openIdx) => {
      let depth = 1;
      let quote = '';
      for (let index = openIdx + 1; index < source.length; index++) {
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
    };

    const parseBlocks = source => {
      let cursor = 0;
      while (cursor < source.length) {
        const openIdx = source.indexOf('{', cursor);
        if (openIdx < 0) break;
        const header = source.slice(cursor, openIdx).trim();
        const closeIdx = findClosingBrace(source, openIdx);
        const block = source.slice(openIdx + 1, closeIdx);
        cursor = closeIdx + 1;
        if (!header) continue;

        if (/^@media\b/i.test(header)) {
          const condition = header.replace(/^@media\s*/i, '');
          let active = true;
          try { active = window.matchMedia(condition).matches; } catch (error) {}
          if (active) parseBlocks(block);
          continue;
        }
        if (/^@supports\b/i.test(header)) {
          const condition = header.replace(/^@supports\s*/i, '');
          let active = true;
          try { active = window.CSS.supports(condition); } catch (error) {}
          if (active) parseBlocks(block);
          continue;
        }
        if (/^@(?:layer|scope)\b/i.test(header)) {
          parseBlocks(block);
          continue;
        }
        if (header.startsWith('@')) continue;

        const selectorParts = splitSelectorList(header);
        const baseSelectors = selectorParts.filter(part =>
          !pseudoState.test(part) && !pseudoElement.test(part)
        );
        if (!baseSelectors.length) continue;
        const selector = baseSelectors.join(', ');
        group++;
        const declarationPattern = /(^|;)\s*(--[\w-]+|[a-zA-Z-]+)\s*:\s*([^;{}]+)/g;
        for (const match of block.matchAll(declarationPattern)) {
          rules.push({
            selector,
            group,
            property: match[2].trim(),
            value: match[3].trim(),
            isBase: baseSelectors.length === selectorParts.length
          });
        }
      }
    };

    parseBlocks(css);
    return rules;
  }

  function parseBaseRules(css) {
    return parseActiveCSSRules(css);
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
    
    // Handle named colors - allocate the lookup only once per page.
    const namedColors = namedColorsCache = namedColorsCache || {
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
      'mediumblue': '#0000cd', 'mediumorchid': '#ba55d3', 'mediumpurple': '#9370db', 'mediumseagreen': '#3cb371',
      'mediumslateblue': '#7b68ee', 'mediumspringgreen': '#00fa9a', 'mediumturquoise': '#48d1cc', 'mediumvioletred': '#c71585',
      'midnightblue': '#191970', 'mintcream': '#f5fffa', 'mistyrose': '#ffe4e1', 'moccasin': '#ffe4b5',
      'navajowhite': '#ffdead', 'navy': '#000080', 'oldlace': '#fdf5e6', 'olive': '#808000',
      'olivedrab': '#6b8e23', 'orange': '#ffa500', 'orangered': '#ff4500', 'orchid': '#da70d6',
      'palegoldenrod': '#eee8aa', 'palegreen': '#98fb98', 'paleturquoise': '#afeeee', 'palevioletred': '#db7093',
      'papayawhip': '#ffefd5', 'peachpuff': '#ffdab9', 'peru': '#cd853f', 'pink': '#ffc0cb',
      'plum': '#dda0dd', 'powderblue': '#b0e0e6', 'purple': '#800080', 'rebeccapurple': '#663399',
      'red': '#ff0000', 'rosybrown': '#bc8f8f', 'royalblue': '#4169e1', 'saddlebrown': '#8b4513',
      'salmon': '#fa8072', 'sandybrown': '#f4a460', 'seagreen': '#2e8b57', 'seashell': '#fff5ee',
      'sienna': '#a0522d', 'silver': '#c0c0c0', 'skyblue': '#87ceeb', 'slateblue': '#6a5acd',
      'slategray': '#708090', 'slategrey': '#708090', 'snow': '#fffafa', 'springgreen': '#00ff7f',
      'steelblue': '#4682b4', 'tan': '#d2b48c', 'teal': '#008080', 'thistle': '#d8bfd8',
      'tomato': '#ff6347', 'turquoise': '#40e0d0', 'violet': '#ee82ee', 'wheat': '#f5deb3',
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
  const COLOR_PROPERTIES = new Set(['color', 'background-color', 'border-color',
    'border-top-color', 'border-right-color', 'border-bottom-color',
    'border-left-color', 'border-block-color', 'border-block-start-color',
    'border-block-end-color', 'border-inline-color', 'border-inline-start-color',
    'border-inline-end-color', 'outline-color', 'text-decoration-color',
    'caret-color', 'accent-color', 'column-rule-color', 'fill', 'stroke',
    'stop-color', 'flood-color', 'lighting-color']);
  const SHADOW_PROPERTIES = new Set(['box-shadow', 'text-shadow']);
  const NUMERIC_SINGLE_PROPERTIES = new Set([
    'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
    'inline-size', 'block-size', 'min-inline-size', 'max-inline-size',
    'min-block-size', 'max-block-size', 'top', 'right', 'bottom', 'left',
    'inset-block-start', 'inset-block-end', 'inset-inline-start', 'inset-inline-end',
    'flex-basis', 'gap', 'row-gap', 'column-gap', 'line-height', 'font-size',
    'letter-spacing', 'word-spacing', 'text-indent', 'text-underline-offset', 'column-width',
    'column-rule-width', 'outline-width', 'outline-offset', 'stroke-width',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'border-top-left-radius', 'border-top-right-radius',
    'border-bottom-right-radius', 'border-bottom-left-radius',
    'border-block-start-width', 'border-block-end-width', 'border-inline-start-width',
    'border-inline-end-width', 'margin-top', 'margin-right', 'margin-bottom',
    'margin-left', 'margin-block-start', 'margin-block-end', 'margin-inline-start',
    'margin-inline-end', 'padding-top', 'padding-right', 'padding-bottom',
    'padding-left', 'padding-block-start', 'padding-block-end', 'padding-inline-start',
    'padding-inline-end', 'scroll-margin-top', 'scroll-margin-right',
    'scroll-margin-bottom', 'scroll-margin-left', 'scroll-padding-top',
    'scroll-padding-right', 'scroll-padding-bottom', 'scroll-padding-left',
    'z-index', 'opacity', 'flex-grow', 'flex-shrink', 'order'
  ]);
  const MULTI_NUMERIC_PROPERTIES = new Set([
    'margin', 'padding', 'margin-block', 'margin-inline', 'padding-block',
    'padding-inline', 'border-radius', 'border-width', 'border-block-width',
    'border-inline-width', 'background-position', 'transform-origin', 'inset',
    'inset-block', 'inset-inline', 'scroll-margin', 'scroll-padding'
  ]);
  const BORDER_SHORTHANDS = new Set(['border', 'border-top', 'border-right',
    'border-bottom', 'border-left', 'border-block', 'border-block-start',
    'border-block-end', 'border-inline', 'border-inline-start',
    'border-inline-end', 'outline', 'column-rule']);

  /**
   * getActualValue – the single source of truth for "what value does this
   * element actually have for this property, as DevTools would show it".
   *
   * Strategy (2 layers, cheapest first):
   *  1. Reconstruct shorthands from individual computed sides (MOST RELIABLE)
   *     → preserves "auto", "none", keywords exactly as the browser resolved them
   *     → e.g. margin: "0px auto" from margin-top/right/bottom/left
   *  2. Raw getComputedStyle (fallback for simple scalar properties)
   * The optimized checker scans authored cascade rules only after these fast
   * values fail comparison.
   */
  function getActualValue(property, el, computedStyles) {
    // Inline declarations are deliberately not returned directly: a stylesheet
    // !important declaration can override a normal inline value. Computed style
    // remains the rendered source of truth.
    // ── Layer 1: Reconstruct shorthands from individual computed sides ────────
    const reconstructed = reconstructShorthand(property, el, computedStyles);
    if (reconstructed !== null) return reconstructed;

    // ── Layer 2: Raw computed ─────────────────────────────────────────────────
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
  function getCascadeValue(property, el, ignoreElementLimit = false) {
    let bestValue = null;
    let bestSpecificity = -1;
    let bestImportant = false;

    let matchingRules = matchedCascadeRulesCache.get(el);
    if (!matchingRules) {
      if (!ignoreElementLimit && cascadeElementCount >= MAX_CASCADE_ELEMENTS) return null;
      if (!ignoreElementLimit) cascadeElementCount++;
      matchingRules = [];
      for (const rule of getFlattenedCascadeRules()) {
        try {
          if (el.matches(rule.selectorText)) matchingRules.push(rule);
        } catch (error) {}
      }
      matchedCascadeRulesCache.set(el, matchingRules);
    }

    for (const rule of matchingRules) {
      const value = rule.style.getPropertyValue(property).trim();
      if (!value) continue;
      const important = rule.style.getPropertyPriority(property) === 'important';
      const specificity = computeMatchingSpecificity(rule.selectorText, el);
      if ((important && !bestImportant) || (important === bestImportant && specificity >= bestSpecificity)) {
        bestImportant = important;
        bestSpecificity = specificity;
        bestValue = value;
      }
    }

    // Inline declarations participate in the same cascade. A stylesheet
    // !important rule still beats a normal inline declaration.
    const inlineValue = el.style && el.style.getPropertyValue(property).trim();
    if (inlineValue) {
      const inlineImportant = el.style.getPropertyPriority(property) === 'important';
      if (inlineImportant || !bestImportant) bestValue = inlineValue;
    }

    return bestValue; // null if nothing found
  }

  const SOURCE_SYNTAX_PROPERTIES = new Set([
    'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
    'inline-size', 'block-size', 'min-inline-size', 'max-inline-size',
    'min-block-size', 'max-block-size', 'top', 'right', 'bottom', 'left',
    'inset-block-start', 'inset-block-end', 'inset-inline-start', 'inset-inline-end',
    'flex-basis', 'gap', 'row-gap', 'column-gap', 'margin', 'padding',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'margin-block', 'margin-inline', 'padding-block', 'padding-inline',
    'grid-template-columns', 'grid-template-rows', 'grid-auto-columns', 'grid-auto-rows'
  ]);

  function getSyntaxPreservingActualValue(property, el, expected) {
    property = property.toLowerCase();
    // The computed display value is blockified for flex/grid items, so values
    // such as inline-flex, inline-grid and inline-block lose their authored
    // outer display type. The cascade is the only faithful comparison source.
    if (property === 'display') return getCascadeValue(property, el, true);
    if (!SOURCE_SYNTAX_PROPERTIES.has(property) ||
        !/(?:%|\bauto\b|\bmin-content\b|\bmax-content\b|\bsubgrid\b|\bminmax\(|\brepeat\(|\bfit-content\(|(?:^|[^a-z-])[-+]?\d*\.?\d+fr\b)/i.test(expected)) {
      return null;
    }

    // Typed OM commonly retains percentages even when getComputedStyle has
    // resolved them to pixels. Do not accept a typed value that has itself
    // already been reduced to absolute pixels.
    try {
      if (typeof el.computedStyleMap === 'function') {
        const typed = el.computedStyleMap().get(property);
        const value = typed && typed.toString().trim();
        if (value && /(?:%|\bauto\b|\bmin-content\b|\bmax-content\b|\bsubgrid\b|\bminmax\(|\brepeat\(|\bfit-content\(|(?:^|[^a-z-])[-+]?\d*\.?\d+fr\b)/i.test(value)) {
          return value;
        }
      }
    } catch (error) {}

    // Grid tracks are usually exposed as used pixel sizes even through Typed
    // OM. Read the winning declaration from the accessible CSS cascade. This
    // path intentionally bypasses the general diagnostic scan limit because
    // there is no meaningful computed-value comparison for source-only syntax.
    return getCascadeValue(property, el, true);
  }

  function getFlattenedCascadeRules() {
    if (flattenedCascadeRules) return flattenedCascadeRules;
    flattenedCascadeRules = [];

    const collect = rules => {
      if (!rules) return;
      for (const rule of rules) {
        if (rule.type === CSSRule.STYLE_RULE) {
          flattenedCascadeRules.push(rule);
        } else if (rule.cssRules) {
          if (rule.type === CSSRule.MEDIA_RULE && rule.conditionText) {
            try { if (!window.matchMedia(rule.conditionText).matches) continue; } catch (error) {}
          }
          if (rule.type === CSSRule.SUPPORTS_RULE && rule.conditionText) {
            try { if (!window.CSS.supports(rule.conditionText)) continue; } catch (error) {}
          }
          try { collect(rule.cssRules); } catch (error) {}
        }
      }
    };

    for (const sheet of document.styleSheets) {
      try { collect(sheet.cssRules || sheet.rules); } catch (error) {}
    }
    return flattenedCascadeRules;
  }

  // Specificity score: id=100, class/attr/pseudo=10, tag=1
  function computeMatchingSpecificity(selector, element) {
    let maximum = -1;
    for (const part of splitSelectorList(selector)) {
      try {
        if (element.matches(part)) maximum = Math.max(maximum, computeSpecificity(part));
      } catch (error) {}
    }
    return maximum;
  }

  function computeSpecificity(selector) {
    if (!selector) return 0;
    let score = 0;
    const clean = selector
      .replace(/::[a-z-]+/gi, '')
      .replace(/:[a-z-]+(\([^)]*\))?/gi, '');
    score += (clean.match(/#[a-zA-Z0-9_-]/g) || []).length * 100;
    score += (clean.match(/\.[a-zA-Z0-9_-]|\[[^\]]+\]/g) || []).length * 10;
    score += (clean.match(/\b[a-z][a-z0-9-]*\b/gi) || []).length;
    return score;
  }

  // Main router: choose the right comparator per property
  function smartCompareValues(property, expected, actual, el) {
    // Strip !important — computed styles never include it
    const e = expected.trim().replace(/\s*!important\s*/gi, '').trim();
    const a = actual.trim().replace(/\s*!important\s*/gi, '').trim();
    if (!e && !a) return true;

    property = property.startsWith('--') ? property : property.toLowerCase();

    if (COLOR_PROPERTIES.has(property)) return compareColors(e, a);
    if (SHADOW_PROPERTIES.has(property)) return compareBoxShadows(e, a);
    if (BORDER_SHORTHANDS.has(property)) return compareBorder(e, a);
    if (MULTI_NUMERIC_PROPERTIES.has(property)) return compareMultiNumeric(e, a, el, property);
    if (NUMERIC_SINGLE_PROPERTIES.has(property)) return compareNumericValue(e, a, el, property);

    if (property.startsWith('--')) {
      if (looksLikeColor(e) && looksLikeColor(a)) return compareColors(e, a);
      if (isNumericValueList(e) && isNumericValueList(a)) return compareMultiNumeric(e, a, el, property);
    }

    // Background shorthand
    if (property === 'background') return compareBackground(e, a);
    if (property === 'flex') return compareFlex(e, a, el);

    if (property === 'transition') return compareTransition(e, a);
    if (property === 'animation') return compareAnimation(e, a);
    if (property === 'counter-reset' || property === 'counter-set') {
      return compareCounterList(e, a, 0);
    }
    if (property === 'counter-increment') return compareCounterList(e, a, 1);

    // Dimension properties – try numeric first, then string
    // Generic: normalize then compare strings
    return normalizeCSSValue(e) === normalizeCSSValue(a);
  }

  function compareFlex(expected, actual, el) {
    const expand = value => {
      const parts = value.trim().split(/\s+/);
      if (parts.length === 1 && resolveLength(parts[0], el, 'flex-grow') !== null) {
        return [parts[0], '1', '0%'];
      }
      if (parts.length === 2 && resolveLength(parts[0], el, 'flex-grow') !== null) {
        return [parts[0], parts[1], '0%'];
      }
      return parts;
    };
    const expectedParts = expand(expected);
    const actualParts = expand(actual);
    if (expectedParts.length !== actualParts.length) return false;
    return expectedParts.every((part, index) => {
      if (index < 2) return compareNumericValue(part, actualParts[index], el, 'flex-grow');
      if (part === '0%' && /^0(?:px)?$/.test(actualParts[index])) return true;
      return normalizeCSSValue(part) === normalizeCSSValue(actualParts[index]);
    });
  }

  // Resolve any length value → px number (returns null if not resolvable)
  function resolveLength(value, el, property = '') {
    if (!value) return null;
    value = value.trim().toLowerCase();
    if (value === '0' || value === '0px') return 0;
    const match = value.match(/^(-?(?:\d+|\d*\.\d+))(px|rem|em|pt|pc|in|cm|mm|q|vw|vh|vmin|vmax)?$/);
    if (!match) return null;
    const num = parseFloat(match[1]);
    const unit = match[2] || '';

    if (unit === 'px') return num;
    if (unit === '') {
      if (property === 'line-height' && el) {
        const fontSize = parseFloat(getCachedComputedStyle(el).fontSize) || 16;
        return num * fontSize;
      }
      return num;
    }
    if (unit === 'vw') return (num / 100) * window.innerWidth;
    if (unit === 'vh') return (num / 100) * window.innerHeight;
    if (unit === 'vmin') return (num / 100) * Math.min(window.innerWidth, window.innerHeight);
    if (unit === 'vmax') return (num / 100) * Math.max(window.innerWidth, window.innerHeight);
    if (unit === 'rem') {
      if (rootFontSizeCache === null) {
        rootFontSizeCache = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      }
      return num * rootFontSizeCache;
    }
    if (unit === 'em') {
      const fontSource = property === 'font-size' && el && el.parentElement ? el.parentElement : el;
      const elFs = fontSource ? parseFloat(getCachedComputedStyle(fontSource).fontSize) || 16 : 16;
      return num * elFs;
    }
    if (unit === 'pt') return num * (96 / 72);
    if (unit === 'pc') return num * 16;
    if (unit === 'in') return num * 96;
    if (unit === 'cm') return num * (96 / 2.54);
    if (unit === 'mm') return num * (96 / 25.4);
    if (unit === 'q') return num * (96 / 101.6);
    return null;
  }

  function compareNumericValue(expected, actual, el, property = '') {
    const expectedPercent = expected.trim().match(/^(-?(?:\d+|\d*\.\d+))%$/);
    const actualPercent = actual.trim().match(/^(-?(?:\d+|\d*\.\d+))%$/);
    if (expectedPercent && actualPercent) {
      return Math.abs(Number(expectedPercent[1]) - Number(actualPercent[1])) <= 0.001;
    }
    const expN = resolveLength(expected, el, property);
    const actN = resolveLength(actual, el, property);
    if (expN !== null && actN !== null) return Math.abs(expN - actN) <= NUMERIC_TOLERANCE;
    return normalizeCSSValue(expected) === normalizeCSSValue(actual);
  }

  /**
   * compareMultiNumeric – handles shorthand layout props like margin/padding.
   * Crucially supports "0 auto", "auto", keyword parts alongside px values.
   * Works on both inspect-style values ("0px auto") and expected ("0 auto").
   */
  function compareMultiNumeric(expected, actual, el, property = '') {
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
      if (ep === 'auto' && resolveLength(ap, el, property) === 0) return true;
      // One is a keyword and the other isn't → fail (e.g. "auto" vs "20px")
      if (/^[a-z]/.test(ep) || /^[a-z]/.test(ap)) return ep === ap;
      // Numeric comparison with tolerance
      const en = resolveLength(ep, el, property);
      const an = resolveLength(ap, el, property);
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

  function isNumericValueList(value) {
    const parts = value.trim().split(/\s+/);
    return parts.length > 0 && parts.length <= 4 && parts.every(part =>
      part === 'auto' || /^-?(?:\d+|\d*\.\d+)(?:px|rem|em|pt|pc|in|cm|mm|q|vw|vh|vmin|vmax)?$/i.test(part)
    );
  }

  function normalizeColorToHex(color) {
    if (!color) return null;
    const cacheKey = color.trim().toLowerCase();
    if (colorHexCache.has(cacheKey)) return colorHexCache.get(cacheKey);
    if (cacheKey === 'transparent') return '#00000000';

    let result = null;
    const hexMatch = cacheKey.match(/^#([0-9a-f]{3,8})$/i);
    if (hexMatch) {
      let hex = hexMatch[1];
      if (hex.length === 3 || hex.length === 4) hex = hex.split('').map(character => character + character).join('');
      if (hex.length === 6 || hex.length === 8) result = `#${hex}`;
    }

    const functionalMatch = cacheKey.match(/^rgba?\((.*)\)$/i);
    if (!result && functionalMatch) {
      const pieces = functionalMatch[1].replace(/,/g, ' ').split(/\s*\/\s*|\s+/).filter(Boolean);
      if (pieces.length >= 3) {
        const channel = value => value.endsWith('%')
          ? Math.round(Math.max(0, Math.min(100, parseFloat(value))) * 255 / 100)
          : Math.round(Math.max(0, Math.min(255, parseFloat(value))));
        const alpha = pieces[3] === undefined ? 255 : pieces[3].endsWith('%')
          ? Math.round(Math.max(0, Math.min(100, parseFloat(pieces[3]))) * 255 / 100)
          : Math.round(Math.max(0, Math.min(1, parseFloat(pieces[3]))) * 255);
        const channels = pieces.slice(0, 3).map(channel);
        if (channels.every(Number.isFinite) && Number.isFinite(alpha)) result = bytesToHex(channels, alpha);
      }
    }

    const srgbMatch = cacheKey.match(/^color\(\s*srgb\s+(.+)\)$/i);
    if (!result && srgbMatch) {
      const pieces = srgbMatch[1].split(/\s*\/\s*|\s+/).filter(Boolean);
      if (pieces.length >= 3) {
        const channel = value => value.endsWith('%')
          ? Math.round(Math.max(0, Math.min(100, parseFloat(value))) * 255 / 100)
          : Math.round(Math.max(0, Math.min(1, parseFloat(value))) * 255);
        const alpha = pieces[3] === undefined ? 255 : pieces[3].endsWith('%')
          ? Math.round(Math.max(0, Math.min(100, parseFloat(pieces[3]))) * 255 / 100)
          : Math.round(Math.max(0, Math.min(1, parseFloat(pieces[3]))) * 255);
        const channels = pieces.slice(0, 3).map(channel);
        if (channels.every(Number.isFinite) && Number.isFinite(alpha)) result = bytesToHex(channels, alpha);
      }
    }

    if (!result) {
      const converted = colorToHex(cacheKey);
      if (converted && converted.toLowerCase() !== cacheKey) result = normalizeColorToHex(converted);
    }

    colorHexCache.set(cacheKey, result);
    return result;
  }

  function bytesToHex(channels, alpha = 255) {
    const hex = [...channels, alpha].map(value => Math.max(0, Math.min(255, value))
      .toString(16).padStart(2, '0')).join('');
    return alpha === 255 ? `#${hex.slice(0, 6)}` : `#${hex}`;
  }

  // Compatibility form retained for shadow and border token normalization.
  function normalizeColorToRGBA(color) {
    const hex = normalizeColorToHex(color);
    if (!hex) return null;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const alpha = hex.length === 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1;
    return `rgba(${r},${g},${b},${parseFloat(alpha.toFixed(3))})`;
  }

  function looksLikeColor(value) {
    return normalizeColorToHex(value) !== null;
  }

  function compareColors(expected, actual) {
    const expectedHex = normalizeColorToHex(expected);
    const actualHex = normalizeColorToHex(actual);
    if (expectedHex && actualHex) return expectedHex === actualHex;
    return normalizeCSSValue(expected) === normalizeCSSValue(actual);
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
    const colors = [];

    const tokenized = shadow.replace(/rgba?\([^)]+\)|hsla?\([^)]+\)|color\([^)]+\)|#[0-9a-f]{3,8}\b/gi, match => {
      colors.push(normalizeColorToHex(match) || match.toLowerCase());
      return `__COLOR${colors.length - 1}__`;
    });

    tokenized.split(/\s+/).filter(Boolean).forEach(part => {
      const colorMatch = part.match(/^__COLOR(\d+)__$/);
      if (colorMatch) { color = colors[Number(colorMatch[1])]; return; }
      if (part.toLowerCase() === 'inset') { numericParts.push('inset'); return; }
      const num = resolveLength(part, null);
      if (num !== null) { numericParts.push(Math.round(num * 100) / 100); return; }
      const colorAttempt = normalizeColorToHex(part);
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
    const eColor = normalizeColorToHex(expected.trim()) || extractFirstColor(expected);
    const aColor = normalizeColorToHex(actual.trim()) || extractFirstColor(actual);
    if (eColor && aColor) return eColor === aColor;
    return normalizePropertyWithColors(expected) === normalizePropertyWithColors(actual);
  }

  function extractFirstColor(value) {
    const candidates = value.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|color\([^)]*\)|\btransparent\b/ig) || [];
    for (const candidate of candidates) {
      const hex = normalizeColorToHex(candidate);
      if (hex) return hex;
    }
    return null;
  }

  function compareBorder(expected, actual) {
    const normalizedExpected = normalizeCSSValue(expected);
    const normalizedActual = normalizeCSSValue(actual);
    if ((normalizedExpected === '0' || normalizedExpected === 'none') &&
        /(^|\s)0(\s|$)/.test(normalizedActual) && /\bnone\b/.test(normalizedActual)) {
      return true;
    }
    const tokenize = (val) => {
      const tokens = [];
      const colorMap = {};
      let idx = 0;
      const cleaned = val.trim().replace(/rgba?\([^)]+\)|hsla?\([^)]+\)|color\([^)]+\)|#[0-9a-f]{3,8}\b/gi, match => {
        const key = `__CLR${idx}__`;
        colorMap[key] = normalizeColorToHex(match) || match.toLowerCase();
        idx++;
        return key;
      });
      cleaned.split(/\s+/).filter(Boolean).forEach(part => {
        if (colorMap[part] !== undefined) {
          tokens.push({ type: 'color', value: colorMap[part] });
        } else {
          const num = resolveLength(part, null);
          if (num !== null) tokens.push({ type: 'number', value: num });
          else {
            const color = normalizeColorToHex(part);
            tokens.push(color
              ? { type: 'color', value: color }
              : { type: 'keyword', value: part.toLowerCase() });
          }
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
    value = value.replace(/(^|[\s,(])\.(\d)/g, '$10.$2');

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
    // Reuse the comprehensive lookup initialized by colorToHex.
    const namedColors = namedColorsCache = namedColorsCache || {
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
      'mediumblue': '#0000cd', 'mediumorchid': '#ba55d3', 'mediumpurple': '#9370db', 'mediumseagreen': '#3cb371',
      'mediumslateblue': '#7b68ee', 'mediumspringgreen': '#00fa9a', 'mediumturquoise': '#48d1cc', 'mediumvioletred': '#c71585',
      'midnightblue': '#191970', 'mintcream': '#f5fffa', 'mistyrose': '#ffe4e1', 'moccasin': '#ffe4b5',
      'navajowhite': '#ffdead', 'navy': '#000080', 'oldlace': '#fdf5e6', 'olive': '#808000',
      'olivedrab': '#6b8e23', 'orange': '#ffa500', 'orangered': '#ff4500', 'orchid': '#da70d6',
      'palegoldenrod': '#eee8aa', 'palegreen': '#98fb98', 'paleturquoise': '#afeeee', 'palevioletred': '#db7093',
      'papayawhip': '#ffefd5', 'peachpuff': '#ffdab9', 'peru': '#cd853f', 'pink': '#ffc0cb',
      'plum': '#dda0dd', 'powderblue': '#b0e0e6', 'purple': '#800080', 'rebeccapurple': '#663399',
      'red': '#ff0000', 'rosybrown': '#bc8f8f', 'royalblue': '#4169e1', 'saddlebrown': '#8b4513',
      'salmon': '#fa8072', 'sandybrown': '#f4a460', 'seagreen': '#2e8b57', 'seashell': '#fff5ee',
      'sienna': '#a0522d', 'silver': '#c0c0c0', 'skyblue': '#87ceeb', 'slateblue': '#6a5acd',
      'slategray': '#708090', 'slategrey': '#708090', 'snow': '#fffafa', 'springgreen': '#00ff7f',
      'steelblue': '#4682b4', 'tan': '#d2b48c', 'teal': '#008080', 'thistle': '#d8bfd8',
      'tomato': '#ff6347', 'turquoise': '#40e0d0', 'violet': '#ee82ee', 'wheat': '#f5deb3',
      'white': '#ffffff', 'whitesmoke': '#f5f5f5', 'yellow': '#ffff00', 'yellowgreen': '#9acd32'
    };
    
    // Replace named colors (as whole words) with one cached expression.
    if (!namedColorPatternCache) {
      namedColorPatternCache = new RegExp(`\\b(?:${Object.keys(namedColors).join('|')})\\b`, 'gi');
    }
    value = value.replace(namedColorPatternCache, colorName => namedColors[colorName.toLowerCase()]);
    
    // Normalize numeric values with units
    value = value.replace(/\b0(px|em|rem|pt|pc|in|cm|mm|ex|ch|vw|vh|vmin|vmax|deg|rad|grad|ms|s|Hz|kHz)\b/g, '0');
    
    // Normalize commas
    value = value.replace(/\s*,\s*/g, ',');
    
    // Normalize spaces around operators and values
    value = value.replace(/\s+/g, ' ').trim();
    
    return value.toLowerCase();
  }

  function splitCssTokens(value) {
    const tokens = [];
    let token = '';
    let depth = 0;
    for (const character of value.trim()) {
      if (character === '(') depth++;
      else if (character === ')') depth--;
      if (/\s/.test(character) && depth === 0) {
        if (token) tokens.push(token);
        token = '';
      } else {
        token += character;
      }
    }
    if (token) tokens.push(token);
    return tokens;
  }

  function normalizeTime(value) {
    const match = String(value || '').trim().toLowerCase().match(/^(-?(?:\d+|\d*\.\d+))(ms|s)$/);
    if (!match) return null;
    const milliseconds = parseFloat(match[1]) * (match[2] === 's' ? 1000 : 1);
    return Math.abs(milliseconds) < 1e-9 ? 0 : Number(milliseconds.toFixed(6));
  }

  function isTimingFunction(value) {
    return /^(?:ease|linear|ease-in|ease-out|ease-in-out|step-start|step-end|steps\(|cubic-bezier\(|linear\()/i.test(value);
  }

  /** Normalize transition token order, omitted defaults, and ms/s units. */
  function normalizeTransitionValue(value) {
    return splitShadowLayers(value).map(layer => {
      const result = { property: 'all', duration: 0, easing: 'ease', delay: 0 };
      let timeIndex = 0;
      for (const rawToken of splitCssTokens(layer)) {
        const token = normalizeCSSValue(rawToken);
        const time = normalizeTime(rawToken);
        if (time !== null) {
          if (timeIndex++ === 0) result.duration = time;
          else result.delay = time;
        } else if (isTimingFunction(token)) {
          result.easing = token;
        } else if (token) {
          result.property = token;
        }
      }
      return JSON.stringify(result);
    }).sort().join(', ');
  }

  function compareTransition(expected, actual) {
    return normalizeTransitionValue(expected) === normalizeTransitionValue(actual);
  }

  /**
   * Animation shorthand components may be written in any order. Browsers tend
   * to serialize the name last, so compare parsed components rather than token
   * positions. List order is retained because it controls animation stacking.
   */
  function normalizeAnimationValue(value) {
    return splitShadowLayers(value).map(layer => {
      const result = {
        name: 'none', duration: 0, easing: 'ease', delay: 0,
        iteration: '1', direction: 'normal', fill: 'none', play: 'running'
      };
      let timeIndex = 0;
      for (const rawToken of splitCssTokens(layer)) {
        const token = normalizeCSSValue(rawToken);
        const time = normalizeTime(rawToken);
        if (time !== null) {
          if (timeIndex++ === 0) result.duration = time;
          else result.delay = time;
        } else if (isTimingFunction(token)) {
          result.easing = token;
        } else if (token === 'infinite' || /^\d*\.?\d+$/.test(token)) {
          result.iteration = token === 'infinite' ? token : String(Number(token));
        } else if (/^(?:normal|reverse|alternate|alternate-reverse)$/.test(token)) {
          result.direction = token;
        } else if (/^(?:forwards|backwards|both)$/.test(token)) {
          result.fill = token;
        } else if (/^(?:running|paused)$/.test(token)) {
          result.play = token;
        } else if (token === 'none') {
          // "none" is both the default animation name and fill mode. Both
          // defaults are already represented, so it cannot change this layer.
        } else if (token) {
          result.name = token;
        }
      }
      return JSON.stringify(result);
    }).join(', ');
  }

  function compareAnimation(expected, actual) {
    return normalizeAnimationValue(expected) === normalizeAnimationValue(actual);
  }

  function compareCounterList(expected, actual, defaultValue) {
    const normalize = value => {
      const normalized = normalizeCSSValue(value);
      if (normalized === 'none') return 'none';
      const tokens = splitCssTokens(normalized);
      const counters = [];
      for (let index = 0; index < tokens.length; index++) {
        const name = tokens[index];
        const next = tokens[index + 1];
        const hasInteger = /^[-+]?\d+$/.test(next || '');
        counters.push(`${name} ${hasInteger ? Number(next) : defaultValue}`);
        if (hasInteger) index++;
      }
      return counters.join(',');
    };
    return normalize(expected) === normalize(actual);
  }

  // Normalize CSS values for string-level comparison (last resort)
  function normalizeCSSValue(value) {
    if (!value) return '';
    // Strip !important — computed styles never include it
    value = value.replace(/\s*!important\s*/gi, '');
    value = value.replace(/\s+/g, ' ').trim();
    value = value.replace(/\s*,\s*/g, ',');
    // Normalize leading decimal: ".1" → "0.1"
    value = value.replace(/(^|[\s,(])\.(\d)/g, '$10.$2');
    // Preserve relative units while removing insignificant precision.
    value = value.replace(/-?(?:\d+\.\d+|\.\d+)(?=%|[a-z]+\b)/gi, number => String(Number(number)));
    // Strip units from zero values
    value = value.replace(/\b0(px|em|rem|pt|pc|in|cm|mm|ex|ch|vw|vh|vmin|vmax|deg|rad|grad|turn|ms|s|Hz|kHz)\b/g, '0');
    return value.toLowerCase();
  }


  // ========================================
  // AUTO FIX (Component-Based)
  // ========================================

  function autoFixViolationsOptimized(components) {
    if (!Array.isArray(components) || components.length === 0) {
      return { success: false, fixedCount: 0, fixes: [], error: 'No components provided.' };
    }

    const signature = catalogSignature(components);
    if (signature !== lastCheckedCatalogSignature) runConsistencyCheckOptimized(components);

    const maximumDeclarations = MAX_FIX_DECLARATIONS;
    const omittedDeclarationCount = lastOmittedFixDeclarationCount;
    const candidates = lastFailedDeclarations.slice(0, maximumDeclarations);
    const byElement = new Map();
    document.querySelectorAll('.ui-check-error').forEach(element => element.classList.remove('ui-check-error'));
    computedStyleCache = new WeakMap();
    displayNoneCache = new WeakMap();

    for (const failure of candidates) {
      if (!failure.element || !failure.element.isConnected) continue;
      if (isDisplayNone(failure.element)) continue;
      const expected = failure.value.replace(/\s*!important\s*/gi, '').trim();
      const computed = getCachedComputedStyle(failure.element);
      const actual = getActualValue(failure.property, failure.element, computed);
      const resolvedExpected = resolveComparableValue(expected, computed);
      const resolvedActual = resolveComparableValue(actual, computed);
      if (smartCompareValues(failure.property, resolvedExpected, resolvedActual, failure.element) ||
          smartCompareValues(failure.property, expected, resolvedActual, failure.element)) continue;
      if (!byElement.has(failure.element)) byElement.set(failure.element, new Map());
      byElement.get(failure.element).set(failure.property, failure);
    }

    const fixes = [];
    const fixedElements = [];
    for (const [element, declarations] of byElement) {
      const css = [];
      let selector = '';
      for (const failure of declarations.values()) {
        const value = failure.value.replace(/\s*!important\s*/gi, '').trim();
        if (!value) continue;
        element.style.setProperty(failure.property, value, 'important');
        selector = failure.selector;
        css.push(`${failure.property}: ${value} !important;`);
      }
      if (!css.length) continue;

      element.classList.remove('ui-check-error');
      element.classList.add('ui-check-fixed');
      fixedElements.push(element);
      if (fixes.length < MAX_REPORTED_FIXES) {
        fixes.push({ element: summarizeValue(selector, 500), css: summarizeValue(css.join('\n'), 4000) });
      }
    }

    if (fixedElements.length) {
      setTimeout(() => fixedElements.forEach(element => element.classList.remove('ui-check-fixed')), 500);
    }
    lastFailedDeclarations = [];
    lastOmittedFixDeclarationCount = 0;

    return {
      success: true,
      fixedCount: fixedElements.length,
      fixes,
      omittedFixCount: Math.max(0, fixedElements.length - fixes.length),
      omittedDeclarationCount
    };
  }

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

  function scanPageForComponentsOptimized() {
    const selector = [
      '[data-ui]', '.mdl-button', '.mdl-js-button', '.mdl-textfield',
      '.mdl-js-textfield', '.mdl-card', '.mdl-dialog', '.mdl-layout__header',
      '.btn', '.button', '.card', '.modal', '.navbar', 'nav', 'dialog',
      'button', 'input', 'textarea', 'select'
    ].join(',');
    const found = Array.from(document.querySelectorAll(selector));
    const selected = found.slice(0, MAX_SCANNED_COMPONENTS);
    const components = selected.map(element => {
      const styles = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        type: detectElementType(element),
        tagName: element.tagName.toLowerCase(),
        className: element.getAttribute('class') || '',
        id: element.id || '',
        dataUi: element.dataset.ui || null,
        styles: {
          height: parseFloat(styles.height) || 0,
          width: parseFloat(styles.width) || 0,
          borderRadius: parseFloat(styles.borderRadius) || 0,
          padding: styles.padding,
          margin: styles.margin,
          backgroundColor: styles.backgroundColor,
          color: styles.color,
          fontSize: styles.fontSize,
          fontWeight: styles.fontWeight
        },
        position: { top: rect.top, left: rect.left }
      };
    });

    return {
      url: window.location.href,
      title: document.title,
      totalComponents: found.length,
      omittedComponentCount: Math.max(0, found.length - components.length),
      components
    };
  }

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

  if (window.__UI_CHECKER_TEST__) {
    window.__uiCheckerTestHooks = {
      compileCheckTasks,
      computeMatchingSpecificity,
      parseActiveCSSRules,
      scopeSelector
    };
  }

  console.log('[UI Checker] Content script loaded successfully');
})();
