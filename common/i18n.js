// common/i18n.js: Helper for WebExtension i18n localization
// Copyright (C) 2026 Selene ToyKeeper / Contributor
// SPDX-License-Identifier: AGPL-3.0-or-later

"use strict";

export function getMessage(key, substitutions = []) {
  if (!key) return '';
  try {
    if (typeof chrome !== 'undefined' && chrome.i18n && typeof chrome.i18n.getMessage === 'function') {
      const msg = chrome.i18n.getMessage(key, substitutions);
      if (msg) return msg;
    }
    if (typeof browser !== 'undefined' && browser.i18n && typeof browser.i18n.getMessage === 'function') {
      const msg = browser.i18n.getMessage(key, substitutions);
      if (msg) return msg;
    }
  } catch (e) {
    // fallback if i18n call throws
  }
  return key;
}

export function localizeDOM(root = document) {
  if (!root) return;

  // Localize element text content (data-i18n="key")
  const elements = root.querySelectorAll('[data-i18n]');
  for (const el of elements) {
    const key = el.getAttribute('data-i18n');
    if (key) {
      const msg = getMessage(key);
      if (msg && msg !== key) {
        el.textContent = msg;
      }
    }
  }

  // Localize element attributes (data-i18n-[attr]="key")
  const attrTypes = ['title', 'placeholder', 'aria-label', 'value', 'alt'];
  for (const attr of attrTypes) {
    const attrName = `data-i18n-${attr}`;
    const attrElements = root.querySelectorAll(`[${attrName}]`);
    for (const el of attrElements) {
      const key = el.getAttribute(attrName);
      if (key) {
        const msg = getMessage(key);
        if (msg && msg !== key) {
          el.setAttribute(attr, msg);
        }
      }
    }
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => localizeDOM(document));
  } else {
    localizeDOM(document);
  }
}
