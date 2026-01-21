'use strict';

const sourceSelect = document.getElementById('sourceLang');
const targetSelect = document.getElementById('targetLang');
const inputEl = document.getElementById('inputHtml');
const outputEl = document.getElementById('outputHtml');
const translateBtn = document.getElementById('translateBtn');
const swapBtn = document.getElementById('swapLangBtn');
const statusEl = document.getElementById('status');
const modelSelect = document.getElementById('modelSelect');
const historyListEl = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const refreshHistoryBtn = document.getElementById('refreshHistoryBtn');
const extensionToggle = document.getElementById('extensionToggle');

const LANGS = [
  { code: 'auto', name: 'Detect language' },
  { code: 'en', name: 'English' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'es', name: 'Spanish' },
  { code: 'pt', name: 'Portuguese' }
];

function populateLanguageSelect(select, defaultCode) {
  select.innerHTML = '';
  for (const lang of LANGS) {
    const opt = document.createElement('option');
    opt.value = lang.code;
    opt.textContent = lang.name;
    if (lang.code === defaultCode) opt.selected = true;
    select.appendChild(opt);
  }
}

// --- Translation history (store last 10) ---
const HISTORY_KEY = 'translationHistory';
const HISTORY_LIMIT = 10;

async function saveTranslationHistoryEntry(entry) {
  try {
    const { [HISTORY_KEY]: existing } = await chrome.storage.local.get({ [HISTORY_KEY]: [] });
    const list = Array.isArray(existing) ? existing : [];
    const updated = [entry, ...list].slice(0, HISTORY_LIMIT);
    await chrome.storage.local.set({ [HISTORY_KEY]: updated });
  } catch (e) {
    // Ignore history save errors to not disrupt UX
  }
}

async function getTranslationHistory() {
  try {
    const { [HISTORY_KEY]: existing } = await chrome.storage.local.get({ [HISTORY_KEY]: [] });
    return Array.isArray(existing) ? existing : [];
  } catch (e) {
    return [];
  }
}

async function clearTranslationHistory() {
  await chrome.storage.local.set({ [HISTORY_KEY]: [] });
}

// Per-item deletion and action buttons removed per request

function formatLang(code) {
  const found = LANGS.find(l => l.code === code);
  return found ? found.name : code;
}

async function renderHistory() {
  if (!historyListEl) return;
  const items = await getTranslationHistory();
  historyListEl.innerHTML = '';
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = 'No history yet.';
    historyListEl.appendChild(empty);
    return;
  }
  const frag = document.createDocumentFragment();
  items.forEach((entry, idx) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'history-item';

    const meta = document.createElement('div');
    meta.className = 'history-meta';
    const left = document.createElement('div');
    const ts = new Date(entry.timestamp || Date.now());
    left.textContent = `${ts.toLocaleString()} · ${formatLang(entry.sourceLang || 'auto')} → ${formatLang(entry.targetLang || '')} · ${entry.model || ''}`;
    meta.appendChild(left);

    const body = document.createElement('div');
    body.className = 'history-body';
    const colIn = document.createElement('div');
    colIn.className = 'history-col';
    const inTitle = document.createElement('h3');
    inTitle.textContent = 'Input';
    const inContent = document.createElement('div');
    inContent.innerHTML = sanitizeHtml(entry.inputHtml || '');
    colIn.appendChild(inTitle);
    colIn.appendChild(inContent);

    const colOut = document.createElement('div');
    colOut.className = 'history-col';
    const outTitle = document.createElement('h3');
    outTitle.textContent = 'Output';
    const outContent = document.createElement('div');
    outContent.innerHTML = sanitizeHtml(entry.outputHtml || '');
    colOut.appendChild(outTitle);
    colOut.appendChild(outContent);

    body.appendChild(colIn);
    body.appendChild(colOut);

    wrapper.appendChild(meta);
    wrapper.appendChild(body);
    frag.appendChild(wrapper);
  });
  historyListEl.appendChild(frag);
}

async function copyHtmlString(html) {
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      const blobHtml = new Blob([html || ''], { type: 'text/html' });
      const blobText = new Blob([String(html || '').replace(/<[^>]*>/g, '')], { type: 'text/plain' });
      const item = new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText });
      await navigator.clipboard.write([item]);
      setStatus('Copied');
      setTimeout(() => setStatus(''), 800);
      return;
    }
  } catch (e) {
    // Fallback below
  }
  const temp = document.createElement('div');
  temp.style.position = 'fixed';
  temp.style.left = '-9999px';
  temp.style.whiteSpace = 'pre-wrap';
  temp.innerHTML = html || '';
  document.body.appendChild(temp);
  const range = document.createRange();
  range.selectNodeContents(temp);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  try {
    document.execCommand('copy');
    setStatus('Copied');
    setTimeout(() => setStatus(''), 800);
  } finally {
    sel.removeAllRanges();
    document.body.removeChild(temp);
  }
}

const MODELS = [
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash-Lite' }
  // Models focused on image generation or live streaming are omitted for this text workflow
];

function populateModelSelect(select, defaultId) {
  select.innerHTML = '';
  for (const m of MODELS) {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.label;
    if (m.id === defaultId) opt.selected = true;
    select.appendChild(opt);
  }
}

async function loadPreferences() {
  const { sourceLang, targetLang, geminiModel } = await chrome.storage.sync.get({ sourceLang: 'auto', targetLang: 'vi', geminiModel: 'gemini-2.0-flash' });
  populateLanguageSelect(sourceSelect, sourceLang);
  populateLanguageSelect(targetSelect, targetLang);
  populateModelSelect(modelSelect, geminiModel);
}

function savePreferences() {
  chrome.storage.sync.set({ sourceLang: sourceSelect.value, targetLang: targetSelect.value, geminiModel: modelSelect.value });
}

swapBtn.addEventListener('click', () => {
  const s = sourceSelect.value;
  sourceSelect.value = targetSelect.value === 'auto' ? 'en' : targetSelect.value;
  targetSelect.value = s === 'auto' ? 'vi' : s;
  savePreferences();
});

sourceSelect.addEventListener('change', savePreferences);
targetSelect.addEventListener('change', savePreferences);
modelSelect.addEventListener('change', savePreferences);

function setStatus(text) { statusEl.textContent = text; }

async function copyElementHtml(el) {
  if (!el) return;
  const html = el.innerHTML || '';
  const text = el.innerText || '';
  if (!html && !text) return;
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      const blobHtml = new Blob([html], { type: 'text/html' });
      const blobText = new Blob([text], { type: 'text/plain' });
      const item = new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText });
      await navigator.clipboard.write([item]);
      setStatus('Copied');
      setTimeout(() => setStatus(''), 1000);
      return;
    }
  } catch (e) {
    // Fallback below
  }
  // Fallback: execCommand('copy') on a temp element
  const temp = document.createElement('div');
  temp.style.position = 'fixed';
  temp.style.left = '-9999px';
  temp.style.whiteSpace = 'pre-wrap';
  temp.innerHTML = html || text;
  document.body.appendChild(temp);
  const range = document.createRange();
  range.selectNodeContents(temp);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  try {
    document.execCommand('copy');
    setStatus('Copied');
    setTimeout(() => setStatus(''), 1000);
  } finally {
    sel.removeAllRanges();
    document.body.removeChild(temp);
  }
}

// --- HTML-preserving translation helpers ---
function buildPromptFromHtml(html, source, target) {
  const sourceInfo = source === 'auto'
    ? 'Detect the source language from the entire HTML fragment.'
    : `The source language is ${source}.`;
  return `${sourceInfo}\nYou will be given an HTML fragment. Translate ONLY human-visible text nodes into ${target}, while preserving the original HTML structure and all tags and attributes.\nStrict rules:\n- Do not add, remove, or reorder HTML tags.\n- Keep attributes (including classes and ids) unchanged.\n- Preserve inline formatting (e.g., <strong>, <em>, <code>, <a>, lists, headings, line breaks).\n- Keep URLs and code content unchanged unless they contain human language to translate.\n- Return ONLY the translated HTML fragment, no explanations, no code fences.\nHTML:\n${html}`;
}

async function translateHtmlWithGemini(html, source, target, modelId) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('Missing Gemini API key. Open Preferences to set it.');
  }

  const modelPath = `models/${modelId}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const prompt = buildPromptFromHtml(html, source, target);

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }]
      }
    ]
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini error: ${res.status} ${errText}`);
  }
  const data = await res.json();
  const first = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!first) throw new Error('No translation returned');
  return first.trim();
}

function sanitizeHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const allowedTags = new Set(['DIV','P','SPAN','BR','STRONG','B','EM','I','U','CODE','PRE','UL','OL','LI','H1','H2','H3','H4','H5','H6','A','BLOCKQUOTE']);
  const allowedAttrsForA = new Set(['href','title','rel','target']);

  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT, null);
  const toRemove = [];
  while (walker.nextNode()) {
    const el = walker.currentNode;
    if (!allowedTags.has(el.tagName)) {
      // unwrap disallowed element: move its children up
      const parent = el.parentNode;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      toRemove.push(el);
      continue;
    }
    // remove dangerous attributes
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) { el.removeAttribute(attr.name); continue; }
      if (el.tagName === 'A') {
        if (!allowedAttrsForA.has(attr.name)) el.removeAttribute(attr.name);
      } else {
        // drop all attributes except dir and lang for non-links
        if (name !== 'dir' && name !== 'lang') el.removeAttribute(attr.name);
      }
    }
    if (el.tagName === 'A') {
      const href = el.getAttribute('href') || '';
      // prevent javascript: URLs
      if (/^\s*javascript:/i.test(href)) el.removeAttribute('href');
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noreferrer noopener');
    }
  }
  for (const n of toRemove) n.parentNode.removeChild(n);
  return template.innerHTML;
}

// --- Exact-structure translation: replace only text nodes ---
function collectTextNodes(root) {
  const nodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
      // Skip pure whitespace
      if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      // Skip inside elements that should not be translated
      const parentTag = node.parentElement?.tagName || '';
      if (parentTag === 'CODE' || parentTag === 'PRE' || parentTag === 'SCRIPT' || parentTag === 'STYLE') {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  while (walker.nextNode()) nodes.push(walker.currentNode);
  return nodes;
}

function buildChunksPrompt(texts, source, target) {
  const sourceInfo = source === 'auto'
    ? 'Detect the source language from the entire set.'
    : `The source language is ${source}.`;
  const inputJson = JSON.stringify(texts);
  return `${sourceInfo}\nTranslate each array item into ${target}. Return ONLY a valid JSON array of strings (same length, same order).\nRules:\n- Translate only human language; keep numbers, URLs, code, and emojis unchanged.\n- Do not add or remove items.\n- Do not add quotes, backticks, or explanations.\nInput: ${inputJson}`;
}

async function translateTextChunksWithGemini(texts, source, target, modelId) {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('Missing Gemini API key. Open Preferences to set it.');
  const modelPath = `models/${modelId}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const prompt = buildChunksPrompt(texts, source, target);
  const body = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini error: ${res.status} ${errText}`);
  }
  const data = await res.json();
  const first = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!first) throw new Error('No translation returned');
  // Expecting a JSON array
  let arr;
  try {
    arr = JSON.parse(first);
  } catch (e) {
    // Attempt to extract JSON between brackets
    const m = first.match(/\[[\s\S]*\]/);
    if (!m) throw new Error('Unexpected response format');
    arr = JSON.parse(m[0]);
  }
  if (!Array.isArray(arr) || arr.length !== texts.length) throw new Error('Mismatched translation array length');
  return arr.map(s => (typeof s === 'string' ? s : String(s)));
}

// Basic, safe Markdown renderer (headings, bold/italic, lists, code, links)
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;');
}

function convertLists(text) {
  const lines = text.split('\n');
  const out = [];
  let inUl = false;
  let inOl = false;
  for (const line of lines) {
    const ul = line.match(/^\s*[-*+]\s+(.*)/);
    const ol = line.match(/^\s*(\d+)\.\s+(.*)/);
    if (ul) {
      if (!inUl) { out.push('<ul>'); inUl = true; }
      out.push(`<li>${ul[1]}</li>`);
      continue;
    }
    if (ol) {
      if (!inOl) { out.push('<ol>'); inOl = true; }
      out.push(`<li>${ol[2]}</li>`);
      continue;
    }
    if (inUl) { out.push('</ul>'); inUl = false; }
    if (inOl) { out.push('</ol>'); inOl = false; }
    out.push(line);
  }
  if (inUl) out.push('</ul>');
  if (inOl) out.push('</ol>');
  return out.join('\n');
}

function renderMarkdown(md) {
  let text = (md || '').replace(/\r\n?/g, '\n').trim();

  // Capture fenced code blocks first
  const codeBlocks = [];
  text = text.replace(/```([\s\S]*?)```/g, (_, code) => {
    const token = `@@CODEBLOCK_${codeBlocks.length}@@`;
    codeBlocks.push(`<pre><code>${escapeHtml(code)}</code></pre>`);
    return token;
  });

  // Capture inline code
  const inlineCodes = [];
  text = text.replace(/`([^`]+)`/g, (_, code) => {
    const token = `@@CODEINLINE_${inlineCodes.length}@@`;
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });

  // Escape remaining HTML
  text = escapeHtml(text);

  // Headings
  text = text.replace(/^######\s+(.*)$/gm, '<h6>$1</h6>')
             .replace(/^#####\s+(.*)$/gm, '<h5>$1</h5>')
             .replace(/^####\s+(.*)$/gm, '<h4>$1</h4>')
             .replace(/^###\s+(.*)$/gm, '<h3>$1</h3>')
             .replace(/^##\s+(.*)$/gm, '<h2>$1</h2>')
             .replace(/^#\s+(.*)$/gm, '<h1>$1</h1>');

  // Blockquotes
  text = text.replace(/^>\s?(.*)$/gm, '<blockquote>$1</blockquote>');

  // Lists
  text = convertLists(text);

  // Links
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>');

  // Bold and italic
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(^|\W)\*(.+?)\*(?=\W|$)/g, '$1<em>$2</em>');
  text = text.replace(/(^|\W)_(.+?)_(?=\W|$)/g, '$1<em>$2</em>');

  // Paragraphs: split on blank lines; keep block elements intact
  const blocks = text.split(/\n\n+/);
  text = blocks.map(b => {
    if (/^\s*<(h\d|ul|ol|pre|blockquote)/.test(b)) return b;
    return `<p>${b.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');

  // Restore code placeholders
  text = text.replace(/@@CODEINLINE_(\d+)@@/g, (_, i) => inlineCodes[Number(i)] || '');
  text = text.replace(/@@CODEBLOCK_(\d+)@@/g, (_, i) => codeBlocks[Number(i)] || '');

  return text;
}

async function getApiKey() {
  const { geminiApiKey } = await chrome.storage.sync.get({ geminiApiKey: '' });
  return geminiApiKey;
}

function buildPrompt(text, source, target) {
  const sourceInfo = source === 'auto'
    ? 'Detect the source language from the entire passage.'
    : `The source language is ${source}.`;
  return `You are a senior professional translator. ${sourceInfo} Translate the entire passage into ${target} with strict respect to context and discourse.
Requirements:
- Preserve meaning, intent, tone, and register; do not translate word-by-word.
- Use the full passage for context; resolve pronouns and references and keep terminology consistent.
- Prefer natural, idiomatic ${target}.
- Keep numbers, URLs, code snippets, emoji, and product names unchanged when appropriate.
- Preserve inline formatting, punctuation, line breaks, and paragraph structure.
- If the text includes lists or headings, keep their structure.
Output only the translated text, with no explanations or quotation marks.
Text:
${text}`;
}

async function translateWithGemini(text, source, target, modelId) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('Missing Gemini API key. Open Preferences to set it.');
  }

  const modelPath = `models/${modelId}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const prompt = buildPrompt(text, source, target);

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }]
      }
    ]
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini error: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const first = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!first) throw new Error('No translation returned');
  return first.trim();
}

translateBtn.addEventListener('click', async () => {
  const hasText = (inputEl?.innerText || '').trim();
  if (!hasText) return;
  const inputHtml = (inputEl?.innerHTML || '').trim();
  const htmlToTranslate = inputHtml || `<p>${hasText}</p>`;
  setStatus('Translating...');
  if (outputEl) outputEl.innerHTML = '';
  translateBtn.disabled = true;
  try {
    // Try exact-structure translation first
    const template = document.createElement('template');
    template.innerHTML = htmlToTranslate;
    const textNodes = collectTextNodes(template.content);
    const texts = textNodes.map(n => n.nodeValue);
    let outputHtml = '';
    if (texts.length > 0) {
      const translated = await translateTextChunksWithGemini(texts, sourceSelect.value, targetSelect.value, modelSelect.value);
      translated.forEach((t, i) => { textNodes[i].nodeValue = t; });
      outputHtml = sanitizeHtml(template.innerHTML);
      if (outputEl) outputEl.innerHTML = outputHtml;
    } else {
      // Fallback to HTML translation if no text nodes found
      const translatedHtml = await translateHtmlWithGemini(htmlToTranslate, sourceSelect.value, targetSelect.value, modelSelect.value);
      outputHtml = sanitizeHtml(translatedHtml);
      if (outputEl) outputEl.innerHTML = outputHtml;
    }
    // Save history (keep latest 10)
    await saveTranslationHistoryEntry({
      timestamp: Date.now(),
      sourceLang: sourceSelect.value,
      targetLang: targetSelect.value,
      model: modelSelect.value,
      inputHtml: htmlToTranslate,
      outputHtml
    });
    // Refresh history UI
    renderHistory();
    setStatus('');
  } catch (e) {
    setStatus(String(e.message || e));
  } finally {
    translateBtn.disabled = false;
  }
});

if (clearHistoryBtn) {
  clearHistoryBtn.addEventListener('click', async () => {
    await clearTranslationHistory();
    await renderHistory();
    setStatus('Cleared');
    setTimeout(() => setStatus(''), 800);
  });
}
if (refreshHistoryBtn) {
  refreshHistoryBtn.addEventListener('click', () => renderHistory());
}

async function loadExtensionState() {
  const { extensionEnabled } = await chrome.storage.sync.get({ extensionEnabled: true });
  if (extensionToggle) {
    extensionToggle.checked = extensionEnabled !== false;
  }
}

async function saveExtensionState(enabled) {
  await chrome.storage.sync.set({ extensionEnabled: enabled });
}

if (extensionToggle) {
  extensionToggle.addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    await saveExtensionState(enabled);
    setStatus(enabled ? 'Extension enabled' : 'Extension disabled');
    setTimeout(() => setStatus(''), 1200);
  });
}

loadPreferences();
loadExtensionState();
renderHistory();
