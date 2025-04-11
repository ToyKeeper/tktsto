// common/tree.js: Tree class
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: GPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import { log, debug, warn, error, emit } from '/common/common.js';
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
    // cache all windows by ID
    this.windows = {};
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
      //debug('serializeNodes:', key, this.nodes[key]);
      result[key] = this.nodes[key].toDict();
    }
    return result;
  }

  rebuildNodeFromSerializedHash (node, hash) {
    //debug('rebuildNodeFromSerializedHash()', node, hash);
    let numLoaded = 0;
    const nodeDict = hash[node.id];
    if (! nodeDict) {
      error(`rebuildNodeFromSerializedHash(): no nodeId "${node.id}"`);
      return 0;
    }
    //debug('nodeDict()', nodeDict);

    // update caches
    this.nodes[node.id] = node;
    if ('window' === node.type) this.windows[node.windowId] = node;
    // build the node
    node.fromDict(nodeDict);
    this.nodeMarkChanged(node);  // update our mark cache
    node.nodes = [];
    numLoaded ++;
    for (const nodeId of nodeDict.nodes) {
      //debug('nodeDict() childId', nodeId);
      const child = new this.NodeClass(this, node);
      child.id = nodeId;
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

  getNodeByTabId(tabId)  {
    // TODO: cache loaded tabs in Tree.tabIds
    //       instead of searching the whole damn tree every time
    // TODO: maybe move this function to Node.getNodeByTabId() ?
    const found = this.root.findNodes((node) =>
      { return (node.isLoaded() && (node.tabId === tabId));}
    );
    if (1 === found.length) return found[0];
    if (1 > found.length) return null;
    warn(`Tree.getNodeByTabId(${tabId}) found ${found.length} matches, not 1`);
    return found[0];
  }

  onTabActivated (windowId, tabId) {
    const windowNode = this.windows[windowId];
    if (! windowNode) {
      // FIXME: WTF, shouldn't happen, big error here
      return error(`Tree.onTabActivated() can't find windowId="${windowId}"`);
    }
    windowNode.setActiveTab(tabId);
  }

  onTabRemoved (tabId, removeInfo) {
    // tabId: number
    // removeInfo.isWindowClosing: boolean
    // removeInfo.windowId: number
    const tabNode = this.getNodeByTabId(tabId);
    // if tab doesn't exist, do nothing
    if (! tabNode) return;
    // if tab closed only because its window is closing
    if (removeInfo && removeInfo.isWindowClosing) {
      // keep unloaded tab as part of the user's saved window
      return tabNode.unload({ onTabRemoved: true });
    }
    // if tab closed manually by user, but it has notes
    else if (tabNode.shouldUnloadNotDelete()) {
      // keep tab in tree to preserve its metadata
      return tabNode.unload({ onTabRemoved: true });
    }
    // if tab is boring but has kids
    else if (tabNode.hasKids()) {
      // delete the node, but keep its kids
      return tabNode.deleteSelfAndPromoteKids({ onTabRemoved: true });
    }
    // tab is a leaf node with no notes or anything interesting
    else {
      // delete boring tabs on close
      return tabNode.deleteSelf({ onTabRemoved: true });
    }
  }

  onTabUpdated(tabId, changeInfo, tab) {
    // tabId: number
    // tab: https://developer.chrome.com/docs/extensions/reference/api/tabs#type-Tab
    // changeInfo.title: string
    // changeInfo.url: url
    // changeInfo.favIconUrl: string
    // changeInfo.status: https://developer.chrome.com/docs/extensions/reference/api/tabs#type-TabStatus
    //   - 'unloaded', 'loading', 'complete'
    // changeInfo.pinned: boolean
    // changeInfo.groupId: number
    // changeInfo.discarded: boolean
    // changeInfo.frozen: boolean
    // changeInfo.audible: boolean
    // changeInfo.mutedInfo: https://developer.chrome.com/docs/extensions/reference/api/tabs#type-MutedInfo
    // changeInfo.autoDiscardable: boolean
    const tabNode = this.getNodeByTabId(tabId);
    // if tab doesn't exist, do nothing
    if (! tabNode) return;
    // change ... multiple things
    let changes = {};  // only changes we care about
    for (const field of
      ['title', 'url', 'favIconUrl',
        'discarded', 'frozen', 'hidden']) {
      if (undefined !== changeInfo[field]) {
        changes[field] = changeInfo[field];
      }
    }
    // apply changes, if any
    if (Object.keys(changes).length > 0) {
      return tabNode.setTabFields(changes);
    }
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
    const parentId = msg.parentId;
    const index = msg.index;
    const details = msg.node;
    const parent = this.nodes[parentId];
    //debug('tree_nodeAdded() parent', parent);
    if (! parent) {
      return error(`tree_nodeAdded(): couldn't find parent "${parentId}"`);
    }
    const newNode = await parent.addChild(index, details, msg, false);
    //const newNode = parent.nodes[index];
    //debug('tree_nodeAdded() newNode', newNode);
    if (! newNode) {
      return error(`tree_nodeAdded(): failed to add node "${details.id}"`);
    }
    this.nodes[newNode.id] = newNode;
    if (newNode.isWindow()) {
      this.windows[newNode.windowId] = newNode;
      debug('Tree.windows[] added', newNode.windowId, this.windows);
    }
    debug(`tree_nodeAdded() added "${newNode.id}" to "${parent.id}"`);
    //debug('Tree root:', this.root);
  }

  async tree_nodeDeleted (msg, sender, sendResponse) {
    const nodeId = msg.nodeId;
    debug('tree_nodeDeleted()', nodeId);
    let node = this.nodes[nodeId];
    // FIXME: this happens reliably when deleting loaded tabs from the TreeView
    //if (! node) {
    //  const found = this.root.findNodes((node) =>
    //    { return nodeId === node.id; });
    //  if (found) {
    //    warn(`tree_nodeDeleted(): node cache miss: "${nodeId}"`);
    //    node = found[0];
    //    this.nodes[nodeId] = node;
    //  }
    //}
    if (! node) {
      // FIXME: this happens reliably when deleting loaded tabs from the TreeView
      // probably already deleted the node in a different event,
      // and a second event triggered the same deletion
      // (like pressing 'd' in the TreeView to delete a loaded tab,
      //  then getting a onTabRemoved event for the same ID)
      //warn(`tree_nodeDeleted(): couldn't find node "${nodeId}"`);
      return;
    }
    // un-cache and delete it
    delete this.nodes[nodeId];
    if (node.isWindow()) delete this.windows[node.windowId];

    //return await node.deleteSelf(msg, false);
    let result;
    try {
      result = await node.deleteSelf(msg, false);
    } catch (err) {
      error(`tree_nodeDeleted() error`, err);
    }
    return result;
  }

  async tree_nodeMoved (msg, sender, sendResponse) {
    // unpack
    const nodeId = msg.nodeId;
    const destParentId = msg.destParentId;
    const destIndex = msg.destIndex;

    // find nodes
    const node = this.nodes[nodeId];
    const destParent = this.nodes[destParentId];
    if (! node)
      return error(`tree_nodeMoved(): couldn't find node "${nodeId}"`);
    if (! destParent)
      return error(`tree_nodeMoved(): couldn't find parent "${destParentId}"`);

    // move the node
    return node.moveTo(destParent, destIndex, msg, false);
  }

  async tree_nodeChanged (msg, sender, sendResponse) {
    // unpack
    const nodeId = msg.nodeId;
    const changeType = msg.type;

    // find nodes
    const node = this.nodes[nodeId];
    if (! node) {
      return error(`tree_nodeChanged(): couldn't find node "${nodeId}"`);
    }

    // FIXME: change API to make it more general
    // like nodeChanged(fieldName, before, after)
    // so it can just set node['fieldName'] = after
    // or node[set${fieldName}](after, false)
    // or something like that

    // figure out what kind of change happened, and update it
    if ('setExpanded' === changeType) {
      return node.setExpanded(msg.expanded, msg, false);
    }
    else if ('setNote' === changeType) {
      return node.setNote(msg.note, msg.longNote, msg, false);
    }
    else if ('setTabFields' === changeType) {
      return node.setTabFields(msg.changes, msg, false);
    }
    else if ('setMarked' === changeType) {
      return node.setMarked(msg.marked, msg, false);
    }
    else if ('setActive' === changeType) {
      return node.setActive(msg.active, msg, false);
    }
    else if ('load' === changeType) {
      return node.load(msg, false);
    }
    else if ('unload' === changeType) {
      return node.unload(msg, false);
    }
    else {
      return error(`tree_nodeChanged(): unsupported change type "${changeType}"`);
    }
  }

  async tree_windowClosed (msg, sender, sendResponse) {
    const nodeId = msg.nodeId;
    const windowId = msg.windowId;
    const node = this.nodes[nodeId];
    debug('tree_windowClosed()', nodeId, windowId);
    if (! node) {
      return error(`tree_windowClosed(): couldn't find node "${nodeId}"`);
    }
    if (! node.isWindow()) {
      return error(`tree_windowClosed(): not a window: "${nodeId}"`);
    }
    // un-cache and delete it (?)
    // (a closed window object may just be unloaded, not deleted)
    //delete this.nodes[nodeId];
    delete this.windows[node.windowId];
    return await node.windowClosed(msg, false);
  }

}

