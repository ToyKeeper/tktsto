// common/tree.js: Tree class
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: GPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import { log, error } from '/common/common.js';
import { Node } from '/common/node.js';


export class Tree {

  constructor (NodeClass) {
    if (undefined === NodeClass) NodeClass = Node;
    this.NodeClass = NodeClass;

    this.root = new NodeClass(this, null);
    this.root.parent = this.root;
    this.root.id = 'root';

    // cache all nodes by ID
    this.nodes = { 'root': this.root };
  }

  destroy () {
  }

  init () {
    this.initListeners();
  }

  initListeners () {
    api.runtime.onMessage.addListener( (msg, sender, sendResponse) => {
      this.onMessage(msg, sender, sendResponse);
    });
  }

  onMessage (msg, sender, sendResponse) {
    //log('Tree onMessage', msg);
    if (! msg.msg) {
      warn('Tree onMessage invalid', msg);
      sendResponse({error: 'invalid msg type'});
      return;
    }
    const handler = this[`${msg.msg}`];
    if (handler) {
      // actually handle the event
      log(`Tree: ${msg.msg}()`);
      handler.bind(this)(msg, sender, sendResponse);
    }
    else {
      // message was probably intended for someone else
      //log(`Tree fn not found: ${msg.msg}`);
    }
  }

  async tree_nodeAdded (msg, sender, sendResponse) {
    const parentID = msg.parentID;
    const index = msg.index;
    const details = msg.node;
    const parent = this.nodes[parentID];
    log('tree_nodeAdded() parent', parent);
    if (! parent) {
      return error(`tree_nodeAdded(): couldn't find parent "${parentID}"`);
    }
    const newNode = await parent.addChild(index, details, false);
    //const newNode = parent.nodes[index];
    log('tree_nodeAdded() newNode', newNode);
    if (! newNode) {
      return error(`tree_nodeAdded(): failed to add node "${details.id}"`);
    }
    this.nodes[newNode.id] = newNode;
    log(`tree_nodeAdded() added "${newNode.id}" to "${parent.id}"`);
    log('Tree root:', this.root);
  }

  async tree_nodeMoved (msg, sender, sendResponse) {
    // unpack
    const nodeID = msg.nodeID;
    const destParentID = msg.destParentID;
    const destIndex = msg.destIndex;

    // find nodes
    const node = this.nodes[nodeID];
    const destParent = this.nodes[destParentID];
    if (! node)
      return error(`tree_nodeMoved(): couldn't find node "${nodeID}"`);
    if (! destParent)
      return error(`tree_nodeMoved(): couldn't find parent "${destParentID}"`);

    // move the node
    return node.moveTo(destParent, destIndex, false);
  }

}

