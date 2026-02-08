// api.js: browser compatibility shim
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: AGPL-3.0-or-later

"use strict";

// browser (Firefox) vs chrome (Chromium)
export const isFirefox = (typeof browser !== 'undefined');
// if not Firefox, it's some flavor of Chromium
export const isChrome = (! isFirefox);

// select a base symbol for all browser API calls
export const api = isFirefox ? browser : chrome;

// MS Edge
export let isEdge = / Edg\//.test(navigator.userAgent);
if (navigator.userAgentData?.brands) {
  isEdge = navigator.userAgentData.brands
    .some(b => b.brand === "Microsoft Edge");
}

// Brave
// Brave sets userAgentData.brands too, but this is easier
export const isBrave = (typeof navigator.brave !== 'undefined');

// Vivaldi ... is hard to detect
export const isVivaldi = undefined

// Maxthon
export const isMaxthon = (typeof maxthon !== 'undefined');

// Zen Browser ... sigh.  This is a dirty kludge.
// https://github.com/zen-browser/desktop/issues/12198
// (can't be identified at import time without causing other problems,
//  so it spins off a separate execution context to lazy-detect it,
//  and results won't be available at boot time)
export let isZenBrowser = false;  // false, true, 'waiting', or 'maybe'
if (isFirefox) {
  isZenBrowser = 'waiting';  // waiting on browser to respond
  (async () => {
    try {
      const info = await browser.runtime.getBrowserInfo();
      // Zen 1.18.4? and above
      if (info?.zen) isZenBrowser = true;
      // Firefox newer than Zen 1.18.3b
      else if (info?.version > '147.0.2') isZenBrowser = false;
      // otherwise, Zen 1.18.3 and below, can't fkn tell
      else isZenBrowser = 'maybe';
      console.log(`isZenBrowser => ${isZenBrowser}`);
    } catch { isZenBrowser = false; }
  })();
}

// show browser type at boot time
console.log('Browser type:'
  + ` Firefox(${isFirefox})`
  + ` Chrome(${isChrome})`
  + ` Edge(${isEdge})`
  + ` Brave(${isBrave})`
  + ` Vivaldi(${isVivaldi})`
  + ` Maxthon(${isMaxthon})`
  + ` Zen(${isZenBrowser})`
);

