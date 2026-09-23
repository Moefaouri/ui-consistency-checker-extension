(function () {
  'use strict';

  const PROVIDERS = {
    openai: {
      label: 'OpenAI', keyUrl: 'https://platform.openai.com/api-keys', defaultModel: 'gpt-6-astra',
      models: [['gpt-6-astra', 'GPT-6 Astra'], ['gpt-5.6-sol', 'GPT-5.6 Sol'], ['gpt-5.6-terra', 'GPT-5.6 Terra'], ['gpt-5.6-luna', 'GPT-5.6 Luna'], ['gpt-5.5', 'GPT-5.5']]
    },
    anthropic: {
      label: 'Claude', keyUrl: 'https://console.anthropic.com/settings/keys', defaultModel: 'claude-sonnet-5',
      models: [['claude-sonnet-5', 'Claude Sonnet 5'], ['claude-opus-5', 'Claude Opus 5'], ['claude-sonnet-4-6', 'Claude Sonnet 4.6'], ['claude-haiku-4-5-20251001', 'Claude Haiku 4.5']]
    },
    google: {
      label: 'Google AI Studio', keyUrl: 'https://aistudio.google.com/apikey', defaultModel: 'gemini-3.8-flash',
      models: [['gemini-3.8-flash', 'Gemini 3.8 Flash'], ['gemini-3.7-flash', 'Gemini 3.7 Flash'], ['gemini-3.5-flash', 'Gemini 3.5 Flash'], ['gemini-3.1-pro-preview', 'Gemini 3.1 Pro Preview'], ['gemini-2.5-pro', 'Gemini 2.5 Pro'], ['gemini-2.5-flash', 'Gemini 2.5 Flash']]
    }
  };
  const MAX_CONVERSATIONS = 50;
  const MAX_STORED_MESSAGES = 100;
  const MAX_HISTORY_MESSAGES = 18;
  const PAGE_TERMS = /\b(this|current|page|website|site|screen|layout|button|card|form|navbar|header|footer|element|css|html|dom|responsive|mobile|desktop|accessibility|aria|contrast|overflow|align|spacing|font|color|design|ui|ux|submit|input|image|modal|menu|tab)\b/i;
  const GENERAL_TERMS = /\b(weather|capital of|translate|recipe|write (?:a|an)|brainstorm|explain (?:quantum|history|math)|who is|what time|news today)\b/i;
  const VISUAL_TERMS = /\b(look|visual|design|color|spacing|align|misalign|layout|responsive|mobile|desktop|screenshot|appearance|polish)\b/i;
  const ACCESSIBILITY_TERMS = /\b(accessibility|accessible|a11y|aria|screen reader|keyboard|contrast|focus)\b/i;
  const FORM_TERMS = /\b(form|submit|validation|input|textarea|select|checkbox|login|sign in|field)\b/i;
  const CURRENT_INFO_TERMS = /\b(weather|forecast|news|latest|today|current (?:price|score|president|ceo)|stock price|exchange rate|live score)\b/i;

  const state = {
    provider: 'openai', models: {}, availableModels: {}, apiKeys: {}, contextMode: 'auto', includeText: true,
    retention: 'forever', conversations: [], activeId: '', selectedElement: null, contextCache: null,
    running: false, requestId: '', port: null, streamText: '', streamMessageId: '', forceRefresh: false,
    screen: 'chat', drafts: {}, allowScreenshots: true, allowDom: true, allowElementSelection: true,
    contextSize: 'balanced', fontSize: 'medium', motion: 'system', theme: 'system', connectionValid: false,
    oneShotContext: '', previewActive: false, previewMessageId: '', previewParts: { html: false, css: false, js: false }, useComponentLibrary: true,
    authModes: { openai: 'api', anthropic: 'api', google: 'api' }
  };
  const el = {};

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    mapElements();
    if (!el.shell) return;
    bindEvents();
    await loadState();
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => { if (state.motion === 'system') applyChatAppearance(); });
    pruneHistory();
    ensureConversation();
    renderAll();
  }

  function mapElements() {
    const ids = ['aiChatShell','aiHistoryBtn','aiConversationTitle','aiNewChatBtn','aiSettingsBtn','aiHistoryPanel','aiCloseHistoryBtn','aiHistoryNewBtn','aiHistoryList','aiSettingsPanel','aiSettingsBackBtn','aiAuthMode','aiAccountPanel','aiAccountLoginBtn','aiAccountHint','aiApiKeyField','aiModelField','aiEndpointField','aiChatApiKey','aiChatToggleKey','aiChatGetKey','aiChatModel','aiChatCustomModel','aiChatLoadModels','aiChatModelHint','aiSaveConnectionBtn','aiTestConnectionBtn','aiConnectionStatus','aiApiEndpoint','aiFontSize','aiMotionPreference','aiContextMode','aiContextSize','aiAllowDom','aiAllowScreenshots','aiAllowElementSelection','aiUseComponentLibrary','aiChatIncludeText','aiHistoryRetention','aiClearHistoryBtn','aiClearAllDataBtn','aiConfigNotice','aiNoticeSettingsBtn','aiMessageList','aiEmptyState','aiChatStatus','aiAttachmentBar','aiAttachmentLabel','aiRemoveAttachment','aiContextPill','aiContextPillText','aiInspectElementBtn','aiRefreshContextBtn','aiComposer','aiChatInput','aiSendBtn','aiStopBtn'];
    ids.forEach(id => { el[id.replace(/^ai/, '').replace(/^./, value => value.toLowerCase())] = document.getElementById(id); });
    el.shell = document.getElementById('aiChatShell');
    el.providerButtons = document.querySelectorAll('[data-chat-provider]');
  }

  function bindEvents() {
    el.historyBtn.addEventListener('click', () => showScreen('history'));
    el.closeHistoryBtn.addEventListener('click', () => showScreen('chat'));
    el.settingsBtn.addEventListener('click', () => showScreen('settings'));
    el.settingsBackBtn.addEventListener('click', () => showScreen('chat'));
    el.historyNewBtn.addEventListener('click', newConversation);
    el.newChatBtn.addEventListener('click', newConversation);
    el.conversationTitle.addEventListener('click', renameActiveConversation);
    el.composer.addEventListener('submit', event => { event.preventDefault(); sendCurrentMessage(); });
    el.chatInput.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); sendCurrentMessage(); }
    });
    el.chatInput.addEventListener('input', () => { resizeComposer(); saveDraftSoon(); });
    el.stopBtn.addEventListener('click', stopGeneration);
    el.contextPill.addEventListener('click', cycleContextMode);
    el.refreshContextBtn.addEventListener('click', refreshPageContext);
    el.inspectElementBtn.addEventListener('click', startElementPicker);
    el.removeAttachment.addEventListener('click', () => { state.selectedElement = null; renderAttachment(); });
    el.contextMode.addEventListener('change', () => setContextMode(el.contextMode.value));
    el.chatIncludeText.addEventListener('change', persistSettings);
    el.historyRetention.addEventListener('change', () => { state.retention = el.historyRetention.value; pruneHistory(); persistConversations(); persistSettings(); });
    el.clearAllDataBtn.addEventListener('click', clearAllAIData);
    el.clearHistoryBtn.addEventListener('click', clearChatHistory);
    el.noticeSettingsBtn.addEventListener('click', () => showScreen('settings'));
    el.providerButtons.forEach(button => button.addEventListener('click', () => changeProvider(button.dataset.chatProvider)));
    el.chatToggleKey.addEventListener('click', toggleKeyVisibility);
    el.chatApiKey.addEventListener('input', debounce(saveApiKey, 250));
    el.chatApiKey.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); saveConnectionAndReturn(); } });
    el.chatModel.addEventListener('change', changeModel);
    el.chatCustomModel.addEventListener('change', saveCustomModel);
    el.chatLoadModels.addEventListener('click', loadModels);
    el.saveConnectionBtn.addEventListener('click', saveConnectionAndReturn);
    el.testConnectionBtn.addEventListener('click', testConnection);
    el.authMode.addEventListener('change', changeAuthMode);
    el.accountLoginBtn.addEventListener('click', openAccountLogin);
    el.fontSize.addEventListener('change', persistSettings);
    el.motionPreference.addEventListener('change', persistSettings);
    el.contextSize.addEventListener('change', persistSettings);
    el.allowDom.addEventListener('change', persistSettings);
    el.allowScreenshots.addEventListener('change', persistSettings);
    el.allowElementSelection.addEventListener('change', persistSettings);
    el.useComponentLibrary.addEventListener('change', persistSettings);
    document.querySelectorAll('[data-chat-prompt]').forEach(button => button.addEventListener('click', () => { el.chatInput.value = button.dataset.chatPrompt || ''; resizeComposer(); el.chatInput.focus(); }));
    chrome.runtime.onMessage.addListener(message => {
      if (message?.action === 'aiElementSelected') {
        state.selectedElement = message.element || null;
        renderAttachment();
        setStatus(state.selectedElement ? 'Element attached. Ask anything about it.' : 'Element could not be attached.', !state.selectedElement);
        el.chatInput.focus();
      } else if (message?.action === 'aiElementPickerCancelled') {
        setStatus('Element selection cancelled.');
      }
    });
  }

  async function loadState() {
    const local = await chrome.storage.local.get(['aiProvider','aiModels','aiAuthModes','aiContextMode','aiIncludeText','aiHistoryRetention','aiConversations','aiActiveConversationId','aiDrafts','aiAllowScreenshots','aiAllowDom','aiAllowElementSelection','aiUseComponentLibrary','aiContextSize','aiChatFontSize','aiMotionPreference','theme']);
    const session = await chrome.storage.session.get(['aiApiKeys']);
    state.provider = PROVIDERS[local.aiProvider] ? local.aiProvider : 'openai';
    state.models = Object.fromEntries(Object.keys(PROVIDERS).map(key => [key, validModel(local.aiModels?.[key]) || PROVIDERS[key].defaultModel]));
    state.authModes = { openai: local.aiAuthModes?.openai === 'account' ? 'account' : 'api', anthropic: local.aiAuthModes?.anthropic === 'account' ? 'account' : 'api', google: 'api' };
    state.apiKeys = session.aiApiKeys && typeof session.aiApiKeys === 'object' ? session.aiApiKeys : {};
    state.contextMode = ['auto','on','off'].includes(local.aiContextMode) ? local.aiContextMode : 'auto';
    state.includeText = local.aiIncludeText !== false;
    state.retention = ['forever','30','7'].includes(local.aiHistoryRetention) ? local.aiHistoryRetention : 'forever';
    state.drafts = local.aiDrafts && typeof local.aiDrafts === 'object' ? local.aiDrafts : {};
    state.allowScreenshots = local.aiAllowScreenshots !== false;
    state.allowDom = local.aiAllowDom !== false;
    state.allowElementSelection = local.aiAllowElementSelection !== false;
    state.useComponentLibrary = local.aiUseComponentLibrary !== false;
    state.contextSize = ['compact','balanced','detailed'].includes(local.aiContextSize) ? local.aiContextSize : 'balanced';
    state.fontSize = ['small','medium','large'].includes(local.aiChatFontSize) ? local.aiChatFontSize : 'medium';
    state.motion = ['system','on','off'].includes(local.aiMotionPreference) ? local.aiMotionPreference : 'system';
    state.theme = ['system','dark','light'].includes(local.theme) ? local.theme : 'system';
    state.conversations = Array.isArray(local.aiConversations) ? local.aiConversations.map(normalizeConversation).filter(Boolean).slice(0, MAX_CONVERSATIONS) : [];
    state.activeId = typeof local.aiActiveConversationId === 'string' ? local.aiActiveConversationId : '';
  }

  function normalizeConversation(value) {
    if (!value || typeof value !== 'object' || typeof value.id !== 'string') return null;
    const messages = Array.isArray(value.messages) ? value.messages.slice(-MAX_STORED_MESSAGES).map(message => ({
      id: String(message.id || uid()), role: message.role === 'assistant' ? 'assistant' : 'user', content: String(message.content || '').slice(0, 50000),
      createdAt: String(message.createdAt || new Date().toISOString()), error: message.error === true,
      provider: String(message.provider || ''), model: String(message.model || ''), usedPage: String(message.usedPage || ''), recovery: String(message.recovery || '')
    })).filter(message => message.content) : [];
    return { id: value.id, title: String(value.title || 'New conversation').slice(0, 80), createdAt: String(value.createdAt || new Date().toISOString()), updatedAt: String(value.updatedAt || value.createdAt || new Date().toISOString()), messages, summary: String(value.summary || '').slice(0, 12000), pageContextRefs: Array.isArray(value.pageContextRefs) ? value.pageContextRefs.slice(-20) : [] };
  }

  function ensureConversation() {
    let conversation = state.conversations.find(item => item.id === state.activeId);
    if (!conversation) {
      conversation = createConversation();
      state.conversations.unshift(conversation);
      state.activeId = conversation.id;
      persistConversations();
    }
    return conversation;
  }

  function createConversation() {
    const now = new Date().toISOString();
    return { id: uid(), title: 'New conversation', createdAt: now, updatedAt: now, messages: [], summary: '', pageContextRefs: [] };
  }

  function activeConversation() { return state.conversations.find(item => item.id === state.activeId) || ensureConversation(); }

  function newConversation() {
    if (state.running) stopGeneration();
    const current = activeConversation();
    storeCurrentDraft();
    if (!current.messages.length && state.conversations.length === 1) { showScreen('chat'); el.chatInput.focus(); return; }
    const conversation = createConversation();
    state.conversations.unshift(conversation);
    state.activeId = conversation.id;
    state.selectedElement = null;
    state.drafts[conversation.id] = '';
    persistConversations(); persistDrafts();
    renderAll();
    showScreen('chat');
    el.chatInput.focus();
  }

  function renameActiveConversation() {
    const conversation = activeConversation();
    const title = window.prompt('Conversation name', conversation.title);
    if (title === null) return;
    const clean = title.trim().slice(0, 80);
    if (!clean) return;
    conversation.title = clean;
    conversation.updatedAt = new Date().toISOString();
    persistConversations();
    renderHeader(); renderHistory();
  }

  function deleteConversation(id) {
    const conversation = state.conversations.find(item => item.id === id);
    if (!conversation || !window.confirm(`Delete “${conversation.title}”?`)) return;
    state.conversations = state.conversations.filter(item => item.id !== id);
    delete state.drafts[id];
    if (state.activeId === id) state.activeId = state.conversations[0]?.id || '';
    ensureConversation(); persistConversations(); persistDrafts(); renderAll();
  }

  function switchConversation(id) {
    if (state.running || !state.conversations.some(item => item.id === id)) return;
    storeCurrentDraft();
    state.activeId = id; state.selectedElement = null; persistConversations(); renderAll(); showScreen('chat');
  }

  async function sendCurrentMessage(options = {}) {
    if (state.running) return;
    const conversation = activeConversation();
    const apiKey = String(state.apiKeys[state.provider] || '').trim();
    const model = selectedModel();
    const accountMode = currentAuthMode() === 'account';
    if ((!accountMode && apiKey.length < 16) || !model) {
      el.configNotice.hidden = false;
      setStatus('Connect an AI provider in Settings to send messages.', true);
      return;
    }
    let userMessage;
    if (options.retry) {
      userMessage = [...conversation.messages].reverse().find(message => message.role === 'user');
      if (!userMessage) return;
      while (conversation.messages.at(-1)?.role === 'assistant') conversation.messages.pop();
    } else {
      const content = el.chatInput.value.trim();
      if (!content) return;
      userMessage = { id: uid(), role: 'user', content, createdAt: new Date().toISOString(), error: false };
      conversation.messages.push(userMessage);
      el.chatInput.value = ''; state.drafts[conversation.id] = ''; persistDrafts(); resizeComposer();
      if (conversation.title === 'New conversation') conversation.title = makeTitle(content);
    }
    conversation.updatedAt = new Date().toISOString();
    trimConversation(conversation);
    await persistConversations();
    renderAll();
    el.configNotice.hidden = true;

    setRunning(true);
    let contextResult = { context: null, screenshotDataUrl: '', usedPage: '' };
    try {
      contextResult = await prepareContext(userMessage.content);
      const assistant = { id: uid(), role: 'assistant', content: '', createdAt: new Date().toISOString(), error: false, provider: state.provider, model, usedPage: contextResult.usedPage };
      conversation.messages.push(assistant);
      state.streamMessageId = assistant.id;
      state.streamText = '';
      renderMessages();
      startStream({ conversation, model, apiKey, contextResult });
    } catch (error) {
      appendError(conversation, error.message || 'The request could not start.', 'context');
      setRunning(false);
    }
  }

  function startStream({ conversation, model, apiKey, contextResult }) {
    state.requestId = uid();
    state.port = chrome.runtime.connect({ name: 'ai-chat-stream' });
    state.port.onMessage.addListener(message => {
      if (!message || message.requestId !== state.requestId) return;
      const assistant = conversation.messages.find(item => item.id === state.streamMessageId);
      if (message.type === 'delta') {
        state.streamText += String(message.delta || '');
        if (assistant) assistant.content = state.streamText;
        updateStreamingMessage();
      } else if (message.type === 'complete') {
        if (assistant) { assistant.content = state.streamText || 'The provider returned an empty response.'; assistant.model = message.model || model; }
        finishStream(conversation, false);
      } else if (message.type === 'stopped') {
        if (assistant && !assistant.content) assistant.content = 'Generation stopped.';
        finishStream(conversation, false);
      } else if (message.type === 'error') {
        if (assistant) {
          assistant.content = message.error || 'The AI request failed.';
          assistant.error = true;
          assistant.recovery = /(?:context|token|too large|maximum input|request size)/i.test(assistant.content) ? 'context' : 'provider';
        }
        finishStream(conversation, true);
      }
    });
    state.port.onDisconnect.addListener(() => {
      if (!state.running) return;
      const assistant = conversation.messages.find(item => item.id === state.streamMessageId);
      if (assistant && !assistant.content) { assistant.content = 'The provider connection closed before a response arrived.'; assistant.error = true; }
      finishStream(conversation, true);
    });
    const history = selectHistory(conversation);
    const lastUserText = [...conversation.messages].reverse().find(message => message.role === 'user')?.content || '';
    state.port.postMessage({ action: 'start', requestId: state.requestId, provider: state.provider, authMode: currentAuthMode(), apiKey, model, messages: history, context: contextResult.context, screenshotDataUrl: contextResult.screenshotDataUrl, webSearch: CURRENT_INFO_TERMS.test(lastUserText) });
  }

  function finishStream(conversation, isError) {
    conversation.updatedAt = new Date().toISOString();
    updateSummary(conversation);
    persistConversations();
    setRunning(false);
    renderMessages(); renderHistory();
    setStatus(isError ? 'The request failed. Your conversation was kept.' : '', isError);
    try { state.port?.disconnect(); } catch (error) { /* already closed */ }
    state.port = null;
  }

  function stopGeneration() {
    if (!state.running || !state.port) return;
    state.port.postMessage({ action: 'stop', requestId: state.requestId });
    setStatus('Stopping…');
  }

  async function prepareContext(prompt) {
    const decision = chooseContext(prompt);
    const selectedReferenceTerms = state.selectedElement
      ? [state.selectedElement.tag, state.selectedElement.selector, state.selectedElement.text, state.selectedElement.html]
        .filter(Boolean).join(' ').slice(0, 3000)
      : '';
    const componentReference = await buildComponentReference(`${prompt}\n${selectedReferenceTerms}`.trim());
    updateContextIndicator(decision.use, '', decision.reason);
    if (!decision.use) {
      if (!componentReference) return { context: null, screenshotDataUrl: '', usedPage: '' };
      setStatus(`Applying ${componentReference.matchedComponents.length} imported component standard${componentReference.matchedComponents.length === 1 ? '' : 's'}.`);
      return { context: { schemaVersion: 2, componentReference }, screenshotDataUrl: '', usedPage: '' };
    }
    const tab = await activeWebTab();
    const cacheKey = `${tab.id}:${stripUrl(tab.url)}:${decision.profile}:${state.includeText}:${state.allowDom}`;
    let rawContext;
    if (!state.allowDom) {
      rawContext = { page: { title: String(tab.title || '').slice(0, 240), url: stripUrl(tab.url) }, summary: { domInspectionDisabled: true }, privacy: { screenshotSafe: false }, elements: [], authoredCSS: '', designTokens: {} };
    } else {
    await ensureContentScript(tab.id);
    let pageVersion = null;
    try { pageVersion = (await tabMessage(tab.id, { action: 'getAIPageVersion' }, 3000))?.mutationVersion; } catch (error) { /* capture below */ }
    if (!state.forceRefresh && state.contextCache?.key === cacheKey && state.contextCache.version === pageVersion && Date.now() - state.contextCache.time < 90000) {
      rawContext = state.contextCache.rawContext;
    } else {
      setStatus('Reading relevant page details…');
      const response = await tabMessage(tab.id, { action: 'captureAIContext', options: { includeText: state.includeText, profile: decision.profile } }, 30000);
      if (!response?.success || !response.context) throw new Error(response?.error || 'The current page could not be inspected. You can retry without page context or select a specific element.');
      rawContext = response.context;
      state.contextCache = { key: cacheKey, version: response.context.mutationVersion, time: Date.now(), rawContext };
      state.forceRefresh = false;
    }
    }
    const processed = UIContextBudget.processPageContext(rawContext, prompt, {
      model: selectedModel(), preference: state.oneShotContext === 'compact' ? 'compact' : state.contextSize, profile: decision.profile,
      selectedElement: state.allowElementSelection ? state.selectedElement : null
    });
    state.oneShotContext = '';
    const context = processed.context;
    if (!context) return { context: null, screenshotDataUrl: '', usedPage: '' };
    if (componentReference) context.componentReference = componentReference;
    if (typeof lastCheckResults !== 'undefined' && lastCheckResults) context.extensionDiagnostics = { passed: lastCheckResults.passed || 0, failed: lastCheckResults.failed || 0, issues: Array.isArray(lastCheckResults.issues) ? lastCheckResults.issues.slice(0, 20) : [] };
    let screenshotDataUrl = '';
    if (state.allowScreenshots && decision.screenshot && context.privacy?.screenshotSafe === true) {
      try { screenshotDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 65 }); } catch (error) { /* DOM context remains usable */ }
    }
    const host = safeHost(tab.url);
    updateContextIndicator(true, host, decision.reason);
    const conversation = activeConversation();
    conversation.pageContextRefs.push({ url: stripUrl(tab.url), title: tab.title || host, capturedAt: new Date().toISOString(), profile: decision.profile });
    conversation.pageContextRefs = conversation.pageContextRefs.slice(-20);
    setStatus(processed.stats.reduced ? `Using a focused ${processed.stats.estimatedTokens.toLocaleString()}-token page context.` : 'Using relevant page context.');
    return { context, screenshotDataUrl, usedPage: host, contextStats: processed.stats };
  }

  async function buildComponentReference(prompt) {
    if (!state.useComponentLibrary) return null;
    const stored = await chrome.storage.local.get(['savedComponents', 'importedLibrarySummary']);
    const components = Array.isArray(stored.savedComponents) ? stored.savedComponents : [];
    if (!components.length) return null;
    return UIContextBudget.processComponentLibrary(components, stored.importedLibrarySummary, prompt, { preference: state.contextSize });
  }

  function chooseContext(prompt) {
    if (state.oneShotContext === 'off') { state.oneShotContext = ''; return { use: false, reason: 'Retrying without page context', profile: 'broad', screenshot: false }; }
    if (state.contextMode === 'off') return { use: false, reason: 'Page access is off', profile: 'broad', screenshot: false };
    if (state.selectedElement) return { use: true, reason: 'Selected element attached', profile: 'focused', screenshot: VISUAL_TERMS.test(prompt) };
    if (state.contextMode === 'on') return { use: true, reason: 'Page access is on', profile: contextProfile(prompt), screenshot: VISUAL_TERMS.test(prompt) };
    const pageRelated = PAGE_TERMS.test(prompt) && !GENERAL_TERMS.test(prompt);
    return { use: pageRelated, reason: pageRelated ? 'Relevant page request' : 'General question — no page data', profile: contextProfile(prompt), screenshot: pageRelated && VISUAL_TERMS.test(prompt) };
  }

  function contextProfile(prompt) {
    if (/\b(article|summari[sz]e|main content|blog post)\b/i.test(prompt)) return 'article';
    if (ACCESSIBILITY_TERMS.test(prompt)) return 'accessibility';
    if (FORM_TERMS.test(prompt)) return 'form';
    if (/\b(element|button|card|overflow|align|css)\b/i.test(prompt)) return 'focused';
    return 'broad';
  }

  async function startElementPicker() {
    if (state.contextMode === 'off' || !state.allowElementSelection) { setStatus('Enable selected-element inspection in Settings first.', true); return; }
    try {
      const tab = await activeWebTab();
      await ensureContentScript(tab.id);
      const response = await tabMessage(tab.id, { action: 'startAIElementPicker' }, 10000);
      if (!response?.success) throw new Error(response?.error || 'Element inspection could not start.');
      setStatus('Choose an element on the page. Press Esc to cancel.');
    } catch (error) { setStatus(error.message, true); }
  }

  function refreshPageContext() {
    state.contextCache = null; state.forceRefresh = true; setStatus('Page context will be refreshed with your next page-related message.');
  }

  function selectHistory(conversation) {
    const real = conversation.messages.filter(message => !message.error && message.content && message.id !== state.streamMessageId);
    return UIContextBudget.selectConversationHistory(real, conversation.summary, selectedModel(), state.contextSize).messages;
  }

  function updateSummary(conversation) {
    const older = conversation.messages.slice(0, -MAX_HISTORY_MESSAGES);
    if (!older.length) return;
    conversation.summary = older.slice(-16).map(message => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content.replace(/\s+/g, ' ').slice(0, 420)}`).join('\n').slice(-10000);
  }

  function trimConversation(conversation) {
    if (conversation.messages.length <= MAX_STORED_MESSAGES) return;
    updateSummary(conversation);
    conversation.messages = conversation.messages.slice(-MAX_STORED_MESSAGES);
  }

  function appendError(conversation, message, recovery = '') {
    conversation.messages.push({ id: uid(), role: 'assistant', content: message, createdAt: new Date().toISOString(), error: true, recovery, provider: state.provider, model: selectedModel() });
    conversation.updatedAt = new Date().toISOString(); persistConversations(); renderMessages(); setStatus(message, true);
  }

  function renderAll() {
    renderHeader(); renderHistory(); renderSettings(); renderMessages(); renderAttachment(); updateContextIndicator(false); applyChatAppearance();
    if (el.chatInput.dataset.conversationId !== state.activeId) {
      el.chatInput.dataset.conversationId = state.activeId;
      el.chatInput.value = String(state.drafts[state.activeId] || '');
      resizeComposer();
    }
    showScreen(state.screen);
  }
  function renderHeader() { el.conversationTitle.textContent = activeConversation().title; }

  function renderHistory() {
    el.historyList.replaceChildren();
    const sorted = [...state.conversations].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    for (const conversation of sorted) {
      const item = document.createElement('div'); item.className = `ai-history-item${conversation.id === state.activeId ? ' active' : ''}`;
      const open = document.createElement('button'); open.className = 'ai-history-open'; open.type = 'button';
      const title = document.createElement('strong'); title.textContent = conversation.title;
      const meta = document.createElement('small'); meta.textContent = `${conversation.messages.length} messages · ${relativeTime(conversation.updatedAt)}`;
      open.append(title, meta); open.addEventListener('click', () => switchConversation(conversation.id));
      const rename = iconButton('edit', 'Rename'); rename.addEventListener('click', () => { switchConversation(conversation.id); renameActiveConversation(); });
      const remove = iconButton('delete', 'Delete'); remove.addEventListener('click', () => deleteConversation(conversation.id));
      item.append(open, rename, remove); el.historyList.appendChild(item);
    }
  }

  function renderSettings() {
    el.providerButtons.forEach(button => button.classList.toggle('active', button.dataset.chatProvider === state.provider));
    el.chatApiKey.value = state.apiKeys[state.provider] || '';
    el.chatApiKey.placeholder = state.provider === 'openai' ? 'sk-…' : state.provider === 'anthropic' ? 'sk-ant-…' : 'Google AI Studio key';
    el.chatGetKey.href = PROVIDERS[state.provider].keyUrl;
    const authMode = currentAuthMode();
    el.authMode.value = authMode;
    const accountOption = el.authMode.querySelector('option[value="account"]');
    if (accountOption) accountOption.disabled = state.provider === 'google';
    el.accountPanel.hidden = authMode !== 'account';
    el.apiKeyField.hidden = authMode === 'account';
    el.modelField.hidden = false;
    el.endpointField.hidden = authMode === 'account';
    el.chatLoadModels.hidden = authMode === 'account';
    el.accountHint.textContent = authMode === 'account'
      ? `Opens ${state.provider === 'openai' ? 'ChatGPT' : 'Claude'} sign-in in your browser. The one-time local companion must be installed first.`
      : '';
    el.contextMode.value = state.contextMode; el.contextSize.value = state.contextSize; el.chatIncludeText.checked = state.includeText; el.historyRetention.value = state.retention;
    el.allowScreenshots.checked = state.allowScreenshots; el.allowDom.checked = state.allowDom; el.allowElementSelection.checked = state.allowElementSelection;
    el.useComponentLibrary.checked = state.useComponentLibrary;
    el.fontSize.value = state.fontSize; el.motionPreference.value = state.motion;
    el.connectionStatus.textContent = state.connectionValid ? `${PROVIDERS[state.provider].label} connection verified` : 'Not tested';
    el.connectionStatus.classList.toggle('success', state.connectionValid);
    const saveLabel = el.saveConnectionBtn.querySelector('span:last-child');
    if (saveLabel) saveLabel.textContent = authMode === 'account' ? 'Use account & return to chat' : 'Save key & return to chat';
    populateModels();
    if (authMode === 'account') el.chatModelHint.textContent = `Choose the ${PROVIDERS[state.provider].label} model used for this chat.`;
  }

  function renderMessages() {
    const stick = nearBottom(el.messageList);
    el.messageList.replaceChildren();
    const conversation = activeConversation();
    if (!conversation.messages.length) { el.messageList.appendChild(el.emptyState); el.emptyState.hidden = false; return; }
    el.emptyState.hidden = true;
    for (const message of conversation.messages) el.messageList.appendChild(renderMessage(message));
    if (stick || conversation.messages.at(-1)?.id === state.streamMessageId) requestAnimationFrame(() => { el.messageList.scrollTop = el.messageList.scrollHeight; });
  }

  function updateStreamingMessage() {
    const node = el.messageList.querySelector(`[data-message-id="${cssEscape(state.streamMessageId)}"] .ai-message-content`);
    if (!node) { renderMessages(); return; }
    node.innerHTML = renderMarkdown(state.streamText);
    enhanceCodeBlocks(node);
    node.classList.add('ai-stream-cursor');
    if (nearBottom(el.messageList, 110)) el.messageList.scrollTop = el.messageList.scrollHeight;
  }

  function renderMessage(message) {
    const wrapper = document.createElement('article'); wrapper.className = `ai-message ${message.role}${message.error ? ' error' : ''}`; wrapper.dataset.messageId = message.id;
    const bubble = document.createElement('div'); bubble.className = 'ai-message-bubble';
    const content = document.createElement('div'); content.className = 'ai-message-content';
    if (message.role === 'assistant') { content.innerHTML = renderMarkdown(message.content); enhanceCodeBlocks(content); }
    else content.textContent = message.content;
    if (state.running && message.id === state.streamMessageId) content.classList.add('ai-stream-cursor');
    bubble.appendChild(content);
    const meta = document.createElement('div'); meta.className = 'ai-message-meta';
    const left = document.createElement('span'); left.textContent = message.usedPage ? `Using ${message.usedPage}` : (message.role === 'assistant' ? (message.model || PROVIDERS[state.provider].label) : 'You');
    const time = document.createElement('time'); time.textContent = formatTime(message.createdAt); meta.append(left, time); bubble.appendChild(meta);
    if (message.role === 'assistant' && message.content) {
      const actions = document.createElement('div'); actions.className = 'ai-message-actions';
      const copy = actionButton('Copy'); copy.addEventListener('click', () => copyText(message.content, copy));
      const retry = actionButton(message.error ? 'Retry' : 'Regenerate'); retry.addEventListener('click', () => sendCurrentMessage({ retry: true }));
      actions.append(copy, retry);
      const bundle = extractFrontendBundle(message.content);
      if (bundle.html || bundle.css || bundle.js) {
        const active = state.previewActive && state.previewMessageId === message.id;
        const availableParts = ['html', 'css'].filter(part => Boolean(bundle[part]));
        for (const part of availableParts) {
          const applied = active && state.previewParts[part];
          const labels = [`Apply ${part.toUpperCase()}`, `Undo ${part.toUpperCase()}`];
          const button = actionButton(labels[applied ? 1 : 0]);
          button.classList.toggle('active', applied);
          button.title = `Apply or remove the proposed ${part.toUpperCase()}`;
          button.addEventListener('click', () => toggleFrontendPart(message, bundle, part));
          actions.appendChild(button);
        }
        if (bundle.js) {
          const copyJs = actionButton('Copy JS');
          copyJs.title = 'Copy the JavaScript for review. The extension never executes AI-generated JavaScript.';
          copyJs.addEventListener('click', async () => {
            await copyText(bundle.js, copyJs);
            setStatus('JavaScript copied. Review it before pasting it into DevTools Console. The extension did not execute it.');
          });
          actions.appendChild(copyJs);
        }
        if (availableParts.length > 1) {
          const applyAll = actionButton('Apply all');
          applyAll.addEventListener('click', () => applyFrontendBundle(message, bundle, Object.fromEntries(availableParts.map(part => [part, true]))));
          actions.appendChild(applyAll);
        }
        const undoAll = actionButton('Undo all');
        undoAll.disabled = !active;
        undoAll.addEventListener('click', () => clearFrontendPreview());
        actions.appendChild(undoAll);
      }
      if (message.error && message.recovery === 'context') {
        const reduced = actionButton('Retry with reduced context'); reduced.addEventListener('click', () => { state.oneShotContext = 'compact'; sendCurrentMessage({ retry: true }); });
        const without = actionButton('Send without page context'); without.addEventListener('click', () => { state.oneShotContext = 'off'; sendCurrentMessage({ retry: true }); });
        const inspect = actionButton('Select a specific element'); inspect.addEventListener('click', startElementPicker);
        actions.append(reduced, without, inspect);
      }
      bubble.appendChild(actions);
    }
    wrapper.appendChild(bubble); return wrapper;
  }

  function renderAttachment() {
    el.attachmentBar.hidden = !state.selectedElement;
    el.attachmentLabel.textContent = state.selectedElement ? `${state.selectedElement.selector} · ${Math.round(state.selectedElement.box?.width || 0)} × ${Math.round(state.selectedElement.box?.height || 0)}` : '';
  }

  function updateContextIndicator(using, host = '', reason = '') {
    el.contextPill.classList.toggle('using', Boolean(using));
    const label = using && host ? `Using: ${host}` : `Context: ${state.contextMode[0].toUpperCase()}${state.contextMode.slice(1)}`;
    el.contextPillText.textContent = label; el.contextPill.title = reason || 'Change page context mode';
  }

  function showScreen(screen) {
    state.screen = ['chat','history','settings'].includes(screen) ? screen : 'chat';
    el.shell.hidden = state.screen !== 'chat';
    el.historyPanel.hidden = state.screen !== 'history';
    el.settingsPanel.hidden = state.screen !== 'settings';
    if (state.screen === 'history') renderHistory();
    if (state.screen === 'settings') renderSettings();
    if (state.screen === 'chat') requestAnimationFrame(() => el.chatInput.focus());
  }

  function cycleContextMode() { const modes = ['auto','on','off']; setContextMode(modes[(modes.indexOf(state.contextMode) + 1) % modes.length]); }
  function setContextMode(mode) { state.contextMode = ['auto','on','off'].includes(mode) ? mode : 'auto'; el.contextMode.value = state.contextMode; state.contextCache = null; persistSettings(); updateContextIndicator(false); }

  function changeProvider(provider) { if (!PROVIDERS[provider]) return; saveApiKey(); state.provider = provider; state.connectionValid = false; persistSettings(); renderSettings(); }
  function currentAuthMode() { return state.provider === 'google' ? 'api' : (state.authModes[state.provider] === 'account' ? 'account' : 'api'); }
  function changeAuthMode() {
    state.authModes[state.provider] = state.provider === 'google' ? 'api' : (el.authMode.value === 'account' ? 'account' : 'api');
    state.connectionValid = false;
    persistSettings();
    renderSettings();
  }
  async function openAccountLogin() {
    if (currentAuthMode() !== 'account') return;
    el.accountLoginBtn.disabled = true;
    setConnectionStatus('Opening secure browser sign-in…');
    try {
      const response = await runtimeMessage({ action: 'aiNativeLogin', provider: state.provider }, 15000);
      if (!response?.success) throw new Error(response?.error || 'Could not open browser sign-in.');
      state.connectionValid = false;
      setConnectionStatus(response.message || 'Browser sign-in opened. Finish signing in, then choose Test connection.');
    } catch (error) {
      setConnectionStatus(error.message || 'Could not open browser sign-in.', true);
    } finally {
      el.accountLoginBtn.disabled = false;
    }
  }
  function toggleKeyVisibility() { const show = el.chatApiKey.type === 'password'; el.chatApiKey.type = show ? 'text' : 'password'; el.chatToggleKey.querySelector('.material-icons').textContent = show ? 'visibility_off' : 'visibility'; el.chatToggleKey.setAttribute('aria-label', show ? 'Hide API key' : 'Show API key'); }
  async function saveApiKey() { const value = el.chatApiKey.value.trim(); if (value) state.apiKeys[state.provider] = value; else delete state.apiKeys[state.provider]; await chrome.storage.session.set({ aiApiKeys: state.apiKeys }); }

  function populateModels() {
    const config = PROVIDERS[state.provider]; const selected = state.models[state.provider] || config.defaultModel; const models = new Map(config.models);
    for (const id of state.availableModels[state.provider] || []) if (!models.has(id)) models.set(id, id);
    el.chatModel.replaceChildren();
    for (const [id, label] of models) { const option = document.createElement('option'); option.value = id; option.textContent = label === id ? id : `${label} — ${id}`; el.chatModel.appendChild(option); }
    const custom = document.createElement('option'); custom.value = '__custom__'; custom.textContent = 'Custom model ID…'; el.chatModel.appendChild(custom);
    const known = models.has(selected); el.chatModel.value = known ? selected : '__custom__'; el.chatCustomModel.hidden = known; el.chatCustomModel.value = known ? '' : selected;
    el.chatModelHint.textContent = `Choose a ${config.label} model, load models enabled for your key, or enter a custom ID.`;
  }

  function changeModel() { const custom = el.chatModel.value === '__custom__'; el.chatCustomModel.hidden = !custom; if (custom) { el.chatCustomModel.value = state.models[state.provider] || ''; el.chatCustomModel.focus(); return; } state.models[state.provider] = el.chatModel.value; persistSettings(); }
  function saveCustomModel() { const model = validModel(el.chatCustomModel.value); if (!model) { setStatus('Use a valid model ID.', true); return; } state.models[state.provider] = model; persistSettings(); }
  function selectedModel() { return validModel(el.chatModel.value === '__custom__' ? el.chatCustomModel.value : el.chatModel.value); }

  async function loadModels() {
    const apiKey = el.chatApiKey.value.trim(); if (apiKey.length < 16) { setStatus('Enter your API key first.', true); return; }
    el.chatLoadModels.disabled = true; setStatus('Loading available models…');
    try {
      await saveApiKey(); const response = await runtimeMessage({ action: 'aiListModels', provider: state.provider, apiKey }, 30000);
      if (!response?.success) throw new Error(response?.error || 'Models could not be loaded.');
      state.availableModels[state.provider] = response.models || []; populateModels(); setStatus(`${response.models.length} models loaded.`);
    } catch (error) { setStatus(error.message, true); } finally { el.chatLoadModels.disabled = false; }
  }

  async function testConnection() {
    if (currentAuthMode() === 'account') {
      el.testConnectionBtn.disabled = true; setConnectionStatus('Checking local account session…');
      try {
        const response = await runtimeMessage({ action: 'aiNativeStatus', provider: state.provider }, 30000);
        if (!response?.success) throw new Error(response?.error || 'Account session was not found.');
        state.connectionValid = response.authenticated === true;
        if (!state.connectionValid) throw new Error(response.message || 'Finish account login, then test again.');
        setConnectionStatus(response.message || `${PROVIDERS[state.provider].label} account connected.`);
      } catch (error) { state.connectionValid = false; setConnectionStatus(error.message || 'Account connection failed.', true); }
      finally { el.testConnectionBtn.disabled = false; }
      return;
    }
    const apiKey = el.chatApiKey.value.trim();
    if (apiKey.length < 16) { setConnectionStatus('Enter an API key first.', true); el.chatApiKey.focus(); return; }
    el.testConnectionBtn.disabled = true; setConnectionStatus('Testing connection…');
    try {
      await saveApiKey();
      const response = await runtimeMessage({ action: 'aiListModels', provider: state.provider, apiKey }, 30000);
      if (!response?.success) throw new Error(response?.error || 'Connection failed.');
      state.availableModels[state.provider] = Array.isArray(response.models) ? response.models : [];
      if (!state.availableModels[state.provider].length) throw new Error('Connected, but this key has no compatible models.');
      state.connectionValid = true; populateModels(); setConnectionStatus(`Connected to ${PROVIDERS[state.provider].label}. ${state.availableModels[state.provider].length} models available.`);
    } catch (error) { state.connectionValid = false; setConnectionStatus(error.message || 'Connection failed.', true); }
    finally { el.testConnectionBtn.disabled = false; }
  }

  function setConnectionStatus(message, error = false) {
    el.connectionStatus.textContent = message;
    el.connectionStatus.classList.toggle('success', !error && state.connectionValid);
    el.connectionStatus.classList.toggle('error', error);
  }

  async function saveConnectionAndReturn() {
    if (el.saveConnectionBtn.disabled) return;
    if (currentAuthMode() === 'account') {
      const label = el.saveConnectionBtn.querySelector('span:last-child');
      const icon = el.saveConnectionBtn.querySelector('.material-icons');
      el.saveConnectionBtn.disabled = true; label.textContent = 'Checking account…'; icon.textContent = 'progress_activity'; icon.classList.add('is-spinning');
      try {
        const response = await runtimeMessage({ action: 'aiNativeStatus', provider: state.provider }, 30000);
        if (!response?.success || response.authenticated !== true) throw new Error(response?.error || response?.message || 'Finish account login first.');
        state.connectionValid = true; await persistSettings(); showScreen('chat'); setStatus(`${PROVIDERS[state.provider].label} account connected.`); el.chatInput.focus();
      } catch (error) { state.connectionValid = false; setConnectionStatus(error.message || 'Account connection failed.', true); }
      finally { el.saveConnectionBtn.disabled = false; label.textContent = 'Use account & return to chat'; icon.textContent = 'check'; icon.classList.remove('is-spinning'); }
      return;
    }
    const apiKey = el.chatApiKey.value.trim();
    if (apiKey.length < 16) {
      el.chatModelHint.textContent = 'Enter a valid API key first.';
      el.chatApiKey.focus();
      return;
    }
    const label = el.saveConnectionBtn.querySelector('span:last-child');
    const icon = el.saveConnectionBtn.querySelector('.material-icons');
    el.saveConnectionBtn.disabled = true;
    label.textContent = 'Validating key…';
    icon.textContent = 'progress_activity';
    icon.classList.add('is-spinning');
    try {
      await saveApiKey();
      const response = await runtimeMessage({ action: 'aiListModels', provider: state.provider, apiKey }, 30000);
      if (!response?.success) throw new Error(response?.error || 'The API key could not be validated.');
      const models = Array.isArray(response.models) ? response.models : [];
      if (!models.length) throw new Error('The key is valid, but no compatible models are available to it.');
      state.availableModels[state.provider] = models;
      state.connectionValid = true;
      const current = selectedModel();
      if (!current || !models.includes(current)) state.models[state.provider] = chooseAvailableModel(state.provider, models);
      await persistSettings();
      renderSettings();
      showScreen('chat');
      setStatus(`${PROVIDERS[state.provider].label} connected.`);
      const last = activeConversation().messages.at(-1);
      if (last?.role === 'assistant' && last.error && /(?:api key|valid model|settings)/i.test(last.content)) {
        await sendCurrentMessage({ retry: true });
      } else {
        el.chatInput.focus();
      }
    } catch (error) {
      el.chatModelHint.textContent = error.message || 'The API key could not be validated.';
      setConnectionStatus(error.message || 'The API key could not be validated.', true);
      setStatus(error.message || 'The API key could not be validated.', true);
    } finally {
      el.saveConnectionBtn.disabled = false;
      label.textContent = 'Save key & return to chat';
      icon.textContent = 'check';
      icon.classList.remove('is-spinning');
    }
  }

  function chooseAvailableModel(provider, models) {
    const recommended = PROVIDERS[provider].models.map(([id]) => id).find(id => models.includes(id));
    if (recommended) return recommended;
    if (provider === 'openai') return models.find(id => /^gpt-/i.test(id) && !/(?:audio|image|realtime|transcri|tts|search)/i.test(id)) || models[0];
    if (provider === 'google') return models.find(id => /gemini/i.test(id)) || models[0];
    return models.find(id => /claude/i.test(id)) || models[0];
  }

  async function clearAllAIData() {
    if (!window.confirm('Delete every AI conversation, provider key, and AI preference?')) return;
    await chrome.storage.local.remove(['aiConversations','aiActiveConversationId','aiDrafts','aiProvider','aiModels','aiAuthModes','aiContextMode','aiIncludeText','aiHistoryRetention','aiAllowScreenshots','aiAllowDom','aiAllowElementSelection','aiUseComponentLibrary','aiContextSize','aiChatFontSize','aiMotionPreference']);
    await chrome.storage.session.remove(['aiApiKeys']);
    state.conversations = []; state.activeId = ''; state.drafts = {}; state.apiKeys = {}; state.provider = 'openai'; state.models = Object.fromEntries(Object.keys(PROVIDERS).map(key => [key, PROVIDERS[key].defaultModel])); state.authModes = { openai: 'api', anthropic: 'api', google: 'api' }; state.contextMode = 'auto'; state.contextSize = 'balanced'; state.includeText = true; state.allowDom = true; state.allowScreenshots = true; state.allowElementSelection = true; state.useComponentLibrary = true; state.retention = 'forever'; state.fontSize = 'medium'; state.motion = 'system'; state.selectedElement = null; state.contextCache = null; state.connectionValid = false;
    ensureConversation(); renderAll(); showScreen('chat'); setStatus('AI data cleared.');
  }

  async function clearChatHistory() {
    if (!window.confirm('Delete all saved conversations?')) return;
    state.conversations = []; state.activeId = ''; state.drafts = {}; ensureConversation();
    await persistConversations(); await persistDrafts(); renderAll(); showScreen('chat'); setStatus('Chat history cleared.');
  }

  function pruneHistory() {
    if (state.retention === 'forever') return;
    const cutoff = Date.now() - Number(state.retention) * 86400000;
    state.conversations = state.conversations.filter(conversation => Date.parse(conversation.updatedAt) >= cutoff || conversation.id === state.activeId);
  }

  async function persistSettings() {
    state.includeText = el.chatIncludeText?.checked ?? state.includeText;
    state.contextMode = el.contextMode?.value || state.contextMode;
    state.contextSize = el.contextSize?.value || state.contextSize;
    state.allowScreenshots = el.allowScreenshots?.checked ?? state.allowScreenshots;
    state.allowDom = el.allowDom?.checked ?? state.allowDom;
    state.allowElementSelection = el.allowElementSelection?.checked ?? state.allowElementSelection;
    state.useComponentLibrary = el.useComponentLibrary?.checked ?? state.useComponentLibrary;
    state.retention = el.historyRetention?.value || state.retention;
    state.fontSize = el.fontSize?.value || state.fontSize;
    state.motion = el.motionPreference?.value || state.motion;
    state.contextCache = null;
    applyChatAppearance();
    await chrome.storage.local.set({
      aiProvider: state.provider, aiModels: state.models, aiAuthModes: state.authModes, aiContextMode: state.contextMode,
      aiIncludeText: state.includeText, aiHistoryRetention: state.retention,
      aiAllowScreenshots: state.allowScreenshots, aiAllowDom: state.allowDom,
      aiAllowElementSelection: state.allowElementSelection, aiContextSize: state.contextSize,
      aiUseComponentLibrary: state.useComponentLibrary, aiChatFontSize: state.fontSize, aiMotionPreference: state.motion
    });
  }
  async function persistConversations() { state.conversations = state.conversations.slice(0, MAX_CONVERSATIONS); await chrome.storage.local.set({ aiConversations: state.conversations, aiActiveConversationId: state.activeId }); }
  async function persistDrafts() { await chrome.storage.local.set({ aiDrafts: state.drafts }); }
  function storeCurrentDraft() { if (state.activeId && el.chatInput) state.drafts[state.activeId] = el.chatInput.value.slice(0, 12000); }
  const saveDraftSoon = debounce(() => { storeCurrentDraft(); persistDrafts(); }, 250);

  function applyChatAppearance() {
    document.body.dataset.chatFont = state.fontSize;
    document.body.dataset.reduceMotion = state.motion === 'off' || (state.motion === 'system' && matchMedia('(prefers-reduced-motion: reduce)').matches) ? 'true' : 'false';
  }

  function setRunning(running) { state.running = running; el.sendBtn.hidden = running; el.stopBtn.hidden = !running; el.chatInput.disabled = running; el.newChatBtn.disabled = running; if (!running) { state.requestId = ''; state.streamMessageId = ''; state.streamText = ''; el.chatInput.disabled = false; el.chatInput.focus(); } }
  function setStatus(message, error = false) { el.chatStatus.textContent = message || ''; el.chatStatus.classList.toggle('error', error); }
  function resizeComposer() { el.chatInput.style.height = 'auto'; el.chatInput.style.height = `${Math.min(150, Math.max(30, el.chatInput.scrollHeight))}px`; }

  async function activeWebTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab was found.');
    if (/^(chrome|edge|about|chrome-extension|devtools|view-source):/i.test(tab.url || '')) throw new Error('The browser does not allow page access here. Turn context Off to continue with normal chat.');
    return tab;
  }
  async function ensureContentScript(tabId) { try { await tabMessage(tabId, { action: 'ping' }, 1800); } catch (error) { await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }); } }
  function tabMessage(tabId, message, timeout = 10000) { return new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('The page did not respond.')), timeout); chrome.tabs.sendMessage(tabId, message, response => { clearTimeout(timer); if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message)); else resolve(response); }); }); }
  function runtimeMessage(message, timeout = 30000) { return new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('The extension request timed out.')), timeout); chrome.runtime.sendMessage(message, response => { clearTimeout(timer); if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message)); else resolve(response); }); }); }

  async function previewCss(css) {
    try {
      const tab = await activeWebTab(); await ensureContentScript(tab.id);
      const response = await tabMessage(tab.id, { action: 'previewAICss', css }, 10000);
      if (!response?.success) throw new Error(response?.error || 'CSS preview failed.');
      setStatus('Temporary CSS preview applied. Use Undo preview to restore the previous style.');
      return true;
    } catch (error) { setStatus(error.message, true); return false; }
  }
  async function undoCssPreview() {
    try {
      const tab = await activeWebTab(); await ensureContentScript(tab.id);
      const response = await tabMessage(tab.id, { action: 'clearAICssPreview' }, 10000);
      if (!response?.success) throw new Error(response?.error || 'The CSS preview could not be removed.');
      setStatus('Preview removed. The previous page style is restored.');
      return true;
    } catch (error) { setStatus(error.message, true); return false; }
  }
  async function toggleFrontendPart(message, bundle, part) {
    const current = state.previewActive && state.previewMessageId === message.id
      ? { ...state.previewParts }
      : { html: false, css: false, js: false };
    current[part] = !current[part];
    if (!current.html && !current.css && !current.js) {
      await clearFrontendPreview();
      return;
    }
    await applyFrontendBundle(message, bundle, current);
  }
  async function applyFrontendBundle(message, rawBundle, parts) {
    const bundle = {
      ...rawBundle,
      selector: rawBundle.selector || state.selectedElement?.selector || 'body',
      mode: rawBundle.mode || (rawBundle.selector || state.selectedElement?.selector ? 'replace' : 'append')
    };
    try {
      const tab = await activeWebTab(); await ensureContentScript(tab.id);
      const response = await tabMessage(tab.id, {
        action: 'previewAIFrontend',
        bundle,
        parts: { html: parts.html === true, css: parts.css === true, js: false },
        selectedSelector: state.selectedElement?.selector || ''
      }, 10000);
      if (!response?.success) throw new Error(response?.error || 'The frontend preview could not be applied.');
      state.previewActive = true;
      state.previewMessageId = message.id;
      state.previewParts = { html: Boolean(response.parts?.html), css: Boolean(response.parts?.css), js: false };
      if (response.selectedElement) state.selectedElement = response.selectedElement;
      state.contextCache = null;
      state.forceRefresh = true;
      renderAttachment();
      const applied = Object.entries(state.previewParts).filter(([, value]) => value).map(([key]) => key.toUpperCase()).join(' + ');
      setStatus(`${applied} preview applied. Use the matching Undo button or Undo all to restore the page.`);
      renderMessages();
      return true;
    } catch (error) { setStatus(error.message, true); return false; }
  }
  async function clearFrontendPreview() {
    try {
      const tab = await activeWebTab(); await ensureContentScript(tab.id);
      const response = await tabMessage(tab.id, { action: 'clearAIFrontendPreview' }, 10000);
      if (!response?.success) throw new Error(response?.error || 'The frontend preview could not be removed.');
      state.previewActive = false;
      state.previewMessageId = '';
      state.previewParts = { html: false, css: false, js: false };
      if (response.selectedElement) state.selectedElement = response.selectedElement;
      state.contextCache = null;
      state.forceRefresh = true;
      renderAttachment();
      setStatus('All preview changes were removed. The original page is restored.');
      renderMessages();
      return true;
    } catch (error) { setStatus(error.message, true); return false; }
  }
  function extractFrontendBundle(text) {
    const source = String(text || '');
    const readBlocks = language => Array.from(source.matchAll(new RegExp('```(?:' + language + ')\\s*\\n?([\\s\\S]*?)```', 'gi')))
      .map(match => match[1].trim()).filter(Boolean).join('\n\n');
    const metadataText = readBlocks('preview|ui-preview');
    let metadata = {};
    if (metadataText) {
      try { metadata = JSON.parse(metadataText); } catch (error) { metadata = {}; }
    }
    const html = readBlocks('html').slice(0, 80000);
    const css = readBlocks('css').slice(0, 60000);
    const js = readBlocks('javascript|js').slice(0, 30000);
    return {
      selector: typeof metadata.selector === 'string' ? metadata.selector.trim().slice(0, 500) : '',
      mode: ['replace', 'append', 'before', 'after'].includes(metadata.mode) ? metadata.mode : '',
      title: typeof metadata.title === 'string' ? metadata.title.trim().slice(0, 120) : '',
      html, css, js
    };
  }
  function extractCss(text) { return Array.from(String(text).matchAll(/```css\s*([\s\S]*?)```/gi)).map(match => match[1].trim()).filter(Boolean).join('\n\n').slice(0, 60000); }

  function renderMarkdown(value) {
    const code = [];
    let text = escapeHtml(String(value || '')).replace(/```([a-z0-9_-]*)\n?([\s\S]*?)```/gi, (_, language, source) => { const index = code.push({ language: language || 'code', source: decodeEntities(source) }) - 1; return `@@CODE${index}@@`; });
    text = text.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>').replace(/^##\s+(.+)$/gm, '<h2>$1</h2>').replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
    text = text.replace(/(?:^|\n)((?:[-*]\s+.+(?:\n|$))+)/g, (_, list) => `<ul>${list.trim().split('\n').map(line => `<li>${line.replace(/^[-*]\s+/, '')}</li>`).join('')}</ul>`);
    text = text.split(/\n{2,}/).map(block => /^<(?:h\d|ul|ol|div)/.test(block) || /^@@CODE/.test(block) ? block : `<p>${block.replace(/\n/g, '<br>')}</p>`).join('');
    code.forEach((block, index) => { const highlighted = highlightCode(escapeHtml(block.source), block.language); text = text.replace(`@@CODE${index}@@`, `<div class="ai-code-wrap"><div class="ai-code-head"><span>${escapeHtml(block.language)}</span><button class="ai-code-copy" type="button">Copy</button></div><pre data-raw="${escapeAttribute(block.source)}"><code>${highlighted}</code></pre></div>`); });
    return text;
  }

  function enhanceCodeBlocks(root) { root.querySelectorAll('.ai-code-copy').forEach(button => button.addEventListener('click', () => { const pre = button.closest('.ai-code-wrap')?.querySelector('pre'); copyText(pre?.dataset.raw || '', button); })); }
  function highlightCode(value) { return value; }
  async function copyText(value, button) { try { await navigator.clipboard.writeText(value); const original = button.textContent; button.textContent = 'Copied'; setTimeout(() => { button.textContent = original; }, 1200); } catch (error) { setStatus('Chrome could not copy that text.', true); } }

  function iconButton(icon, label) { const button = document.createElement('button'); button.type = 'button'; button.className = 'ai-toolbar-btn'; button.setAttribute('aria-label', label); const glyph = document.createElement('span'); glyph.className = 'material-icons'; glyph.textContent = icon; button.appendChild(glyph); return button; }
  function actionButton(label) { const button = document.createElement('button'); button.type = 'button'; button.className = 'ai-message-action'; button.textContent = label; return button; }
  function makeTitle(value) { const clean = value.replace(/\s+/g, ' ').trim(); return clean.length > 48 ? `${clean.slice(0, 47)}…` : clean; }
  function validModel(value) { const model = typeof value === 'string' ? value.trim() : ''; return /^[a-zA-Z0-9._:-]{1,120}$/.test(model) ? model : ''; }
  function uid() { return `${Date.now().toString(36)}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`; }
  function formatTime(value) { try { return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value)); } catch (error) { return ''; } }
  function relativeTime(value) { const seconds = Math.max(0, (Date.now() - Date.parse(value)) / 1000); if (seconds < 60) return 'now'; if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`; if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`; return `${Math.floor(seconds / 86400)}d ago`; }
  function safeHost(value) { try { return new URL(value).hostname || 'this page'; } catch (error) { return 'this page'; } }
  function stripUrl(value) { try { const url = new URL(value); return `${url.origin}${url.pathname}`.slice(0, 500); } catch (error) { return ''; } }
  function nearBottom(node, threshold = 70) { return node.scrollHeight - node.scrollTop - node.clientHeight < threshold; }
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }
  function escapeAttribute(value) { return escapeHtml(value).replace(/\r?\n/g, '&#10;'); }
  function decodeEntities(value) { const area = document.createElement('textarea'); area.innerHTML = value; return area.value; }
  function cssEscape(value) { return globalThis.CSS?.escape ? CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&'); }
  function debounce(fn, wait) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); }; }
})();
