// common/node.js: Node class (one unit of a tree)
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: GPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import { log } from '/common/common.js';


export class Node {

  constructor (tree, parent) {
    //this.id = get_next_available_node_id();
    // placement
    this.tree = tree;
    this.parent = parent;
    // attributes
    this.note = null;
    //this.$note = null;  // <span>
    //this.long_note = null;
    this.title = null;
    this.url = null;
    //this.$url = null;  // <a>
    this.favicon_url = null;
    //this.$favicon = null;  // <img>
    //this.checkbox = false;
    this.expanded = true;
    this.loaded = false;
    this.wasLoaded = false;
    // children
    this.nodes = [];
  }

  destroy () {
    this.del();
  }

  del () {
    if (this.window) this.$destroy();
  }

  indexOf () {
    if (!this.parent) return 0;
    if (!this.parent.nodes) return 0;
    return this.parent.nodes.indexOf(this);
  }

  // TODO
  setNote (text) {
    this.note = text;
  }

}  // end class Node

