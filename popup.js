/**
 * UI Consistency Checker - Popup Script
 * Component-Based Architecture (No Legacy Rules)
 * @version 1.5.1
 */

// ========================================
// STATE MANAGEMENT
// ========================================


// Results state
let lastCheckResults = null;
let lastFixResults = null;
let lastQualityResults = null;

// UI State
let gridActive = false;
let gridSize = 32;
let savedComponents = [];
let importedClassInventory = [];
let importedLibrarySummary = null;
let editingComponentId = null;
let hasRunCheck = false;

const AI_PROVIDER_CONFIG = {
  openai: {
    label: 'OpenAI',
    defaultModel: 'gpt-6-astra',
    keyUrl: 'https://platform.openai.com/api-keys',
    models: [
      ['gpt-6-astra', 'GPT-6 Astra'],
      ['gpt-5.6-sol', 'GPT-5.6 Sol'],
      ['gpt-5.6-terra', 'GPT-5.6 Terra'],
      ['gpt-5.6-luna', 'GPT-5.6 Luna'],
      ['gpt-5.5', 'GPT-5.5']
    ],
    modelHint: 'Recommended OpenAI design model. You can enter another model available to your API project.'
  },
  anthropic: {
    label: 'Claude',
    defaultModel: 'claude-sonnet-5',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    models: [
      ['claude-sonnet-5', 'Claude Sonnet 5'],
      ['claude-opus-5', 'Claude Opus 5'],
      ['claude-fable-5', 'Claude Fable 5'],
      ['claude-opus-4-8', 'Claude Opus 4.8'],
      ['claude-sonnet-4-6', 'Claude Sonnet 4.6'],
      ['claude-haiku-4-5-20251001', 'Claude Haiku 4.5']
    ],
    modelHint: 'Recommended Claude model for frontend and design work. You can enter another active Claude model ID.'
  },
  google: {
    label: 'Google AI Studio',
    defaultModel: 'gemini-3.8-flash',
    keyUrl: 'https://aistudio.google.com/apikey',
    models: [
      ['gemini-3.8-flash', 'Gemini 3.8 Flash'],
      ['gemini-3.7-flash', 'Gemini 3.7 Flash'],
      ['gemini-3.6-flash', 'Gemini 3.6 Flash'],
      ['gemini-3.5-flash', 'Gemini 3.5 Flash'],
      ['gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite'],
      ['gemini-3.1-pro-preview', 'Gemini 3.1 Pro Preview'],
      ['gemini-2.5-pro', 'Gemini 2.5 Pro'],
      ['gemini-2.5-flash', 'Gemini 2.5 Flash'],
      ['gemini-2.5-flash-lite', 'Gemini 2.5 Flash-Lite']
    ],
    modelHint: 'Models from Google AI Studio. Refresh after adding your key to load every model enabled for your project.'
  }
};
let currentAIProvider = 'openai';
let aiModels = {
  openai: AI_PROVIDER_CONFIG.openai.defaultModel,
  anthropic: AI_PROVIDER_CONFIG.anthropic.defaultModel,
  google: AI_PROVIDER_CONFIG.google.defaultModel
};
let aiAvailableModels = {};
let aiApiKeys = {};
let lastAIResponse = '';
let lastAICss = '';
let lastAIUserRequest = '';
let aiPreviewActive = false;
let aiKeySaveTimer = null;

// Collapse state
let isComponentsCollapsed = false;
let isQualityCollapsed = false;
let isResultsCollapsed = true;
let isFixCollapsed = true;

// Theme state
let currentTheme = 'dark';

// ========================================
// DOM ELEMENT REFERENCES
// ========================================

// Main buttons
const checkBtn = document.getElementById('checkBtn');
const qualityBtn = document.getElementById('qualityBtn');
const autoFixBtn = document.getElementById('autoFixBtn');
const gridBtn = document.getElementById('gridBtn');
const responsivePresetBtns = document.querySelectorAll('.responsive-preset');
const responsiveStatus = document.getElementById('responsiveStatus');
const responsiveCustomWidth = document.getElementById('responsiveCustomWidth');
const responsiveCustomHeight = document.getElementById('responsiveCustomHeight');
const responsiveCustomApply = document.getElementById('responsiveCustomApply');
const responsiveAuditSummary = document.getElementById('responsiveAuditSummary');
const responsiveErrorCount = document.getElementById('responsiveErrorCount');
const responsiveWarningCount = document.getElementById('responsiveWarningCount');
const responsiveAuditSuccess = document.getElementById('responsiveAuditSuccess');
const responsiveRescanBtn = document.getElementById('responsiveRescanBtn');
const responsiveClearBtn = document.getElementById('responsiveClearBtn');
const responsiveIssues = document.getElementById('responsiveIssues');
const addComponentBtn = document.getElementById('addComponentBtn');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const importFile = document.getElementById('importFile');

// Results sections
const resultsSection = document.getElementById('resultsSection');
const resultsHeader = document.getElementById('resultsHeader');
const resultsContent = document.getElementById('resultsContent');
const resultsCollapseIcon = document.getElementById('resultsCollapseIcon');
const stats = document.getElementById('stats');
const results = document.getElementById('results');

// Fix sections
const fixSection = document.getElementById('fixSection');
const fixHeader = document.getElementById('fixHeader');
const fixContent = document.getElementById('fixContent');
const fixCollapseIcon = document.getElementById('fixCollapseIcon');
const copyFixBtn = document.getElementById('copyFixBtn');
const exportFixBtn = document.getElementById('exportFixBtn');

// Other sections
const runCheckNotice = document.getElementById('runCheckNotice');
const qualitySection = document.getElementById('qualitySection');
const qualityHeader = document.getElementById('qualityHeader');
const qualityContent = document.getElementById('qualityContent');
const qualityCollapseIcon = document.getElementById('qualityCollapseIcon');


// Tab Navigation
const tabBtns = document.querySelectorAll('.tab-btn');
const servicesTab = document.getElementById('servicesTab');
const componentsTab = document.getElementById('componentsTab');
const aiTab = document.getElementById('aiTab');

// AI Design Studio
const aiProviderBtns = document.querySelectorAll('[data-ai-provider]');
const aiApiKey = document.getElementById('aiApiKey');
const aiToggleKeyBtn = document.getElementById('aiToggleKeyBtn');
const aiGetKeyLink = document.getElementById('aiGetKeyLink');
const aiModelSelect = document.getElementById('aiModelSelect');
const aiCustomModel = document.getElementById('aiCustomModel');
const aiRefreshModelsBtn = document.getElementById('aiRefreshModelsBtn');
const aiModelHint = document.getElementById('aiModelHint');
const aiPrompt = document.getElementById('aiPrompt');
const aiIncludeText = document.getElementById('aiIncludeText');
const aiRunBtn = document.getElementById('aiRunBtn');
const aiStatus = document.getElementById('aiStatus');
const aiContextName = document.getElementById('aiContextName');
const aiContextMeta = document.getElementById('aiContextMeta');
const aiResponseCard = document.getElementById('aiResponseCard');
const aiResponseOutput = document.getElementById('aiResponseOutput');
const aiResponseMeta = document.getElementById('aiResponseMeta');
const aiCopyResponseBtn = document.getElementById('aiCopyResponseBtn');
const aiPreviewCssBtn = document.getElementById('aiPreviewCssBtn');
const aiClearPreviewBtn = document.getElementById('aiClearPreviewBtn');

// Theme toggle
const themeBtns = document.querySelectorAll('.theme-toggle-btn');

// ========================================
// INITIALIZATION
// ========================================

/**
 * Initialize the popup - load all saved data and set up UI
 */
async function initialize() {
  await applySidePanelLayout();
  await loadSavedData();
  setupEventListeners();
  setupCollapsibleSections();
  setupThemeToggle();
  setupAIStudio();
}

/**
 * Load all saved data from chrome.storage.local
 */
async function loadSavedData() {
  const result = await chrome.storage.local.get([
    'savedComponents',
    'importedClassInventory',
    'importedLibrarySummary',
    'isComponentsCollapsed',
    'isQualityCollapsed',
    'isResultsCollapsed',
    'isFixCollapsed',
    'theme',
    'firstRun',
    'activePanelTab',
    'aiProvider',
    'aiModels',
    'aiIncludeText'
  ]);

  // Load saved components
  if (result.savedComponents && result.savedComponents.length > 0) {
    savedComponents = result.savedComponents;
  } else {
    // First time - start with empty array
    savedComponents = [];
    await chrome.storage.local.set({ savedComponents });
  }
  importedClassInventory = Array.isArray(result.importedClassInventory)
    ? result.importedClassInventory.filter(name => typeof name === 'string')
    : [];
  importedLibrarySummary = result.importedLibrarySummary || null;

  // Load collapse states
  if (result.isComponentsCollapsed !== undefined) {
    isComponentsCollapsed = result.isComponentsCollapsed;
    updateComponentsCollapseState();
  }
  if (result.isQualityCollapsed !== undefined) {
    isQualityCollapsed = result.isQualityCollapsed;
    updateQualityCollapseState();
  }
  if (result.isResultsCollapsed !== undefined) {
    isResultsCollapsed = result.isResultsCollapsed;
    updateResultsCollapseState();
  }
  if (result.isFixCollapsed !== undefined) {
    isFixCollapsed = result.isFixCollapsed;
    updateFixCollapseState();
  }

  // Load theme
  if (result.theme) {
    currentTheme = result.theme;
    applyTheme(currentTheme);
  }

  currentAIProvider = AI_PROVIDER_CONFIG[result.aiProvider] ? result.aiProvider : 'openai';
  if (result.aiModels && typeof result.aiModels === 'object') {
    aiModels = {
      openai: validAIModel(result.aiModels.openai) || AI_PROVIDER_CONFIG.openai.defaultModel,
      anthropic: validAIModel(result.aiModels.anthropic) || AI_PROVIDER_CONFIG.anthropic.defaultModel,
      google: validAIModel(result.aiModels.google) || AI_PROVIDER_CONFIG.google.defaultModel
    };
  }
  if (aiIncludeText) aiIncludeText.checked = result.aiIncludeText !== false;
  let requestedPanelTab = '';
  try {
    const sessionResult = await chrome.storage.session.get(['aiApiKeys', 'requestedPanelTab']);
    aiApiKeys = sessionResult.aiApiKeys && typeof sessionResult.aiApiKeys === 'object'
      ? sessionResult.aiApiKeys
      : {};
    if (sessionResult.requestedPanelTab === 'ai') {
      requestedPanelTab = 'ai';
      await chrome.storage.session.remove('requestedPanelTab');
    }
  } catch (error) {
    aiApiKeys = {};
  }
  applyAIProviderState();
  activatePanelTab(requestedPanelTab || result.activePanelTab || 'ai');

  // Display components and update button states
  displaySavedComponents();
  updateCheckButtonState();
}

// ========================================
// THEME SYSTEM
// ========================================

function setupThemeToggle() {
  themeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      setTheme(theme);
    });
  });
}

async function setTheme(theme) {
  currentTheme = theme;
  applyTheme(theme);
  await chrome.storage.local.set({ theme });
  
  themeBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.body.setAttribute('data-theme', theme);
  themeBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
}

async function applySidePanelLayout() {
  document.body.dataset.panelSide = 'adaptive';
  if (!chrome.sidePanel || typeof chrome.sidePanel.getLayout !== 'function') return;
  try {
    const layout = await chrome.sidePanel.getLayout();
    if (layout && (layout.side === 'left' || layout.side === 'right')) {
      document.body.dataset.panelSide = layout.side;
    }
  } catch (error) {}
}

// ========================================
// COLLAPSIBLE SECTIONS
// ========================================

function setupCollapsibleSections() {
  // Saved Components collapse
  document.getElementById('savedComponentsHeader').addEventListener('click', async () => {
    isComponentsCollapsed = !isComponentsCollapsed;
    updateComponentsCollapseState();
    await chrome.storage.local.set({ isComponentsCollapsed });
  });

  // Quality section collapse
  if (qualityHeader) {
    qualityHeader.addEventListener('click', async () => {
      isQualityCollapsed = !isQualityCollapsed;
      updateQualityCollapseState();
      await chrome.storage.local.set({ isQualityCollapsed });
    });
  }

  // Results section collapse
  if (resultsHeader) {
    resultsHeader.addEventListener('click', async () => {
      isResultsCollapsed = !isResultsCollapsed;
      updateResultsCollapseState();
      await chrome.storage.local.set({ isResultsCollapsed });
    });
  }

  // Fix section collapse
  if (fixHeader) {
    fixHeader.addEventListener('click', (e) => {
      // Don't toggle if clicking on action buttons or collapse icon directly
      if (e.target.closest('.fix-header-actions') || e.target.closest('#fixCollapseIcon')) {
        // If clicking the collapse icon specifically, toggle it
        if (e.target.closest('#fixCollapseIcon') || e.target.id === 'fixCollapseIcon') {
          isFixCollapsed = !isFixCollapsed;
          updateFixCollapseState();
          chrome.storage.local.set({ isFixCollapsed });
        }
        return;
      }
      // Toggle collapse when clicking elsewhere on header
      isFixCollapsed = !isFixCollapsed;
      updateFixCollapseState();
      chrome.storage.local.set({ isFixCollapsed });
    });
  }
}

function updateComponentsCollapseState() {
  document.getElementById('componentsListContainer').classList.toggle('collapsed', isComponentsCollapsed);
  document.getElementById('collapseIcon').classList.toggle('collapsed', isComponentsCollapsed);
}

function updateQualityCollapseState() {
  qualityContent.classList.toggle('collapsed', isQualityCollapsed);
  qualityCollapseIcon.classList.toggle('collapsed', isQualityCollapsed);
}

function updateResultsCollapseState() {
  resultsContent.classList.toggle('collapsed', isResultsCollapsed);
  resultsCollapseIcon.classList.toggle('collapsed', isResultsCollapsed);
}

function updateFixCollapseState() {
  fixContent.classList.toggle('collapsed', isFixCollapsed);
  if (fixCollapseIcon) {
    fixCollapseIcon.classList.toggle('collapsed', isFixCollapsed);
  }
}


// ========================================
// EVENT LISTENERS SETUP
// ========================================

function setupEventListeners() {
  // Tab navigation
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;
      
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      activatePanelTab(targetTab, true);
    });
  });

  // Main action buttons
  checkBtn.addEventListener('click', runCheckV14);
  qualityBtn.addEventListener('click', calculateQuality);
  autoFixBtn.addEventListener('click', runAutoFix);
  responsivePresetBtns.forEach(button => button.addEventListener('click', () => applyResponsiveViewport(button)));
  responsiveCustomApply.addEventListener('click', () => applyResponsiveViewport(responsiveCustomApply, true));
  responsiveRescanBtn.addEventListener('click', rescanResponsiveIssues);
  responsiveClearBtn.addEventListener('click', clearResponsiveHighlights);
  responsiveIssues.addEventListener('click', focusResponsiveIssue);
  
  // Grid toggle
  gridBtn.addEventListener('click', toggleGrid);
  document.getElementById('applyGridBtn').addEventListener('click', applyCustomGrid);
  
  // Component management
  addComponentBtn.addEventListener('click', openAddComponentModal);
  document.getElementById('closeModal').addEventListener('click', closeAddModal);
  document.getElementById('cancelBtn').addEventListener('click', closeAddModal);
  document.getElementById('saveBtn').addEventListener('click', saveComponent);
  
  // Preview updates
  document.getElementById('componentScope').addEventListener('input', updatePreview);
  document.getElementById('componentStyles').addEventListener('input', updatePreview);
  
  // Import/Export
  exportBtn.addEventListener('click', exportConfigurationV14);
  importBtn.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', importConfigurationV14);

  document.getElementById('componentsList').addEventListener('click', event => {
    const button = event.target.closest('.icon-btn[data-action][data-id]');
    if (!button) return;
    const { id, action } = button.dataset;
    if (action === 'edit') editComponent(id);
    else if (action === 'delete') deleteComponent(id);
  });
  
  // Copy/Export fixes
  copyFixBtn.addEventListener('click', copyFixResults);
  exportFixBtn.addEventListener('click', exportFixResults);
  
  // Close modals on outside click
  window.addEventListener('click', (e) => {
    if (e.target === document.getElementById('addModal')) closeAddModal();
  });
}

function activatePanelTab(targetTab, remember = false) {
  const allowed = ['services', 'components', 'ai'];
  const selected = allowed.includes(targetTab) ? targetTab : 'services';
  tabBtns.forEach(button => button.classList.toggle('active', button.dataset.tab === selected));
  servicesTab.classList.toggle('active', selected === 'services');
  componentsTab.classList.toggle('active', selected === 'components');
  aiTab.classList.toggle('active', selected === 'ai');
  if (remember) chrome.storage.local.set({ activePanelTab: selected });
}

async function applyResponsiveViewport(button, custom = false) {
  if (!button) return;
  responsivePresetBtns.forEach(item => { item.disabled = true; });
  responsiveCustomApply.disabled = true;
  try {
    const restoring = button.dataset.responsiveRestore === 'true';
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No inspectable browser tab was found.');
    if (/^(chrome|edge|about|chrome-extension|devtools|view-source):/i.test(tab.url || '')) {
      throw new Error('Open a normal webpage before using responsive check.');
    }

    if (restoring) {
      const restored = await sendRuntimeMessage({ action: 'responsiveRestore', tabId: tab.id }, 15000);
      if (!restored?.success) throw new Error(restored?.error || 'The content viewport could not be restored.');
      await injectContentScript(tab.id);
      await sendTabMessage(tab.id, { action: 'clearResponsiveAudit' }, 5000).catch(() => null);
      responsivePresetBtns.forEach(item => item.classList.remove('active'));
      resetResponsiveAuditResults();
      setResponsiveStatus('Normal page viewport restored. The browser window was not changed.');
      return;
    }

    const targetWidth = Number(custom ? responsiveCustomWidth.value : button.dataset.responsiveWidth);
    const targetHeight = Number(custom ? responsiveCustomHeight.value : button.dataset.responsiveHeight);
    if (!Number.isFinite(targetWidth) || !Number.isFinite(targetHeight)) throw new Error('The selected viewport size is invalid.');
    const emulated = await sendRuntimeMessage({ action: 'responsiveEmulate', tabId: tab.id, width: targetWidth, height: targetHeight }, 15000);
    if (!emulated?.success) throw new Error(emulated?.error || 'The content viewport could not be emulated.');
    await injectContentScript(tab.id);
    await waitForViewport(250);
    const actual = await sendTabMessage(tab.id, { action: 'getViewportSize' }, 5000);
    if (!actual?.success) throw new Error(actual?.error || 'The emulated viewport could not be measured.');
    responsivePresetBtns.forEach(item => item.classList.toggle('active', !custom && item === button));
    const label = custom ? 'Custom' : button.textContent.trim();
    setResponsiveStatus(`${label}: ${actual.width} × ${actual.height}px content viewport. Scanning responsive risks…`);
    if (savedComponents.length) await runCheckV14();
    const audit = await runResponsiveAudit(tab.id);
    const summary = audit.total
      ? `${audit.total} responsive issue${audit.total === 1 ? '' : 's'} found and highlighted.`
      : 'No obvious overflow, clipping, target-size, or text-size issues found.';
    setResponsiveStatus(`${label}: ${actual.width} × ${actual.height}px. ${summary}`);
  } catch (error) {
    setResponsiveStatus(error.message || 'The viewport could not be changed.', true);
  } finally {
    responsivePresetBtns.forEach(item => { item.disabled = false; });
    responsiveCustomApply.disabled = false;
  }
}

async function runResponsiveAudit(tabId) {
  const audit = await sendTabMessage(tabId, { action: 'auditResponsiveLayout' }, 15000);
  if (!audit?.success) throw new Error(audit?.error || 'The responsive layout could not be audited.');
  renderResponsiveAudit(audit);
  return audit;
}

function renderResponsiveAudit(audit) {
  responsiveAuditSummary.hidden = false;
  responsiveErrorCount.textContent = String(audit.errors || 0);
  responsiveWarningCount.textContent = String(audit.warnings || 0);
  responsiveAuditSuccess.hidden = Number(audit.total) !== 0;
  responsiveIssues.replaceChildren();
  for (const issue of Array.isArray(audit.issues) ? audit.issues : []) {
    const item = document.createElement('li');
    const issueButton = document.createElement('button');
    issueButton.type = 'button';
    issueButton.className = `result-item responsive-issue ${issue.severity === 'error' ? 'fail' : 'warning'}`;
    issueButton.dataset.responsiveIssueIndex = String(issue.index);
    const icon = document.createElement('div');
    icon.className = 'result-icon';
    icon.innerHTML = `<span class="material-icons">${issue.severity === 'error' ? 'error' : 'warning'}</span>`;
    const content = document.createElement('div');
    content.className = 'result-content';
    const title = document.createElement('div');
    title.className = 'result-title';
    title.textContent = String(issue.type || 'Responsive issue').split(',')[0].replace(/-/g, ' ').replace(/^./, value => value.toUpperCase());
    const selector = document.createElement('div');
    selector.className = 'result-desc responsive-target';
    selector.textContent = `Element: ${issue.selector || 'Page element'}`;
    const message = document.createElement('span');
    message.className = 'result-desc';
    message.textContent = issue.message || issue.type;
    const heading = document.createElement('div');
    heading.className = 'responsive-issue-heading';
    const severity = document.createElement('span');
    severity.className = 'responsive-severity';
    severity.textContent = issue.severity === 'error' ? 'Error' : 'Warning';
    heading.append(title, severity);
    content.append(heading, selector, message);
    issueButton.append(icon, content);
    item.appendChild(issueButton);
    responsiveIssues.appendChild(item);
  }
  responsiveIssues.hidden = responsiveIssues.children.length === 0;
}

function resetResponsiveAuditResults() {
  responsiveAuditSummary.hidden = true;
  responsiveAuditSuccess.hidden = true;
  responsiveIssues.hidden = true;
  responsiveIssues.replaceChildren();
}

async function rescanResponsiveIssues() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No inspectable browser tab was found.');
    await injectContentScript(tab.id);
    const audit = await runResponsiveAudit(tab.id);
    setResponsiveStatus(audit.total ? `${audit.total} responsive issues highlighted.` : 'No obvious responsive issues found.');
  } catch (error) {
    setResponsiveStatus(error.message || 'The page could not be re-scanned.', true);
  }
}

async function clearResponsiveHighlights() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) await sendTabMessage(tab.id, { action: 'clearResponsiveAudit' }, 5000);
    resetResponsiveAuditResults();
    setResponsiveStatus('Responsive highlights cleared. The emulated content size is still active.');
  } catch (error) {
    setResponsiveStatus(error.message || 'Highlights could not be cleared.', true);
  }
}

async function focusResponsiveIssue(event) {
  const issueButton = event.target.closest('[data-responsive-issue-index]');
  if (!issueButton) return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    await sendTabMessage(tab.id, { action: 'focusResponsiveIssue', index: Number(issueButton.dataset.responsiveIssueIndex) }, 5000);
  } catch (error) {
    setResponsiveStatus(error.message || 'The highlighted element is no longer available.', true);
  }
}

async function applyResponsiveViewportLegacy(button) {
  if (!button || !chrome.windows) {
    setResponsiveStatus('This browser does not expose window resizing to the extension.', true);
    return;
  }
  responsivePresetBtns.forEach(item => { item.disabled = true; });
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || tab.windowId == null) throw new Error('No inspectable browser tab was found.');
    if (/^(chrome|edge|about|chrome-extension|devtools|view-source):/i.test(tab.url || '')) {
      throw new Error('Open a normal webpage before using responsive check.');
    }
    const currentWindow = await getBrowserWindow(tab.windowId);
    const stored = await chrome.storage.session.get(['responsiveOriginalWindow']);

    if (button.dataset.responsiveRestore === 'true') {
      const original = stored.responsiveOriginalWindow;
      if (!original || original.id !== tab.windowId) throw new Error('No saved viewport is available to restore.');
      if (currentWindow.state !== 'normal') await updateBrowserWindow(tab.windowId, { state: 'normal' });
      await updateBrowserWindow(tab.windowId, {
        left: original.left,
        top: original.top,
        width: original.width,
        height: original.height
      });
      if (original.state && original.state !== 'normal') await updateBrowserWindow(tab.windowId, { state: original.state });
      await chrome.storage.session.remove('responsiveOriginalWindow');
      responsivePresetBtns.forEach(item => item.classList.remove('active'));
      setResponsiveStatus('Original browser size restored.');
      return;
    }

    const targetWidth = Number(button.dataset.responsiveWidth);
    const targetHeight = Number(button.dataset.responsiveHeight);
    if (!Number.isFinite(targetWidth) || !Number.isFinite(targetHeight)) throw new Error('The selected viewport preset is invalid.');
    if (!stored.responsiveOriginalWindow || stored.responsiveOriginalWindow.id !== tab.windowId) {
      await chrome.storage.session.set({
        responsiveOriginalWindow: {
          id: tab.windowId,
          state: currentWindow.state,
          left: currentWindow.left,
          top: currentWindow.top,
          width: currentWindow.width,
          height: currentWindow.height
        }
      });
    }

    await injectContentScript(tab.id);
    if (currentWindow.state !== 'normal') {
      await updateBrowserWindow(tab.windowId, { state: 'normal' });
      await waitForViewport(180);
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const viewport = await sendTabMessage(tab.id, { action: 'getViewportSize' }, 5000);
      if (!viewport?.success) throw new Error(viewport?.error || 'The page viewport could not be measured.');
      const widthDelta = targetWidth - Number(viewport.width);
      const heightDelta = targetHeight - Number(viewport.height);
      if (Math.abs(widthDelta) <= 2 && Math.abs(heightDelta) <= 2) break;
      const outer = await getBrowserWindow(tab.windowId);
      await updateBrowserWindow(tab.windowId, {
        width: Math.max(500, Math.round(outer.width + widthDelta)),
        height: Math.max(400, Math.round(outer.height + heightDelta))
      });
      await waitForViewport(180);
    }

    const actual = await sendTabMessage(tab.id, { action: 'getViewportSize' }, 5000);
    if (!actual?.success) throw new Error(actual?.error || 'The resized viewport could not be measured.');
    responsivePresetBtns.forEach(item => item.classList.toggle('active', item === button));
    const exact = Math.abs(actual.width - targetWidth) <= 3 && Math.abs(actual.height - targetHeight) <= 3;
    setResponsiveStatus(`${button.textContent.trim()}: ${actual.width} × ${actual.height}px${exact ? '' : ' (limited by the current screen)'}. ${savedComponents.length ? 'Refreshing component checks…' : 'Import components to run checks at this size.'}`);
    if (savedComponents.length) {
      await runCheckV14();
      setResponsiveStatus(`${button.textContent.trim()}: ${actual.width} × ${actual.height}px. Checks now use this viewport and its active media queries.`);
    }
  } catch (error) {
    setResponsiveStatus(error.message || 'The viewport could not be changed.', true);
  } finally {
    responsivePresetBtns.forEach(item => { item.disabled = false; });
  }
}

function getBrowserWindow(windowId) {
  return new Promise((resolve, reject) => {
    chrome.windows.get(windowId, {}, windowInfo => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(windowInfo);
    });
  });
}

function updateBrowserWindow(windowId, updateInfo) {
  throw new Error('Browser-window resizing has been retired. Use content viewport emulation.');
}

function waitForViewport(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function setResponsiveStatus(message, error = false) {
  if (!responsiveStatus) return;
  responsiveStatus.textContent = message;
  responsiveStatus.classList.toggle('error', error);
}

chrome.runtime.onMessage.addListener(request => {
  if (request && request.action === 'openPanelTab') activatePanelTab(request.tab);
});

// ========================================
// AI DESIGN STUDIO
// ========================================

function setupAIStudio() {
  if (!aiRunBtn) return;

  aiProviderBtns.forEach(button => {
    button.addEventListener('click', async () => {
      const provider = button.dataset.aiProvider;
      if (!AI_PROVIDER_CONFIG[provider] || provider === currentAIProvider) return;
      await persistCurrentAIKey();
      currentAIProvider = provider;
      applyAIProviderState();
      await chrome.storage.local.set({ aiProvider: currentAIProvider });
    });
  });

  aiToggleKeyBtn.addEventListener('click', () => {
    const showing = aiApiKey.type === 'text';
    aiApiKey.type = showing ? 'password' : 'text';
    aiToggleKeyBtn.title = showing ? 'Show API key' : 'Hide API key';
    aiToggleKeyBtn.setAttribute('aria-label', aiToggleKeyBtn.title);
    aiToggleKeyBtn.querySelector('.material-icons').textContent = showing ? 'visibility' : 'visibility_off';
  });

  aiApiKey.addEventListener('input', () => {
    clearTimeout(aiKeySaveTimer);
    aiKeySaveTimer = setTimeout(() => persistCurrentAIKey(), 350);
  });
  aiApiKey.addEventListener('change', persistCurrentAIKey);

  aiModelSelect.addEventListener('change', async () => {
    const isCustom = aiModelSelect.value === '__custom__';
    aiCustomModel.hidden = !isCustom;
    if (isCustom) {
      aiCustomModel.value = aiModels[currentAIProvider] || '';
      aiCustomModel.focus();
      return;
    }
    aiModels[currentAIProvider] = aiModelSelect.value;
    await chrome.storage.local.set({ aiModels });
  });

  aiCustomModel.addEventListener('change', saveAICustomModel);
  aiRefreshModelsBtn.addEventListener('click', loadAIProviderModels);

  document.querySelectorAll('.ai-accordion-header').forEach(header => {
    header.addEventListener('click', () => {
      const content = header.nextElementSibling;
      const expanded = header.getAttribute('aria-expanded') === 'true';
      header.setAttribute('aria-expanded', String(!expanded));
      header.querySelector('.collapse-icon').textContent = expanded ? 'expand_more' : 'expand_less';
      content.hidden = expanded;
    });
  });

  aiIncludeText.addEventListener('change', () => {
    chrome.storage.local.set({ aiIncludeText: aiIncludeText.checked });
  });

  document.querySelectorAll('[data-ai-prompt]').forEach(button => {
    button.addEventListener('click', () => {
      aiPrompt.value = button.dataset.aiPrompt || '';
      aiPrompt.focus();
    });
  });

  aiRunBtn.addEventListener('click', runAIDesignAnalysis);
  aiCopyResponseBtn.addEventListener('click', async () => {
    if (!lastAIResponse) return;
    await copyAIText(lastAIResponse, 'Recommendation copied.');
  });
  aiPreviewCssBtn.addEventListener('click', previewAICss);
  aiClearPreviewBtn.addEventListener('click', clearAICssPreview);
}

function applyAIProviderState() {
  if (!aiApiKey || !aiModelSelect) return;
  const config = AI_PROVIDER_CONFIG[currentAIProvider];
  aiProviderBtns.forEach(button => {
    button.classList.toggle('active', button.dataset.aiProvider === currentAIProvider);
  });
  aiApiKey.value = typeof aiApiKeys[currentAIProvider] === 'string' ? aiApiKeys[currentAIProvider] : '';
  aiApiKey.placeholder = currentAIProvider === 'openai'
    ? 'sk-…'
    : currentAIProvider === 'anthropic' ? 'sk-ant-…' : 'Google AI Studio key';
  populateAIModelSelect();
  aiModelHint.textContent = config.modelHint;
  aiGetKeyLink.href = config.keyUrl;
  setAIStatus('');
}

function populateAIModelSelect() {
  const config = AI_PROVIDER_CONFIG[currentAIProvider];
  const selected = aiModels[currentAIProvider] || config.defaultModel;
  const entries = new Map(config.models);
  for (const id of aiAvailableModels[currentAIProvider] || []) {
    if (!entries.has(id)) entries.set(id, id);
  }
  aiModelSelect.replaceChildren();
  for (const [id, label] of entries) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = label === id ? id : `${label} — ${id}`;
    aiModelSelect.appendChild(option);
  }
  const customOption = document.createElement('option');
  customOption.value = '__custom__';
  customOption.textContent = 'Custom model ID…';
  aiModelSelect.appendChild(customOption);

  const known = entries.has(selected);
  aiModelSelect.value = known ? selected : '__custom__';
  aiCustomModel.hidden = known;
  aiCustomModel.value = known ? '' : selected;
}

async function saveAICustomModel() {
  const model = validAIModel(aiCustomModel.value);
  if (!model) {
    setAIStatus('Use letters, numbers, dots, colons, underscores, or hyphens for the custom model ID.', true);
    return;
  }
  aiModels[currentAIProvider] = model;
  await chrome.storage.local.set({ aiModels });
}

function getSelectedAIModel() {
  return validAIModel(aiModelSelect.value === '__custom__' ? aiCustomModel.value : aiModelSelect.value);
}

async function loadAIProviderModels() {
  const apiKey = aiApiKey.value.trim();
  if (apiKey.length < 16) {
    setAIStatus(`Enter your ${AI_PROVIDER_CONFIG[currentAIProvider].label} API key first.`, true);
    aiApiKey.focus();
    return;
  }
  aiRefreshModelsBtn.disabled = true;
  aiRefreshModelsBtn.querySelector('.material-icons').classList.add('is-spinning');
  setAIStatus(`Loading models available to your ${AI_PROVIDER_CONFIG[currentAIProvider].label} key…`);
  try {
    await persistCurrentAIKey();
    const response = await sendRuntimeMessage({
      action: 'aiListModels',
      provider: currentAIProvider,
      apiKey
    }, 30000);
    if (!response || !response.success) throw new Error(response && response.error ? response.error : 'Models could not be loaded.');
    aiAvailableModels[currentAIProvider] = Array.isArray(response.models) ? response.models : [];
    populateAIModelSelect();
    setAIStatus(`${aiAvailableModels[currentAIProvider].length.toLocaleString()} available models loaded.`);
  } catch (error) {
    setAIStatus(error.message || 'Models could not be loaded.', true);
  } finally {
    aiRefreshModelsBtn.disabled = false;
    aiRefreshModelsBtn.querySelector('.material-icons').classList.remove('is-spinning');
  }
}

async function persistCurrentAIKey() {
  if (!aiApiKey) return;
  const value = aiApiKey.value.trim();
  if (value) aiApiKeys[currentAIProvider] = value;
  else delete aiApiKeys[currentAIProvider];
  try {
    await chrome.storage.session.set({ aiApiKeys });
  } catch (error) {
    setAIStatus('Chrome could not save the key for this browser session.', true);
  }
}

function validAIModel(value) {
  const model = typeof value === 'string' ? value.trim() : '';
  return /^[a-zA-Z0-9._:-]{1,120}$/.test(model) ? model : '';
}

async function runAIDesignAnalysis() {
  const apiKey = aiApiKey.value.trim();
  const model = getSelectedAIModel();
  const userRequest = aiPrompt.value.trim();
  if (apiKey.length < 16) {
    setAIStatus(`Enter your ${AI_PROVIDER_CONFIG[currentAIProvider].label} API key.`, true);
    aiApiKey.focus();
    return;
  }
  if (!model) {
    setAIStatus('Choose a model or enter a valid custom model ID.', true);
    (aiModelSelect.value === '__custom__' ? aiCustomModel : aiModelSelect).focus();
    return;
  }
  if (!userRequest) {
    setAIStatus('Tell the AI what you want to improve.', true);
    aiPrompt.focus();
    return;
  }

  setAIRunning(true);
  try {
    await persistCurrentAIKey();
    aiModels[currentAIProvider] = model;
    await chrome.storage.local.set({ aiModels, aiProvider: currentAIProvider, aiIncludeText: aiIncludeText.checked });

    setAIStatus('Reading the page structure and visual styles…');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) throw new Error('No active webpage was found.');
    if (/^(chrome|edge|about|chrome-extension):/i.test(tab.url || '')) {
      throw new Error('Chrome does not allow extensions to inspect this browser page. Open a normal website and try again.');
    }
    await injectContentScript(tab.id);
    const capture = await sendTabMessage(tab.id, {
      action: 'captureAIContext',
      options: { includeText: aiIncludeText.checked }
    }, 30000);
    if (!capture || !capture.success || !capture.context) {
      throw new Error(capture && capture.error ? capture.error : 'The page context could not be captured.');
    }

    const contextJSON = compactAIContext(capture.context);
    const contextKB = Math.max(1, Math.round(new Blob([contextJSON]).size / 1024));
    aiContextName.textContent = capture.context.page.title || capture.context.page.url || 'Current page';
    aiContextMeta.textContent = `${capture.context.summary.capturedElements.toLocaleString()} visual elements · ${contextKB.toLocaleString()} KB protected context · ${capture.context.summary.stylesheetCharacters.toLocaleString()} CSS characters found`;

    setAIStatus(`Sending protected page context to ${AI_PROVIDER_CONFIG[currentAIProvider].label}…`);
    const prompt = buildAIPagePrompt(userRequest, contextJSON);
    const response = await sendRuntimeMessage({
      action: 'aiProviderRequest',
      provider: currentAIProvider,
      apiKey,
      model,
      prompt
    }, 100000);
    if (!response || !response.success) {
      throw new Error(response && response.error ? response.error : 'The AI provider did not return a response.');
    }

    lastAIResponse = response.text;
    lastAICss = extractAICss(response.text);
    lastAIUserRequest = userRequest;
    renderAIResponse(response);
    setAIStatus(lastAICss ? 'Recommendation ready. A CSS patch is available to preview.' : 'Recommendation ready.');
  } catch (error) {
    setAIStatus(error.message || 'AI analysis failed.', true);
  } finally {
    setAIRunning(false);
  }
}

function compactAIContext(context) {
  const copy = {
    ...context,
    page: { ...context.page },
    summary: { ...context.summary },
    privacy: { ...context.privacy },
    designTokens: { ...(context.designTokens || {}) },
    elements: Array.isArray(context.elements) ? context.elements.slice() : [],
    stylesheets: Array.isArray(context.stylesheets) ? context.stylesheets.slice() : [],
    authoredCSS: context.authoredCSS || ''
  };
  let json = JSON.stringify(copy);
  if (json.length > 190000) {
    copy.elements = copy.elements.slice(0, 420);
    copy.authoredCSS = copy.authoredCSS.slice(0, 45000);
    json = JSON.stringify(copy);
  }
  if (json.length > 190000) {
    copy.elements = copy.elements.slice(0, 260);
    copy.authoredCSS = copy.authoredCSS.slice(0, 25000);
    copy.designTokens = Object.fromEntries(Object.entries(copy.designTokens).slice(0, 140));
    json = JSON.stringify(copy);
  }
  if (json.length > 190000) {
    copy.elements = copy.elements.slice(0, 160);
    copy.authoredCSS = copy.authoredCSS.slice(0, 12000);
    json = JSON.stringify(copy);
  }
  copy.summary.sentElements = copy.elements.length;
  copy.summary.sentStylesheetCharacters = copy.authoredCSS.length;
  return JSON.stringify(copy);
}

function buildAIPagePrompt(userRequest, contextJSON) {
  const diagnostics = lastCheckResults ? {
    consistencyCheck: {
      passed: lastCheckResults.passed || 0,
      failed: lastCheckResults.failed || 0,
      issues: Array.isArray(lastCheckResults.issues) ? lastCheckResults.issues.slice(0, 25) : []
    },
    qualitySummary: lastQualityResults || null
  } : null;
  const safeContext = contextJSON.replace(/<\/page_context/gi, '<\\/page_context');
  const previous = lastAIResponse && userRequest !== lastAIUserRequest
    ? `\n<previous_recommendation>\n${lastAIResponse.slice(0, 16000)}\n</previous_recommendation>\nRefine the previous recommendation using the new request.`
    : '';
  return `<user_request>\n${userRequest}\n</user_request>${previous}
<extension_diagnostics>\n${JSON.stringify(diagnostics)}\n</extension_diagnostics>
<page_context encoding="json">\n${safeContext}\n</page_context>`;
}

function renderAIResponse(response) {
  aiResponseOutput.textContent = response.text;
  const usage = response.usage || {};
  const inputTokens = Number(usage.input_tokens || 0);
  const outputTokens = Number(usage.output_tokens || 0);
  const usageText = inputTokens || outputTokens ? ` · ${(inputTokens + outputTokens).toLocaleString()} tokens` : '';
  aiResponseMeta.textContent = `${response.model || getSelectedAIModel()}${usageText}`;
  aiResponseCard.hidden = false;
  aiPreviewCssBtn.disabled = !lastAICss;
  aiClearPreviewBtn.disabled = !aiPreviewActive;
  aiResponseCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function extractAICss(text) {
  const blocks = [];
  for (const match of String(text).matchAll(/```css\s*([\s\S]*?)```/gi)) {
    if (match[1] && match[1].trim()) blocks.push(match[1].trim());
  }
  return blocks.join('\n\n').slice(0, 60000);
}

async function previewAICss() {
  if (!lastAICss) return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) throw new Error('No active webpage was found.');
    await injectContentScript(tab.id);
    const result = await sendTabMessage(tab.id, { action: 'previewAICss', css: lastAICss }, 10000);
    if (!result || !result.success) throw new Error(result && result.error ? result.error : 'The CSS preview could not be applied.');
    aiPreviewActive = true;
    aiClearPreviewBtn.disabled = false;
    setAIStatus('Temporary CSS preview applied. Reloading the page also removes it.');
  } catch (error) {
    setAIStatus(error.message || 'The CSS preview could not be applied.', true);
  }
}

async function clearAICssPreview() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) throw new Error('No active webpage was found.');
    await sendTabMessage(tab.id, { action: 'clearAICssPreview' }, 10000);
    aiPreviewActive = false;
    aiClearPreviewBtn.disabled = true;
    setAIStatus('Temporary CSS preview removed.');
  } catch (error) {
    setAIStatus(error.message || 'The CSS preview could not be removed.', true);
  }
}

async function copyAIText(value, successMessage) {
  try {
    await navigator.clipboard.writeText(value);
    setAIStatus(successMessage);
  } catch (error) {
    setAIStatus('Chrome could not copy the text.', true);
  }
}

function setAIRunning(running) {
  aiRunBtn.disabled = running;
  aiRunBtn.classList.toggle('is-loading', running);
  aiRunBtn.setAttribute('aria-busy', String(running));
  aiRunBtn.querySelector('.material-icons').textContent = running ? 'progress_activity' : 'auto_awesome';
}

function setAIStatus(message, isError = false) {
  if (!aiStatus) return;
  aiStatus.textContent = message;
  aiStatus.classList.toggle('error', isError);
}

function sendRuntimeMessage(message, timeoutMs = 100000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The extension request timed out.')), timeoutMs);
    chrome.runtime.sendMessage(message, response => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}

// ========================================
// CORE FUNCTIONALITY
// ========================================

function clearResults() {
  results.innerHTML = '';
  resultsSection.classList.remove('show');
  fixSection.classList.remove('show');
  stats.classList.remove('show');
  qualitySection.classList.remove('show');
}

function enableQualityFeatures() {
  hasRunCheck = true;
  qualityBtn.disabled = false;
  autoFixBtn.disabled = false;
  runCheckNotice.classList.add('hidden');
}

// ========================================
// GRID FUNCTIONALITY
// ========================================

async function toggleGrid() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await injectContentScript(tab.id);
  gridActive = !gridActive;
  
  const gridSettings = document.getElementById('gridSettings');
  gridSettings.style.display = gridActive ? 'block' : 'none';
  
  chrome.tabs.sendMessage(tab.id, { 
    action: 'toggleGrid', 
    active: gridActive,
    gridSize: gridSize 
  });
  
  gridBtn.classList.toggle('active-state', gridActive);
  gridBtn.innerHTML = gridActive 
    ? '<i class="fa-solid fa-border-none" aria-hidden="true"></i>Grid' 
    : '<i class="fa-solid fa-border-all" aria-hidden="true"></i>Grid';
}

async function applyCustomGrid() {
  const newGridSize = parseInt(document.getElementById('gridSize').value);
  if (newGridSize >= 4 && newGridSize <= 128) {
    gridSize = newGridSize;
    
    if (gridActive) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      chrome.tabs.sendMessage(tab.id, { 
        action: 'toggleGrid', 
        active: true,
        gridSize: gridSize 
      });
      showSuccess(`Grid updated to ${gridSize}px`);
    }
  }
}

// ========================================
// COMPONENT MANAGEMENT
// ========================================

function openAddComponentModal() {
  editingComponentId = null;
  document.getElementById('modalTitle').textContent = 'Add Component';
  document.getElementById('componentName').value = '';
  document.getElementById('componentScope').value = '';
  document.getElementById('componentStyles').value = '';
  document.getElementById('componentPreview').textContent = 'Enter CSS selector blocks above';
  document.getElementById('saveBtn').textContent = 'Save Component';
  document.getElementById('addModal').classList.add('show');
}

function closeAddModal() {
  document.getElementById('addModal').classList.remove('show');
  editingComponentId = null;
}

function updatePreview() {
  const scope = document.getElementById('componentScope').value.trim();
  const styles = document.getElementById('componentStyles').value;

  if (!styles.trim()) {
    document.getElementById('componentPreview').textContent = 'Enter CSS selector blocks above';
    return;
  }

  const selectors = Array.from(styles.matchAll(/(?:^|\})\s*([^@{}][^{}]*)\s*\{/g), match => match[1].trim())
    .filter(Boolean)
    .slice(0, 12)
    .map(selector => {
      if (!scope) return selector;
      if (selector.includes('&')) return selector.replaceAll('&', scope);
      return selector.includes(scope) ? selector : `${scope} ${selector}`;
    });
  document.getElementById('componentPreview').textContent = selectors.length
    ? selectors.join('\n')
    : 'CSS must contain selector blocks, for example: .title { color: navy; }';
}

function detectComponentType(name, styles) {
  const hint = `${name} ${styles}`.toLowerCase();
  if (/\b(btn|button|fab)\b/.test(hint)) return 'button';
  if (/\b(input|textarea|select|field|form-control|picker)\b/.test(hint)) return 'input';
  if (/\bcard\b/.test(hint)) return 'card';
  if (/\b(modal|dialog|drawer|sheet)\b/.test(hint)) return 'modal';
  if (/\b(nav|navbar|toolbar|app-bar|tabs?)\b/.test(hint)) return 'navbar';
  return 'custom';
}

function validateCssOnlyComponent(name, scope, styles) {
  if (!name) return 'Please enter a component name.';
  if (!styles) return 'Please enter the component CSS.';
  if (!/[^{}]+\{[^{}]*\}/s.test(styles)) {
    return 'CSS must contain complete selector blocks, for example: .title { color: navy; }';
  }
  if (scope) {
    try {
      document.createDocumentFragment().querySelector(scope);
    } catch (error) {
      return `Scope is not a valid CSS selector: ${error.message}`;
    }
  }
  return '';
}

async function saveComponent() {
  if (editingComponentId) {
    await updateComponent(editingComponentId);
  } else {
    await saveNewComponent();
  }
}

async function saveNewComponent() {
  const name = document.getElementById('componentName').value.trim();
  const scope = document.getElementById('componentScope').value.trim();
  const styles = document.getElementById('componentStyles').value.trim();
  const validationError = validateCssOnlyComponent(name, scope, styles);
  if (validationError) return alert(validationError);
  const componentType = detectComponentType(name, styles);
  
  const component = {
    id: 'comp-' + Date.now(),
    name,
    type: 'component',
    componentType,
    ...(scope ? { scope } : {}),
    styles
  };
  
  savedComponents.push(component);
  await chrome.storage.local.set({ savedComponents });
  invalidateCheckState();
  displaySavedComponents();
  closeAddModal();
  resetAddModal();
  showSuccess('Component saved!');
}


function updateCheckButtonState() {
  // Enable Run Check button only if there's at least one component
  if (savedComponents.length > 0) {
    checkBtn.disabled = false;
    runCheckNotice.classList.add('hidden');
  } else {
    checkBtn.disabled = true;
    runCheckNotice.classList.remove('hidden');
  }
}

function displaySavedComponents() {
  const container = document.getElementById('savedComponents');
  const list = document.getElementById('componentsList');
  document.getElementById('componentCount').textContent = String(savedComponents.length);
  list.replaceChildren();

  if (savedComponents.length === 0) {
    container.classList.remove('show');
    updateCheckButtonState();
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const component of savedComponents) {
    const row = document.createElement('div');
    row.className = 'saved-component';

    const info = document.createElement('div');
    info.className = 'component-info';
    const name = document.createElement('div');
    name.className = 'component-name';
    name.textContent = component.name || 'Unnamed component';
    const type = document.createElement('div');
    type.className = 'component-type';
    const typeName = component.componentType || 'custom';
    type.textContent = typeName.charAt(0).toUpperCase() + typeName.slice(1);
    info.append(name, type);

    const actions = document.createElement('div');
    actions.className = 'component-actions';
    for (const [action, icon, title] of [
      ['edit', 'edit', 'Edit'],
      ['delete', 'delete', 'Delete']
    ]) {
      const button = document.createElement('button');
      button.className = `icon-btn${action === 'delete' ? ' delete' : ''}`;
      button.dataset.id = component.id;
      button.dataset.action = action;
      button.title = title;
      const iconElement = document.createElement('span');
      iconElement.className = 'material-icons';
      iconElement.textContent = icon;
      button.appendChild(iconElement);
      actions.appendChild(button);
    }

    row.append(info, actions);
    fragment.appendChild(row);
  }
  list.appendChild(fragment);
  container.classList.add('show');
  updateCheckButtonState();
}

function editComponent(id) {
  const component = savedComponents.find(c => c.id === id);
  if (component) {
    editingComponentId = id;
    document.getElementById('modalTitle').textContent = 'Edit Component';
    document.getElementById('componentName').value = component.name || '';
    document.getElementById('componentScope').value = component.scope || '';
    document.getElementById('componentStyles').value = component.styles || '';
    updatePreview();
    document.getElementById('saveBtn').textContent = 'Update Component';
    document.getElementById('addModal').classList.add('show');
  }
}

async function updateComponent(id) {
  const name = document.getElementById('componentName').value.trim();
  const scope = document.getElementById('componentScope').value.trim();
  const styles = document.getElementById('componentStyles').value.trim();
  const validationError = validateCssOnlyComponent(name, scope, styles);
  if (validationError) return alert(validationError);
  const componentType = detectComponentType(name, styles);
  
  const index = savedComponents.findIndex(c => c.id === id);
  if (index !== -1) {
    savedComponents[index] = {
      ...savedComponents[index],
      name,
      componentType,
      styles,
      ...(scope ? { scope } : {})
    };
    if (!scope) delete savedComponents[index].scope;
    await chrome.storage.local.set({ savedComponents });
    invalidateCheckState();
    displaySavedComponents();
  }
  
  closeAddModal();
  resetAddModal();
  showSuccess('Component updated!');
}

async function deleteComponent(id) {
  if (confirm('Delete this component?')) {
    savedComponents = savedComponents.filter(c => c.id !== id);
    await chrome.storage.local.set({ savedComponents });
    invalidateCheckState();
    displaySavedComponents();
  }
}

function resetAddModal() {
  document.getElementById('componentName').value = '';
  document.getElementById('componentScope').value = '';
  document.getElementById('componentStyles').value = '';
  document.getElementById('componentPreview').textContent = 'Enter CSS selector blocks above';
  document.getElementById('saveBtn').textContent = 'Save Component';
}

// ========================================
// IMPORT/EXPORT
// ========================================

async function exportConfiguration() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await injectContentScript(tab.id);
  
  chrome.tabs.sendMessage(tab.id, { action: 'scanPage' }, (response) => {
    const exportData = {
      version: '1.5.1',
      exportDate: new Date().toISOString(),
      components: savedComponents,
      pageScan: response || null
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `ui-checker-config-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showSuccess('Configuration exported!');
  });
}

function importConfiguration(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const importData = JSON.parse(event.target.result);
      
      if (confirm(`Import configuration from "${file.name}"?`)) {
        // Import components
        if (importData.components && importData.components.length > 0) {
          savedComponents = importData.components;
          await chrome.storage.local.set({ savedComponents });
        }
        
        displaySavedComponents();
        showSuccess(`Imported! Components: ${savedComponents.length}`);
      }
    } catch (error) {
      showError('Import Error', error.message);
    }
    importFile.value = '';
  };
  reader.readAsText(file);
}

async function exportConfigurationV14() {
  const exportData = {
    kind: 'ui-checker-config',
    version: '1.5.1',
    exportDate: new Date().toISOString(),
    library: importedLibrarySummary,
    components: savedComponents,
    classInventory: { items: importedClassInventory }
  };
  downloadJson(exportData, `ui-checker-config-${Date.now()}.json`);
  showSuccess('Configuration exported!');
}

async function importConfigurationV14(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  try {
    if (file.size > 8 * 1024 * 1024) throw new Error('File is larger than the 8 MB import limit.');
    const parsed = JSON.parse(await file.text());
    const rawComponents = Array.isArray(parsed) ? parsed : parsed && parsed.components;
    if (!Array.isArray(rawComponents)) throw new Error('Expected a JSON object with a components array.');
    const components = normalizeImportedComponents(rawComponents);
    const classInventory = extractClassInventory(parsed);
    if (JSON.stringify({ components, classInventory }).length > 4 * 1024 * 1024) {
      throw new Error('Normalized catalog exceeds the 4 MB storage safety limit.');
    }
    const tokenCount = parsed && parsed.tokens && typeof parsed.tokens === 'object'
      ? Object.keys(parsed.tokens).length
      : Number(parsed && parsed.library && parsed.library.tokenCount) || 0;
    const library = parsed && parsed.library && typeof parsed.library === 'object' ? parsed.library : {};
    const summary = {
      id: stringField(library.id || 'custom', 100, 'library id'),
      name: stringField(library.name || file.name.replace(/\.json$/i, ''), 160, 'library name'),
      version: typeof library.version === 'string' ? library.version.slice(0, 40) : '',
      componentCount: components.length,
      classCount: classInventory.length,
      tokenCount,
      sourceFile: file.name.slice(0, 200)
    };

    if (!confirm(`Import ${components.length} components and ${classInventory.length.toLocaleString()} classes from "${file.name}"?`)) return;

    // Persist first so a storage failure cannot replace the working in-memory catalog.
    await chrome.storage.local.set({
      savedComponents: components,
      importedClassInventory: classInventory,
      importedLibrarySummary: summary
    });
    savedComponents = components;
    importedClassInventory = classInventory;
    importedLibrarySummary = summary;
    invalidateCheckState();
    displaySavedComponents();
    showSuccess(`Imported ${components.length} components · ${classInventory.length.toLocaleString()} classes · ${tokenCount.toLocaleString()} tokens`);
  } catch (error) {
    showError('Import Error', error.message || 'The JSON file is not valid.');
  } finally {
    importFile.value = '';
  }
}

function normalizeImportedComponents(input) {
  if (input.length > 500) throw new Error('A catalog can contain at most 500 live-check components.');
  const usedIds = new Set();
  return input.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`Component ${index + 1} must be an object.`);
    }
    const name = stringField(item.name, 160, `component ${index + 1} name`);
    // A complete source-ordered library cascade can legitimately exceed the
    // old 250 KB per-component limit. The normalized catalog-wide 4 MB check
    // remains the authoritative storage safety boundary.
    const styles = stringField(item.styles ?? '', 4 * 1024 * 1024, `${name} styles`, true);
    if (!styles.trim()) throw new Error(`${name} must include CSS styles for checking.`);
    if (!/[^{}]+\{[^{}]*\}/s.test(styles)) {
      throw new Error(`${name} must use complete CSS selector blocks.`);
    }
    const scope = typeof item.scope === 'string' ? item.scope.trim().slice(0, 500) : '';
    if (scope) {
      try {
        document.createDocumentFragment().querySelector(scope);
      } catch (error) {
        throw new Error(`${name} has an invalid scope selector.`);
      }
    }

    let baseId = typeof item.id === 'string' && item.id.trim()
      ? item.id.trim().slice(0, 120)
      : `component-${index + 1}`;
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
    usedIds.add(id);

    const detectedType = detectComponentType(name, styles);
    const componentType = typeof item.componentType === 'string' && item.componentType.trim()
      ? item.componentType.trim().slice(0, 40)
      : detectedType || 'custom';
    return {
      id,
      name,
      type: 'component',
      componentType,
      styles,
      ...(scope ? { scope } : {})
    };
  });
}

function extractClassInventory(parsed) {
  if (!parsed || Array.isArray(parsed)) return [];
  let raw = [];
  if (Array.isArray(parsed.classes)) raw = parsed.classes;
  else if (Array.isArray(parsed.classInventory)) raw = parsed.classInventory;
  else if (parsed.classInventory && Array.isArray(parsed.classInventory.items)) raw = parsed.classInventory.items;
  if (raw.length > 10000) throw new Error('Class inventory exceeds the 10,000 item limit.');
  const names = raw.map(item => typeof item === 'string' ? item : item && item.name)
    .filter(name => typeof name === 'string' && name.length > 0 && name.length <= 200);
  return Array.from(new Set(names)).sort();
}

function stringField(value, maximumLength, label, allowEmpty = false) {
  if (typeof value !== 'string') throw new Error(`${label} must be a string.`);
  if (!allowEmpty && !value.trim()) throw new Error(`${label} is required.`);
  if (value.length > maximumLength) throw new Error(`${label} exceeds ${maximumLength.toLocaleString()} characters.`);
  return value;
}

function downloadJson(value, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function invalidateCheckState() {
  lastCheckResults = null;
  lastFixResults = null;
  lastQualityResults = null;
  hasRunCheck = false;
  qualityBtn.disabled = true;
  autoFixBtn.disabled = true;
}

// ========================================
// RUN CHECK (Component-Based)
// ========================================

async function runCheckV14() {
  if (savedComponents.length === 0) {
    showError('No Components', 'Please import or add at least one component before running a check.');
    return null;
  }

  checkBtn.disabled = true;
  checkBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>Checking...';
  resultsSection.classList.add('show');
  results.innerHTML = '<div class="loading"><div class="spinner"></div>Scanning page...</div>';
  stats.classList.remove('show');
  isResultsCollapsed = false;
  updateResultsCollapseState();

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) throw new Error('No active tab is available.');
    await injectContentScript(tab.id);
    const response = await sendTabMessage(tab.id, {
      action: 'runCheck',
      components: savedComponents,
      classInventory: importedClassInventory
    }, 30000);
    if (!response || response.success === false) {
      throw new Error(response && response.error || 'The page returned no check result.');
    }
    lastCheckResults = response;
    enableQualityFeatures();
    displayResults(response);
    return response;
  } catch (error) {
    showError('Check Failed', error.message || 'Could not scan this page.');
    return null;
  } finally {
    checkBtn.disabled = savedComponents.length === 0;
    checkBtn.innerHTML = '<i class="fa-solid fa-circle-play" aria-hidden="true"></i>Run Check';
  }
}

async function runCheck() {
  // Check if there are any components
  if (savedComponents.length === 0) {
    showError('No Components', 'Please add at least one component before running check.');
    return;
  }
  
  checkBtn.disabled = true;
  checkBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>Checking...';
  
  // Show results section with loading state
  resultsSection.classList.add('show');
  results.innerHTML = '<div class="loading"><div class="spinner"></div>Scanning page...</div>';
  stats.classList.remove('show');
  qualitySection.classList.remove('show');
  // Don't hide fix section if it was already shown (from auto-fix)
  // Only hide it if it's not currently showing
  if (!fixSection.classList.contains('show')) {
    fixSection.classList.remove('show');
  }
  
  // Ensure results content is visible during check
  isResultsCollapsed = false;
  updateResultsCollapseState();
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await injectContentScript(tab.id);
    
    // Send saved components to content script
    chrome.tabs.sendMessage(tab.id, { 
      action: 'runCheck', 
      components: savedComponents,
      classInventory: importedClassInventory
    }, (response) => {
      checkBtn.disabled = false;
      checkBtn.innerHTML = '<i class="fa-solid fa-circle-play" aria-hidden="true"></i>Run Check';
      
      if (chrome.runtime.lastError) {
        showError('Error', 'Could not scan this page. ' + chrome.runtime.lastError.message);
        return;
      }
      
      if (!response) {
        showError('Error', 'No response from page. Please refresh and try again.');
        return;
      }
      
      lastCheckResults = response;
      // If nothing matched on the page, show a friendly informational note
      if ((!response.totalChecked || response.totalChecked === 0) && !response.classAudit) {
        results.innerHTML = `
          <div class="empty-state" style="text-align:center; padding: 24px 16px;">
            <span class="material-icons" style="font-size:40px; color:var(--text-muted); display:block; margin-bottom:10px;">manage_search</span>
            <p style="font-size:13px; font-weight:600; color:var(--text); margin:0 0 6px;">No Matching Elements Found</p>
            <p style="font-size:11px; color:var(--text-muted); margin:0 0 12px; line-height:1.5;">
              None of your saved components were found on this page.<br>
              Make sure the CSS selectors and optional scope match elements on the page.
            </p>
            <div style="background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:10px 12px; text-align:left;">
              <p style="font-size:10px; color:var(--text-muted); margin:0 0 6px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">Tips</p>
              <p style="font-size:11px; color:var(--text-muted); margin:2px 0;">• Check that your component selector matches elements on this page</p>
              <p style="font-size:11px; color:var(--text-muted); margin:2px 0;">• Try scanning the page first to discover components</p>
              <p style="font-size:11px; color:var(--text-muted); margin:2px 0;">• Verify the page fully loaded before running check</p>
            </div>
          </div>
        `;
        stats.classList.remove('show');
        resultsSection.classList.add('show');
        isResultsCollapsed = false;
        updateResultsCollapseState();
        return;
      }

      enableQualityFeatures();
      displayResults(response);
    });
  } catch (error) {
    checkBtn.disabled = false;
    checkBtn.innerHTML = '<i class="fa-solid fa-circle-play" aria-hidden="true"></i>Run Check';
    showError('Error', error.message || 'Failed to run check');
  }
}

function displayResultsLegacy(data) {
  const { passed, failed, issues, totalChecked, message } = data;
  
  document.getElementById('passedCount').textContent = passed;
  document.getElementById('failedCount').textContent = failed;
  stats.classList.add('show');
  
  if (failed === 0 && passed === 0) {
    results.innerHTML = `
      <div class="empty-state">
        <span class="material-icons">search_off</span>
        <p>${message || 'No components found.'}</p>
      </div>
    `;
  } else if (failed === 0) {
    results.innerHTML = `
      <div class="success-message" style="text-align: center; padding: 20px; color: var(--success);">
        <span class="material-icons" style="font-size: 36px;">check_circle</span>
        <p style="margin-top: 8px; font-size: 12px;">All ${passed} components pass!</p>
      </div>
    `;
  } else {
    let issuesHtml = '';
    issues.forEach(issue => {
      issuesHtml += `
        <div class="result-item fail">
          <div class="result-icon">
            <span class="material-icons">error</span>
          </div>
          <div class="result-content">
            <div class="result-title">${issue.type.charAt(0).toUpperCase() + issue.type.slice(1)}</div>
            ${issue.violations.map(v => `<div class="result-desc">${v}</div>`).join('')}
          </div>
        </div>
      `;
    });
    results.innerHTML = issuesHtml;
  }
}

function displayResults(data) {
  const passed = Number(data && data.passed) || 0;
  const failed = Number(data && data.failed) || 0;
  const issues = Array.isArray(data && data.issues) ? data.issues : [];
  const unknownClassCount = Number(data && data.classAudit && data.classAudit.unknownCount) || 0;
  document.getElementById('passedCount').textContent = String(passed);
  document.getElementById('failedCount').textContent = String(failed);
  stats.classList.add('show');
  results.replaceChildren();

  if (failed === 0 && passed === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<span class="material-icons">search_off</span>';
    const message = document.createElement('p');
    message.textContent = data && data.message || 'No components found.';
    empty.appendChild(message);
    results.appendChild(empty);
  } else if (failed === 0 && unknownClassCount === 0) {
    const success = document.createElement('div');
    success.className = 'success-message';
    success.style.cssText = 'text-align:center;padding:20px;color:var(--success)';
    success.innerHTML = '<span class="material-icons" style="font-size:36px">check_circle</span>';
    const text = document.createElement('p');
    text.style.cssText = 'margin-top:8px;font-size:12px';
    text.textContent = `All ${passed} checks pass!`;
    success.appendChild(text);
    results.appendChild(success);
  } else {
    const fragment = document.createDocumentFragment();
    for (const issue of issues) {
      const item = document.createElement('div');
      item.className = 'result-item fail';
      const icon = document.createElement('div');
      icon.className = 'result-icon';
      icon.innerHTML = '<span class="material-icons">error</span>';
      const content = document.createElement('div');
      content.className = 'result-content';
      const title = document.createElement('div');
      title.className = 'result-title';
      const issueType = typeof issue.type === 'string' ? issue.type : 'Component';
      title.textContent = issueType.charAt(0).toUpperCase() + issueType.slice(1);
      content.appendChild(title);
      const targetParts = [];
      if (typeof issue.selector === 'string' && issue.selector) targetParts.push(`Rule: ${issue.selector}`);
      if (typeof issue.element === 'string' && issue.element) targetParts.push(`Element: ${issue.element}`);
      if (targetParts.length) {
        const target = document.createElement('div');
        target.className = 'result-desc';
        target.style.cssText = 'margin-bottom:4px;color:var(--text-muted);font-family:monospace';
        target.textContent = targetParts.join(' · ');
        content.appendChild(target);
      }
      for (const violation of Array.isArray(issue.violations) ? issue.violations : []) {
        const description = document.createElement('div');
        description.className = 'result-desc';
        description.textContent = String(violation);
        content.appendChild(description);
      }
      item.append(icon, content);
      fragment.appendChild(item);
    }
    results.appendChild(fragment);
  }

  if (unknownClassCount > 0) {
    const item = document.createElement('div');
    item.className = 'result-item fail';
    const icon = document.createElement('div');
    icon.className = 'result-icon';
    icon.innerHTML = '<span class="material-icons">rule</span>';
    const content = document.createElement('div');
    content.className = 'result-content';
    const title = document.createElement('div');
    title.className = 'result-title';
    title.textContent = `${unknownClassCount.toLocaleString()} unknown library class${unknownClassCount === 1 ? '' : 'es'}`;
    const description = document.createElement('div');
    description.className = 'result-desc';
    description.textContent = (data.classAudit.unknownClasses || []).join(', ');
    content.append(title, description);
    item.append(icon, content);
    results.appendChild(item);
  }

  const notes = [];
  if (data && data.omittedIssueCount) notes.push(`${data.omittedIssueCount.toLocaleString()} additional issues hidden`);
  if (data && data.omittedFixDeclarationCount) notes.push(`${data.omittedFixDeclarationCount.toLocaleString()} auto-fix declarations omitted`);
  if (data && data.omittedElementCount) notes.push(`${data.omittedElementCount.toLocaleString()} elements skipped by safety limits`);
  if (data && data.elementCheckLimitReached) notes.push('10,000 element-check safety limit reached');
  if (data && data.hiddenSkippedCount) notes.push(`${data.hiddenSkippedCount.toLocaleString()} display:none elements deferred until visible`);
  if (data && data.classAudit) {
    const audit = data.classAudit;
    notes.push(`${audit.usedCount.toLocaleString()} of ${audit.knownCount.toLocaleString()} library classes used`);
    if (audit.unknownCount) notes.push(`${audit.unknownCount.toLocaleString()} unknown library classes`);
    if (audit.hiddenUnknownElementCount) notes.push(`${audit.hiddenUnknownElementCount.toLocaleString()} hidden class-audit elements deferred`);
    if (audit.omittedElementCount) notes.push(`${audit.omittedElementCount.toLocaleString()} class-bearing elements skipped by safety limits`);
  }
  if (notes.length) {
    const notice = document.createElement('div');
    notice.className = 'empty-state';
    notice.style.cssText = 'padding:10px;margin-top:8px;font-size:10px';
    notice.textContent = notes.join(' · ');
    results.appendChild(notice);
  }
}

// ========================================
// QUALITY ANALYSIS
// ========================================

async function calculateQuality() {
  if (!lastCheckResults) {
    await runCheckV14();
    return;
  }
  
  // Clear other results but keep check results
  fixSection.classList.remove('show');
  
  // Show quality section
  qualitySection.classList.add('show');
  isQualityCollapsed = false;
  updateQualityCollapseState();
  
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await injectContentScript(tab.id);
  
  chrome.tabs.sendMessage(tab.id, { action: 'analyzeQuality', components: savedComponents }, (response) => {
    if (!response) return;
    
    lastQualityResults = response;
    const { performance, accessibility, bestPractices, seo } = response;
    const consistencyScore = calculateQualityScore(lastCheckResults);
    
    const weightedOverall = Math.round(
      (performance * 0.25) + 
      (accessibility * 0.25) + 
      (bestPractices * 0.2) + 
      (seo * 0.15) + 
      (consistencyScore * 0.15)
    );
    
    const getScoreColor = (score) => 
      score >= 80 ? 'var(--success)' : score >= 50 ? 'var(--warning)' : 'var(--error)';
    
    const tips = getImprovementTips(performance, accessibility, bestPractices, seo, consistencyScore);
    
    const qualityMetricsHtml = `
      <div class="quality-dashboard">
        <div class="quality-overall">
          <div style="font-size: 48px; font-weight: 800; color: ${getScoreColor(weightedOverall)}; margin-bottom: 4px;">
            ${weightedOverall}%
          </div>
          <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 16px;">Overall Quality Score</div>
          <div style="height: 10px; background: var(--surface-light); border-radius: 5px; overflow: hidden;">
            <div style="height: 100%; width: ${weightedOverall}%; background: ${getScoreColor(weightedOverall)}; border-radius: 5px; transition: width 0.5s ease;"></div>
          </div>
        </div>
        
        <div class="quality-metrics">
          <div class="quality-metric">
            <div class="metric-header">
              <span class="material-icons">speed</span>
              <span>Performance</span>
            </div>
            <div class="metric-score" style="color: ${getScoreColor(performance)};">${performance}%</div>
            <div class="metric-bar">
              <div style="width: ${performance}%; background: ${getScoreColor(performance)};"></div>
            </div>
          </div>
          
          <div class="quality-metric">
            <div class="metric-header">
              <span class="material-icons">accessibility</span>
              <span>Accessibility</span>
            </div>
            <div class="metric-score" style="color: ${getScoreColor(accessibility)};">${accessibility}%</div>
            <div class="metric-bar">
              <div style="width: ${accessibility}%; background: ${getScoreColor(accessibility)};"></div>
            </div>
          </div>
          
          <div class="quality-metric">
            <div class="metric-header">
              <span class="material-icons">verified</span>
              <span>Best Practices</span>
            </div>
            <div class="metric-score" style="color: ${getScoreColor(bestPractices)};">${bestPractices}%</div>
            <div class="metric-bar">
              <div style="width: ${bestPractices}%; background: ${getScoreColor(bestPractices)};"></div>
            </div>
          </div>
          
          <div class="quality-metric">
            <div class="metric-header">
              <span class="material-icons">search</span>
              <span>SEO</span>
            </div>
            <div class="metric-score" style="color: ${getScoreColor(seo)};">${seo}%</div>
            <div class="metric-bar">
              <div style="width: ${seo}%; background: ${getScoreColor(seo)};"></div>
            </div>
          </div>
          
          <div class="quality-metric">
            <div class="metric-header">
              <span class="material-icons">compare</span>
              <span>Component Consistency</span>
            </div>
            <div class="metric-score" style="color: ${getScoreColor(consistencyScore)};">${consistencyScore}%</div>
            <div class="metric-bar">
              <div style="width: ${consistencyScore}%; background: ${getScoreColor(consistencyScore)};"></div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    let tipsHtml = '';
    if (tips.length > 0) {
      tipsHtml = `
        <div class="improvement-tips">
          <div class="improvement-tips-title">
            <span class="material-icons">lightbulb</span>
            How to Improve
          </div>
          ${tips.map(tip => `
            <div class="tip-item">
              <div class="tip-category">
                <span class="material-icons">${tip.icon}</span>
                ${tip.category}
              </div>
              <div class="tip-text">
                ${tip.suggestions.map(s => `• ${s}`).join('<br>')}
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      tipsHtml = `
        <div class="improvement-tips">
          <div class="improvement-tips-title">
            <span class="material-icons">emoji_events</span>
            Great Job!
          </div>
          <div class="tip-item">
            <div class="tip-text">
              All metrics are above 80%. Your page is well-optimized! Keep up the good work.
            </div>
          </div>
        </div>
      `;
    }
    
    document.getElementById('qualityMetrics').innerHTML = qualityMetricsHtml;
    document.getElementById('improvementTips').innerHTML = tipsHtml;
  });
}

function getImprovementTips(performance, accessibility, bestPractices, seo, consistencyScore) {
  const tips = [];
  
  if (performance < 80) {
    tips.push({
      category: 'Performance',
      icon: 'speed',
      suggestions: [
        'Enable lazy loading for images below the fold',
        'Minimize and compress CSS/JS files',
        'Use a CDN for static assets',
        'Implement browser caching with proper headers',
        'Reduce DOM size - remove unnecessary elements'
      ]
    });
  }
  
  if (accessibility < 80) {
    tips.push({
      category: 'Accessibility',
      icon: 'accessibility',
      suggestions: [
        'Add descriptive alt text to all images',
        'Ensure all interactive elements have proper labels',
        'Add ARIA landmarks (main, nav, aside)',
        'Ensure color contrast ratio of at least 4.5:1',
        'Add skip-to-content link for keyboard users'
      ]
    });
  }
  
  if (bestPractices < 80) {
    tips.push({
      category: 'Best Practices',
      icon: 'verified',
      suggestions: [
        'Use HTTPS for all resources',
        'Add viewport meta tag for mobile',
        'Use modern image formats (WebP, AVIF)',
        'Remove unused CSS and JavaScript',
        'Keep dependencies up to date'
      ]
    });
  }
  
  if (seo < 80) {
    tips.push({
      category: 'SEO',
      icon: 'search',
      suggestions: [
        'Add unique and descriptive meta descriptions',
        'Use only one H1 tag per page',
        'Create an XML sitemap',
        'Add structured data (Schema.org)',
        'Optimize page titles with relevant keywords'
      ]
    });
  }
  
  if (consistencyScore < 80) {
    tips.push({
      category: 'UI Consistency',
      icon: 'compare',
      suggestions: [
        'Use a design system with consistent spacing',
        'Standardize border radius values (4px, 8px, 12px)',
        'Limit color palette to 5-8 brand colors',
        'Use consistent button heights and padding',
        'Apply typography scale for headings and body'
      ]
    });
  }
  
  return tips;
}

function calculateQualityScore(data) {
  const { passed, failed } = data;
  const classPassed = Number(data.classAudit && data.classAudit.usedCount) || 0;
  const classFailed = Number(data.classAudit && data.classAudit.unknownCount) || 0;
  const total = passed + failed + classPassed + classFailed;
  return total > 0 ? Math.round(((passed + classPassed) / total) * 100) : 100;
}

// ========================================
// AUTO FIX (Fixed - Results Persist)
// ========================================

async function runAutoFix() {
  if (!lastCheckResults) {
    await runCheckV14();
    return;
  }
  
  if (savedComponents.length === 0) {
    showError('No Components', 'Please add at least one component before running auto-fix.');
    return;
  }
  
  qualitySection.classList.remove('show');
  
  autoFixBtn.disabled = true;
  autoFixBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>Fixing...';
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const fixResponse = await sendTabMessage(tab.id, {
      action: 'autoFix',
      components: savedComponents
    }, 30000);
    
    if (!fixResponse || !fixResponse.success) {
      showError('Fix Failed', 'Could not apply fixes. Please try again.');
      autoFixBtn.disabled = false;
      autoFixBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>Auto-Fix';
      return;
    }
    
    lastFixResults = fixResponse;
    showFixResults(fixResponse);
    
    // Use the inline verify result from content script if available,
    // otherwise do a fresh runCheck to get accurate post-fix counts
    if (fixResponse.verifyFailed !== undefined) {
      // Content script already re-checked — update UI with accurate counts
      const verifyData = {
        passed: fixResponse.verifyPassed,
        failed: fixResponse.verifyFailed,
        issues: fixResponse.verifyIssues || [],
        totalChecked: (fixResponse.verifyPassed || 0) + (fixResponse.verifyFailed || 0)
      };
      lastCheckResults = verifyData;
      displayResults(verifyData);
      
      const remaining = fixResponse.verifyFailed;
      const fixed = fixResponse.fixedCount;
      if (remaining === 0) {
        showSuccess(`✅ All ${fixed} issues fixed! Everything passes now.`);
      } else {
        showSuccess(`Fixed ${fixed} elements. ${remaining} issue(s) still need attention.`);
      }
    } else {
      // Fallback: re-run full check from popup
      showSuccess(`Auto Fix Applied! Fixed ${fixResponse.fixedCount} elements.`);
      await runCheckV14();
    }
    
  } catch (error) {
    showError('Error', error.message);
  } finally {
    autoFixBtn.disabled = false;
    autoFixBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>Auto-Fix';
  }
}

function showFixResults(response) {
  if (!response.fixes || response.fixes.length === 0) {
    fixSection.classList.remove('show');
    return;
  }
  
  // Add summary at the top
  const summaryHtml = `
    <div class="fix-summary" style="background: var(--bg); border-radius: 8px; padding: 10px; margin-bottom: 12px; border: 1px solid var(--border);">
      <div style="display: flex; align-items: center; gap: 8px; color: var(--success); font-size: 12px; font-weight: 600;">
        <span class="material-icons">check_circle</span>
        Auto Fix Applied
      </div>
      <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
        Fixed: ${response.fixedCount} | Remaining: ${response.verifyFailed !== undefined ? response.verifyFailed : (lastCheckResults?.failed ?? 'N/A')}
      </div>
      ${(response.omittedFixCount || response.omittedDeclarationCount) ? `
        <div style="font-size:10px;color:var(--warning);margin-top:4px;">
          Safety limit: ${Number(response.omittedFixCount || 0)} fix summaries and ${Number(response.omittedDeclarationCount || 0)} declarations omitted
        </div>` : ''}
    </div>
  `;
  
  const fixesHtml = response.fixes.map(fix => `
    <div class="fix-item">
      <div class="fix-item-header">
        <span class="material-icons">check_circle</span>
        ${escapeHtml(String(fix.element || 'element'))}
      </div>
      <div class="fix-code">${escapeHtml(fix.css)}</div>
    </div>
  `).join('');
  
  fixContent.innerHTML = summaryHtml + fixesHtml;
  fixSection.classList.add('show');
  // Keep it collapsed (collapsed = true means content is hidden, collapsed = false means content is visible)
  isFixCollapsed = true;
  updateFixCollapseState();
  // Save the collapsed state
  chrome.storage.local.set({ isFixCollapsed: true });
}

async function copyFixResults() {
  if (!lastFixResults || !lastFixResults.fixes) return;
  
  const fixText = lastFixResults.fixes.map(fix => 
    `/* ${fix.element} */\n${fix.css}`
  ).join('\n\n');
  
  await navigator.clipboard.writeText(fixText);
  copyFixBtn.innerHTML = '<span class="material-icons">check</span>Copied!';
  copyFixBtn.classList.add('copied');
  
  setTimeout(() => {
    copyFixBtn.innerHTML = '<span class="material-icons">content_copy</span>Copy';
    copyFixBtn.classList.remove('copied');
  }, 2000);
}

function exportFixResults() {
  if (!lastFixResults || !lastFixResults.fixes) return;
  
  const fixText = lastFixResults.fixes.map(fix => 
    `/* ${fix.element} */\n${fix.css}`
  ).join('\n\n');
  
  const blob = new Blob([fixText], { type: 'text/css' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ui-fixes-${Date.now()}.css`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  
  showSuccess('Fixes exported as CSS file!');
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

async function injectContentScript(tabId) {
  try {
    await sendTabMessage(tabId, { action: 'ping' }, 1200);
  } catch (error) {
    await chrome.scripting.executeScript({ target: { tabId: tabId }, files: ['content.js'] });
    await chrome.scripting.insertCSS({ target: { tabId: tabId }, files: ['content.css'] });
    let lastError = error;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await sendTabMessage(tabId, { action: 'ping' }, 1200);
        return;
      } catch (pingError) {
        lastError = pingError;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    throw lastError;
  }
}

function sendTabMessage(tabId, message, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The page did not respond in time.')), timeoutMs);
    chrome.tabs.sendMessage(tabId, message, response => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}

function showSuccess(message) {
  const tempDiv = document.createElement('div');
  tempDiv.style.cssText = 'text-align: center; padding: 20px; color: var(--success);';
  const icon = document.createElement('span');
  icon.className = 'material-icons';
  icon.style.fontSize = '36px';
  icon.textContent = 'check_circle';
  const text = document.createElement('p');
  text.style.cssText = 'margin-top:8px;font-size:12px';
  text.textContent = String(message);
  tempDiv.append(icon, text);
  results.replaceChildren();
  results.appendChild(tempDiv);
  resultsSection.classList.add('show');
}

function showError(title, detail) {
  const item = document.createElement('div');
  item.className = 'result-item fail';
  const icon = document.createElement('div');
  icon.className = 'result-icon';
  icon.innerHTML = '<span class="material-icons">error</span>';
  const content = document.createElement('div');
  content.className = 'result-content';
  const heading = document.createElement('div');
  heading.className = 'result-title';
  heading.textContent = String(title);
  const description = document.createElement('div');
  description.className = 'result-desc';
  description.textContent = String(detail);
  content.append(heading, description);
  item.append(icon, content);
  results.replaceChildren(item);
  resultsSection.classList.add('show');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ========================================
// INITIALIZE ON LOAD
// ========================================

document.addEventListener('DOMContentLoaded', initialize);
