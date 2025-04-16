// bkgd/bkgd.js: main background script
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: GPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import {
  log, debug, warn, error, fmtDate, emit, jsonSchema
} from '/common/common.js';
import { IdGenerator } from '/common/id-generator.js';
import * as sidepanel from './sidepanel.js';
import { TreeStore } from './treestore.js';
import { base32encode } from '/common/base32.js';

log('/bkgd/bkgd.js running');

class Bkgd {

  constructor () {
    // help event handlers wait until init is finished
    this.configLoaded = new Promise(resolve => {
      this.resolveConfigLoaded = resolve;
    });
    this.treeDbLoaded = new Promise(resolve => {
      this.resolveTreeDbLoaded = resolve;
    });
    this.treeLoaded = new Promise(resolve => {
      this.resolveTreeLoaded = resolve;
    });
  }

  init () {
    // tell emit() that this thread is a service worker,
    // so it should only runtime.sendMessage()
    // when TreeView ports are connected
    emit.isBkgd = true;
    emit.bkgd = this;
    this.ports = [];

    // if I understand correctly, this needs to NOT be async,
    // because that means listeners aren't registered immediately at startup,
    // which means it misses messages until init is finished...
    // but instead, it needs to register listeners *immediately* and then
    // make them handle "waiting on init" conditions when events come in
    // (by receiving events but delaying the processing until init is done)
    this.initConnectListener();
    this.initMessageListener();
    this.initWindowListeners();
    this.initTabListeners();
    this.initMiscListeners();

    // tell the browser the sidepanel can be opened via hotkey or icon click
    sidepanel.init();

    this.initConfig().then(() => {
      this.idGen = new IdGenerator(this.clientId, 9, 2);
      this.resolveConfigLoaded();  // let listeners know the config is ready

      this.tree = new TreeStore(this);
      this.tree.init();
      // TODO: use tree node dict as idGen ID cache
      // TODO: make IdGenerator check a cache to avoid duplicates
      //this.idGen.cache = this.tree.nodes;
      //  TODO: actually load the tree from storage
      // this.tree.loadFromIDB().then(() => {
      //   this.resolveTreeLoaded();
      // });
      this.resolveTreeDbLoaded();  // let listeners know the IDB is loaded
      // grab all the open windows and tabs, and put them in the tree
      this.mergeOpenWindowsIntoTree().then(() => {
        // tree is ready to use
        this.resolveTreeLoaded();  // let listeners know the tree is loaded
      });
    });

  }

  initConnectListener () {
    api.runtime.onConnect.addListener( this.onConnect.bind(this) );
  }

  initMessageListener () {
    api.runtime.onMessage.addListener( this.onMessage.bind(this) );
  }

  initMiscListeners () {
    // TODO
    //api.action.onClicked.addListener((...args) => {
    //  this.onExtensionIconClicked(...args);
    //});
    //api.commands.onCommand.addListener((...args) => {
    //  this.onGlobalHotkeyCommand(...args);
    //});
  }

  initWindowListeners () {
    // monitor for windows being opened and closed
    api.windows.onCreated.addListener( this.onWindowCreated.bind(this) );
    api.windows.onRemoved.addListener( this.onWindowRemoved.bind(this) );
    // user changed keyboard focus to a new window
    api.windows.onFocusChanged.addListener( this.onWindowFocusChanged.bind(this) );
    // TODO: handle window change events, like resizing
  }

  initTabListeners () {
    // tabs opened and closed
    api.tabs.onCreated.addListener( this.onTabCreated.bind(this) );
    api.tabs.onRemoved.addListener( this.onTabRemoved.bind(this) );
    // tab became the window's active tab
    api.tabs.onActivated.addListener (this.onTabActivated.bind(this) );
    // tab moved within a single window
    api.tabs.onMoved.addListener (this.onTabMoved.bind(this) );
    // tab moved from one window to another
    api.tabs.onAttached.addListener (this.onTabAttached.bind(this) );
    api.tabs.onDetached.addListener (this.onTabDetached.bind(this) );
    // virtually anything else changed
    api.tabs.onUpdated.addListener (this.onTabUpdated.bind(this) );
    // not really sure when this happens or why or how
    api.tabs.onReplaced.addListener (this.onTabReplaced.bind(this) );
  }

  async initConfig () {
    // load client name from storage
    const result = await api.storage.local.get('clientId');
    if (result.clientId) {
      this.clientId = result.clientId;
      log(`clientId: ${this.clientId}`);
    } else {
      // detect first run and generate random client name
      // generate 2-digit base32 string
      let num = Math.floor(Math.random() * (32**2));
      this.clientId = base32encode(num, 2);
      await api.storage.local.set({ 'clientId': this.clientId });
      log(`rand clientId: ${this.clientId}`);
    }
  }

  async mergeOpenWindowsIntoTree () {
    log('mergeOpenWindowsIntoTree()');
    const windows = await api.windows.getAll({ populate: true });
    for (const window of windows) {
      debug(`Window ID: ${window.id}`);
      // TODO: detect whether window is already in tree
      // TODO: may need to detect based on tab matching
      let winNode = this.tree.windows[window.id];
      if (winNode) {
      }
      // TODO: if not, add new window to the tree
      else {
        winNode = await this.onWindowCreated(window, false);
      }
      for (const tab of window.tabs) {
        debug(`Tab ID: ${tab.id}, URL: ${tab.url}`, tab);
        // TODO: detect whether tab is already in tree
        // TODO: if not, add new tab to the tree
        //       ... in an appropriate position
        let destParent = winNode;
        let destIndex = winNode.nodes.length;
        if (tab.openerTabId && (tab.openerTabId !== tab.id)) {
          let found = this.tree.root.findNodes(
            (n) => { return (n.tabId === tab.openerTabId); });
          if (found.length > 0) {
            destParent = found[0];
            destIndex = destParent.nodes.length;
          } else {
            error(`tab ${tab.id} has openerTabId ${tab.openerTabId} but no parent found`);
          }
        }
        await destParent.addChild(destIndex, {
          windowId: window.id,
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
          }, null, false);
      }
    }
    log('mergeOpenWindowsIntoTree() done');
  }

  async onWindowCreated (window, notify = true) {
    // add new window to the tree
    // (note: window.id may have already been created by a prior event,
    //  so we need to search for it and attach to that node if it exists)
    log(`bkgd.onWindowCreated: ID ${window.id}`, window);
    //await this.configLoaded;
    await this.treeDbLoaded;
    //await this.treeLoaded;
    const destParent = this.tree.root;
    const destIndex = this.tree.root.nodes.length;
    const found = this.tree.root.findNodes((node) =>
      { return node.isWindow() && (node.windowId === window.id); });
    if (found.length > 0) {
      const windowNode = found[0];
      await windowNode.setTabFields({
        loaded: true,
        geometry: [window.width, window.height, window.left, window.top]
      }, null, notify);
      // in case a parent tab with child tabs has *already* been moved
      // to this window (which caused the window to be created),
      // reorder the tabs to pull in the child tabs
      await windowNode.reorderAllTabsInThisWindow();
      return windowNode;
    }
    // TODO: handle window.top, .left, .width, .height
    //       so it can re-open saved windows at same size+position
    // TODO: handle window types: normal, incognito, pop-up?, ...
    const newNode = await destParent.addChild(destIndex, {
      type: 'window',
      windowId: window.id,
      loaded: true,
      geometry: [window.width, window.height, window.left, window.top]
    }, null, notify);
    return newNode;
  }

  async onWindowRemoved (windowId) {
    log(`bkgd.onWindowRemoved: ID ${windowId}`);
    // TODO: detect whether window was closed by user or by us
    await this.treeLoaded;
    // TODO
    debug('bkgd.tree.windows', this.tree.windows);
    const node = this.tree.windows[windowId];
    if (node) {
      debug('found window node', windowId, node);
      node.windowClosed();
    }
    else {
      debug('no window node found', windowId);
    }
  }

  async onWindowFocusChanged (...args) {
    debug('bkgd.onWindowFocusChanged', ...args);
    // TODO: set window node as 'active' and set others as just 'loaded'?
    //   (so the focused window can have a brighter row in the tree view)
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
    debug(`bkgd.onTabCreated(${tab.id}): ${tab.url} : ${tab.title}`, tab);
    await this.tree.onTabCreated(tab);
  }

  onTabRemoved (tabId, removeInfo) {
    // tabId: number
    // removeInfo.isWindowClosing: boolean
    // removeInfo.windowId: number
    debug(`bkgd.onTabRemoved(tabId=${tabId}, windowId=${removeInfo.windowId}, isWindowClosing=${removeInfo.isWindowClosing})`);
    this.tree.onTabRemoved(tabId, removeInfo);
  }

  onTabActivated (activeInfo) {
    // activeInfo.tabId: number
    // activeInfo.windowId: number
    debug(`bkgd.onTabActivated(tabId=${activeInfo.tabId}, windowId=${activeInfo.windowId})`);
    this.tree.onTabActivated(activeInfo.windowId, activeInfo.tabId);
  }

  onTabMoved (tabId, moveInfo) {
    // tab was moved within a window
    // tabId: number
    // moveInfo.fromIndex: number
    // moveInfo.toIndex: number
    // moveInfo.windowId: number
    debug(`bkgd.onTabMoved(tabId=${tabId}, windowId=${moveInfo.windowId}): ${moveInfo.fromIndex} -> ${moveInfo.toIndex}`);
    this.tree.onTabMoved(tabId, moveInfo);
  }

  onTabAttached (tabId, attachInfo) {
    // tabId: number
    // attachInfo.newPosition: number
    // attachInfo.newWindowId: number
    //   (may refer to a window which doesn't exist yet)
    debug(`bkgd.onTabAttached(tabId=${tabId}, windowId=${attachInfo.newWindowId}, ${attachInfo.newPosition})`);
    this.tree.onTabAttached(tabId, attachInfo);
  }

  onTabDetached (tabId, detachInfo) {
    // tabId: number
    // detachInfo.oldPosition: number
    // detachInfo.oldWindowId: number
    debug(`bkgd.onTabDetached(tabId=${tabId}, windowId=${detachInfo.oldWindowId}, ${detachInfo.oldPosition})`);
    // blank, on purpose
    // we don't really need to do anything here
  }

  onTabUpdated (tabId, changeInfo, tab) {
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
    debug(`bkgd.onTabUpdated(tabId=${tabId})`, changeInfo, tab);
    this.tree.onTabUpdated(tabId, changeInfo, tab);
  }

  onTabReplaced (addedTabId, removedTabId) {
    // "Fired when a tab is replaced with another tab due to prerendering or instant."
    // addedTabId: number
    // removedTabId: number
    debug(`bkgd.onTabReplaced(addedTabId=${addedTabId}, removedTabId=${removedTabId})`);
    // this apparently only happens in chrome,
    // and only in some circumstances which are almost entirely undocumented
    // so I'm not sure how to even make it happen
    // If I understand correctly, it's stuff like... you start typing into
    // the address bar with "instant search" enabled, and it pre-fetches
    // and pre-renders some pages, and then when you click on one,
    // it replaces the current tab?
    // I'll probably have to install a whole separate browser just to find
    // one which actually supports this feature, since all the browsers I
    // use either block it or don't implement it at all.
    this.tree.onTabReplaced(addedTabId, removedTabId);
  }

  onConnect (port) {
    // keep a list of connected TreeView instances
    this.ports.push(port);
    port.onDisconnect.addListener(() => {
      this.ports = this.ports.filter(p => p !== port);
    });
  }

  onMessage (msg, sender, sendResponse) {
    // reject broken messages
    if (! msg.msg) {
      const err = 'bkgd onMessage: invalid msg type';
      warn(err, msg);
      sendResponse({error: err});
      return;
    }
    // if message is for someone else, ignore it and abort
    if (! msg.msg.startsWith('bkgd_')) return;

    // onMessage handlers can't be async,
    // because async functions return a Promise
    // and then the message channel gets closed before calling sendResponse()
    // so instead we return true to keep the channel open,
    // and invoke the real handler, which can take as much time as it needs

    // call async handler synchronously
    this.onBkgdMessage(msg, sender, sendResponse);
    // "claim" this message, indicating we'll respond async,
    // and keep the message channel open
    // (but if we don't respond within a few seconds,
    //  it'll generate an error, so there is a time limit)
    return true;
  }

  async onBkgdMessage (msg, sender, sendResponse) {
    if (msg && ('bkgd_ping' !== msg.msg))
      debug('bkgd onMessage', msg);
    // look up the appropriate message handler
    const handler = this[`${msg.msg}`];
    if (handler) {
      //await this.configLoaded;  // wait for config to finish loading
      // actually handle the event
      //debug(`bkgd: ${msg.msg}()`);
      const result = await handler.bind(this)(msg);
      //debug('bkgd sendResponse:', result);
      sendResponse(result);
      return;
    }
    // if no handler found, send an error
    // because we promised to send a response, so now it's mandatory
    // and if we don't, the caller's "emit()" will retry
    const err = `bkgd fn not found: ${msg.msg}`;
    sendResponse({ error: err });
    return error(err);
  }

  async bkgd_ping (msg) {
    return Date.now();
  }

  async bkgd_newNodeId (msg) {
    //debug('bkgd_newNodeId()', msg);
    await this.configLoaded;  // wait for config to finish loading
    const newId = this.idGen.newId();
    //debug(`bkgd_newNodeId() => "${newId}"`);
    return newId;
  }

  async bkgd_setClientId (msg) {
    await this.configLoaded;  // wait for config to finish loading
    // FIXME: strip everything but a-zA-Z0-9
    // TODO: save to config
    this.clientId = msg.clientId;
    this.idGen.name = this.clientId;
  }

  async bkgd_getTree (msg) {
    await this.treeLoaded;  // ensure tree is loaded before sending it
    const response = {};
    response.nodes = this.tree.serializeNodes();
    return response;
  }

  async bkgd_importBackupFile (msg) {
    return this.importBackupFileGeneric(msg, this.importBackupFile);
  }

  bkgd_importTabsOutliner (msg) {
    return this.importBackupFileGeneric(msg, this.importTabsOutlinerExport);
  }

  async importBackupFileGeneric (msg, handler) {
    const response = {};
    let total = 0;
    try {
      total = await handler.bind(this)(msg.data, msg.filename);
      response.status = `${total} nodes imported`;
    } catch (err) {
      response.status = `Import error: ${err}`;
      error(err);
    }
    response.total = total;
    return response;
  }

  async importBackupFile(json, filename) {
    if (jsonSchema !== json.$schema) {
      error('Does not appear to be a TKTSTO file.');
      return -1;
    }
    if (! json.nodes['root']) return -1;

    // don't import to an incomplete tree
    await this.treeLoaded;

    function lookup (id) {
      const node = json.nodes[id];
      if (! node) {
        warn(`Failed to load node "${id}"`);
        return null;
      }
      // let tree assign new IDs for all nodes
      // (because we're adding to the current session, not replacing it)
      node.id = undefined;
      node.parent = undefined;
      // nothing is loaded or active in an imported tree
      if (node.loaded) {
        node.loaded = false;
        node.wasLoaded = true;
      }
      if (node.active) {
        node.active = false;
        node.wasActive = true;
      }
      // root node needs special care
      if ('root' === id) {
        const itimeStr = fmtDate(Date.now());
        const ctimeStr = fmtDate(json.metadata.sessionStartDate);
        const etimeStr = fmtDate(json.metadata.exportDate);
        // generate a title
        const note = filename;
        if (node.note) node.note = `${note} (${node.note})`;
        else node.note = note;
        // generate a description
        const filenameStr = `Filename: ${filename}\n`;
        const importText = `${filenameStr}Session Started: ${ctimeStr}\nExported: ${etimeStr}\nImported: ${itimeStr}`;
        if (node.longNote) node.longNote = importText + '\n' + node.longNote;
        else node.longNote = importText;
      }
      return node;
    }

    async function createNodes (parent, childIds) {
      let firstNode;
      for (const childId of childIds) {
        //debug(`loading "${parent.id}" :: "${childId}"`);
        const destIndex = parent.nodes.length;
        const childDict = lookup(childId);
        if (! childDict) continue;
        const newNode = await parent.addChild(destIndex, childDict);
        // first node created is the "root" of this sub-tree
        if (! firstNode) firstNode = newNode;
        if (childDict.nodes) {
          await createNodes(newNode, childDict.nodes);
        }
      }
      return firstNode;
    }

    // actually create the nodes now
    const sessionRoot = await createNodes(this.tree.root, ['root']);

    // if imported session is older than current session,
    // set the current session's creation date to the older date
    if (sessionRoot.ctime < this.tree.root.ctime) {
      // FIXME: do this through proper channels so it gets saved and emitted
      this.tree.root.ctime = sessionRoot.ctime;
    }

    return sessionRoot.countDescendants();
  }

  async importTabsOutlinerExport(json, filename) {
    //log(typeof(json), json);
    if (! Array.isArray(json)) {
      error('Does not appear to be a Tabs Outliner file.  Outer element is not an array.');
      return -1;
    }
    // step 1: parse the data into a temporary structure
    const parsedNodes = this.parseTabsOutlinerExport(json, filename);
    if (! parsedNodes) return -1;
    // step 2: convert the parsed items into actual tree nodes
    const rootNode = await this.importParsedNodes(parsedNodes);
    if (! rootNode) return -1;
    return rootNode.countDescendants();
  }

  parseTabsOutlinerExport (json, filename) {
    let parsedNodes = [];

    // look up a list of indexes in the parsedNodes tree
    function findNode(path) {
      //debug('findNode', path);
      let node = parsedNodes[0];
      let prevNode = node;
      for (const index of path) {
        node = node.nodes[index];
        if (! node) {
          // final index is the destination, and it should not exist yet
          return prevNode;
          //warn(`findNode(): invalid path: ${path}`, parsedNodes);
          //return null;
        }
        prevNode = node;
      }
      return node;
    }

    for (const item of json) {
      //debug('parsing item', item);
      // first item (2000) is a session summary
      // middle items (2001) are the tree nodes
      // last item (11111) is an export summary
      if (item.type) {
        // session summary object
        if ((2000 === item.type)
          || (item.node && ('session' === item.node.type))) {
          // create session root node
          const details = {};
          details.expanded = false;  // collapse new sub-tree
          details.note = `Tabs Outliner Session`;
          // treeId is the session creation time
          details.ctime = Number(item.node.data.treeId);
          details.sessionImportTime = Date.now();
          details.nodes = [];
          parsedNodes.push(details);
        }
        // export summary object
        else if (11111 === item.type) {
          const rootNode = parsedNodes[0];
          rootNode.sessionExportTime = item.time;
          // create the root / session node's longNote
          const ctimeStr = fmtDate(rootNode.ctime);
          const itimeStr = fmtDate(rootNode.sessionImportTime);
          const etimeStr = fmtDate(rootNode.sessionExportTime);
          let filenameStr = '';
          if (filename) filenameStr = `Filename: ${filename}\n`;
          rootNode.longNote = `${filenameStr}Session Started: ${ctimeStr}\nExported: ${etimeStr}\nImported: ${itimeStr}`;
        }
      }
      // regular tree items are Arrays
      else if (Array.isArray(item)) {
        const twoThousandOne = item[0];  // every item starts with 2001
        if (2001 !== twoThousandOne) {
          warn('Unexpected item in import', item);
          continue;
        }
        const fields = item[1];
        const parents = item[2];
        // find the new node's parent node
        const parent = findNode(parents);
        //debug('parent', parent);
        if (! parent) continue;
        // parse the details
        const details = {};
        details.nodes = [];
        // expanded / collapsed state ("colapsed" is TO author's typo)
        if (fields.colapsed) details.expanded = false;
        else details.expanded = true;
        // general
        if (fields.marks) {
          // parse marks.customTitle
          details.note = fields.marks.customTitle;
        }
        if (fields.data) {
          const d = fields.data;
          // parse data.title
          if (d.title) details.title = d.title;
          // parse data.url
          if (d.url) details.url = d.url;
          // parse data.favIconUrl
          if (d.favIconUrl) details.favIconUrl = d.favIconUrl;
          // parse data.lastAccessed
          if (d.lastAccessed) details.atime = Number(d.lastAccessed);
        }
        // window nodes
        if (['win', 'savedwin', 'group'].includes(fields.type)) {
          details.type = 'window';
          details.loaded = false;
          if (! details.note) details.note = 'Window';
          if (fields.data) {
            const d = fields.data;
            // parse data.type for window type
            let winType = '';
            if (d.type && (d.type !== 'normal')) {
              // capitalize 1st letter
              winType = String(d.type).charAt(0).toUpperCase()
                + String(d.type).slice(1);
              details.note = `${winType} ${details.note}`;
            }
            // parse data.crashDetectedDate
            if (d.crashDetectedDate) {
              const dateStr = fmtDate(Number(d.crashDetectedDate));
              details.note = `${details.note} (crashed ${dateStr})`;
            }
          }
          // TODO: parse data.rect
          //details.geometry = [window.width, window.height, window.left, window.top];
          // TODO: parse data.focused
          //debug('window', details);
        }
        else if ('tab' === fields.type) {
          details.wasLoaded = true;  // link was open in a tab
        }
        // note-only nodes
        else if ('textnote' === fields.type) {
          // parse data.note
          details.note = fields.data.note;
          //debug('textnote', details);
        }
        // regular nodes
        else if (! fields.type) {
          // TODO: parse data.openerTabId?
          // TODO: parse data.highlighted?
          // TODO: parse data.audible?
          // TODO: parse data.autoDiscardable?
          // TODO: parse data.discarded?
          // TODO: parse data.frozen?
          // TODO: parse data.groupId?
          // TODO: parse data.mutedInfo?
          // TODO: parse marks.relicons?
        }
        // attach a new node under the parent
        //debug('loaded', details);
        parent.nodes.push(details);
      }
      // unrecognized item
      else {
        warn('Unexpected item in import', item);
      }
    }
    return parsedNodes;
  }

  async importParsedNodes(parsedNodes) {
    // don't import to an incomplete tree
    await this.treeLoaded;

    let rootNode;
    async function createNodes (parent, children) {
      for (const node of children) {
        const destIndex = parent.nodes.length;
        const newNode = await parent.addChild(destIndex, node);
        // first node created is the "root" of this sub-tree
        if (! rootNode) rootNode = newNode;
        if (node.nodes) {
          await createNodes(newNode, node.nodes);
        }
      }
    }

    // actually create the nodes now
    await createNodes(this.tree.root, parsedNodes);

    // if imported session is older than current session,
    // set the current session's creation date to the older date
    if (rootNode.ctime < this.tree.root.ctime) {
      // FIXME: do this through proper channels so it gets saved and emitted
      this.tree.root.ctime = rootNode.ctime;
    }
    // return the root of the new subtree
    //debug('rootNode:', rootNode);
    return rootNode;
  }

}

const bkgd = new Bkgd();
bkgd.init();

