// view/view.js: outline view script
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: AGPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import { log } from '/common/common.js';
import { TreeView } from './treeview.js';

log('/view/view.js running');


function init() {
  let tree = new TreeView();
  tree.init();
  return tree;
}


// init when page is ready
document.addEventListener('DOMContentLoaded', () => {
  const tree = init();
});

