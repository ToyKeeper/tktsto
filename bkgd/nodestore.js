// bkgd/nodestore.js: NodeStore class
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: GPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import { log } from '/common/common.js';
import { Node } from '/common/node.js';


// TODO
export class NodeStore extends Node {

  constructor (...args) {
    super(...args);
  }

  async newNodeID () {
    // NodeView.newNodeID() and NodeStore.newNodeID()
    // are totally different, and Node.newNodeID() doesn't exist
    //super.newNodeID();  // unnecessary, doesn't exist
    const nodeID = this.tree.bkgd.idGen.newID();
    return nodeID;
  }

  async addChild (index, details, ...extra) {
    //debug('NodeStore.addChild():', details);
    // index is required; assume 1st child if not given
    if (undefined === index) index = 0;

    // must allocate ID before creating node and emitting notifications
    if (! details.id) { details.id = await this.newNodeID(); }
    // create new Node object
    const newNode = super.addChild(index, details, ...extra);

    return newNode;
  }

}

