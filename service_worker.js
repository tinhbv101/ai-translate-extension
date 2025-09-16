'use strict';

// Ensure Chrome opens the side panel automatically when the toolbar icon is clicked
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  });
}

// Configure the side panel path per-tab when the icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (!tab || !tab.id) return;
    await chrome.sidePanel.setOptions({
      tabId: tab.id,
      path: 'sidepanel/sidepanel.html',
      enabled: true
    });
    // Do not call chrome.sidePanel.open() here; Chrome will open it due to setPanelBehavior
  } catch (err) {
    console.error('Failed to configure side panel', err);
  }
});

// Ensure the panel is available on new or refreshed tabs
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status === 'complete') {
    try {
      await chrome.sidePanel.setOptions({
        tabId,
        path: 'sidepanel/sidepanel.html',
        enabled: true
      });
    } catch (e) {
      // ignore
    }
  }
});
