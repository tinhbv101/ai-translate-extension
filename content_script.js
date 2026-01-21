'use strict';

// Content script: auto-translate selected text and show a tooltip near the selection

(() => {
  const STATE = {
    root: null,
    shadow: null,
    bubble: null,
    bubbleContent: null,
    bubbleHeader: null,
    bubbleActions: null,
    isVisible: false,
    lastSelectionKey: '',
    translateTimer: null,
    repositionTimer: null,
    extensionEnabled: true
  };

  const DEFAULTS = {
    sourceLang: 'auto',
    targetLang: 'vi',
    geminiModel: 'gemini-2.0-flash'
  };

  function ensureUi() {
    if (STATE.root) return;
    const root = document.createElement('div');
    root.id = 'ai-translate-bubble-root';
    root.style.all = 'initial';
    root.style.position = 'fixed';
    root.style.zIndex = '2147483647';
    root.style.top = '0';
    root.style.left = '0';
    root.style.pointerEvents = 'none';
    document.documentElement.appendChild(root);

    const shadow = root.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      .bubble { 
        font-family: ui-sans-serif, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
        position: fixed; max-width: 420px; min-width: 240px; pointer-events: auto;
        background: #111827; color: #F9FAFB; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.25);
        border: 1px solid rgba(255,255,255,0.08);
        overflow: hidden; display: none;
      }
      .header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.08); }
      .title { font-size: 12px; opacity: 0.85; }
      .actions { display: flex; gap: 6px; }
      .btn { cursor: pointer; border: 0; background: #374151; color: #F9FAFB; border-radius: 8px; padding: 6px 10px; font-size: 12px; }
      .btn:hover { background: #4B5563; }
      .btn.primary { background: #2563EB; }
      .btn.primary:hover { background: #1D4ED8; }
      .content { padding: 10px 12px; font-size: 14px; line-height: 1.45; white-space: pre-wrap; word-break: break-word; }
      .muted { opacity: 0.8; }
    `;
    shadow.appendChild(style);

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    const header = document.createElement('div');
    header.className = 'header';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = 'AI Translate';
    const actions = document.createElement('div');
    actions.className = 'actions';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn';
    copyBtn.textContent = 'Copy';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn';
    closeBtn.textContent = 'Close';
    actions.appendChild(copyBtn);
    actions.appendChild(closeBtn);
    header.appendChild(title);
    header.appendChild(actions);

    const content = document.createElement('div');
    content.className = 'content';
    content.textContent = '';

    bubble.appendChild(header);
    bubble.appendChild(content);
    shadow.appendChild(bubble);

    // Events
    closeBtn.addEventListener('click', hideBubble);
    copyBtn.addEventListener('click', () => {
      const text = content.textContent || '';
      navigator.clipboard?.writeText(text).catch(() => {});
    });
    shadow.addEventListener('mousedown', e => e.stopPropagation(), { capture: true });
    shadow.addEventListener('mouseup', e => e.stopPropagation(), { capture: true });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideBubble();
    });

    STATE.root = root;
    STATE.shadow = shadow;
    STATE.bubble = bubble;
    STATE.bubbleContent = content;
    STATE.bubbleHeader = header;
    STATE.bubbleActions = actions;
  }

  function hideBubble() {
    if (!STATE.bubble) return;
    STATE.bubble.style.display = 'none';
    STATE.isVisible = false;
  }

  function setBubbleText(text, muted) {
    ensureUi();
    STATE.bubbleContent.classList.toggle('muted', !!muted);
    STATE.bubbleContent.textContent = text;
  }

  function showBubbleNearSelection() {
    ensureUi();
    const rect = getSelectionRect();
    if (!rect) return hideBubble();
    positionBubble(rect.left, rect.bottom + 8);
    STATE.bubble.style.display = 'block';
    STATE.isVisible = true;
  }

  function positionBubble(x, y) {
    if (!STATE.bubble) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Temporarily display to measure
    STATE.bubble.style.visibility = 'hidden';
    STATE.bubble.style.display = 'block';
    const bw = STATE.bubble.offsetWidth || 320;
    const bh = STATE.bubble.offsetHeight || 100;
    let left = Math.max(8, Math.min(x, vw - bw - 8));
    let top = Math.max(8, Math.min(y, vh - bh - 8));
    STATE.bubble.style.left = left + 'px';
    STATE.bubble.style.top = top + 'px';
    STATE.bubble.style.visibility = 'visible';
  }

  function getSelectionRect() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return null;
    return rect;
  }

  function getSelectedText() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return '';
    const text = String(sel.toString() || '').trim();
    return text;
  }

  function keyFor(text) {
    // Stable key for deduping same selection
    return text.slice(0, 200) + '|' + text.length;
  }

  async function getPrefs() {
    try {
      const prefs = await chrome.storage.sync.get({
        sourceLang: DEFAULTS.sourceLang,
        targetLang: DEFAULTS.targetLang,
        geminiModel: DEFAULTS.geminiModel
      });
      return prefs;
    } catch (e) {
      return {
        sourceLang: DEFAULTS.sourceLang,
        targetLang: DEFAULTS.targetLang,
        geminiModel: DEFAULTS.geminiModel
      };
    }
  }

  function requestTranslation(text, source, target, modelId) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({
          type: 'ai_translate_selection',
          text,
          sourceLang: source,
          targetLang: target,
          modelId
        }, (resp) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!resp || !resp.ok) {
            reject(new Error((resp && resp.error) || 'Translation failed'));
            return;
          }
          resolve(String(resp.text || ''));
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function escapeForDisplay(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function scheduleReposition() {
    if (STATE.repositionTimer) cancelAnimationFrame(STATE.repositionTimer);
    STATE.repositionTimer = requestAnimationFrame(() => {
      const rect = getSelectionRect();
      if (rect && STATE.isVisible) positionBubble(rect.left, rect.bottom + 8);
    });
  }

  async function maybeTranslateSelection() {
    if (!STATE.extensionEnabled) {
      hideBubble();
      return;
    }
    const text = getSelectedText();
    if (!text) { hideBubble(); return; }
    // Bound length to avoid huge costs
    const maxLen = 1200;
    const shortAutoLen = 200;
    const trimmed = text.length > maxLen ? text.slice(0, maxLen) : text;
    const key = keyFor(trimmed);
    if (STATE.lastSelectionKey === key) return; // already handled
    STATE.lastSelectionKey = key;

    ensureUi();
    setBubbleText('Translating…', true);
    showBubbleNearSelection();

    try {
      const prefs = await getPrefs();

      // If selection is long, wait for user to click to confirm
      if (trimmed.length > shortAutoLen) {
        // Show a translate button instead of auto-call
        STATE.bubbleContent.innerHTML = '';
        const btn = document.createElement('button');
        btn.className = 'btn primary';
        btn.textContent = 'Translate selection';
        btn.addEventListener('click', async () => {
          setBubbleText('Translating…', true);
          try {
            const out = await requestTranslation(trimmed, prefs.sourceLang, prefs.targetLang, prefs.geminiModel);
            STATE.bubbleContent.classList.remove('muted');
            STATE.bubbleContent.innerHTML = escapeForDisplay(out).replace(/\n/g, '<br>');
          } catch (e) {
            setBubbleText(String(e.message || e), true);
          }
        });
        STATE.bubbleContent.appendChild(btn);
        return;
      }

      // Auto-translate short selections
      const out = await requestTranslation(trimmed, prefs.sourceLang, prefs.targetLang, prefs.geminiModel);
      STATE.bubbleContent.classList.remove('muted');
      STATE.bubbleContent.innerHTML = escapeForDisplay(out).replace(/\n/g, '<br>');
    } catch (e) {
      setBubbleText(String(e.message || e), true);
    }
  }

  function handleSelectionChange() {
    if (STATE.translateTimer) clearTimeout(STATE.translateTimer);
    STATE.translateTimer = setTimeout(() => {
      maybeTranslateSelection();
    }, 600);
  }

  async function checkExtensionState() {
    try {
      const { extensionEnabled } = await chrome.storage.sync.get({ extensionEnabled: true });
      STATE.extensionEnabled = extensionEnabled !== false;
      if (!STATE.extensionEnabled) {
        hideBubble();
      }
    } catch (e) {
      STATE.extensionEnabled = true;
    }
  }

  // Load initial state
  checkExtensionState();

  // Listen for storage changes to sync state across tabs
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && changes.extensionEnabled !== undefined) {
      STATE.extensionEnabled = changes.extensionEnabled.newValue !== false;
      if (!STATE.extensionEnabled) {
        hideBubble();
      }
    }
  });

  // Global listeners
  document.addEventListener('selectionchange', handleSelectionChange);
  document.addEventListener('mouseup', handleSelectionChange);
  document.addEventListener('keyup', (e) => {
    if (e.key === 'Shift' || e.key === 'Meta' || e.key === 'Control' || e.key === 'Alt') return;
    handleSelectionChange();
  });
  window.addEventListener('scroll', scheduleReposition, { passive: true });
  window.addEventListener('resize', scheduleReposition, { passive: true });
  document.addEventListener('click', (e) => {
    // Hide when clicking outside the bubble
    if (!STATE.shadow || !STATE.isVisible) return;
    const path = e.composedPath && e.composedPath();
    const clickedInside = path && path.includes(STATE.shadow.host);
    if (!clickedInside) hideBubble();
  }, true);
})();


