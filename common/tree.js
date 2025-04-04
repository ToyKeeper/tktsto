// common/tree.js: Tree class
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: GPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import { log, debug, error, emit } from '/common/common.js';
import { Node } from '/common/node.js';


export class Tree {

  constructor (NodeClass) {
    if (undefined === NodeClass) NodeClass = Node;
    this.NodeClass = NodeClass;

    this.markedNodes = [];

    this.createRootNode();
  }

  destroy () {
  }

  init () {
    this.initListeners();
  }

  createRootNode () {
    // empty Node to hold all others
    if (!this.root)
      this.root = new this.NodeClass(this, null);
    this.root.parent = this.root;
    this.root.id = 'root';
    this.root.nodes = [];
    // cache all nodes by ID
    this.nodes = { 'root': this.root };
  }

  nodeMarkChanged (node) {
    if (node.marked) {
      this.markedNodes.push(node.id);
    }
    else {
      const index = this.markedNodes.indexOf(node.id);
      if (index >= 0) this.markedNodes.splice(index, 1);
    }
  }

  async loadTreeFromBkgd () {
    // TODO: get entire tree state from bkgd
    //   ... and populate this tree with that data

    // get the raw Tree data
    const response = await emit('bkgd_getTree');
    if (! response)
      return error('Tree.loadTreeFromBkgd() failed, bkgd did not send tree');

    //debug('bkgd_getTree() =>', response);
    // TODO: delete anything which needs deleting before restoring
    // (like removing DOM elements in Views)
    // (maybe call derived class handler?)

    // restore session from serialized data
    this.createRootNode();
    const numLoaded = this.rebuildNodeFromSerializedHash(
      this.root, response.nodes);
    log(`loadTreeFromBkgd(): loaded ${numLoaded} nodes`);
  }

  serializeNodes () {
    const result = {};
    for (const key in this.nodes) {
      result[key] = this.nodes[key].toDict();
    }
    return result;
  }

  rebuildNodeFromSerializedHash (node, hash) {
    //debug('rebuildNodeFromSerializedHash()', node, hash);
    let numLoaded = 0;
    const nodeDict = hash[node.id];
    if (! nodeDict) {
      error(`rebuildNodeFromSerializedHash(): no nodeID "${node.id}"`);
      return 0;
    }
    //debug('nodeDict()', nodeDict);

    this.nodes[node.id] = node;
    node.fromDict(nodeDict);
    this.nodeMarkChanged(node);  // update our mark cache
    node.nodes = [];
    numLoaded ++;
    for (const nodeID of nodeDict.nodes) {
      //debug('nodeDict() childID', nodeID);
      const child = new this.NodeClass(this, node);
      child.id = nodeID;
      node.nodes.push(child);
      numLoaded += this.rebuildNodeFromSerializedHash(child, hash);
    }
    return numLoaded;
  }

  initListeners () {
    api.runtime.onMessage.addListener( (msg, sender, sendResponse) => {
      this.onMessage(msg, sender, sendResponse);
    });
  }

  onMessage (msg, sender, sendResponse) {
    if (! msg.msg) {
      warn('Tree onMessage invalid', msg);
      sendResponse({error: 'invalid msg type'});
      return;
    }
    // if message not for us, ignore it and abort
    if (! msg.msg.startsWith('tree_')) return;

    // below here, no sendResponse() is expected
    // and we must return 'false' or nothing at all,
    // to avoid making caller think an async response is coming
    debug('Tree onMessage', msg);
    const handler = this[`${msg.msg}`];
    if (handler) {
      // actually handle the event
      //debug(`Tree: ${msg.msg}()`);
      handler.bind(this)(msg, sender, sendResponse);
      // FIXME: on sync error, tree should set an error state
      //   which can be exposed to the user to let them know they should
      //   reload the view or whatever...
      //   ... or perhaps it should automatically reload the whole tree
      //   any time there's a sync error.
      return;
    }
    return error(`Tree fn not found: ${msg.msg}`);
  }

  async tree_nodeAdded (msg, sender, sendResponse) {
    const parentID = msg.parentID;
    const index = msg.index;
    const details = msg.node;
    const parent = this.nodes[parentID];
    //debug('tree_nodeAdded() parent', parent);
    if (! parent) {
      return error(`tree_nodeAdded(): couldn't find parent "${parentID}"`);
    }
    const newNode = await parent.addChild(index, details, false);
    //const newNode = parent.nodes[index];
    //debug('tree_nodeAdded() newNode', newNode);
    if (! newNode) {
      return error(`tree_nodeAdded(): failed to add node "${details.id}"`);
    }
    this.nodes[newNode.id] = newNode;
    debug(`tree_nodeAdded() added "${newNode.id}" to "${parent.id}"`);
    //debug('Tree root:', this.root);
  }

  async tree_nodeDeleted (msg, sender, sendResponse) {
    const nodeID = msg.nodeID;
    const node = this.nodes[nodeID];
    debug('tree_nodeDeleted()', nodeID);
    if (! node) {
      return error(`tree_nodeDeleted(): couldn't find node "${nodeID}"`);
    }
    // un-cache and delete it
    delete this.nodes[nodeID];
    return await node.deleteSelf(false);
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

  async tree_nodeChanged (msg, sender, sendResponse) {
    // unpack
    const nodeID = msg.nodeID;
    const changeType = msg.type;

    // find nodes
    const node = this.nodes[nodeID];
    if (! node)
      return error(`tree_nodeChanged(): couldn't find node "${nodeID}"`);

    // FIXME: change API to make it more general
    // like nodeChanged(fieldName, before, after)
    // so it can just set node['fieldName'] = after
    // or node[set${fieldName}](after, false)
    // or something like that

    // figure out what kind of change happened, and update it
    if ('setExpanded' === changeType) {
      return node.setExpanded(msg.expanded, false);
    }
    else if ('setNote' === changeType) {
      return node.setNote(msg.note, false);
    }
    else if ('setMarked' === changeType) {
      return node.setMarked(msg.marked, false);
    }
    else {
      return error(`tree_nodeChanged(): unsupported change type "${changeType}"`);
    }
  }

}

