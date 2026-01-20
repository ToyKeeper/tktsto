// bkgd/sidepanel.js: sidepanel init script
// Copyright (C) 2025-2026 Selene ToyKeeper
// SPDX-License-Identifier: AGPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

export function init() {
  // User can open the side panel by clicking the extension's icon
  if (isChrome) {
    api.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((error) => console.error(error));
  }
  // Firefox
  else if (isFirefox) {
    // Different API for Firefox.
    // This is handled in bkgd.onExtensionIconClicked()
    // So, nothing to do here.
  }
}

