# AI Translate Side Panel (Chrome Extension)

A Chrome MV3 extension that provides a side panel translator UI powered by Google Gemini. Paste text, choose languages, and translate.

## Install (Developer Mode)

1. Get a Gemini API key from https://aistudio.google.com/app/apikey
2. Clone or download this folder to your machine.
3. Open Chrome → `chrome://extensions` → toggle `Developer mode`.
4. Click `Load unpacked` and select this project directory.
5. Click the extension toolbar icon to open the side panel.
6. Open `Preferences` and paste your API key. Optionally set default languages.

## Features

- Side Panel UI: input textarea, language selectors, swap, output textarea
- Uses Gemini `gemini-1.5-flash-latest` via REST API
- Options page persisted with `chrome.storage.sync`

## Privacy

Your API key is stored locally in Chrome sync storage. Requests are sent directly from the extension to Google APIs.
