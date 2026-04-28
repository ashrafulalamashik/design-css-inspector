// content.js — DOM Inspector Engine
// Injected into the active tab. Handles hover highlighting, click inspection,
// and full-page scan modules.

'use strict';

// ─── State ────────────────────────────────────────────────────────────────────

let inspectorActive = false;
let highlightOverlay = null;
let lastHovered = null;

// ─── Message Listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type } = message;

  if (type === 'PING') {
    sendResponse({ pong: true });
    return;
  }

  if (type === 'START_INSPECTOR') {
    startInspector();
    sendResponse({ started: true });
    return;
  }

  if (type === 'STOP_INSPECTOR') {
    stopInspector();
    sendResponse({ stopped: true });
    return;
  }

  if (type === 'RUN_SCAN') {
    const result = runFullScan(message.scanType);
    sendResponse(result);
    return;
  }
});

// ─── Inspector: Hover & Click ─────────────────────────────────────────────────

function startInspector() {
  if (inspectorActive) return;
  inspectorActive = true;
  createOverlay();
  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('mouseout', onMouseOut, true);
  document.addEventListener('click', onClick, true);
  document.body.style.cursor = 'crosshair';
}

function stopInspector() {
  if (!inspectorActive) return;
  inspectorActive = false;
  removeOverlay();
  document.removeEventListener('mouseover', onMouseOver, true);
  document.removeEventListener('mouseout', onMouseOut, true);
  document.removeEventListener('click', onClick, true);
  document.body.style.cursor = '';
}

function createOverlay() {
  if (highlightOverlay) return;
  highlightOverlay = document.createElement('div');
  highlightOverlay.id = '__design_inspector_overlay__';
  Object.assign(highlightOverlay.style, {
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: '2147483647',
    border: '2px solid #4D9EFF',
    backgroundColor: 'rgba(77, 158, 255, 0.08)',
    borderRadius: '2px',
    boxSizing: 'border-box',
    transition: 'all 0.08s ease',
    display: 'none'
  });
  document.documentElement.appendChild(highlightOverlay);
}

function removeOverlay() {
  if (highlightOverlay) {
    highlightOverlay.remove();
    highlightOverlay = null;
  }
  lastHovered = null;
}

function onMouseOver(e) {
  if (!inspectorActive || !highlightOverlay) return;
  if (e.target === highlightOverlay || e.target === document.documentElement) return;
  lastHovered = e.target;
  const rect = e.target.getBoundingClientRect();
  Object.assign(highlightOverlay.style, {
    display: 'block',
    top: rect.top + 'px',
    left: rect.left + 'px',
    width: rect.width + 'px',
    height: rect.height + 'px'
  });
}

function onMouseOut(e) {
  if (!inspectorActive || !highlightOverlay) return;
  if (!e.relatedTarget || e.relatedTarget === document.documentElement) {
    highlightOverlay.style.display = 'none';
  }
}

function onClick(e) {
  if (!inspectorActive) return;
  e.preventDefault();
  e.stopPropagation();
  const el = e.target;
  if (el === highlightOverlay) return;
  const data = extractElementData(el);
  chrome.runtime.sendMessage({ type: 'ELEMENT_INSPECTED', data });
}

// ─── Element Data Extraction ──────────────────────────────────────────────────

function extractElementData(el) {
  const cs = window.getComputedStyle(el);
  const rect = el.getBoundingClientRect();

  return {
    tag: el.tagName.toLowerCase(),
    id: el.id || null,
    classes: Array.from(el.classList),
    dimensions: {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      top: Math.round(rect.top),
      left: Math.round(rect.left)
    },
    typography: extractTypography(cs),
    colors: extractColors(cs),
    spacing: extractSpacing(cs),
    advanced: extractAdvanced(cs, el),
    accessibility: extractAccessibility(el, cs)
  };
}

function extractTypography(cs) {
  return {
    fontFamily: cs.fontFamily,
    fontSize: cs.fontSize,
    fontWeight: cs.fontWeight,
    lineHeight: cs.lineHeight,
    letterSpacing: cs.letterSpacing,
    textAlign: cs.textAlign,
    textTransform: cs.textTransform,
    textDecoration: cs.textDecoration
  };
}

function extractColors(cs) {
  return {
    color: cs.color,
    backgroundColor: cs.backgroundColor,
    borderColor: cs.borderColor,
    outlineColor: cs.outlineColor
  };
}

function extractSpacing(cs) {
  return {
    margin: `${cs.marginTop} ${cs.marginRight} ${cs.marginBottom} ${cs.marginLeft}`,
    padding: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
    border: cs.border,
    borderRadius: cs.borderRadius
  };
}

function extractAdvanced(cs, el) {
  const result = {
    display: cs.display,
    position: cs.position,
    zIndex: cs.zIndex,
    opacity: cs.opacity,
    overflow: cs.overflow,
    transform: cs.transform !== 'none' ? cs.transform : null,
    boxShadow: cs.boxShadow !== 'none' ? cs.boxShadow : null,
    textShadow: cs.textShadow !== 'none' ? cs.textShadow : null,
    backgroundImage: null,
    gradient: null,
    flexGrid: {}
  };

  // Background image / gradient
  const bg = cs.backgroundImage;
  if (bg && bg !== 'none') {
    if (bg.includes('gradient')) {
      result.gradient = parseGradient(bg);
    } else {
      result.backgroundImage = bg;
    }
  }

  // Flex / Grid
  if (cs.display === 'flex' || cs.display === 'inline-flex') {
    result.flexGrid = {
      flexDirection: cs.flexDirection,
      flexWrap: cs.flexWrap,
      justifyContent: cs.justifyContent,
      alignItems: cs.alignItems,
      gap: cs.gap
    };
  } else if (cs.display === 'grid' || cs.display === 'inline-grid') {
    result.flexGrid = {
      gridTemplateColumns: cs.gridTemplateColumns,
      gridTemplateRows: cs.gridTemplateRows,
      gap: cs.gap
    };
  }

  return result;
}

function parseGradient(bgImage) {
  const typeMatch = bgImage.match(/^(linear|radial|conic)-gradient/);
  const type = typeMatch ? typeMatch[1] : 'unknown';
  // Extract color stops naively
  const stops = [];
  const colorRe = /(rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}|[a-z]+)\s*([\d.]+%|[\d.]+(?:px|em|rem))?/g;
  let m;
  while ((m = colorRe.exec(bgImage)) !== null) {
    stops.push({ color: m[1], stop: m[2] || null });
  }
  return { type, raw: bgImage, stops };
}

function extractAccessibility(el, cs) {
  const role = el.getAttribute('role') || inferRole(el);
  const ariaLabel = el.getAttribute('aria-label') || null;
  const altText = el.getAttribute('alt') || null;
  const tabIndex = el.tabIndex;

  // WCAG contrast
  const fgColor = cs.color;
  const bgColor = getEffectiveBackground(el);
  const contrast = bgColor ? calculateContrastRatio(fgColor, bgColor) : null;

  let wcagAA = null, wcagAAA = null;
  if (contrast !== null) {
    const fontSize = parseFloat(cs.fontSize);
    const isBold = parseInt(cs.fontWeight) >= 700;
    const isLarge = fontSize >= 18 || (isBold && fontSize >= 14);
    wcagAA = contrast >= (isLarge ? 3 : 4.5) ? 'Pass' : 'Fail';
    wcagAAA = contrast >= (isLarge ? 4.5 : 7) ? 'Pass' : 'Fail';
  }

  return {
    role,
    ariaLabel,
    altText,
    tabIndex,
    contrastRatio: contrast ? contrast.toFixed(2) : null,
    wcagAA,
    wcagAAA
  };
}

function inferRole(el) {
  const map = {
    a: 'link', button: 'button', input: 'textbox', select: 'listbox',
    textarea: 'textbox', img: 'img', nav: 'navigation', header: 'banner',
    footer: 'contentinfo', main: 'main', aside: 'complementary',
    section: 'region', article: 'article', h1: 'heading', h2: 'heading',
    h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading',
    ul: 'list', ol: 'list', li: 'listitem', table: 'table'
  };
  return map[el.tagName.toLowerCase()] || null;
}

function getEffectiveBackground(el) {
  let node = el;
  while (node && node !== document.documentElement) {
    const cs = window.getComputedStyle(node);
    const bg = cs.backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
      return bg;
    }
    node = node.parentElement;
  }
  return 'rgb(255, 255, 255)'; // Assume white body
}

// ─── WCAG Contrast ────────────────────────────────────────────────────────────

function parseColor(colorStr) {
  const m = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return null;
  return { r: parseInt(m[1]), g: parseInt(m[2]), b: parseInt(m[3]) };
}

function relativeLuminance({ r, g, b }) {
  const srgb = [r, g, b].map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function calculateContrastRatio(fg, bg) {
  const fgC = parseColor(fg);
  const bgC = parseColor(bg);
  if (!fgC || !bgC) return null;
  const L1 = relativeLuminance(fgC);
  const L2 = relativeLuminance(bgC);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ─── Full-Page Scan Modules ───────────────────────────────────────────────────

function runFullScan(scanType) {
  switch (scanType) {
    case 'typography': return scanTypography();
    case 'colors': return scanColors();
    case 'assets': return scanAssets();
    case 'accessibility': return scanAccessibility();
    case 'all': return {
      typography: scanTypography(),
      colors: scanColors(),
      assets: scanAssets(),
      accessibility: scanAccessibility()
    };
    default: return { error: 'Unknown scan type' };
  }
}

// ── Typography Scanner ────────────────────────────────────────────────────────

function scanTypography() {
  const elements = document.querySelectorAll('*');
  const fontFamilies = new Map();
  const fontSizes = new Set();
  const fontWeights = new Set();
  const lineHeights = new Set();

  elements.forEach(el => {
    if (el.closest('#__design_inspector_overlay__')) return;
    const cs = window.getComputedStyle(el);
    const ff = cs.fontFamily;
    const fs = cs.fontSize;
    const fw = cs.fontWeight;
    const lh = cs.lineHeight;

    if (ff) fontFamilies.set(ff, (fontFamilies.get(ff) || 0) + 1);
    if (fs && fs !== '0px') fontSizes.add(fs);
    if (fw) fontWeights.add(fw);
    if (lh && lh !== 'normal') lineHeights.add(lh);
  });

  return {
    fontFamilies: Array.from(fontFamilies.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([family, count]) => ({ family, count })),
    fontSizes: Array.from(fontSizes).sort((a, b) => parseFloat(a) - parseFloat(b)),
    fontWeights: Array.from(fontWeights).sort(),
    lineHeights: Array.from(lineHeights).sort()
  };
}

// ── Color Scanner ─────────────────────────────────────────────────────────────

function scanColors() {
  const elements = document.querySelectorAll('*');
  const textColors = new Map();
  const bgColors = new Map();
  const borderColors = new Map();

  elements.forEach(el => {
    if (el.closest('#__design_inspector_overlay__')) return;
    const cs = window.getComputedStyle(el);

    const textColor = cs.color;
    if (textColor && !isTransparent(textColor)) {
      textColors.set(textColor, (textColors.get(textColor) || 0) + 1);
    }

    const bg = cs.backgroundColor;
    if (bg && !isTransparent(bg)) {
      bgColors.set(bg, (bgColors.get(bg) || 0) + 1);
    }

    const border = cs.borderColor;
    const borderWidth = cs.borderWidth;
    if (border && !isTransparent(border) && borderWidth && borderWidth !== '0px') {
      borderColors.set(border, (borderColors.get(border) || 0) + 1);
    }
  });

  return {
    text: sortColorMap(textColors),
    background: sortColorMap(bgColors),
    border: sortColorMap(borderColors)
  };
}

function isTransparent(color) {
  return color === 'transparent' ||
    color === 'rgba(0, 0, 0, 0)' ||
    color.includes('rgba') && color.match(/,\s*0\)$/);
}

function sortColorMap(map) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([color, count]) => ({ color, count, hex: rgbToHex(color) }));
}

function rgbToHex(rgb) {
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return rgb;
  return '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
}

// ── Asset Scanner ─────────────────────────────────────────────────────────────

function scanAssets() {
  const images = [];
  const svgs = [];
  const bgImages = [];

  // <img> tags
  document.querySelectorAll('img').forEach(img => {
    images.push({
      src: img.src,
      alt: img.alt || null,
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      loading: img.loading
    });
  });

  // Inline SVGs
  document.querySelectorAll('svg').forEach((svg, i) => {
    const serializer = new XMLSerializer();
    svgs.push({
      index: i,
      viewBox: svg.getAttribute('viewBox') || null,
      width: svg.getAttribute('width') || null,
      height: svg.getAttribute('height') || null,
      markup: serializer.serializeToString(svg).substring(0, 500) + '...'
    });
  });

  // background-image URLs
  document.querySelectorAll('*').forEach(el => {
    const cs = window.getComputedStyle(el);
    const bg = cs.backgroundImage;
    if (bg && bg !== 'none') {
      const urlMatch = bg.match(/url\(['"]?([^'")\s]+)['"]?\)/g);
      if (urlMatch) {
        urlMatch.forEach(u => {
          const clean = u.replace(/url\(['"]?|['"]?\)/g, '');
          if (!bgImages.find(b => b.url === clean)) {
            bgImages.push({ url: clean, element: el.tagName.toLowerCase() });
          }
        });
      }
    }
  });

  return { images, svgs, bgImages };
}

// ── Accessibility Scanner ─────────────────────────────────────────────────────

function scanAccessibility() {
  const issues = [];
  const passed = [];

  // Images without alt
  document.querySelectorAll('img').forEach(img => {
    if (!img.hasAttribute('alt')) {
      issues.push({ type: 'missing-alt', element: img.outerHTML.substring(0, 100), severity: 'error' });
    }
  });

  // Buttons without accessible text
  document.querySelectorAll('button, [role="button"]').forEach(btn => {
    const text = btn.textContent.trim() || btn.getAttribute('aria-label') || btn.getAttribute('title');
    if (!text) {
      issues.push({ type: 'empty-button', element: btn.outerHTML.substring(0, 100), severity: 'error' });
    }
  });

  // Links without href or text
  document.querySelectorAll('a').forEach(a => {
    if (!a.href && !a.getAttribute('role')) {
      issues.push({ type: 'missing-href', element: a.outerHTML.substring(0, 100), severity: 'warning' });
    }
    if (!a.textContent.trim() && !a.getAttribute('aria-label')) {
      issues.push({ type: 'empty-link', element: a.outerHTML.substring(0, 100), severity: 'error' });
    }
  });

  // Form inputs without labels
  document.querySelectorAll('input, select, textarea').forEach(input => {
    const id = input.id;
    const hasLabel = id && document.querySelector(`label[for="${id}"]`);
    const hasAria = input.getAttribute('aria-label') || input.getAttribute('aria-labelledby');
    if (!hasLabel && !hasAria) {
      issues.push({ type: 'missing-label', element: input.outerHTML.substring(0, 100), severity: 'error' });
    }
  });

  // Headings hierarchy
  const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'));
  let lastLevel = 0;
  headings.forEach(h => {
    const level = parseInt(h.tagName[1]);
    if (lastLevel > 0 && level > lastLevel + 1) {
      issues.push({ type: 'heading-skip', element: `<${h.tagName.toLowerCase()}>${h.textContent.trim().substring(0, 50)}`, severity: 'warning' });
    }
    lastLevel = level;
  });

  // Contrast check on visible text elements
  const textEls = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, a, li, label, button');
  let checkedContrast = 0;
  let failedContrast = 0;

  textEls.forEach(el => {
    if (checkedContrast >= 50) return; // Limit for performance
    const cs = window.getComputedStyle(el);
    const fg = cs.color;
    const bg = getEffectiveBackground(el);
    if (!bg) return;
    const ratio = calculateContrastRatio(fg, bg);
    if (ratio !== null) {
      checkedContrast++;
      const fontSize = parseFloat(cs.fontSize);
      const isBold = parseInt(cs.fontWeight) >= 700;
      const isLarge = fontSize >= 18 || (isBold && fontSize >= 14);
      const pass = ratio >= (isLarge ? 3 : 4.5);
      if (!pass) failedContrast++;
    }
  });

  return {
    issues,
    summary: {
      errors: issues.filter(i => i.severity === 'error').length,
      warnings: issues.filter(i => i.severity === 'warning').length,
      totalTextElements: checkedContrast,
      contrastFails: failedContrast
    }
  };
}
