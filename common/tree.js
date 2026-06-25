// common/tree.js: Tree class
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: AGPL-3.0-or-later

"use strict";
import {
  api, isChrome, isFirefox,
  isEdge, isBrave, isVivaldi, isMaxthon, isZenBrowser
} from '/api.js';

import {
  log, debug, warn, error, emit,
  jsonSchema, dateTupleStrings, isNewTabPage
} from '/common/common.js';
import { Node } from '/common/node.js';
import { Mutex } from '/common/mutex.js';
import { Config } from '/common/config.js';


export class Tree {

  constructor (NodeClass) {
    if (undefined === NodeClass) NodeClass = Node;
    this.NodeClass = NodeClass;

    this.treeLoaded = new Promise(resolve => {
      this.resolveTreeLoaded = resolve;
    });

    this.onTabCreatedMutex = new Mutex();
    this.onTabReplacedMutex = new Mutex();

    // don't run more than one backup simultaneously
    this.localBackupInProgress = false;

    this.markedNodes = [];

    // holds tabIds of "tabs" we need to ignore,
    // like Vivaldi panels
    this.tabBlacklist = {};

    this.cfg = new Config();
    this.cfgDefaults = {
      clientId: null,
      humanFriendlyBackups: false,
      localBackupLastTimeCompleted: 0,
      hideCollapsedTabs: false,
      hideCollapsedTabGroups: true,
      pinnedTabsOpenNewTabsPinnedToo: false,
      convertFromWindowWhenDroppedIntoWindow: true,
    };

    this.createRootNode();

    // fields to copy when serializing Nodes to/from dict
    this.dictable = [
      'id',
      'type',
      'windowId',
      'tabId',
      'label',
      'note',
      'title',
      'url',
      'bookmark',
      'faviconUrl',
      'expanded',
      'loaded',
      'wasLoaded',
      'active',
      'marked',
      'checkbox',
      'checkboxPx',
      'ctime',
      'mtime',
      'atime',
      'geometry',
      'windowState',
      'incognito',
      'discarded',
      'frozen',
      'hidden',
    ];

    // TODO: make user-configurable
    this.checkboxTodoType = ' ';
    this.checkboxHalfDoneType = '+';
    this.checkboxDoneType = 'X';
    // map because a plain object gets confused about order
    // when some of the keys look like numbers
    this.checkboxClasses = new Map();
    for (const [key, value] of [
      [' ', 'todo'],
      ['-', 'todo'],
      ['+', 'half-done'],
      ['=', 'half-done'],
      ['%', 'percent'],
      ['/', 'ratio'],
      ['X', 'done'],
      ['*', 'done'],
      ['F', 'fail'],
      ['S', 'skip'],
      ['C', 'skip'],
      ['O', 'other'],
      ['!', 'important'],
      ['?', 'unknown'],
      //['0': 'n0'],
      ['1', 'n1'],
      ['2', 'n2'],
      ['3', 'n3'],
      ['4', 'n4'],
      ['5', 'n5'],
      ['6', 'n6'],
      ['7', 'n7'],
      ['8', 'n8'],
      ['9', 'n9'],
    ]) {
      this.checkboxClasses.set(key, value);
    }
  }

  destroy () {
  }

  async init () {
    if (this.bkgd) {
      // prevent tab reorder storms
      this.tabReorderMutex = new Mutex();

      if (isFirefox)
        this.cfg.watch('hideCollapsedTabs',
          this.onHideCollapsedTabsChanged.bind(this), 1000);
    }
    await this.cfg.init(this.cfgDefaults);
    this.initListeners();
  }

  initListeners () {
    if (this.isInert) return;  // detached trees shouldn't listen

    // only process one message at a time
    this.onMessageMutex = new Mutex();
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

  async unmarkAll (args) {
    //debug('Tree.unmarkAll()');
    // iterate over a copy of the array,
    // since the original will be modified while iterating
    for (const nodeId of this.markedNodes.slice()) {
      const node = this.nodes[nodeId];
      //debug(`unmarking "${nodeId}"`);
      await node.setMarked(false, args);
    }
  }

  async newNodeId () {
    const nextId = await emit('bkgd_newNodeId');
    //debug('Tree.newNodeId():', nextId);
    return nextId;
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
    // tree is ready to use
    debug('Tree.resolveTreeLoaded()');
    this.resolveTreeLoaded();  // let listeners know the tree is loaded
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
          if (['tabId', 'oldTabId', 'windowId', 'marked'].includes(k))
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
      warn(`rebuildNodeFromSerializedHash(): no nodeId "${node.id}"`);
      return 1;
    }
    //debug('nodeDict()', nodeDict);

    // update caches
    this.nodes[node.id] = node;
    // build the node
    node.fromDict(nodeDict);
    this.nodeMarkChanged(node);  // update our mark cache
    node.nodes = [];
    numLoaded ++;
    for (const nodeId of nodeDict.nodes) {
      if ('root' === nodeId) continue;  // root can't be a child
      //debug('nodeDict() childId', nodeId);
      const child = new this.NodeClass(this, node);
      child.id = nodeId;
      this.nodes[nodeId] = child;
      node.nodes.push(child);
      numLoaded += this.rebuildNodeFromSerializedHash(child, hash);
    }
    return numLoaded;
  }

  makeBackupObject (rootNode, when) {
    const obj = {};
    // TODO: actually write and publish the schema file
    obj.$schema = jsonSchema;
    if (undefined === when) when = Date.now();
    obj.metadata = {};
    obj.metadata.exportDate = Number(when);
    obj.metadata.sessionStartDate = Number(rootNode.ctime);
    // attach the client ID
    let clientId = this.cfg.clientId;
    if (! clientId) clientId = '??';
    obj.metadata.clientId = clientId;
    // attach the actual tree / node data
    obj.nodes = this.serializeNodes(true);
    return obj;
  }

  async downloadBackupNow () {
    // abort if backup already running
    if (this.localBackupInProgress) return;
    this.localBackupInProgress = true;

    await this.treeLoaded;  // wait until tree is ready

    const when = new Date();
    // determine whether to pretty-print the data
    const prettyPrint = this.cfg.humanFriendlyBackups ? 2 : 0;
    // generate the file's raw data
    const backup = this.makeBackupObject(this.root, when);
    const jsonString = JSON.stringify(backup, null, prettyPrint);
    const blob = new Blob([jsonString], { type: "application/json" });
    // generate the URL to download
    let url;
    if ((! this.bkgd) || (isFirefox)) {
      // simple, but only works in Firefox or in views (like the sidepanel)
      url = URL.createObjectURL(blob);
    }
    else {
      // more complex, but works in Chrome service workers:
      const buffer = await blob.arrayBuffer();
      // hello, stack overflow:
      //const base64String = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      // avoid a stack overflow:
      const binaryString = new Uint8Array(buffer)
        .reduce((acc, byte) => acc + String.fromCharCode(byte), "");
      const base64String = btoa(binaryString);
      url = `data:application/json;base64,${base64String}`;
    }
    // build a filename
    const clientId = backup.metadata.clientId;
    const date = dateTupleStrings(when);
    const filenameRequested = `tktsto.${date[0]}-${date[1]}-${date[2]}_${date[3]}-${date[4]}-${date[5]}.${clientId}.json`;
    let filename = filenameRequested;

    // save the file
    log(`downloadBackupNow(): saving to "${filename}"`);
    const downloading = api.downloads.download({
      url: url,
      filename: filename,
      saveAs: false
    });
    let downloadId;
    const onStarted = (id) => { downloadId = id; };
    const onProgress = (delta) => {
      //debug('Download delta', delta);
      if (delta.id !== downloadId) return;
      // filename changed
      if (delta.filename?.current) {
        // "/foo/baz.txt" or "C:\foo\baz.txt" -> "baz.txt"
        filename = delta.filename.current.split(/[/\\]+/).pop();
        if (filenameRequested !== filename)
          log(`downloadBackupNow(): filename changed to "${filename}" from "${filenameRequested}"`);
      }
      // download succeeded
      if ('complete' === delta.state?.current) {
        //log(`downloadBackupNow(): Download succeeded: ${filename}`);
        api.downloads.onChanged.removeListener(onProgress);
        this.cfg.set('localBackupLastTimeCompleted', Date.now());
        this.localBackupInProgress = false;
        if (this.setStatus)
          this.setStatus(`Saved ${blob.size} bytes to "${filename}"`);
        try {
          // docs recommend cleaning this up
          // but docs also say this is unavailable in service workers
          // so ... do it when possible, and ignore errors otherwise
          URL.revokeObjectURL(url);
        } catch (err) { }
      } else if (
        (!!delta.error?.current) || ('interrupted' === delta.state?.current)
      ) {
        onFailed(delta.error?.current || 'Download was interrupted');
      }
    };
    const onFailed = (err) => {
      warn(`downloadBackupNow(): Download failed: ${err}`);
      api.downloads.onChanged.removeListener(onProgress);
      this.localBackupInProgress = false;
    };
    api.downloads.onChanged.addListener(onProgress);
    downloading.then(onStarted, onFailed);
  }

  getNodeByTabId (tabId, root)  {
    // TODO: maybe move this function to Node.getNodeByTabId() ?
    if (! root) root = this.root;
    const found = root.findNodes((node) =>
      { return ((node.tabId === tabId) || (node.oldTabId === tabId));}
    );
    if (1 === found.length) return found[0];
    if (1 > found.length) return null;
    warn(`Tree.getNodeByTabId(${tabId}) found ${found.length} matches, not 1`,
      found);
    // fix the errors we found, by unsetting duplicate tabIds
    for (const dupe of found.slice(1)) {
      if (dupe.tabId === tabId)
        dupe.unload({ reason: 'badTabId' });
    }
    // FIXME: prefer matching tabId over oldTabId
    return found[0];
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

  async onWindowCreated (window, args) {
    // are we re-opening a saved window?
    let savedWindowNode;
    if (this.bkgd.windowsLoading.length > 0) {
      savedWindowNode = this.bkgd.windowsLoading.shift();
      debug(`Tree.onWindowCreated() loadingSavedWindow=${savedWindowNode.id}`);
    }
    // if nothing in the queue, try searching by window ID
    // TODO: unsure if this ever actually happens
    if ((! savedWindowNode)
      // special case: Firefox restarted, windowId=1, but not same window
      && ('mergeOpenWindowsIntoTree' !== args.reason)
    ) {
      const found = this.root.findNodes((node) =>
        { return node.isWindow() && (node.windowId === window.id); });
      if (found.length > 0) {
        debug('Tree.onWindowCreated() found window', found[0]);
        savedWindowNode = found[0];
      }
    }
    // are we re-opening a saved window?
    if (savedWindowNode) {
      await savedWindowNode.setTabFields({
        type: 'window',
        windowId: window.id,
        loaded: true,
        windowState: window.state,
        incognito: window.incognito,
        geometry: [window.width, window.height, window.left, window.top]
      }, { reason: args.reason });
      // in case a parent tab with child tabs has *already* been moved
      // to this window (which caused the window to be created),
      // reorder the tabs to pull in the child tabs
      await savedWindowNode.reorderAllTabsInThisWindow();
      return savedWindowNode;
    }

    // otherwise, create a new node for this window
    const destParent = this.root;
    // TODO: maybe insert at beginning instead of end?
    //       (or after current window, in same parent?)
    const destIndex = this.root.nodes.length;
    // TODO: handle window types: normal, panel, pop-up?, ...
    const newNode = await destParent.addChild(destIndex, {
      type: 'window',
      windowId: window.id,
      loaded: true,
      windowState: window.state,
      incognito: window.incognito,
      geometry: [window.width, window.height, window.left, window.top]
    }, { reason: args.reason });
    debug('Tree.onWindowCreated() new window node', newNode);
    return newNode;
  }

  async onWindowBoundsChanged(win, winNode = null) {
    if (! winNode) winNode = this.root.getWindowId(win.id);
    // no node = no problem, because a non-browser window may be focused
    if (! winNode) return;

    function arraysEqual(a, b) {
      if ((!a) || (!b)) return false;
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) return false; }
      return true;
    }

    // update the window geometry and stuff
    const changes = {};
    if (win.width && win.height) {
      const geometry = [ win.width, win.height, win.left, win.top ];
      if (! arraysEqual(geometry, winNode.geometry))
        changes.geometry = geometry;
    }
    if ((undefined !== win.state)
      && (win.state !== winNode.windowState))
      changes.windowState = win.state;
    if ((undefined !== win.incognito)
      && (win.incognito !== winNode.incognito))
      changes.incognito = win.incognito;
    if (0 === Object.keys(changes).length) return;  // abort if no changes
    await winNode.setTabFields(changes, { reason: 'onWindowBoundsChanged' });
  }

  async checkIfVivaldiPanel (tab) {
    // TODO: figure out how to detect Vivaldi
    //if (! isVivaldi) return false;
    // Most browsers don't have this problem
    if (isFirefox) return false;
    if (isBrave) return false;
    if (isMaxthon) return false;
    // cache results
    if (this.tabBlacklist[`${tab.id}`]) { return true; }
    // cache miss, check the long way
    const winTabList = await api.tabs.query({ windowId: tab.windowId });
    // Vivaldi lists tab.windowId as this window,
    // but doesn't list tab.id in this window's tabs.
    const found = winTabList.some(t => t.id === tab.id);
    if (! found) {
      // Vivaldi puts sidePanel "tabs" after the regular tabs
      //if (tab.index >= winTabList.length) {
      this.tabBlacklist[`${tab.id}`] = true;
      debug('ignoring tab which looks like a Vivaldi panel', tab);
      // TODO: this.cfg.set('isVivaldi', true);
      return true;
    }
    return false;
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

    const unlock = await this.onTabCreatedMutex.lock();
    try {

      // Zen Browser is fucked
      if (isZenBrowser) {
        const oldIndex = tab.index;
        const tabArray = await api.tabs.query( { windowId: tab.windowId });
        const zeroIndex = tabArray[0].index;
        const newIndex = oldIndex - zeroIndex;
        debug(`onTabCreated(): Zen tab.index ${oldIndex} - ${zeroIndex} => ${newIndex}`);
        tab.index = newIndex;
        if (oldIndex < zeroIndex) {
          debug(`onTabCreated(): ignoring Zen non-tab`);
        }
      }

      // if tab was already created, do nothing
      const tabNode = this.getNodeByTabId(tab.id);
      if (tabNode) return debug(`Tree.onTabCreated(${tab.id}): already exists`);

      // detect if it's a Vivaldi sidePanel, and ignore it
      if (isChrome) {
        if (await this.checkIfVivaldiPanel(tab)) return;
      }

      // figure out which URL this new tab is going to
      const tabPendingUrl = this.getTabPendingUrl(tab);

      // are we loading a saved tab?
      let savedTabNode;
      if (this.bkgd && (this.bkgd.nodesLoading.length > 0)) {
        savedTabNode = this.bkgd.nodesLoading.shift();
        debug(`Tree.onTabCreated() loadingSavedTab: ${savedTabNode.toLine()}`,
          savedTabNode, tab, [...this.bkgd.nodesLoading]);
        if ((this.bkgd.nodesLoading.length <= 0) && this.bkgd.nodesLoadingMutexUnlock)
          this.bkgd.nodesLoadingMutexUnlock();
      }
      else {
        debug(`Tree.onTabCreated() new tab: ${tab.id}`, tab);
      }

      // if we're loading a saved tab,
      // use that node instead of making a new one
      if (savedTabNode) {
        debug(`Tree.onTabCreated() restoring node: ${savedTabNode.toLine()}`, savedTabNode);
        // re-attach this tab to the found Node
        await savedTabNode.setTabFields({
          tabId: tab.id,
          loaded: true,
          discarded: tab.discarded,
          frozen: tab.frozen,
          hidden: tab.hidden,
          incognito: tab.incognito
        }, { reason: 'onTabCreated' });
        // put the tab in the right position
        await savedTabNode.reorderAllTabsInThisWindow();
        return;
      }

      // find the window Node
      let winNode = this.root.getWindowId(tab.windowId);
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
          }, { reason: 'onTabCreated' });
      }
      let destParent = winNode;
      let destIndex = winNode.nodes.length;

      // find the active tab so we can compare to the new tab
      // (some browsers (Maxthon) set tab.index *instead of* tab.openerTabId,
      //  so detecting parent must be done by index in those browsers)
      // FIXME: ensure activeTab and activeTabNode are the same tab
      // (activeTabNode can be null on rare occasions, not sure how)
      // activeTabNode is what was active *before* new tab was created
      const activeTabNode = winNode.getActiveTab();
      const loadedTabNodes = winNode.getLoadedTabs();
      const activeTabs = await api.tabs.query({
        active: true, windowId: tab.windowId });
      const activeTab = activeTabs[0];
      //debug(`Tree.onTabCreated(): new tab is ${tab.index+1} of ${loadedTabNodes.length}`);

      // Zen opens "New Tab" at the far left for some reason
      if (isZenBrowser && (0 === tab.index) && activeTab) {
        // place it as 1st child of focused tab
        tab.index = activeTab.index + 1;
      }

      // if the active tab is pinned, open just after the "Pinned" area
      if (activeTabNode?.isPinned()
        && (! this.cfg.pinnedTabsOpenNewTabsPinnedToo)
      ) {
        debug(`Tree.onTabCreated(active = pinned): moving new tab outside Pinned area`);
        destParent = winNode;
        destIndex = 1;
      }
      // if the tab is a blank created by the user with C-t...
      // ... make it the 1st child of the active tab
      else if (isNewTabPage(tabPendingUrl)) {
        destParent = activeTabNode;
        if (destParent) {
          destIndex = 0;
          debug(`Tree.onTabCreated(newTabPage) moving to the right of: "${destParent.toLine()}"`);
        }
        else {
          destParent = winNode;
          // don't take place of "Pinned"
          if (winNode.nodes[0]?.isPinnedBranch()) destIndex = 1;
          debug(`Tree.onTabCreated(newTabPage) new tab in window: "${destParent.toLine()}"`);
        }
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
          debug(`Tree.onTabCreated(openerTabId): destParent:`, destParent);
        }
        else {
          // if parent not found, open tab as 1st child of current/active tab
          if (activeTabNode) {
            destParent = activeTabNode;
            destIndex = 0;
            debug(`Tree.onTabCreated(openerTabId not found): destParent:`, destParent);
          }
        }
      }
      // Maxthon doesn't set openerTabId, so detect it by index
      else if ((activeTab.index + 1) === tab.index) {
        // first child of current tab
        // (assume user clicked a link on the current page, to open a new tab)
        destParent = activeTabNode;
        if (! destParent) destParent = winNode;
        destIndex = 0;
        debug(`Tree.onTabCreated(parentByIndex) moving new tab to the right of: "${destParent.toLine()}"`);
      }
      // if a tab is opened at the far right edge, claim it
      else if (tab.index >= loadedTabNodes.length) {
        // become first child of current tab
        destParent = activeTabNode;
        if (! destParent) destParent = winNode;
        destIndex = 0;
        debug(`Tree.onTabCreated(farRightCapture) moving new tab to the right of: "${destParent.toLine()}"`);
      }
      // if a tab is otherwise opened in the middle somewhere,
      // like with "restore last closed tab" in browser
      else if (undefined !== tab.index) {
        if (0 === tab.index) destParent = winNode;
        else destParent = loadedTabNodes[tab.index - 1];
        destIndex = 0;
        debug(`Tree.onTabCreated(tabIndex) new tab is first child of: "${destParent.toLine()}"`);
      }
      // unsure how a tab would have no index, but note it
      else {
        debug('Tree.onTabCreated(default) not moving new tab');
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
        }, { reason: 'onTabCreated' });
    }
    finally { unlock(); }
  }

  async onTabRemoved (tabId, removeInfo) {
    // tabId: number
    // removeInfo.isWindowClosing: boolean
    // removeInfo.windowId: number
    debug(`tree.onTabRemoved(tabId=${tabId}, windowId=${removeInfo.windowId}, isWindowClosing=${removeInfo.isWindowClosing})`);
    const tabNode = this.getNodeByTabId(tabId);
    // if tab doesn't exist, do nothing
    if (! tabNode) {
      log(`onTabRemoved(${tabId}): couldn't find node`, removeInfo);
      return;
    }
    // TODO: if tab was last Node in the window and it's boring,
    //   delete the tab node...
    //   and if the window was boring too, delete it too

    //debug('tabNode', {...tabNode});

    // if tab unloaded manually by user, and we're just cleaning up
    // (without tabClosedReason, it's likely the user closed the tab
    //  and caused a new service worker to spawn)
    if ('unload' === tabNode.tabClosedReason) {
      // finalize the unload now that the browser tab is actually closed
      await tabNode.unload({ reason: 'onTabRemoved', detail: 'manualUnload' });
    }
    // if tab closed only because its window is closing
    else if (removeInfo && removeInfo.isWindowClosing) {
      // special case: Firefox closing last boring tab in a boring window
      if (isFirefox) {
        const winNode = tabNode.getWindowNode();
        if (winNode) {
          const numKids = winNode.countNodes();
          // last node in a boring window is a boring tab
          if ((1 === numKids)
            && (! winNode.shouldUnloadNotDelete())
            && (! tabNode.shouldUnloadNotDelete())
          ) {
            await tabNode.deleteSelf({ reason: 'onTabRemoved', detail: 'boringFinalLeafInBoringWindow' });
            return;
          }
        }
      }
      // keep unloaded tab as part of the user's saved window
      await tabNode.unload({ reason: 'onWindowRemoved', detail: 'saveWindow' });
    }
    // if tab closed manually by user, but it has label/notes
    else if (tabNode.shouldUnloadNotDelete()) {
      // keep tab in tree to preserve its metadata
      await tabNode.unload({ reason: 'onTabRemoved', detail: 'hasMetadata' });
    }
    // if tab is boring but has kids
    else if (tabNode.hasKids()) {
      // delete the node, but keep its kids
      await tabNode.deleteSelfAndPromoteKids({ reason: 'onTabRemoved', detail: 'hasKids' });
    }
    // tab is a leaf node with no label or anything interesting
    else {
      // delete boring tabs on close
      await tabNode.deleteSelf({ reason: 'onTabRemoved', detail: 'boringLeaf' });
    }
    delete tabNode['tabClosedReason'];  // message received, reset it
  }

  async onTabActivated (windowId, tabId) {
    // do everything we can to find the correct tab and window nodes...
    // ... but if that fails, it's almost certainly not an issue
    // (because for some reason, browsers like Vivaldi fire off this event
    //  after the tab and window are already closed, so there's nothing to do)
    let windowNode = this.root.getWindowId(windowId);
    // look up by tabId if windowId failed
    if (! windowNode) {
      const tabNode = this.getNodeByTabId(tabId);
      if (tabNode) { windowNode = tabNode.getWindowNode(); }
      //debug(`Tree.onTabActivated(${windowId}, ${tabId}):`, windowNode, tabNode);
    }
    let tries = 5;
    while ((! windowNode) && (tries > 0)) {
      // can happen when loading saved tab in saved window,
      // because onWindowCreated doesn't happen until
      // after the onTabActivated event for the first tab
      debug(`Tree.onTabActivated() waiting for windowId="${windowId}"`);
      tries --;
      // wait a few ms
      await new Promise(resolve => setTimeout(resolve, 10));
      windowNode = this.root.getWindowId(windowId);
    }
    if (! windowNode) {
      if (this.bkgd && (this.bkgd.windowsLoading.length > 0))
        return;  // not an error, just a browser quirk
      // probably not an error
      return log(`Tree.onTabActivated() can't find windowId="${windowId}"`);
    }
    await windowNode.setActiveTab({ reason: 'onTabActivated' });
  }

  async onTabMoved (tabId, moveInfo) {
    // tab was moved within a window
    // tabId: number
    // moveInfo.fromIndex: number
    // moveInfo.toIndex: number
    // moveInfo.windowId: number
    // get the tabNode and winNode

    // Zen Browser is fucked
    let zeroIndex = 0;
    if (isZenBrowser) {
      const tabArray = await api.tabs.query( { windowId: moveInfo.windowId });
      zeroIndex = tabArray[0].index;
      moveInfo.fromIndex -= zeroIndex;
      moveInfo.toIndex -= zeroIndex;
    }

    const windowNode = this.root.getWindowId(moveInfo.windowId);
    if (! windowNode) {
      // FIXME: WTF, shouldn't happen, big error here
      return error(`Tree.onTabMoved() can't find windowId="${moveInfo.windowId}"`);
    }
    const tabNode = this.getNodeByTabId(tabId);
    debug(`Tree.onTabMoved(): ${tabNode?.toLine()}`);
    if (! tabNode) {
      // FIXME: also shouldn't happen
      return error(`Tree.onTabMoved() can't find tabId="${tabId}"`);
    }
    // for later use
    async function doTheMove(destParent, destIndex) {
      return await tabNode.moveTo(destParent, destIndex, { reason: 'onTabMoved' });
    }
    // get the ordered list of tabs in this windowNode
    let tabList = windowNode.getLoadedTabs();
    if (tabList.length < 1) {
      // this happens if I drag a tab into nowhere to create a new window,
      // and it initially has no tabs
      debug('Tree.onTabMoved(): new window?', moveInfo.fromIndex, moveInfo.toIndex);
      return await doTheMove(windowNode, 0);
    }
    if (moveInfo.toIndex >= tabList.length) {
      // this happens if I drag a tab into the end of another window
      //return error(`Tree.onTabMoved() not enough tabs found in windowNode`);
      let prevNode = tabList[moveInfo.toIndex - 1];
      let destParent = prevNode.parent;
      let destIndex = prevNode.indexOf() + 1;
      debug('Tree.onTabMoved(): past end of window', moveInfo.fromIndex, moveInfo.toIndex);
      return await doTheMove(destParent, destIndex);
    }
    // do nothing if the tab is already in the right place
    // (this probably means we initiated the tabMove operation)
    if (tabNode === tabList[moveInfo.toIndex]) {
      debug('Tree.onTabMoved(): tab already at correct index', moveInfo.fromIndex, moveInfo.toIndex);
      return;
    }
    // if pinned status changed, gotta handle things specially
    const fromWasPinned = tabList[moveInfo.fromIndex].isPinned();
    const toWasPinned = tabList[moveInfo.toIndex].isPinned();
    if (fromWasPinned != toWasPinned) {
      debug('Tree.onTabMoved() ignored (side effect of "pinned" change)',
        moveInfo.fromIndex, moveInfo.toIndex);
      return;
    }
    // FIXME: if pinned tab moved to right edge of pin area,
    // it gets unpinned by the "move right" algorithm
    // (need to rewrite the entire event handling system,
    //  to group batches of events together and analyze them
    //  to infer the actual user intent,
    //  instead of guessing based on the first event)

    // if moving left, things are surprisingly easy...
    // just insert immediately before the tab at the new location
    if (moveInfo.toIndex < moveInfo.fromIndex) {
      let prevNode = tabList[moveInfo.toIndex];
      let destParent = prevNode.parent;
      let destIndex = prevNode.indexOf();
      // must handle special case of far left edge, to allow pinning to work
      if (0 === moveInfo.toIndex) {
        destParent = windowNode;
        destIndex = 0;
        const firstNode = windowNode.nodes[0];
        if (firstNode.isPinnedBranch()) {
          destParent = firstNode;
          destIndex = 0;
        }
      }
      // TODO: ideally should be just after the previous tab in the tree,
      // but that's a lot harder to calculate
      debug('Tree.onTabMoved(): moving left', moveInfo.fromIndex, moveInfo.toIndex);
      return await doTheMove(destParent, destIndex);
    }
    // if moving right, then move to just before the next tab
    // (Node.moveTo handles parent becoming its own child, so that's okay)
    let nextNode = tabList[moveInfo.toIndex + 1];
    if (nextNode) {
      debug('Tree.onTabMoved(): moving right', moveInfo.fromIndex, moveInfo.toIndex);
      let destParent = nextNode.parent;
      let destIndex = nextNode.indexOf();
      debug('Tree.onTabMoved(): moving right', destParent.toLine(), destIndex);
      return await doTheMove(destParent, destIndex);
    }
    else {
      // right-most tab
      let lastNode = tabList[tabList.length - 1];
      let destParent = lastNode.parent;
      let destIndex = lastNode.indexOf() + 1;
      debug('Tree.onTabMoved(): right-most tab', moveInfo.fromIndex, moveInfo.toIndex);
      return await doTheMove(destParent, destIndex);
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

    // Zen Browser is fucked
    if (isZenBrowser) {
      debug(`Tree.onTabAttached(Zen, ${tabId})`, attachInfo);
      let tabArray = await api.tabs.query(
          { windowId: attachInfo.newWindowId });
      // attached to new window which doesn't exist yet
      // (needs a moment to spawn the window)
      if ((! tabArray) || (0 >= tabArray.length)) {
        debug(`Tree.onTabAttached(Zen): retrying`);
        // delay is probably unnecessary, since await above already waited
        await new Promise(r => setTimeout(r, 10));  // wait 10ms
        tabArray = await api.tabs.query(
          { windowId: attachInfo.newWindowId });
      }
      if (tabArray.length > 0) {
        const zeroIndex = tabArray[0].index;
        attachInfo.newPosition -= zeroIndex;
        debug(`Tree.onTabAttached(Zen) => index=${attachInfo.newPosition}`);
      }
    }

    const newIndex = attachInfo.newPosition;
    const windowId = attachInfo.newWindowId;

    debug(`Tree.onTabAttached(tabId=${tabId}) -> windowId=${windowId}, index=${newIndex}`);

    // find the tab node
    const tabNode = this.getNodeByTabId(tabId);
    // if tab doesn't exist, do nothing
    if (! tabNode) return warn(`Tree.onTabAttached(${tabId}): no tab found`);

    // find or create the window node
    let windowNode;
    const found = this.root.findNodes((node) =>
      { return node.isWindow() && (node.windowId === windowId); });
    if (found.length > 0) { windowNode = found[0]; }
    // when moving a loaded tab to an unloaded window,
    // the browser does onTabAttached before onWindowCreated
    // so we have to handle part of that process here
    else if (this.bkgd.windowsLoading.length > 0) {
      windowNode = this.bkgd.windowsLoading[0];
      windowNode.windowId = windowId;
    }
    // otherwise, create a new window node
    else {
      const destParent = this.root;
      const destIndex = destParent.nodes.length;
      windowNode = await destParent.addChild(destIndex, {
        type: 'window',
        windowId: windowId
      }, { reason: 'onTabAttached' });
      // this happens if I drag a tab into nowhere to create a new window,
      // and it initially has no tabs
      debug('Tree.onTabAttached(new window)');
      // is handled below
      //await tabNode.moveTo(windowNode, 0, { reason: 'onTabAttached' });
      //return;
    }

    // get the ordered list of tabs in this windowNode
    let tabList = windowNode.getLoadedTabs();
    let destParent;
    let destIndex;
    let skip = false;
    // already moved internally
    // (like, user moved it in the tree view, and the browser is catching up)
    if (tabNode === tabList[newIndex]) {
      debug('Tree.onTabAttached(): already correct:', tabNode.toLine());
      skip = true;
    }
    // empty window
    else if (0 === tabList.length) {
      destParent = windowNode;
      destIndex = 0;
    }
    // right-most tab
    else if (newIndex >= tabList.length) {
      const lastNode = tabList[tabList.length - 1];
      destParent = lastNode.parent;
      destIndex = lastNode.indexOf() + 1;
    }
    // middle or first tab
    else {
      const nextNode = tabList[newIndex];
      destParent = nextNode.parent;
      destIndex = nextNode.indexOf();
    }
    if (! skip) {
      debug('Tree.onTabAttached(): moving', tabNode.toLine(), destParent.toLine(), destIndex);
      await tabNode.moveTo(destParent, destIndex, { reason: 'onTabAttached' });
    }

    // ensure only one tab is 'active'
    debug(`onTabAttached(): active tab: auto`);
    await windowNode.setActiveTab({ reason: 'onTabAttached' });
  }

  async onTabUpdated (tabId, changeInfo, tab) {
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
    debug(`Tree.onTabUpdated(tabId=${tabId})`, changeInfo, tab);

    // dammit, Zen Browser
    if (tabId < 0) {
      debug(`Tree.onTabUpdated(${tabId}): ignoring non-tab (Zen Browser?)`);
      return;
    }

    // wait, if a tab is currently being created or replaced
    const otcUnlock = await this.onTabCreatedMutex.lock();  otcUnlock();
    const otrUnlock = await this.onTabReplacedMutex.lock();  otrUnlock();
    const nlUnlock = await this.bkgd.nodesLoadingMutex.lock();  nlUnlock();

    // detect if it's a Vivaldi sidePanel, and ignore it
    if (isChrome) {
      if (await this.checkIfVivaldiPanel(tab)) return;
    }

    const tabNode = this.getNodeByTabId(tabId);

    // Brave likes to unpin tabs before closing a window,
    // so detect that and ignore it if it happens
    if (tabNode && (false === changeInfo.pinned)) {
      // in my testing, the onTabRemoved({ isWindowClosing: true })
      // comes about 20ms after onTabUpdated({ pinned: false })
      debug('waiting to see if unpin is real or isWindowClosing');
      await new Promise(r => setTimeout(r, 50));  // wait 50ms
      if (! tabNode.isLoaded()) return;
    }

    // if tab doesn't exist, create a node for it
    if (! tabNode) {
      warn(`Tree.onTabUpdated(${tabId}): no tab found`);
      return await this.onTabCreated(tab);
    }
    else {
      debug(`Tree.onTabUpdated(${tabId}): ${tabNode.toLine()}`,
        tabNode, changeInfo);
    }

    // change ... multiple things
    let changes = {};  // only changes we care about
    for (const field of
      ['title', 'url', 'favIconUrl',
        'discarded', 'frozen', 'hidden']
    ) {
      // bugfix: sometimes Vivaldi gives me empty changeInfo,
      // so pull new values from tab object if necessary
      let value = changeInfo[field];
      if (undefined === value) value = tab[field];
      // clean up sloppy titles
      if ('title' === field) value = value.trim().replace(/\s+/g, ' ');
      // if data actually changed, add it to the outgoing message
      if (tabNode[field] !== value) changes[field] = value;
    }
    // apply changes, if any
    if (Object.keys(changes).length > 0) {
      await tabNode.setTabFields(changes, { reason: 'onTabUpdated' });
    }

    // pinned tabs need special care, because they also *move*
    // ... and handling that can be complicated
    if (undefined !== changeInfo.pinned) {
      await tabNode.setPinned(changeInfo.pinned, { reason: 'onTabUpdated' });
    }
  }

  async onTabReplaced (addedTabId, removedTabId) {
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

    const unlock = await this.onTabReplacedMutex.lock();
    try {
      // get the actual tab, to check if anything else changed
      const tab = await api.tabs.get(addedTabId);
      if (tab) {
        // check for other changes too
        for (const field of
          ['title', 'url', 'favIconUrl',
            'discarded', 'frozen', 'hidden']
        ) {
          let value = tab[field];
          // clean up sloppy titles
          if ('title' === field) value = value.trim().replace(/\s+/g, ' ');
          // if data actually changed, add it to the outgoing message
          if (tabNode[field] !== value) changes[field] = value;
        }
      }
      await tabNode.setTabFields(changes, { reason: 'onTabReplaced' });
    }
    finally { unlock(); }
  }

  async onMessage (msg, sender, sendResponse) {
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
      const unlock = await this.onMessageMutex.lock();
      try {
        await handler.bind(this)(msg, sender, sendResponse);
      }
      finally { unlock(); }
      // FIXME: on sync error, tree should set an error state
      //   which can be exposed to the user to let them know they should
      //   reload the view or whatever...
      //   ... or perhaps it should automatically reload the whole tree
      //   any time there's a sync error.
      return;
    }
    return error(`Tree fn not found: ${msg.msg}`);
  }

  async onHideCollapsedTabsChanged (key, newValue, oldValue) {
    if (! isFirefox) return;
    if (! this.bkgd) return;
    debug(`hideCollapsedTabs: ${newValue}`);
    // find all open windows,
    // and force them to refresh their hidden tab states
    const windowNodes = this.root.findNodes(
      (n) => n.isWindow() && n.isLoaded(),
    );
    for (const winNode of windowNodes) {
      if (! newValue) await winNode.syncTabHideState(true);
      else {
        const wasExpanded = winNode.expanded;
        winNode.expanded = true;
        await winNode.syncTabHideState();
        winNode.expanded = wasExpanded;
      }
    }
  }

  async tree_nodeAdded (msg, sender, sendResponse) {
    await this.treeLoaded;  // wait until tree is ready

    const parentId = msg.parentId;
    const index = msg.index;
    const details = msg.node;
    const parent = this.nodes[parentId];
    //debug('tree_nodeAdded() parent', parent);
    if (! parent) {
      return error(`tree_nodeAdded(): couldn't find parent "${parentId}"`);
    }
    msg.reason = 'tree_nodeAdded';
    const newNode = await parent.addChild(index, details, msg);
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
    await this.treeLoaded;  // wait until tree is ready

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
    await this.treeLoaded;  // wait until tree is ready

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
    await this.treeLoaded;  // wait until tree is ready

    // unpack
    const nodeId = msg.nodeId;
    const changeType = msg.type;

    // find nodes
    const node = this.nodes[nodeId];
    if (! node) {
      // setActive(false) can get called after deletion sometimes,
      // but it's fine (like, Chrome temp windows which exist only for 1ms)
      const func = ('setActive' === changeType) ? warn : error;
      return func(`tree_nodeChanged(${changeType}): couldn't find node "${nodeId}"`);
    }

    // while syncing between threads,
    // tell handlers not to emit this event again
    msg.reason = 'tree_nodeChanged';

    // figure out what kind of change happened, and update it
    if ('setExpanded' === changeType) {
      return node.setExpanded(msg.expanded, msg);
    }
    else if ('setNotes' === changeType) {
      return node.setNotes(msg.label, msg.note, msg);
    }
    else if ('setCheckbox' === changeType) {
      return node.setCheckbox(msg.checkbox, msg);
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
    await this.treeLoaded;  // wait until tree is ready

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
    msg.reason = 'tree_windowClosed';
    return await node.windowClosed(msg);
  }

  // Search the entire tree and try to find a window node
  // which matches the contents of this window...
  // ... and merge its tabs into the tree.
  // Matches have a category and a score.
  // Lowest-numbered category wins, and ties are broken by score.
  // Further tie-breaking prefers the window with the most metadata,
  // so a window with a label beats one without... and further ties are
  // broken by which window occurs first in the session tree.
  findMatchingWindow (window) {
    // find the "needle" (realTabList) in the "haystack"
    const result = {};  // data to return
    result.loadedTabNodesWithNoTab = [];
    //const realTabList = [...window.tabs];
    const realTabList = [];
    for (const realTab of window.tabs) {
      // make an object we can safely modify
      const tabCopy = { ...realTab };
      realTabList.push(tabCopy);
    }
    const haystack = [];
    const winNodeList = this.root.findNodes(
      (node) => { return node.isWindow(); }
    );
    for (const winNode of winNodeList) {
      const tabList = winNode.getLoadedAndUnloadedTabs();
      haystack.push({ winNode, tabList });
    }
    // evaluate each candidate to find the best one
    const bestMatch = findClosestWindowMatch(realTabList, haystack);
    // bestMatch may be null if nothing good was found
    if (bestMatch) {
      // attach the window node to the browser window
      bestMatch.winNode.windowId = window.id;
      // update the tabId and loaded / wasLoaded state of this window's tabs
      // search loaded tabs first, then wasLoaded, then unloaded
      // (to avoid attaching to an unloaded tab when a loaded tab exists)
      const tabNodeList = [];
      // loaded
      for (const tabNode of bestMatch.winNode.findNodes(
        (n) => { return n.isLoadedTab(); },
        (n) => { return (! n.isWindow()); }
      )) { tabNodeList.push(tabNode); }
      // wasLoaded
      for (const tabNode of bestMatch.winNode.findNodes(
        (n) => { return n.isWasLoadedTab(); },
        (n) => { return (! n.isWindow()); }
      )) { tabNodeList.push(tabNode); }
      // unloaded
      for (const tabNode of bestMatch.winNode.findNodes(
        (n) => { return n.isUnloadedTab(); },
        (n) => { return (! n.isWindow()); }
      )) { if (! tabNodeList.includes(tabNode)) tabNodeList.push(tabNode); }
      // now attach browser tab IDs to nodes
      for (const tabNode of tabNodeList) {
        let found = false;
        for (const realTab of realTabList) {
          // skip tabs we've already assigned to a node
          if (realTab.attached) continue;
          // this node matches the real tab
          if (tabNode.url === realTab.url) {
            found = true;
            realTab.attached = true;
            // FIXME: use setTabFields()
            tabNode.tabId = realTab.id;
            tabNode.loaded = true;
            tabNode.wasLoaded = false;
            break;  // stop searching realTabList for this tabNode
          }
        }
        // if a "loaded" tab node wasn't found, assign it as "wasLoaded"
        if ((! found) && tabNode.isLoaded()) {
          // FIXME: use tabNode.setWasLoaded()
          // (that would allow for any syncing and stuff to happen)
          tabNode.tabId = undefined;
          tabNode.loaded = false;
          tabNode.wasLoaded = true;
          result.loadedTabNodesWithNoTab.push(tabNode);
        }
      }
      result.winNode = bestMatch.winNode;
      return result;
    }
    return result;
  }
}


// check if two tab arrays are identical (same length, same values in order)
function tabArraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].url !== b[i].url) return false;
  }
  return true;
}


// check if 'sub' is a subsequence of 'arr'
function isTabSubSequence(sub, arr) {
  let subIndex = 0;
  for (let i = 0; i < arr.length && subIndex < sub.length; i++) {
    if (sub[subIndex].url === arr[i].url) {
      subIndex++;
    }
  }
  return subIndex === sub.length;
}


// check if two Tab arrays are identical (same length, same values in order)
function tabArrayIncludes(arr, value) {
  for (const item of arr)
    if (item.url === value.url) return true;
  return false;
}


// Compute a "score" for a candidate array relative to the needle array.
// Args are both [ tab1, tab2, ... ] arrays where each tab has a url.
// Values are compared by tab.url.
// Returns { category (lower is better), matchCount (higher is better) }
// Returns null if the candidate matches fewer than half the needle's values.
function getWindowCandidateScore(candidate, needle) {
  // count how many elements of needle occur in candidate
  const matchCount = needle.reduce(
    (acc, v) => acc + (tabArrayIncludes(candidate, v) ? 1 : 0),
    0);
  const minMatches = Math.ceil(needle.length / 2);
  // disqualify if fewer than half the values are present
  //if (matchCount < minMatches) return null;
  if (matchCount < 1) return null;

  // check if candidate covers all of needle
  const fullMatch = needle.every(v => tabArrayIncludes(candidate, v));
  // check if candidate is exclusively built from needle values
  const candidateIsSubset = candidate.every(v => tabArrayIncludes(needle, v));

  // category 1: exact match
  if (tabArraysEqual(candidate, needle))
    return { category: 1, matchCount };

  // category 2 or 3: candidate contains all needle elements
  if (fullMatch) {
    // if the needle appears in order in the candidate,
    // it's a superset in order
    if (isTabSubSequence(needle, candidate))
      return { category: 2, matchCount };
    else
      return { category: 3, matchCount };
  }

  // category 4 or 5: candidate is made up solely of needle values
  if (candidateIsSubset) {
    if (isTabSubSequence(candidate, needle))
      return { category: 4, matchCount };
    else
      return { category: 5, matchCount };
  }

  // otherwise, candidate is a partial match that doesn't fit a category
  return { category: 6, matchCount };
}


// iterate over the haystack to choose the closest match
// needle: an array of tabs, where each tab has a tab.url
// haystack: an array of { winNode, tabList } objects
function findClosestWindowMatch(needle, haystack) {
  let bestCandidate = null;
  let bestScore = null;

  for (const candidate of haystack) {
    const score = getWindowCandidateScore(candidate.tabList, needle);
    const scoreText = score ? `${score.category}, ${score.matchCount}` : 'null';
    debug(`findClosestWindowMatch(${scoreText}): ${candidate.winNode.toLine()}`);
    // skip candidates that don't meet minimum matching criteria
    if (score === null) continue;

    // first non-null match is an automatic best score
    if (null === bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    } else {
      // lower category number wins
      if (score.category < bestScore.category) {
        bestScore = score;
        bestCandidate = candidate;
      }
      // if same category, take the candidate with more matches
      else if ((score.category === bestScore.category)
        && (score.matchCount > bestScore.matchCount)
      ) {
        bestScore = score;
        bestCandidate = candidate;
      }
      // if same category and same number of matches,
      // take the candidate with more metadata and children
      else if ((score.category === bestScore.category)
        && (score.matchCount === bestScore.matchCount)
      ) {
        const sMeta = (bestCandidate.winNode.label ? 1 : 0)
          + (bestCandidate.winNode.note ? 1 : 0)
          + (bestCandidate.winNode.checkbox ? 1 : 0)
          + bestCandidate.winNode.countNodes();
        const cMeta = (candidate.winNode.label ? 1 : 0)
          + (candidate.winNode.note ? 1 : 0)
          + (candidate.winNode.checkbox ? 1 : 0)
          + candidate.winNode.countNodes();
        if (cMeta > sMeta) {
          bestScore = score;
          bestCandidate = candidate;
        }
      }
    }
  }

  const line = bestCandidate ? bestCandidate.winNode.toLine() : '';
  debug(`findClosestWindowMatch() => ${bestScore}: ${line}`);
  return bestCandidate;
}

