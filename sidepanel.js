// sidepanel.js — Side Panel UI Controller
// Handles all UI interactions, message receiving, and rendering.

'use strict';

// ─── State ────────────────────────────────────────────────────────────────────

let inspectorActive = false;
let currentTabId = null;
let lastScanData = {};
let exportData = {};

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  initAccordions();
  initInspectorToggle();
  initScanButtons();
  initExportButton();
  initCopyHandler();
  await loadActiveTab();
});

// ─── Active Tab ───────────────────────────────────────────────────────────────

async function loadActiveTab() {
  const resp = await sendToBackground({ type: 'GET_ACTIVE_TAB' });
  if (resp && resp.tabId) {
    currentTabId = resp.tabId;
  }
}

// ─── Message Listener (from background/content) ───────────────────────────────

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'ELEMENT_INSPECTED') {
    renderElementData(message.data);
    switchTab('element');
    exportData.element = message.data;
  }
  if (message.type === 'TAB_CHANGED' || message.type === 'TAB_UPDATED') {
    currentTabId = message.tabId;
    if (inspectorActive) {
      setInspectorState(false);
    }
  }
});

// ─── Tab System ───────────────────────────────────────────────────────────────

function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === `tab-${tabName}`));
}

// ─── Accordions ───────────────────────────────────────────────────────────────

function initAccordions() {
  document.addEventListener('click', (e) => {
    const header = e.target.closest('.section-header');
    if (!header) return;
    const bodyId = 'acc-' + header.dataset.accordion;
    const body = document.getElementById(bodyId);
    if (!body) return;
    const isOpen = body.classList.contains('open');
    header.classList.toggle('open', !isOpen);
    body.classList.toggle('open', !isOpen);
  });

  // Open first accordions by default
  document.querySelectorAll('.section-header').forEach((header, i) => {
    if (i < 3) {
      const bodyId = 'acc-' + header.dataset.accordion;
      const body = document.getElementById(bodyId);
      if (body) {
        header.classList.add('open');
        body.classList.add('open');
      }
    }
  });
}

// ─── Inspector Toggle ─────────────────────────────────────────────────────────

function initInspectorToggle() {
  const btn = document.getElementById('btn-toggle-inspector');
  btn.addEventListener('click', async () => {
    if (!currentTabId) {
      await loadActiveTab();
    }
    if (inspectorActive) {
      await sendToBackground({ type: 'STOP_INSPECTOR', tabId: currentTabId });
      setInspectorState(false);
    } else {
      const resp = await sendToBackground({ type: 'START_INSPECTOR', tabId: currentTabId });
      if (resp && resp.ok) {
        setInspectorState(true);
      } else {
        showNotification('Cannot inject inspector on this page.', 'error');
      }
    }
  });
}

function setInspectorState(active) {
  inspectorActive = active;
  const btn = document.getElementById('btn-toggle-inspector');
  const dot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');

  btn.classList.toggle('active', active);
  dot.classList.toggle('active', active);
  btn.textContent = '';

  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '1.5');
  icon.classList.add('icon-crosshair');
  icon.innerHTML = '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>';
  btn.appendChild(icon);
  btn.appendChild(document.createTextNode(active ? 'Stop Inspector' : 'Enable Inspector'));

  statusText.textContent = active ? 'Inspecting...' : 'Inspector Off';
}

// ─── Scan Buttons ─────────────────────────────────────────────────────────────

function initScanButtons() {
  document.querySelectorAll('.btn-scan').forEach(btn => {
    btn.addEventListener('click', async () => {
      const scanType = btn.dataset.scan;
      if (!currentTabId) await loadActiveTab();

      // Loading state
      const origText = btn.textContent;
      btn.innerHTML = '<span class="spinner"></span>Scanning...';
      btn.disabled = true;

      try {
        const resp = await sendToBackground({ type: 'RUN_SCAN', tabId: currentTabId, scanType });
        if (resp && resp.ok && resp.data) {
          renderScanData(scanType, resp.data);
          exportData[scanType] = resp.data;
        } else {
          showNotification('Scan failed. Reload the page and try again.', 'error');
        }
      } finally {
        btn.textContent = origText;
        btn.disabled = false;
      }
    });
  });
}

// ─── Export Button ─────────────────────────────────────────────────────────────

function initExportButton() {
  document.getElementById('btn-export').addEventListener('click', () => {
    if (Object.keys(exportData).length === 0) {
      showNotification('No data to export yet. Inspect elements or run scans first.', 'warn');
      return;
    }
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'design-inspection-' + Date.now() + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showNotification('Exported!');
  });
}

// ─── Copy Handler ─────────────────────────────────────────────────────────────

function initCopyHandler() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('.copyable');
    if (!el) return;
    const text = el.dataset.copy || el.textContent.trim();
    if (!text || text === '—') return;
    navigator.clipboard.writeText(text).then(() => showNotification('Copied!'));
  });
}

// ─── Notification ─────────────────────────────────────────────────────────────

function showNotification(text, type = 'success') {
  const tooltip = document.getElementById('copy-tooltip');
  tooltip.textContent = text;
  tooltip.style.background = type === 'error' ? 'var(--danger)' : type === 'warn' ? 'var(--warning)' : 'var(--accent)';
  tooltip.classList.add('show');
  setTimeout(() => tooltip.classList.remove('show'), 2000);
}

// ─── Background Messaging ─────────────────────────────────────────────────────

function sendToBackground(message) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
      } else {
        resolve(response);
      }
    });
  });
}

// ─── RENDER: Element Data ─────────────────────────────────────────────────────

function renderElementData(data) {
  // Show data, hide empty state
  document.getElementById('empty-element').style.display = 'none';
  const container = document.getElementById('element-data');
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '8px';

  // Tag, ID, Classes
  const tagBadge = document.getElementById('el-tag');
  tagBadge.textContent = `<${data.tag}>`;

  const elId = document.getElementById('el-id');
  elId.textContent = data.id ? `#${data.id}` : '';
  elId.style.display = data.id ? '' : 'none';

  const classesContainer = document.getElementById('el-classes');
  classesContainer.innerHTML = '';
  (data.classes || []).slice(0, 8).forEach(cls => {
    const chip = document.createElement('span');
    chip.className = 'class-chip';
    chip.textContent = `.${cls}`;
    classesContainer.appendChild(chip);
  });

  // Dimensions
  setTextCopy('el-width',  data.dimensions?.width  != null ? `${data.dimensions.width}px` : '—');
  setTextCopy('el-height', data.dimensions?.height != null ? `${data.dimensions.height}px` : '—');
  setTextCopy('el-x',      data.dimensions?.left   != null ? `${data.dimensions.left}px` : '—');
  setTextCopy('el-y',      data.dimensions?.top    != null ? `${data.dimensions.top}px` : '—');

  // Typography
  renderPropList('el-typography-props', [
    ['font-family',    data.typography?.fontFamily],
    ['font-size',      data.typography?.fontSize],
    ['font-weight',    data.typography?.fontWeight],
    ['line-height',    data.typography?.lineHeight],
    ['letter-spacing', data.typography?.letterSpacing],
    ['text-align',     data.typography?.textAlign],
    ['text-transform', data.typography?.textTransform]
  ]);

  // Colors
  const colorRows = [
    ['color',       data.colors?.color, true],
    ['background',  data.colors?.backgroundColor, true],
    ['border',      data.colors?.borderColor, true],
  ];
  const colorContainer = document.getElementById('el-color-props');
  colorContainer.innerHTML = '';
  colorRows.forEach(([key, val, isSwatch]) => {
    if (!val || val === 'rgba(0, 0, 0, 0)') return;
    const row = document.createElement('div');
    row.className = 'prop-row';
    row.innerHTML = `
      <span class="prop-key">${key}</span>
      <span class="prop-val copyable" data-copy="${val}">
        <span class="color-dot" style="background:${val}"></span>${val}
      </span>`;
    colorContainer.appendChild(row);
  });

  // Spacing
  renderPropList('el-spacing-props', [
    ['margin',        data.spacing?.margin],
    ['padding',       data.spacing?.padding],
    ['border',        data.spacing?.border],
    ['border-radius', data.spacing?.borderRadius],
    ['display',       data.advanced?.display],
    ['position',      data.advanced?.position]
  ]);

  // Advanced
  const advRows = [
    ['z-index',    data.advanced?.zIndex],
    ['opacity',    data.advanced?.opacity],
    ['transform',  data.advanced?.transform],
    ['box-shadow', data.advanced?.boxShadow],
    ['text-shadow',data.advanced?.textShadow],
  ];

  // Flex/Grid
  const fg = data.advanced?.flexGrid || {};
  Object.entries(fg).forEach(([k, v]) => advRows.push([k, v]));

  const advContainer = document.getElementById('el-advanced-props');
  advContainer.innerHTML = '';

  // Gradient preview
  if (data.advanced?.gradient) {
    const g = data.advanced.gradient;
    const preview = document.createElement('div');
    preview.className = 'gradient-preview';
    preview.style.background = g.raw;
    advContainer.appendChild(preview);

    const row = document.createElement('div');
    row.className = 'prop-row';
    row.innerHTML = `<span class="prop-key">gradient</span>
      <span class="prop-val copyable" data-copy="${escapeHtml(g.raw)}">${g.type}-gradient (${g.stops.length} stops)</span>`;
    advContainer.appendChild(row);
  }

  advRows.forEach(([key, val]) => {
    if (!val || val === 'none' || val === 'auto' || val === '0px' || val === 'normal') return;
    const row = document.createElement('div');
    row.className = 'prop-row';
    row.innerHTML = `<span class="prop-key">${key}</span>
      <span class="prop-val copyable" data-copy="${escapeHtml(val)}">${escapeHtml(val)}</span>`;
    advContainer.appendChild(row);
  });
  if (!advContainer.children.length) {
    advContainer.innerHTML = '<span class="no-data">No advanced properties detected.</span>';
  }

  // Accessibility
  const a11y = data.accessibility || {};
  const a11yContainer = document.getElementById('el-a11y-props');
  a11yContainer.innerHTML = '';

  const a11yRows = [
    ['role',       a11y.role],
    ['aria-label', a11y.ariaLabel],
    ['alt',        a11y.altText],
    ['tab-index',  a11y.tabIndex != null ? String(a11y.tabIndex) : null]
  ];

  a11yRows.forEach(([key, val]) => {
    if (val == null) return;
    const row = document.createElement('div');
    row.className = 'prop-row';
    row.innerHTML = `<span class="prop-key">${key}</span>
      <span class="prop-val copyable" data-copy="${escapeHtml(String(val))}">${escapeHtml(String(val))}</span>`;
    a11yContainer.appendChild(row);
  });

  // Contrast ratio
  if (a11y.contrastRatio) {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const aaPass = a11y.wcagAA === 'Pass';
    const aaaPass = a11y.wcagAAA === 'Pass';
    row.innerHTML = `
      <span class="prop-key">contrast</span>
      <span class="prop-val">${a11y.contrastRatio}:1
        <span class="contrast-badge ${aaPass ? 'pass' : 'fail'}" style="margin-left:6px">AA ${a11y.wcagAA}</span>
        <span class="contrast-badge ${aaaPass ? 'pass' : 'fail'}" style="margin-left:4px">AAA ${a11y.wcagAAA}</span>
      </span>`;
    a11yContainer.appendChild(row);
  }

  if (!a11yContainer.children.length) {
    a11yContainer.innerHTML = '<span class="no-data">No accessibility attributes found.</span>';
  }
}

function setTextCopy(id, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.dataset.copy = text;
  el.classList.toggle('null-val', text === '—');
}

function renderPropList(containerId, rows) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  rows.forEach(([key, val]) => {
    if (!val || val === 'none' || val === 'normal' || val === 'auto') return;
    const row = document.createElement('div');
    row.className = 'prop-row';
    row.innerHTML = `<span class="prop-key">${key}</span>
      <span class="prop-val copyable" data-copy="${escapeHtml(val)}">${escapeHtml(val)}</span>`;
    container.appendChild(row);
  });
  if (!container.children.length) {
    container.innerHTML = '<span class="no-data">No values to display.</span>';
  }
}

// ─── RENDER: Scan Data ────────────────────────────────────────────────────────

function renderScanData(type, data) {
  switch (type) {
    case 'typography': return renderTypographyScan(data);
    case 'colors':     return renderColorsScan(data);
    case 'assets':     return renderAssetsScan(data);
    case 'accessibility': return renderA11yScan(data);
  }
}

// ── Typography ────────────────────────────────────────────────────────────────

function renderTypographyScan(data) {
  document.getElementById('empty-typography').style.display = 'none';
  document.getElementById('typography-data').style.display = 'block';

  // Font Families
  const familiesList = document.getElementById('type-families-list');
  familiesList.innerHTML = '';
  (data.fontFamilies || []).slice(0, 20).forEach(({ family, count }) => {
    const chip = document.createElement('span');
    chip.className = 'chip copyable';
    chip.dataset.copy = family;
    chip.innerHTML = `${escapeHtml(family.split(',')[0].trim())} <span class="chip-count">×${count}</span>`;
    familiesList.appendChild(chip);
  });
  if (!data.fontFamilies?.length) familiesList.innerHTML = '<span class="no-data">None found.</span>';

  // Font Sizes
  const sizesList = document.getElementById('type-sizes-list');
  sizesList.innerHTML = '';
  (data.fontSizes || []).forEach(size => {
    const chip = document.createElement('span');
    chip.className = 'chip copyable';
    chip.dataset.copy = size;
    chip.textContent = size;
    sizesList.appendChild(chip);
  });
  if (!data.fontSizes?.length) sizesList.innerHTML = '<span class="no-data">None found.</span>';

  // Font Weights
  const weightsList = document.getElementById('type-weights-list');
  weightsList.innerHTML = '';
  (data.fontWeights || []).forEach(w => {
    const chip = document.createElement('span');
    chip.className = 'chip copyable';
    chip.dataset.copy = w;
    chip.textContent = w;
    weightsList.appendChild(chip);
  });
  if (!data.fontWeights?.length) weightsList.innerHTML = '<span class="no-data">None found.</span>';
}

// ── Colors ────────────────────────────────────────────────────────────────────

function renderColorsScan(data) {
  document.getElementById('empty-colors').style.display = 'none';
  document.getElementById('colors-data').style.display = 'block';

  renderSwatchList('colors-text-list',   data.text   || []);
  renderSwatchList('colors-bg-list',     data.background || []);
  renderSwatchList('colors-border-list', data.border || []);
}

function renderSwatchList(containerId, colors) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  if (!colors.length) {
    container.innerHTML = '<span class="no-data">None found.</span>';
    return;
  }
  colors.slice(0, 30).forEach(({ color, count, hex }) => {
    const row = document.createElement('div');
    row.className = 'color-swatch-row copyable';
    row.dataset.copy = hex || color;
    row.innerHTML = `
      <div class="swatch" style="background:${color}"></div>
      <div class="swatch-info">
        <span class="swatch-hex">${hex || color}</span>
        <span class="swatch-rgb">${color}</span>
      </div>
      <span class="swatch-count">×${count}</span>`;
    container.appendChild(row);
  });
}

// ── Assets ────────────────────────────────────────────────────────────────────

function renderAssetsScan(data) {
  document.getElementById('empty-assets').style.display = 'none';
  document.getElementById('assets-data').style.display = 'block';

  const images = data.images || [];
  const svgs   = data.svgs   || [];
  const bgImgs = data.bgImages || [];

  document.getElementById('assets-images-label').textContent = `Images (${images.length})`;
  document.getElementById('assets-svgs-label').textContent   = `Inline SVGs (${svgs.length})`;
  document.getElementById('assets-bg-label').textContent     = `Background Images (${bgImgs.length})`;

  // Images
  const imgList = document.getElementById('assets-images-list');
  imgList.innerHTML = '';
  images.slice(0, 30).forEach(img => {
    const item = document.createElement('div');
    item.className = 'asset-item copyable';
    item.dataset.copy = img.src;
    item.innerHTML = `
      <img class="asset-thumb" src="${escapeHtml(img.src)}" alt="" loading="lazy" onerror="this.style.display='none'">
      <div class="asset-info">
        <div class="asset-src">${escapeHtml(img.src.split('/').pop() || img.src)}</div>
        <div class="asset-meta">${img.width}×${img.height}${img.loading ? ` · ${img.loading}` : ''}</div>
      </div>`;
    imgList.appendChild(item);
  });
  if (!images.length) imgList.innerHTML = '<span class="no-data">No images found.</span>';

  // SVGs
  const svgList = document.getElementById('assets-svgs-list');
  svgList.innerHTML = '';
  svgs.slice(0, 20).forEach((svg, i) => {
    const item = document.createElement('div');
    item.className = 'asset-item';
    item.innerHTML = `
      <div class="asset-svg-preview">SVG</div>
      <div class="asset-info">
        <div class="asset-src">Inline SVG #${i + 1}</div>
        <div class="asset-meta">${svg.viewBox || 'no viewBox'}${svg.width ? ` · ${svg.width}×${svg.height}` : ''}</div>
      </div>`;
    svgList.appendChild(item);
  });
  if (!svgs.length) svgList.innerHTML = '<span class="no-data">No inline SVGs found.</span>';

  // BG Images
  const bgList = document.getElementById('assets-bg-list');
  bgList.innerHTML = '';
  bgImgs.slice(0, 20).forEach(bg => {
    const item = document.createElement('div');
    item.className = 'asset-item copyable';
    item.dataset.copy = bg.url;
    item.innerHTML = `
      <div class="asset-svg-preview" style="font-size:7px">BG</div>
      <div class="asset-info">
        <div class="asset-src">${escapeHtml(bg.url.split('/').pop() || bg.url)}</div>
        <div class="asset-meta">on &lt;${bg.element}&gt;</div>
      </div>`;
    bgList.appendChild(item);
  });
  if (!bgImgs.length) bgList.innerHTML = '<span class="no-data">No background images found.</span>';
}

// ── Accessibility ─────────────────────────────────────────────────────────────

function renderA11yScan(data) {
  document.getElementById('empty-a11y').style.display = 'none';
  document.getElementById('a11y-data').style.display = 'block';

  const summary = data.summary || {};
  const issues  = data.issues  || [];

  const summaryEl = document.getElementById('a11y-summary');
  summaryEl.innerHTML = `
    <div class="a11y-stat ${summary.errors > 0 ? 'error' : 'good'}">
      <span class="a11y-stat-num">${summary.errors || 0}</span>
      <span class="a11y-stat-label">Errors</span>
    </div>
    <div class="a11y-stat ${summary.warnings > 0 ? 'warn' : 'good'}">
      <span class="a11y-stat-num">${summary.warnings || 0}</span>
      <span class="a11y-stat-label">Warnings</span>
    </div>
    <div class="a11y-stat ${summary.contrastFails > 0 ? 'warn' : 'good'}">
      <span class="a11y-stat-num">${summary.contrastFails || 0}</span>
      <span class="a11y-stat-label">Contrast Fails</span>
    </div>
    <div class="a11y-stat good">
      <span class="a11y-stat-num">${summary.totalTextElements || 0}</span>
      <span class="a11y-stat-label">Checked</span>
    </div>`;

  const issuesList = document.getElementById('a11y-issues-list');
  issuesList.innerHTML = '';

  if (!issues.length) {
    issuesList.innerHTML = '<div class="empty-state" style="padding:20px"><p class="empty-title" style="color:var(--success)">✓ No issues found!</p></div>';
    return;
  }

  const issueLabels = {
    'missing-alt':   'Image missing alt text',
    'empty-button':  'Button has no accessible name',
    'missing-href':  'Anchor missing href',
    'empty-link':    'Link has no text content',
    'missing-label': 'Form input missing label',
    'heading-skip':  'Heading level skipped'
  };

  issues.forEach(issue => {
    const item = document.createElement('div');
    item.className = 'issue-item';
    item.innerHTML = `
      <span class="issue-badge ${issue.severity}">${issue.severity}</span>
      <div class="issue-body">
        <div class="issue-type">${issueLabels[issue.type] || issue.type}</div>
        <div class="issue-el">${escapeHtml(issue.element || '')}</div>
      </div>`;
    issuesList.appendChild(item);
  });
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
