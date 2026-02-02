// api.js: browser compatibility shim
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: AGPL-3.0-or-later

"use strict";

// browser (Firefox) vs chrome (Chromium)
export const isFirefox = (typeof browser !== 'undefined');
// if not Firefox, it's some flavor of Chromium
export const isChrome = (! isFirefox);
// MS Edge
export let isEdge = / Edg\//.test(navigator.userAgent);
if (navigator.userAgentData?.brands) {
  isEdge = navigator.userAgentData.brands
    .some(b => b.brand === "Microsoft Edge");
}
// Brave
export const isBrave = (typeof navigator.brave !== 'undefined');
// Vivaldi ... is hard to detect
export const isVivaldi = undefined
// Maxthon
export const isMaxthon = (typeof maxthon !== 'undefined');

export let isZenBrowser = false;
// FIXME: actually detect this somehow
if (isFirefox) isZenBrowser = true;

// select a base symbol for all browser API calls
export const api = isFirefox ? browser : chrome;

console.log('Browser type:'
  + ` Firefox(${isFirefox})`
  + ` Chrome(${isChrome})`
  + ` Edge(${isEdge})`
  + ` Brave(${isBrave})`
  + ` Vivaldi(???)`
  + ` Maxthon(${isMaxthon})`
  + ` Zen(${isZenBrowser})`
);

