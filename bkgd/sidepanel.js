// bkgd/sidepanel.js: sidepanel init script
// Copyright (C) 2025-2026 Selene ToyKeeper
// SPDX-License-Identifier: AGPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

export function init() {
  // User can open the side panel by clicking the extension's icon
  if (isChrome) {
    let oldChrome = false;
    if (undefined === api.sidePanel.close) {
      oldChrome = true;
      console.log('workaround: old Chrome has no sidePanel.close()');
    }
    // FIXME someday: the oldChrome method works better now, but
    // if they ever finish the sidePanel API, this should be removed
    oldChrome = true;  // <-- temporary override until Chrome is fixed
    api.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: oldChrome })
      .catch((error) => console.error(error));

    // try to set which side the panel is on
    try {
      // this doesn't exist yet, as of Chrome 143
      // ... but just in case it gets added later, at least try it
      // (getLayout() exists, but there is no setLayout())
      // TODO? add a config option for left/right side
      //       because some browser vendors are insane and REMOVED this option
      //       sometime in 2024 or so
      api.sidePanel.setLayout({ side: 'left' });
    } catch (error) { console.log(`Failed to set sidePanel side: ${error}`); }
  }

  // Firefox
  else if (isFirefox) {
    // Different API for Firefox.
    // This is handled in bkgd.onExtensionIconClicked()
    // So, nothing to do here.
  }
}

