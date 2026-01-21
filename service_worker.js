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

// --- Translation bridge for content scripts ---
async function getApiKey() {
  const { geminiApiKey } = await chrome.storage.sync.get({ geminiApiKey: '' });
  return geminiApiKey;
}

function buildPrompt(text, source, target) {
  const sourceInfo = source === 'auto'
    ? 'Detect the source language from the entire passage.'
    : `The source language is ${source}.`;
  return `You are a professional translator. ${sourceInfo} Translate the passage into ${target}.
Rules:
- Preserve meaning, tone, and formatting.
- Keep numbers, URLs, code, and emojis unchanged where appropriate.
- Return only the translated text without quotes or explanations.
Text:\n${text}`;
}

async function translateWithGemini(text, source, target, modelId) {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('Missing Gemini API key');
  const modelPath = `models/${modelId}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = { contents: [{ role: 'user', parts: [{ text: buildPrompt(text, source, target) }] }] };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  const first = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
  if (!first) throw new Error('No translation returned');
  return String(first).trim();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'ai_translate_selection') return; 
  (async () => {
    try {
      const { text, sourceLang, targetLang, modelId } = message;
      const output = await translateWithGemini(text || '', sourceLang || 'auto', targetLang || 'vi', modelId || 'gemini-2.0-flash');
      sendResponse({ ok: true, text: output });
    } catch (e) {
      sendResponse({ ok: false, error: String(e && e.message || e) });
    }
  })();
  return true; // keep the message channel open for async response
});
