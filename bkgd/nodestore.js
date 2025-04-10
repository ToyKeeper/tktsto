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

  newNodeId () {
    // NodeView.newNodeId() and NodeStore.newNodeId()
    // are totally different, and Node.newNodeId() doesn't exist
    //super.newNodeId();  // unnecessary, doesn't exist
    const nodeId = this.tree.bkgd.idGen.newId();
    log(`NodeStore.newNodeId(): ${nodeId}`);
    return nodeId;
  }

  async addChild (index, details, ...extra) {
    //debug('NodeStore.addChild():', details);
    // index is required; assume 1st child if not given
    if (undefined === index) index = 0;

    log('NodeStore.addChild()');
    // must allocate ID before creating node and emitting notifications
    if (! details.id) { details.id = this.newNodeId(); }
    // create new Node object
    const newNode = super.addChild(index, details, ...extra);

    return newNode;
  }

}

