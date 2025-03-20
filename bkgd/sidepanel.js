// bkgd/sidepanel.js: sidepanel init script
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: GPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

export function init() {
  // User can open the side panel by clicking the extension's icon
  if (isChrome) {
    api.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((error) => console.error(error));
  }
  // TODO: Firefox
}

