(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.UIContextBudget = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PRESETS = {
    compact: { totalInputTokens: 14000, pageTokens: 4200, historyTokens: 5200, responseTokens: 3200 },
    balanced: { totalInputTokens: 24000, pageTokens: 8500, historyTokens: 9000, responseTokens: 4200 },
    detailed: { totalInputTokens: 38000, pageTokens: 15000, historyTokens: 14000, responseTokens: 5200 }
  };
  const STOP_WORDS = new Set('a an and are as at be by can could do for from has have how i in is it me my of on or our page please should that the their this to was what when where which why with you your'.split(' '));

  function estimateTokens(value) {
    const text = typeof value === 'string' ? value : JSON.stringify(value || '');
    return Math.ceil(text.length / 3.2);
  }

  function modelBudget(model, preference = 'balanced') {
    const base = { ...(PRESETS[preference] || PRESETS.balanced) };
    const id = String(model || '').toLowerCase();
    if (/mini|nano|haiku|flash-lite/.test(id)) {
      base.totalInputTokens = Math.min(base.totalInputTokens, 18000);
      base.pageTokens = Math.min(base.pageTokens, 6000);
      base.historyTokens = Math.min(base.historyTokens, 6500);
    }
    return base;
  }

  function keywords(prompt) {
    return [...new Set(String(prompt || '').toLowerCase().match(/[a-z0-9_-]{3,}/g) || [])]
      .filter(word => !STOP_WORDS.has(word)).slice(0, 40);
  }

  function redactSensitiveText(value, limit = 2000) {
    return String(value || '')
      .replace(/data:[^;,\s]+;base64,[a-z0-9+/=]{24,}/gi, '[redacted-inline-data]')
      .replace(/\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g, '[redacted-token]')
      .replace(/\bBearer\s+[a-zA-Z0-9._~-]{12,}\b/gi, 'Bearer [redacted]')
      .replace(/\b(?:password|passwd|secret|token|authorization|cookie|session)\s*[:=]\s*\S+/gi, match => `${match.split(/[:=]/, 1)[0]}=[redacted]`)
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
      .replace(/\b(?:\d[ -]*?){13,19}\b/g, '[redacted-number]')
      .slice(0, limit);
  }

  function safePage(rawPage) {
    const page = rawPage && typeof rawPage === 'object' ? rawPage : {};
    let url = String(page.url || '').slice(0, 1600);
    try { const parsed = new URL(url); parsed.search = ''; parsed.hash = ''; url = parsed.toString(); } catch (_) { url = url.split(/[?#]/, 1)[0]; }
    return {
      title: redactSensitiveText(page.title, 300),
      url,
      viewport: page.viewport && typeof page.viewport === 'object' ? page.viewport : undefined,
      language: String(page.language || '').slice(0, 40) || undefined
    };
  }

  function elementScore(element, words, profile, viewport) {
    const tag = String(element?.tag || '').toLowerCase();
    const selector = String(element?.selector || '').toLowerCase();
    const text = String(element?.text || '').toLowerCase();
    const role = String(element?.role || element?.semantics?.role || '').toLowerCase();
    let score = 1;
    for (const word of words) {
      if (selector.includes(word)) score += 7;
      if (text.includes(word)) score += 5;
      if (role.includes(word)) score += 4;
    }
    if (/^h[1-6]$/.test(tag)) score += profile === 'article' ? 18 : 8;
    if (['main', 'article'].includes(tag) || role === 'main') score += 15;
    if (['button', 'input', 'select', 'textarea', 'label'].includes(tag) || ['button', 'textbox', 'checkbox'].includes(role)) score += profile === 'form' || profile === 'accessibility' ? 18 : 6;
    if (element?.semantics && Object.keys(element.semantics).length) score += profile === 'accessibility' ? 15 : 4;
    if (profile === 'article' && ['nav', 'footer', 'aside'].includes(tag)) score -= 14;
    if (element?.box && viewport) {
      const visible = element.box.x < viewport.width && element.box.y < viewport.height && element.box.x + element.box.width > 0 && element.box.y + element.box.height > 0;
      if (visible) score += 9;
      else score -= 3;
    }
    return score;
  }

  function cleanElement(element) {
    const result = {
      selector: String(element?.selector || '').slice(0, 260),
      tag: String(element?.tag || '').slice(0, 30)
    };
    if (element?.role) result.role = redactSensitiveText(element.role, 80);
    if (element?.text) result.text = redactSensitiveText(element.text, 520).replace(/\s+/g, ' ').trim();
    if (element?.box) result.box = element.box;
    if (element?.style && typeof element.style === 'object') result.style = Object.fromEntries(Object.entries(element.style).slice(0, 28).map(([key, value]) => [String(key).slice(0, 70), redactSensitiveText(value, 180)]));
    if (element?.semantics && typeof element.semantics === 'object') result.semantics = Object.fromEntries(Object.entries(element.semantics).slice(0, 20).map(([key, value]) => [String(key).slice(0, 70), typeof value === 'boolean' ? value : redactSensitiveText(value, 220)]));
    return result;
  }

  function cleanSelectedElement(element) {
    if (!element || typeof element !== 'object') return undefined;
    return { ...cleanElement(element), html: element.html ? redactSensitiveText(element.html, 6000) : undefined };
  }

  function relevantCss(css, words, selectors, maxChars) {
    const source = redactSensitiveText(css, 500000).replace(/\/\*[\s\S]*?\*\//g, '').replace(/url\([^)]*\)/gi, 'url([removed])');
    if (!source || maxChars <= 0) return '';
    const needles = [...words, ...selectors.flatMap(selector => selector.match(/[.#][a-z0-9_-]+/gi) || []).map(value => value.slice(1).toLowerCase())].filter(Boolean);
    const rules = source.match(/[^{}]+\{[^{}]{0,2400}\}/g) || [];
    const ranked = rules.map((rule, index) => {
      const header = rule.slice(0, rule.indexOf('{')).toLowerCase();
      let score = /:root|@media/.test(header) ? 4 : 0;
      for (const needle of needles) if (header.includes(needle)) score += 5;
      return { rule: rule.slice(0, 2600), score, index };
    }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.index - b.index);
    let output = '';
    for (const item of ranked) {
      if (output.length + item.rule.length + 1 > maxChars) continue;
      output += `${item.rule}\n`;
    }
    return output.trim();
  }

  function processPageContext(raw, prompt, options = {}) {
    if (!raw || typeof raw !== 'object') return { context: null, stats: { estimatedTokens: 0, reduced: false } };
    const budget = modelBudget(options.model, options.preference);
    const maxTokens = Math.max(800, Math.min(Number(options.maxPageTokens) || budget.pageTokens, budget.pageTokens));
    const maxChars = Math.floor(maxTokens * 3.2);
    const words = keywords(prompt);
    const profile = String(options.profile || raw.profile || 'broad');
    const viewport = raw.page?.viewport || null;
    const seen = new Set();
    const ranked = (Array.isArray(raw.elements) ? raw.elements : []).map((element, index) => ({ element: cleanElement(element), score: elementScore(element, words, profile, viewport), index }))
      .filter(item => {
        const key = `${item.element.selector}|${item.element.text || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).sort((a, b) => b.score - a.score || a.index - b.index);

    const context = {
      schemaVersion: 2,
      profile,
      page: safePage(raw.page),
      summary: raw.summary || {},
      privacy: raw.privacy || {},
      selectedElement: cleanSelectedElement(options.selectedElement || raw.selectedElement),
      designTokens: Object.fromEntries(Object.entries(raw.designTokens || {}).slice(0, 100).map(([key, value]) => [String(key).slice(0, 100), redactSensitiveText(value, 180)])),
      elements: [],
      relevantCSS: ''
    };
    const fixedChars = JSON.stringify(context).length;
    const elementAllowance = Math.max(1200, Math.floor((maxChars - fixedChars) * 0.72));
    let used = 0;
    for (const item of ranked) {
      const serialized = JSON.stringify(item.element);
      if (used + serialized.length > elementAllowance) continue;
      context.elements.push(item.element);
      used += serialized.length;
    }
    const selectors = context.elements.slice(0, 80).map(element => element.selector);
    const cssAllowance = Math.max(0, maxChars - JSON.stringify(context).length - 600);
    context.relevantCSS = relevantCss(raw.authoredCSS, words, selectors, cssAllowance);
    context.summary.sentElements = context.elements.length;
    context.summary.originalEstimatedTokens = estimateTokens(raw);
    hardFit(context, maxChars);
    const finalTokens = estimateTokens(context);
    context.summary.sentEstimatedTokens = finalTokens;
    context.summary.contextReduced = context.summary.originalEstimatedTokens > finalTokens;
    return { context, stats: { estimatedTokens: finalTokens, originalEstimatedTokens: context.summary.originalEstimatedTokens, reduced: context.summary.contextReduced, maxTokens } };
  }

  function hardFit(context, maxChars) {
    let serialized = JSON.stringify(context);
    while (serialized.length > maxChars && context.relevantCSS) {
      context.relevantCSS = context.relevantCSS.slice(0, Math.floor(context.relevantCSS.length * 0.65));
      serialized = JSON.stringify(context);
    }
    while (serialized.length > maxChars && context.elements.length > 1) {
      context.elements.pop();
      serialized = JSON.stringify(context);
    }
    while (serialized.length > maxChars && Object.keys(context.designTokens).length) {
      const entries = Object.entries(context.designTokens);
      entries.pop(); context.designTokens = Object.fromEntries(entries);
      serialized = JSON.stringify(context);
    }
    if (serialized.length > maxChars) {
      context.page = { title: String(context.page?.title || '').slice(0, 200), url: String(context.page?.url || '').slice(0, 400), viewport: context.page?.viewport };
      context.relevantCSS = '';
      context.elements = context.elements.slice(0, 1);
      if (context.selectedElement) {
        context.selectedElement = {
          selector: String(context.selectedElement.selector || '').slice(0, 260),
          tag: String(context.selectedElement.tag || '').slice(0, 30),
          text: String(context.selectedElement.text || '').slice(0, 800),
          html: String(context.selectedElement.html || '').slice(0, 2400),
          box: context.selectedElement.box,
          style: context.selectedElement.style,
          semantics: context.selectedElement.semantics
        };
      }
      serialized = JSON.stringify(context);
    }
    if (serialized.length > maxChars) {
      context.elements = [];
      context.designTokens = {};
      if (context.selectedElement) {
        delete context.selectedElement.html;
        delete context.selectedElement.style;
      }
      serialized = JSON.stringify(context);
    }
    if (serialized.length > maxChars) {
      context.summary = { contextReduced: true };
      context.privacy = { sanitized: true };
    }
  }

  function selectConversationHistory(messages, summary, model, preference = 'balanced') {
    const budget = modelBudget(model, preference);
    const maxChars = budget.historyTokens * 3.2;
    const clean = (Array.isArray(messages) ? messages : []).filter(message => message && !message.error && message.content).map(message => ({ role: message.role === 'assistant' ? 'assistant' : 'user', content: String(message.content).slice(0, 30000) }));
    const selected = [];
    let used = 0;
    for (let index = clean.length - 1; index >= 0; index--) {
      const size = clean[index].content.length + 40;
      if (used + size > maxChars && selected.length >= 2) break;
      selected.unshift(clean[index]); used += size;
    }
    if (summary && selected.length < clean.length) {
      const room = Math.max(0, maxChars - used - 80);
      if (room > 200) selected.unshift({ role: 'user', content: `[Earlier conversation summary]\n${String(summary).slice(-room)}` });
    }
    return { messages: selected, estimatedTokens: estimateTokens(selected), maxTokens: budget.historyTokens };
  }

  function processComponentLibrary(components, library, prompt, options = {}) {
    const source = Array.isArray(components) ? components : [];
    if (!source.length) return null;
    const preference = ['compact', 'balanced', 'detailed'].includes(options.preference) ? options.preference : 'balanced';
    const maxChars = Math.min(Number(options.maxChars) || (preference === 'compact' ? 7000 : preference === 'detailed' ? 22000 : 13000), 24000);
    const words = keywords(prompt);
    const ranked = source.map((component, index) => {
      const name = redactSensitiveText(component?.name || `Component ${index + 1}`, 160);
      const scope = redactSensitiveText(component?.scope || '', 260);
      const type = redactSensitiveText(component?.componentType || '', 80);
      const styles = String(component?.styles || '').slice(0, 1000000);
      const haystack = `${name} ${scope} ${type}`.toLowerCase();
      const styleSearch = styles.toLowerCase();
      let score = 1;
      for (const word of words) {
        if (haystack.includes(word)) score += 12;
        if (styleSearch.includes(word)) score += 3;
      }
      return { component, name, scope, type, styles, score, index };
    }).sort((a, b) => b.score - a.score || a.index - b.index);
    const matchedComponents = [];
    let used = 0;
    for (const item of ranked.slice(0, 12)) {
      let styles = relevantCss(item.styles, words, [item.scope, item.name].filter(Boolean), Math.max(0, maxChars - used));
      if (!styles) styles = redactSensitiveText(item.styles, Math.min(item.index === ranked[0]?.index ? 2200 : 1200, maxChars - used));
      const entry = { id: redactSensitiveText(item.component?.id || '', 100), name: item.name, scope: item.scope || undefined, componentType: item.type || undefined, styles };
      const size = JSON.stringify(entry).length;
      if (used + size > maxChars) continue;
      matchedComponents.push(entry); used += size;
    }
    if (!matchedComponents.length) return null;
    return {
      authority: 'design-standard',
      library: library && typeof library === 'object' ? JSON.parse(JSON.stringify(library)) : { name: 'Saved components', componentCount: source.length },
      availableComponents: source.slice(0, 40).map(component => ({ name: redactSensitiveText(component?.name || '', 160), scope: redactSensitiveText(component?.scope || '', 260) || undefined })),
      matchedComponents,
      estimatedTokens: estimateTokens(matchedComponents),
      note: 'Authoritative user-imported UI standard. Reuse these components, selectors, scopes, tokens, responsive rules, and established values. Do not introduce conflicting design values; extend the closest component only when no exact standard exists.'
    };
  }

  return { PRESETS, estimateTokens, modelBudget, keywords, redactSensitiveText, processPageContext, processComponentLibrary, selectConversationHistory, relevantCss };
});
