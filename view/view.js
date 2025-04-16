// view/view.js: outline view script
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: GPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import { log } from '/common/common.js';
import { TreeView } from './treeview.js';

log('/view/view.js running');


function init() {
  initButtonBars();

  let tree = new TreeView();
  tree.init();
  return tree;
}


function initButtonBars () {
  // when options-btn clicked, open the options page
  document.querySelector('#options-btn')
    .addEventListener('click', function() {
      if (api.runtime.openOptionsPage) {
        api.runtime.openOptionsPage();
      } else {
        window.open(api.runtime.getURL('/options/options.html'));
      }
    });
}


// init when page is ready
document.addEventListener('DOMContentLoaded', () => {
  const tree = init();
});

