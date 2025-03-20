// common/common.js: code shared by all scripts
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: GPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

export function debug (...args) {
  console.debug(...args);
}

export function log (...args) {
  console.log(...args);
}

export function warn (...args) {
  console.warn(...args);
}

export function error (...args) {
  console.error(...args);
}

