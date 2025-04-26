// bkgd/sidepanel.js: sidepanel init script
// Copyright (C) 2025 Selene ToyKeeper
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
  // TODO: Firefox
  else if (isFirefox) {
    // get the ID of the window this sidepanel is running in
    // (might not be specific to Firefox)
    //api.windows.getCurrent({populate: true}).then((windowInfo) => {
    //  myWindowId = windowInfo.id;
    //});
  }
}

