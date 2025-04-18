// common/tree.js: Tree class
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: GPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import {
  log, debug, warn, error, emit, jsonSchema, dateTupleStrings
} from '/common/common.js';
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

  initListeners () {
    api.runtime.onMessage.addListener( (msg, sender, sendResponse) => {
      this.onMessage(msg, sender, sendResponse);
    });
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

  serializeNodes (forBackup = false) {
    const result = {};
    let defaultNode;
    if (forBackup) defaultNode = new Node();

    for (const key in this.nodes) {
      //debug('serializeNodes:', key, this.nodes[key]);
      const node = this.nodes[key].toDict();
      if (forBackup) {  // clean up the data before exporting
        for (const [k,v] of Object.entries(node)) {
          // get rid of attributes with no value
          // (redundant, removing unchanged/default does this too)
          //if ((null === v) || ('' === v))
          //  delete node[k];
          // remove data which shouldn't persist
          if (['tabId', 'windowId', 'marked'].includes(k))
            delete node[k];
          // remove values which haven't changed from default
          if (defaultNode[k] === node[k])
            delete node[k];
          // remove empty nodes from leaf
          if (('nodes' === k) && (0 === node[k].length))
            delete node[k];
        }
      }
      result[key] = node;
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

  async makeBackupObject (rootNode, when) {
    const obj = {};
    // TODO: actually write and publish the schema file
    obj.$schema = jsonSchema;
    if (undefined === when) when = Date.now();
    obj.metadata = {};
    obj.metadata.exportDate = Number(when);
    obj.metadata.sessionStartDate = Number(rootNode.ctime);
    // attach the client ID
    let clientId = '??';
    const result = await api.storage.local.get('clientId');
    if (result.clientId) clientId = result.clientId;
    obj.metadata.clientId = clientId;
    // attach the actual tree / node data
    obj.nodes = this.serializeNodes(true);
    return obj;
  }

  async downloadBackupNow () {
    const when = new Date();
    // determine whether to pretty-print the data
    let prettyPrint = 0;
    const result = await api.storage.local.get('humanFriendlyBackups');
    if (result.humanFriendlyBackups) prettyPrint = 2;
    // generate the file's raw data
    const backup = await this.makeBackupObject(this.root, when);
    const jsonString = JSON.stringify(backup, null, prettyPrint);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    // build a filename
    const clientId = backup.metadata.clientId;
    const date = dateTupleStrings(when);
    const filename = `tktsto.${date[0]}-${date[1]}-${date[2]}_${date[3]}-${date[4]}-${date[5]}.${clientId}.json`;

    // save the file
    log(`Tree.downloadBackupNow(): saving to "${filename}"`);
    const downloading = api.downloads.download({
      url: url,
      filename: filename,
      saveAs: false
    });
    let downloadId;
    function onStarted (id) { downloadId = id; }
    function progress (delta) {
      if ((delta.id === downloadId)
        && delta.state && delta.state.current === "complete")
      {
        log(`Download succeeded: ${filename}`);
        api.downloads.onChanged.removeListener(progress);
        try {
          // docs recommend cleaning this up
          // but docs also say this is unavailable in service workers
          // so ... do it when possible, and ignore errors otherwise
          URL.revokeObjectURL(url);
        } catch (err) {
        }
      }
    }
    function onFailed (err) {
      warn(`Download failed: ${err}`);
      api.downloads.onChanged.removeListener(progress);
    }
    api.downloads.onChanged.addListener(progress);
    downloading.then(onStarted, onFailed);
  }

  getNodeByTabId(tabId, root)  {
    // TODO: cache loaded tabs in Tree.tabIds
    //       instead of searching the whole damn tree every time
    // TODO: maybe move this function to Node.getNodeByTabId() ?
    if (! root) root = this.root;
    const found = root.findNodes((node) =>
      { return (node.isLoaded() && (node.tabId === tabId));}
    );
    if (1 === found.length) return found[0];
    if (1 > found.length) return null;
    warn(`Tree.getNodeByTabId(${tabId}) found ${found.length} matches, not 1`);
    return found[0];
  }

  getSavedTabNodeId (tab, url) {
    const tabNodeUrl = api.runtime.getURL('/node.html') + '?id=';
    const minusProtocol = tabNodeUrl.split('://')[1];  // strip "protocol://"
    let tabPendingUrl = url;
    if (undefined === tabPendingUrl)
      tabPendingUrl = this.getTabPendingUrl(tab);
    if ((tabPendingUrl.startsWith(tabNodeUrl))
      || tabPendingUrl.startsWith(minusProtocol)
    ) {
      const nodeId = tabPendingUrl.split('/node.html?id=')[1];
      return nodeId;
    }
    return null;
  }

  getTabPendingUrl (tab) {
    if (tab.pendingUrl) return tab.pendingUrl;  // chrome
    if ('about:blank' === tab.url) {  // firefox
      if (tab.title && tab.title.includes('/')) {
        // firefox puts the pending URL in the title
        // but strips the protocol://
        return tab.title;
      }
      return tab.url;
    }
    return tab.url;
  }

  async onTabCreated (tab) {
    // tab: https://developer.chrome.com/docs/extensions/reference/api/tabs#type-Tab
    // tab.active: boolean
    // tab.discarded: boolean
    // tab.favIconUrl: string
    // tab.frozen: boolean
    // tab.groupId: number
    // tab.id: number
    // tab.incognito: boolean
    // tab.index: number
    // tab.lastAccessed: number
    // tab.openerTabId: number
    // tab.pinned: number
    // tab.sessionId: string (will be useful for handling restored sessions later)
    // tab.title: string
    // tab.url: string
    // tab.windowId: number
    //   MAY NOT EXIST YET
    //   When opening a new window, the browser does onTabCreated
    //   before doing onWindowCreated, so it can refer to a window
    //   which doesn't exist yet.  :(
    debug(`Tree.onTabCreated(): Window ID: ${tab.windowId} Tab ID: ${tab.id}, URL: ${tab.url}, pendingUrl: ${tab.pendingUrl}`, tab);

    // figure out which URL this new tab is going to
    const tabPendingUrl = this.getTabPendingUrl(tab);
    const loadingSavedTabNodeId = this.getSavedTabNodeId(tab);
    debug(`Tree.onTabCreated() loadingSavedTabNodeId=${loadingSavedTabNodeId} tabPendingUrl: ${tabPendingUrl}`);

    // detect whether tab was opened *BY US*
    // if so, attach it to the existing Tree Node
    // instead of creating a new one
    if (loadingSavedTabNodeId) {
      const nodeId = loadingSavedTabNodeId;
      debug(`Tree.onTabCreated(): restoring nodeId=${nodeId}`);
      const node = this.nodes[nodeId];
      if (node) {
        // re-attach this tab to the found Node
        await node.setTabFields({
          tabId: tab.id,
          loaded: true
        }, { reason: 'onTabCreated' });
        // put the tab in the right position
        await node.reorderAllTabsInThisWindow();
        // restore the tab's metadata
        // (doesn't work if we do it here)
        // (need to wait for tab.status='complete' first)
        // (because the request is ignored if we do it here)
        // (so it gets redirected later,
        //  during onTabUpdated({status:'complete'}) event)
        // I'm sad that this doesn't work:
        //await api.tabs.update(tab.id, { url: node.url });
        api.tabs.update(tab.id, { url: node.url });
        return;
      }
      debug(`Tree.onTabCreated(): restoring node failed`);
    }
    //       ... in an appropriate position
    // find the window Node
    let winNode = this.windows[tab.windowId];
    if (! winNode) {
      // this usually means the user just opened a new window, and
      // the browser generated onTabCreated BEFORE doing an onWindowCreated
      // event, so we need to create a new window Node on the assumption
      // that it WILL exist in a few milliseconds (7ms later, in my tests)
      //return error(`Tree.onTabCreated() can't find windowId="${tab.windowId}"`);
      debug(`Tree.onTabCreated() can't find windowId="${tab.windowId}", creating new Node for it`);
      // create the window node, assuming the window will exist soon
      const winParent = this.root;
      const winIndex = this.root.nodes.length;
      winNode = await winParent.addChild(winIndex, {
        type: 'window',
        windowId: tab.windowId,
        loaded: false
        }, null, true);
    }
    let destParent = winNode;
    let destIndex = winNode.nodes.length;

    // if the tab is a blank created by the user with C-t...
    // ... make it the 1st child of the active tab
    if (isNewTabPage(tabPendingUrl)) {
      destParent = winNode.getActiveTab();
      if (! destParent) destParent = winNode;
      destIndex = 0;
      debug(`Tree.onTabCreated() moving new tab to the right of: "${destParent.title}"`);
    }
    // find the right place to put this tab in the tree
    else if (tab.openerTabId) {
      const found = this.getNodeByTabId(tab.openerTabId, winNode);
      if (found) {
        destParent = found;
        // find the correct destIndex
        // TODO: decide this based on a user config option:
        //   - open tabs as [first / last] child of current,
        //     or open as next sibling
        //destIndex = destParent.nodes.length;
        destIndex = 0;  // always insert as 1st child of current tab
        //debug(`Tree.onTabCreated: destParent(${destIndex})`, destParent);
      }
      else {
        // if parent not found, open tab as 1st child of current/active tab
        const activeTabNode = winNode.getActiveTab();
        if (activeTabNode) {
          destParent = activeTabNode;
          destIndex = 0;
        }
      }
    }
    // create the tree node
    await destParent.addChild(destIndex, {
      windowId: tab.windowId,
      tabId: tab.id,
      title: tab.title,
      url: tab.url,
      loaded: true,
      active: tab.active,
      discarded: tab.discarded,
      frozen: tab.frozen,
      hidden: tab.hidden,  // firefox only?
      incognito: tab.incognito,
      atime: tab.lastAccessed
      }, null, true);
  }

  onTabRemoved (tabId, removeInfo) {
    // tabId: number
    // removeInfo.isWindowClosing: boolean
    // removeInfo.windowId: number
    const tabNode = this.getNodeByTabId(tabId);
    // if tab doesn't exist, do nothing
    if (! tabNode) return;
    // TODO: if tab was last Node in the window and it's boring,
    //   delete the tab node...
    //   and if the window was boring too, delete it too
    // if tab closed only because its window is closing
    if (removeInfo && removeInfo.isWindowClosing) {
      // keep unloaded tab as part of the user's saved window
      return tabNode.unload({ reason: 'onWindowClosed' });
    }
    // if tab closed manually by user, but it has notes
    else if (tabNode.shouldUnloadNotDelete()) {
      // keep tab in tree to preserve its metadata
      return tabNode.unload({ reason: 'onTabRemoved' });
    }
    // if tab is boring but has kids
    else if (tabNode.hasKids()) {
      // delete the node, but keep its kids
      return tabNode.deleteSelfAndPromoteKids({ reason: 'onTabRemoved' });
    }
    // tab is a leaf node with no notes or anything interesting
    else {
      // delete boring tabs on close
      return tabNode.deleteSelf({ reason: 'onTabRemoved' });
    }
  }

  onTabActivated (windowId, tabId) {
    const windowNode = this.windows[windowId];
    if (! windowNode) {
      // FIXME: WTF, shouldn't happen, big error here
      return error(`Tree.onTabActivated() can't find windowId="${windowId}"`);
    }
    windowNode.setActiveTab(tabId, { reason: 'onTabActivated' });
  }

  onTabMoved (tabId, moveInfo) {
    // tab was moved within a window
    // tabId: number
    // moveInfo.fromIndex: number
    // moveInfo.toIndex: number
    // moveInfo.windowId: number
    // get the tabNode and winNode
    const windowNode = this.windows[moveInfo.windowId];
    if (! windowNode) {
      // FIXME: WTF, shouldn't happen, big error here
      return error(`Tree.onTabMoved() can't find windowId="${moveInfo.windowId}"`);
    }
    const tabNode = this.getNodeByTabId(tabId);
    if (! tabNode) {
      // FIXME: also shouldn't happen
      return error(`Tree.onTabMoved() can't find tabId="${tabId}"`);
    }
    // for later use
    function doTheMove(destParent, destIndex) {
      return tabNode.moveTo(destParent, destIndex, { reason: 'onTabMoved' });
    }
    // get the ordered list of tabs in this windowNode
    let tabList = windowNode.getLoadedTabs();
    if (tabList.length < 1) {
      // this happens if I drag a tab into nowhere to create a new window,
      // and it initially has no tabs
      return doTheMove(windowNode, 0);
    }
    if (moveInfo.toIndex >= tabList.length) {
      // this happens if I drag a tab into the end of another window
      //return error(`Tree.onTabMoved() not enough tabs found in windowNode`);
      let prevNode = tabList[moveInfo.toIndex - 1];
      let destParent = prevNode.parent;
      let destIndex = prevNode.indexOf() + 1;
      return doTheMove(destParent, destIndex);
    }
    // do nothing if the tab is already in the right place
    // (this probably means we initiated the tabMove operation)
    if (tabId === tabList[moveInfo.toIndex]) {
      debug('Tree.onTabMoved(): tab already at correct index');
      return;
    }
    // if moving left, things are surprisingly easy...
    // just insert immediately before the tab at the new location
    if (moveInfo.toIndex < moveInfo.fromIndex) {
      let prevNode = tabList[moveInfo.toIndex];
      let destParent = prevNode.parent;
      let destIndex = prevNode.indexOf();
      // TODO: ideally should be just after the previous tab in the tree,
      // but that's a lot harder to calculate
      return doTheMove(destParent, destIndex);
    }
    // if moving right, then move to just before the next tab
    // (Node.moveTo handles parent becoming its own child, so that's okay)
    let nextNode = tabList[moveInfo.toIndex + 1];
    if (nextNode) {
      let destParent = nextNode.parent;
      let destIndex = nextNode.indexOf();
      return doTheMove(destParent, destIndex);
    }
    else {
      // right-most tab
      let lastNode = tabList[tabList.length - 1];
      let destParent = lastNode.parent;
      let destIndex = lastNode.indexOf() + 1;
      return doTheMove(destParent, destIndex);
    }

    // old: some thoughts on how this maybe should work
    // decide on a new position:
    // - 1st child of prevTabNode
    // - 1st sibling after prevTabNode
    // - last child of prevTabNode
    // - last sibling before nextTabNode
    // - depends on Node expanded/collapsed states maybe?
    // - other (after implementing user config options for other placements)
    // cases...
    // - if prev and next are siblings, place as sibling between them
    // - if prev is leaf, place as sibling just after it
    // - if prev is ancestor of next, place this as 1st child of prev
    // - if prev is collapsed branch and next not a descendant, place as next sibling?
    // - if prev is branch, place as 1st child?
  }

  async onTabAttached (tabId, attachInfo) {
    // tabId: number
    // attachInfo.newPosition: number
    // attachInfo.newWindowId: number
    //   (may refer to a window which doesn't exist yet)
    const newIndex = attachInfo.newPosition;
    const windowId = attachInfo.newWindowId;

    // find the tab node
    const tabNode = this.getNodeByTabId(tabId);
    // if tab doesn't exist, do nothing
    if (! tabNode) return warn(`Tree.onTabAttached(${tabId}): no tab found`);

    // find or create the window node
    let windowNode;
    const found = this.root.findNodes((node) =>
      { return node.isWindow() && (node.windowId === windowId); });
    if (found.length > 0) { windowNode = found[0]; }
    else {
      const destParent = this.root;
      const destIndex = destParent.nodes.length;
      windowNode = await destParent.addChild(destIndex, {
        type: 'window',
        windowId: windowId
      }, null, true);
    }

    // now that the tab node and window node are guaranteed to exist,
    // onTabMoved() can handle the rest
    return this.onTabMoved(tabId,
      { windowId: windowId, toIndex: newIndex, fromIndex: 9999999 });
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
    if (! tabNode) return warn(`Tree.onTabUpdated(${tabId}): no tab found`);

    // if this tab was being restored, finish that process
    const savedTabNodeId = this.getSavedTabNodeId(tab, tab.url);
    if (savedTabNodeId) {
      // redirect to saved tab URL as soon as the browser allows
      if ('complete' === changeInfo.status) {
        // work around Firefox bug https://bugzilla.mozilla.org/show_bug.cgi?id=1412498
        if (isFirefox &&
          (('about:newtab' === tabNode.pendingUrl)
            || ('about:home' === tabNode.pendingUrl))
        ) tabNode.pendingUrl = 'about:blank';
        // send tab to the correct URL
        api.tabs.update(tab.id, { url: tabNode.pendingUrl });
        // prevent possible infinite loop
        tabNode.pendingUrl = undefined;
      }
      // don't send updates to Node while saved tab is being redirected
      // (this eats the 'loading' and 'complete' events)
      return;
    }

    // change ... multiple things
    let changes = {};  // only changes we care about
    for (const field of
      ['title', 'url', 'favIconUrl',
        'discarded', 'frozen', 'hidden']) {
      if (undefined !== changeInfo[field]) {
        // if data actually changed, add it to the outgoing message
        if (tabNode[field] !== changeInfo[field])
          changes[field] = changeInfo[field];
      }
    }
    // apply changes, if any
    if (Object.keys(changes).length > 0) {
      return tabNode.setTabFields(changes, { reason: 'onTabUpdated' });
    }
  }

  onTabReplaced (addedTabId, removedTabId) {
    // "Fired when a tab is replaced with another tab due to prerendering or instant."
    // addedTabId: number
    // removedTabId: number
    debug(`Tree.onTabReplaced(addedTabId=${addedTabId}, removedTabId=${removedTabId})`);
    // I don't even know how to make this event happen...
    // ... and apparently it doesn't happen at all in some browsers ...
    // so the code here is untested
    const tabNode = this.getNodeByTabId(removedTabId);

    // if tab doesn't exist, do nothing
    if (! tabNode) return warn(`Tree.onTabReplaced(${removedTabId}): no tab found`);

    // it's like a onTabUpdated(), but only the tabId changes?
    const changes = { 'tabId': addedTabId };
    return tabNode.setTabFields(changes, { reason: 'onTabReplaced' });
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

    msg.reason = 'tree_nodeDeleted';

    //return await node.deleteSelf(msg);
    let result;
    try {
      result = await node.deleteSelf(msg);
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
    msg.reason = 'tree_nodeMoved';
    return node.moveTo(destParent, destIndex, msg);
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

    // while syncing between threads,
    // tell handlers not to emit this event again
    msg.reason = 'tree_nodeChanged';

    // figure out what kind of change happened, and update it
    if ('setExpanded' === changeType) {
      return node.setExpanded(msg.expanded, msg);
    }
    else if ('setNote' === changeType) {
      return node.setNote(msg.note, msg.longNote, msg);
    }
    else if ('setTabFields' === changeType) {
      return node.setTabFields(msg.changes, msg);
    }
    else if ('setMarked' === changeType) {
      return node.setMarked(msg.marked, msg);
    }
    else if ('setActive' === changeType) {
      return node.setActive(msg.active, msg);
    }
    else if ('load' === changeType) {
      return node.load(msg);
    }
    else if ('unload' === changeType) {
      return node.unload(msg);
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
    msg.reason = 'tree_windowClosed';
    return await node.windowClosed(msg);
  }

}

function isNewTabPage (url) {
  const prefixes = [
    // firefox, librewolf, ...
    'about:newtab',
    'about:blank',
    'about:home',
    'about://newtab',
    'about://blank',
    'about://home',
    // chrome, chromium, ...
    'chrome://newtab',
    // edge
    'edge://newtab',
    'edge://new-tab-page'
  ];
  for (const prefix of prefixes)
    if (url.startsWith(prefix)) return true;
  return false;
}

