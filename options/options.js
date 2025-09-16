'use strict';

const sourceSelect = document.getElementById('sourceLang');
const targetSelect = document.getElementById('targetLang');
const apiKeyInput = document.getElementById('apiKey');
const saveBtn = document.getElementById('saveBtn');
const statusEl = document.getElementById('status');

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

function populate(select, defaultCode) {
  select.innerHTML = '';
  for (const lang of LANGS) {
    const opt = document.createElement('option');
    opt.value = lang.code;
    opt.textContent = lang.name;
    if (lang.code === defaultCode) opt.selected = true;
    select.appendChild(opt);
  }
}

async function load() {
  const { geminiApiKey, sourceLang, targetLang } = await chrome.storage.sync.get({
    geminiApiKey: '',
    sourceLang: 'auto',
    targetLang: 'vi'
  });
  apiKeyInput.value = geminiApiKey;
  populate(sourceSelect, sourceLang);
  populate(targetSelect, targetLang);
}

saveBtn.addEventListener('click', async () => {
  const payload = {
    geminiApiKey: apiKeyInput.value.trim(),
    sourceLang: sourceSelect.value,
    targetLang: targetSelect.value
  };
  await chrome.storage.sync.set(payload);
  statusEl.textContent = 'Saved';
  setTimeout(() => (statusEl.textContent = ''), 1200);
});

load();
