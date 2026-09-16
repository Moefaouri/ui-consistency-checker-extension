/**
 * UI Consistency Checker - Popup Script
 * Component-Based Architecture (No Legacy Rules)
 * @version 1.3.1
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
let currentViewComponentId = null;
let editingComponentId = null;
let hasRunCheck = false;

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

// Theme toggle
const themeBtns = document.querySelectorAll('.theme-toggle-btn');

// ========================================
// INITIALIZATION
// ========================================

/**
 * Initialize the popup - load all saved data and set up UI
 */
async function initialize() {
  await loadSavedData();
  setupEventListeners();
  setupCollapsibleSections();
  setupThemeToggle();
}

/**
 * Load all saved data from chrome.storage.local
 */
async function loadSavedData() {
  const result = await chrome.storage.local.get([
    'savedComponents',
    'isComponentsCollapsed',
    'isQualityCollapsed',
    'isResultsCollapsed',
    'isFixCollapsed',
    'theme',
    'firstRun'
  ]);

  // Load saved components
  if (result.savedComponents && result.savedComponents.length > 0) {
    savedComponents = result.savedComponents;
  } else {
    // First time - start with empty array
    savedComponents = [];
    await chrome.storage.local.set({ savedComponents });
  }

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
  document.body.setAttribute('data-theme', theme);
  themeBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
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
      
      if (targetTab === 'services') {
        servicesTab.classList.add('active');
        componentsTab.classList.remove('active');
      } else if (targetTab === 'components') {
        servicesTab.classList.remove('active');
        componentsTab.classList.add('active');
      }
    });
  });

  // Main action buttons
  checkBtn.addEventListener('click', runCheck);
  qualityBtn.addEventListener('click', calculateQuality);
  autoFixBtn.addEventListener('click', runAutoFix);
  
  // Grid toggle
  gridBtn.addEventListener('click', toggleGrid);
  document.getElementById('applyGridBtn').addEventListener('click', applyCustomGrid);
  
  // Component management
  addComponentBtn.addEventListener('click', openAddComponentModal);
  document.getElementById('closeModal').addEventListener('click', closeAddModal);
  document.getElementById('cancelBtn').addEventListener('click', closeAddModal);
  document.getElementById('saveBtn').addEventListener('click', saveComponent);
  
  // View HTML modal
  document.getElementById('closeViewHtmlModal').addEventListener('click', closeViewHtmlModal);
  document.getElementById('copyHtmlBtn').addEventListener('click', copyComponentHtml);
  document.getElementById('editHtmlBtn').addEventListener('click', editComponentFromView);
  
  // Preview updates
  document.getElementById('componentHTMLTag').addEventListener('input', updatePreview);
  document.getElementById('componentStyles').addEventListener('input', updatePreview);
  
  // Import/Export
  exportBtn.addEventListener('click', exportConfiguration);
  importBtn.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', importConfiguration);
  
  // Copy/Export fixes
  copyFixBtn.addEventListener('click', copyFixResults);
  exportFixBtn.addEventListener('click', exportFixResults);
  
  // Close modals on outside click
  window.addEventListener('click', (e) => {
    if (e.target === document.getElementById('addModal')) closeAddModal();
    if (e.target === document.getElementById('viewHtmlModal')) closeViewHtmlModal();
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
    ? '<span class="material-icons">grid_off</span>Grid' 
    : '<span class="material-icons">grid_on</span>Grid';
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
  document.getElementById('componentHTMLTag').value = '';
  document.getElementById('componentStyles').value = '';
  document.getElementById('componentPreview').textContent = 'Enter HTML tag and styles above';
  document.getElementById('saveBtn').textContent = 'Save Component';
  document.getElementById('addModal').classList.add('show');
}

function closeAddModal() {
  document.getElementById('addModal').classList.remove('show');
  editingComponentId = null;
}

function closeViewHtmlModal() {
  document.getElementById('viewHtmlModal').classList.remove('show');
  currentViewComponentId = null;
}

function copyComponentHtml() {
  if (currentViewComponentId) {
    const component = savedComponents.find(c => c.id === currentViewComponentId);
    if (component) {
      navigator.clipboard.writeText(component.html);
      showSuccess('HTML copied!');
    }
  }
}

function editComponentFromView() {
  if (currentViewComponentId) {
    const component = savedComponents.find(c => c.id === currentViewComponentId);
    if (component) {
      closeViewHtmlModal();
      editingComponentId = currentViewComponentId;
      document.getElementById('modalTitle').textContent = 'Edit Component';
      document.getElementById('componentName').value = component.name;
      document.getElementById('componentHTMLTag').value = component.htmlTag || component.html;
      document.getElementById('componentStyles').value = component.styles || '';
      updatePreview();
      document.getElementById('saveBtn').textContent = 'Update Component';
      document.getElementById('addModal').classList.add('show');
    }
  }
}

function updatePreview() {
  const htmlTag = document.getElementById('componentHTMLTag').value;
  const styles = document.getElementById('componentStyles').value;
  
  if (!htmlTag && !styles) {
    document.getElementById('componentPreview').textContent = 'Enter HTML tag and styles above';
    return;
  }
  
  let preview = 'HTML:\n' + formatHtml(htmlTag);
  if (styles) {
    preview += '\n\nCSS:\n' + styles;
  }
  
  document.getElementById('componentPreview').textContent = preview;
}

function detectComponentType(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const element = doc.body.firstElementChild;
  if (!element) return 'custom';
  
  const tagName = element.tagName.toLowerCase();
  const classList = element.className ? element.className.split(/\s+/) : [];
  
  if (tagName === 'button') return 'button';
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') return 'input';
  if (tagName === 'nav') return 'navbar';
  if (tagName === 'dialog') return 'modal';
  if (classList.some(c => c.includes('btn') || c.includes('button'))) return 'button';
  if (classList.some(c => c.includes('input') || c.includes('form-control'))) return 'input';
  if (classList.some(c => c.includes('card'))) return 'card';
  if (classList.some(c => c.includes('modal') || c.includes('dialog'))) return 'modal';
  if (classList.some(c => c.includes('nav') || c.includes('navbar'))) return 'navbar';
  
  return 'custom';
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
  const htmlTag = document.getElementById('componentHTMLTag').value.trim();
  const styles = document.getElementById('componentStyles').value.trim();
  
  if (!name || !htmlTag) {
    alert('Please enter component name and HTML tag');
    return;
  }
  
  const finalHtml = combineHtmlWithStyles(htmlTag, styles);
  const componentType = detectComponentType(finalHtml);
  
  const component = {
    id: 'comp-' + Date.now(),
    name,
    type: 'component',
    componentType,
    html: finalHtml,
    htmlTag: htmlTag,
    styles: styles
  };
  
  savedComponents.push(component);
  await chrome.storage.local.set({ savedComponents });
  displaySavedComponents();
  closeAddModal();
  resetAddModal();
  showSuccess('Component saved!');
}


function combineHtmlWithStyles(htmlTag, styles) {
  // Styles are now CSS, not inline styles
  // Return HTML tag as-is, styles are stored separately
  return htmlTag;
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
  document.getElementById('componentCount').textContent = savedComponents.length;
  
  if (savedComponents.length === 0) {
    container.classList.remove('show');
    updateCheckButtonState();
    return;
  }
  
  container.classList.add('show');
  list.innerHTML = savedComponents.map(comp => `
    <div class="saved-component">
      <div class="component-info">
        <div class="component-name">${escapeHtml(comp.name)}</div>
        <div class="component-type">${comp.componentType.charAt(0).toUpperCase() + comp.componentType.slice(1)}</div>
      </div>
      <div class="component-actions">
        <button class="icon-btn" data-id="${comp.id}" data-action="view" title="View HTML">
          <span class="material-icons">visibility</span>
        </button>
        <button class="icon-btn" data-id="${comp.id}" data-action="edit" title="Edit">
          <span class="material-icons">edit</span>
        </button>
        <button class="icon-btn delete" data-id="${comp.id}" data-action="delete" title="Delete">
          <span class="material-icons">delete</span>
        </button>
      </div>
    </div>
  `).join('');
  
  // Add event listeners to action buttons
  list.querySelectorAll('.icon-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      if (action === 'view') viewComponentHtml(id);
      else if (action === 'edit') editComponent(id);
      else if (action === 'delete') deleteComponent(id);
    });
  });
  
  updateCheckButtonState();
}

function viewComponentHtml(id) {
  const component = savedComponents.find(c => c.id === id);
  if (component) {
    currentViewComponentId = id;
    document.getElementById('viewHtmlTitle').textContent = component.name;
    document.getElementById('viewHtmlCode').textContent = formatHtml(component.html);
    document.getElementById('viewHtmlModal').classList.add('show');
  }
}

function editComponent(id) {
  const component = savedComponents.find(c => c.id === id);
  if (component) {
    editingComponentId = id;
    document.getElementById('modalTitle').textContent = 'Edit Component';
    document.getElementById('componentName').value = component.name;
    document.getElementById('componentHTMLTag').value = component.htmlTag || component.html;
    document.getElementById('componentStyles').value = component.styles || '';
    updatePreview();
    document.getElementById('saveBtn').textContent = 'Update Component';
    document.getElementById('addModal').classList.add('show');
  }
}

async function updateComponent(id) {
  const name = document.getElementById('componentName').value.trim();
  const htmlTag = document.getElementById('componentHTMLTag').value.trim();
  const styles = document.getElementById('componentStyles').value.trim();
  
  if (!name || !htmlTag) {
    alert('Please enter component name and HTML tag');
    return;
  }
  
  const finalHtml = combineHtmlWithStyles(htmlTag, styles);
  const componentType = detectComponentType(finalHtml);
  
  const index = savedComponents.findIndex(c => c.id === id);
  if (index !== -1) {
    savedComponents[index] = {
      ...savedComponents[index],
      name,
      componentType,
      html: finalHtml,
      htmlTag: htmlTag,
      styles: styles
    };
    await chrome.storage.local.set({ savedComponents });
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
    displaySavedComponents();
  }
}

function resetAddModal() {
  document.getElementById('componentName').value = '';
  document.getElementById('componentHTMLTag').value = '';
  document.getElementById('componentStyles').value = '';
  document.getElementById('componentPreview').textContent = 'Enter HTML tag and styles above';
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
      version: '1.3.1',
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

// ========================================
// RUN CHECK (Component-Based)
// ========================================

async function runCheck() {
  // Check if there are any components
  if (savedComponents.length === 0) {
    showError('No Components', 'Please add at least one component before running check.');
    return;
  }
  
  checkBtn.disabled = true;
  checkBtn.innerHTML = '<span class="material-icons">hourglass_empty</span>Checking...';
  
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
      components: savedComponents 
    }, (response) => {
      checkBtn.disabled = false;
      checkBtn.innerHTML = '<span class="material-icons">play_circle</span>Run Check';
      
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
      if (!response.totalChecked || response.totalChecked === 0) {
        results.innerHTML = `
          <div class="empty-state" style="text-align:center; padding: 24px 16px;">
            <span class="material-icons" style="font-size:40px; color:var(--text-muted); display:block; margin-bottom:10px;">manage_search</span>
            <p style="font-size:13px; font-weight:600; color:var(--text); margin:0 0 6px;">No Matching Elements Found</p>
            <p style="font-size:11px; color:var(--text-muted); margin:0 0 12px; line-height:1.5;">
              None of your saved components were found on this page.<br>
              Make sure the HTML tag and class names match elements on the page.
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
    checkBtn.innerHTML = '<span class="material-icons">play_circle</span>Run Check';
    showError('Error', error.message || 'Failed to run check');
  }
}

function displayResults(data) {
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

// ========================================
// QUALITY ANALYSIS
// ========================================

async function calculateQuality() {
  if (!lastCheckResults) {
    await runCheck();
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
  const total = passed + failed;
  return total > 0 ? Math.round((passed / total) * 100) : 100;
}

// ========================================
// AUTO FIX (Fixed - Results Persist)
// ========================================

async function runAutoFix() {
  if (!lastCheckResults) {
    await runCheck();
    return;
  }
  
  if (savedComponents.length === 0) {
    showError('No Components', 'Please add at least one component before running auto-fix.');
    return;
  }
  
  qualitySection.classList.remove('show');
  
  autoFixBtn.disabled = true;
  autoFixBtn.innerHTML = '<span class="material-icons">hourglass_empty</span>Fixing...';
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Apply fixes (content script will also do inline verification + reflow)
    const fixResponse = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { 
        action: 'autoFix', 
        components: savedComponents 
      }, resolve);
    });
    
    if (!fixResponse || !fixResponse.success) {
      showError('Fix Failed', 'Could not apply fixes. Please try again.');
      autoFixBtn.disabled = false;
      autoFixBtn.innerHTML = '<span class="material-icons">auto_fix_high</span>Auto-Fix';
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
      showSuccess(`Auto Fix Applied! Fixed ${fixResponse.fixedCount} components.`);
      await new Promise(r => setTimeout(r, 150));
      await runCheck();
    }
    
  } catch (error) {
    showError('Error', error.message);
  } finally {
    autoFixBtn.disabled = false;
    autoFixBtn.innerHTML = '<span class="material-icons">auto_fix_high</span>Auto-Fix';
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
    </div>
  `;
  
  const fixesHtml = response.fixes.map(fix => `
    <div class="fix-item">
      <div class="fix-item-header">
        <span class="material-icons">check_circle</span>
        ${fix.element}
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
    await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, { action: 'ping' }, (response) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(response);
      });
    });
  } catch (error) {
    await chrome.scripting.executeScript({ target: { tabId: tabId }, files: ['content.js'] });
    await chrome.scripting.insertCSS({ target: { tabId: tabId }, files: ['content.css'] });
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function showSuccess(message) {
  const tempDiv = document.createElement('div');
  tempDiv.style.cssText = 'text-align: center; padding: 20px; color: var(--success);';
  tempDiv.innerHTML = `
    <span class="material-icons" style="font-size: 36px;">check_circle</span>
    <p style="margin-top: 8px; font-size: 12px;">${message}</p>
  `;
  results.innerHTML = '';
  results.appendChild(tempDiv);
  resultsSection.classList.add('show');
}

function showError(title, detail) {
  results.innerHTML = `
    <div class="result-item fail">
      <div class="result-icon">
        <span class="material-icons">error</span>
      </div>
      <div class="result-content">
        <div class="result-title">${title}</div>
        <div class="result-desc">${detail}</div>
      </div>
    </div>
  `;
  resultsSection.classList.add('show');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatHtml(html) {
  let formatted = '';
  let indent = 0;
  const tab = '  ';
  
  html.split(/(<[^>]+>)/g).filter(s => s.trim()).forEach(node => {
    if (node.match(/^<\/\w/)) indent = Math.max(0, indent - 1);
    formatted += tab.repeat(indent) + node + '\n';
    if (node.match(/^<\w[^>]*[^\/]>.*$/)) indent++;
  });
  
  return formatted.trim();
}

// ========================================
// INITIALIZE ON LOAD
// ========================================

document.addEventListener('DOMContentLoaded', initialize);