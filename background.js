// Background service worker for UI Consistency Checker
// Component-Based Architecture (No Legacy Rules)
// @version 1.3.1

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[UI Checker] Extension installed');
  
  if (details.reason === 'install') {
    // Set default settings on first install
    chrome.storage.local.set({
      savedComponents: [],
      isComponentsCollapsed: false,
      isQualityCollapsed: false,
      isResultsCollapsed: true,
      isFixCollapsed: true,
      theme: 'dark',
      firstRun: true
    });
    
    // Show welcome notification
    if (chrome.notifications) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon128.png',
        title: 'UI Consistency Checker',
        message: 'Add components and click Run Check to analyze any webpage!'
      });
    }
  } else if (details.reason === 'update') {
    // Handle update - ensure new storage keys exist
    chrome.storage.local.get([
      'theme',
      'isResultsCollapsed',
      'isFixCollapsed',
      'savedComponents'
    ], (result) => {
      const updates = {};
      
      // Remove old legacy keys if they exist
      chrome.storage.local.remove(['customRules', 'customRulesFileName', 'customRulesActive', 'userDefaults', 'hasUserDefaults']);
      
      if (!result.theme) updates.theme = 'dark';
      if (result.isResultsCollapsed === undefined) updates.isResultsCollapsed = true;
      if (result.isFixCollapsed === undefined) updates.isFixCollapsed = true;
      
      // If no saved components, start with empty array
      if (!result.savedComponents) {
        updates.savedComponents = [];
      }
      
      if (Object.keys(updates).length > 0) {
        chrome.storage.local.set(updates);
      }
    });
  }

  // Set up context menus inside onInstalled so the API is ready
  if (chrome.contextMenus) {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'ui-checker-scan',
        title: 'Scan with UI Checker',
        contexts: ['page']
      });
      chrome.contextMenus.create({
        id: 'ui-checker-ai-analysis',
        title: 'AI Deep Analysis',
        contexts: ['page']
      });
    });
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'ping') {
    sendResponse({ success: true, message: 'pong' });
  }
  return true;
});

// Handle tab updates to inject content script
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
    console.log('[UI Checker] Tab updated:', tab.url);
  }
});

// Context menu click handler — only register if API is available
if (chrome.contextMenus && chrome.contextMenus.onClicked) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'ui-checker-scan' || info.menuItemId === 'ui-checker-ai-analysis') {
      chrome.action.openPopup();
    }
  });
}