'use strict';

const sourceSelect = document.getElementById('sourceLang');
const targetSelect = document.getElementById('targetLang');
const inputText = document.getElementById('inputText');
const outputEl = document.getElementById('outputHtml');
const translateBtn = document.getElementById('translateBtn');
const swapBtn = document.getElementById('swapLangBtn');
const statusEl = document.getElementById('status');
const modelSelect = document.getElementById('modelSelect');

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
  const text = inputText.value.trim();
  if (!text) return;
  setStatus('Translating...');
  if (outputEl) outputEl.innerHTML = '';
  translateBtn.disabled = true;
  try {
    const translation = await translateWithGemini(text, sourceSelect.value, targetSelect.value, modelSelect.value);
    if (outputEl) outputEl.innerHTML = renderMarkdown(translation);
    setStatus('');
  } catch (e) {
    setStatus(String(e.message || e));
  } finally {
    translateBtn.disabled = false;
  }
});

loadPreferences();
