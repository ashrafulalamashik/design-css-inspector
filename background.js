// background.js — Service Worker (Manifest V3)
// Handles extension lifecycle, side panel opening, and message routing.

'use strict';

// ─── Side Panel Setup ────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// ─── Tab Tracking ─────────────────────────────────────────────────────────────

let activeInspectorTab = null;

chrome.tabs.onActivated.addListener(({ tabId }) => {
  notifySidePanel({ type: 'TAB_CHANGED', tabId });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    notifySidePanel({ type: 'TAB_UPDATED', tabId, url: tab.url });
  }
});

// ─── Message Hub ──────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type } = message;

  // Content script → Background → Side Panel relay
  if (type === 'ELEMENT_INSPECTED') {
    notifySidePanel(message);
    sendResponse({ ok: true });
    return true;
  }

  // Side Panel → Background: inject content script & start inspector
  if (type === 'START_INSPECTOR') {
    handleStartInspector(message.tabId, sendResponse);
    return true; // async
  }

  // Side Panel → Background: stop inspector
  if (type === 'STOP_INSPECTOR') {
    handleStopInspector(message.tabId, sendResponse);
    return true;
  }

  // Side Panel → Background: run full-page scan
  if (type === 'RUN_SCAN') {
    handleRunScan(message.tabId, message.scanType, sendResponse);
    return true;
  }

  // Side Panel → Background: get current tab id
  if (type === 'GET_ACTIVE_TAB') {
    getCurrentTab().then(tab => {
      sendResponse({ tabId: tab?.id, url: tab?.url });
    });
    return true;
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

async function ensureContentScript(tabId) {
  try {
    // Ping to check if already injected
    await chrome.tabs.sendMessage(tabId, { type: 'PING' });
  } catch {
    // Not injected yet — inject now
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
    // Small delay for script to initialize
    await new Promise(r => setTimeout(r, 150));
  }
}

async function handleStartInspector(tabId, sendResponse) {
  try {
    await ensureContentScript(tabId);
    const response = await chrome.tabs.sendMessage(tabId, { type: 'START_INSPECTOR' });
    activeInspectorTab = tabId;
    sendResponse({ ok: true, ...response });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

async function handleStopInspector(tabId, sendResponse) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'STOP_INSPECTOR' });
    activeInspectorTab = null;
    sendResponse({ ok: true });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

async function handleRunScan(tabId, scanType, sendResponse) {
  try {
    await ensureContentScript(tabId);
    const response = await chrome.tabs.sendMessage(tabId, { type: 'RUN_SCAN', scanType });
    sendResponse({ ok: true, data: response });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

// Broadcast a message to all side panel contexts
function notifySidePanel(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // Side panel may not be open — silently ignore
  });
}
