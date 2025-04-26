// api.js: browser compatibility shim
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: AGPL-3.0-or-later

"use strict";

// browser (Firefox) vs chrome (Chromium)
export const isFirefox = (typeof browser !== 'undefined');
export const isChrome = (! isFirefox);
export const api = isFirefox ? browser : chrome;

