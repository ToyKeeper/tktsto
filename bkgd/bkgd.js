// bkgd/bkgd.js: main background script
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: AGPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import {
  log, debug, warn, error, fmtDate, emit, jsonSchema, isIllegalURL
} from '/common/common.js';
import { Config } from '/common/config.js';
import { IdGenerator } from '/common/id-generator.js';
import * as sidepanel from './sidepanel.js';
import { TreeStore } from './treestore.js';
import { base32encode } from '/common/base32.js';
import { createNewUserTutorialNodes } from '/bkgd/new-user.js';

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

    // queues for saved nodes which are in the process of being loaded
    // (empty except during brief moments before browser opens stuff)
    this.nodesLoading = [];
    this.windowsLoading = [];

    // local backups
    this.localBackupAlarmName = 'periodicLocalBackup';

    this.cfg = new Config();
    this.cfgDefaults = {
      clientId: null,
      localBackupInterval: 0,
      localBackupLastTimeCompleted: 0,
    };

    // kludge because Chrome sidePanel API is missing important stuff
    // like sidePanel.isOpen()
    if (isChrome) this.chromeSidepanelIsOpen = {};
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
      this.idGen = new IdGenerator(this.cfg.clientId, 9, 2);
      this.cfg.watch('clientId', (key, newVal, oldVal) => {
        // always use latest clientId to generate new nodeIds
        this.idGen.name = newVal;
      });
      debug('Bkgd.resolveConfigLoaded()');
      this.resolveConfigLoaded();  // let listeners know the config is ready

      this.tree = new TreeStore(this);
      // give the tree a link to the bkgd object
      this.tree.bkgd = this;
      //  actually load the tree from storage
      this.tree.init().then(() => {
        debug('Bkgd.resolveTreeDbLoaded()');
        this.resolveTreeDbLoaded();  // let listeners know the IDB is loaded
        // TODO: use tree node dict as idGen ID cache
        // TODO: make IdGenerator check a cache to avoid duplicates
        //this.idGen.cache = this.tree.nodes;
        // grab all the open windows and tabs, and put them in the tree
        this.mergeOpenWindowsIntoTree().then(() => {
          // and if this is the first boot, add tutorial nodes
          if (this.tree.needsTutorial) {
            createNewUserTutorialNodes(this.tree);
          }
          // tree is ready to use
          debug('Bkgd.resolveTreeLoaded()');
          this.resolveTreeLoaded();  // let listeners know the tree is loaded
          this.tree.resolveTreeLoaded();
        });
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
    // user clicked extension icon in the address bar area
    api.action.onClicked.addListener( this.onExtensionIconClicked.bind(this) );

    // global hotkey "commands"
    api.commands.onCommand.addListener( this.onCommand.bind(this) );

    // automatic scheduled backups
    this.initLocalBackupAlarm();
    api.alarms.onAlarm.addListener( this.onAlarm.bind(this) );
  }

  initWindowListeners () {
    // monitor for windows being opened and closed
    api.windows.onCreated.addListener( this.onWindowCreated.bind(this) );
    api.windows.onRemoved.addListener( this.onWindowRemoved.bind(this) );
    // user changed keyboard focus to a new window
    api.windows.onFocusChanged.addListener( this.onWindowFocusChanged.bind(this) );
    // handle window resizing
    // Firefox 128.6.0esr-1~deb12u1 gives an error that it doesn't have this,
    // even though the docs say it does
    // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/windows/onBoundsChanged
    if (api.windows.onBoundsChanged)
      api.windows.onBoundsChanged.addListener( this.onWindowBoundsChanged.bind(this) );
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
    await this.cfg.init(this.cfgDefaults);

    if (! this.cfg.clientId) {
      // detect first run and generate random client name
      // generate 2-digit base32 string
      let num = Math.floor(Math.random() * (32**2));
      const clientId = base32encode(num, 2);
      await this.cfg.set('clientId', clientId);
      log(`set random clientId: ${clientId}`);
    }
    log(`clientId: ${this.cfg.clientId}`);

    // reset backup events when the interval changes
    this.cfg.watch('localBackupInterval', (key, newVal, oldVal) => {
      this.initLocalBackupAlarm(true);
    });
  }

  async initLocalBackupAlarm (reset = false) {
    let interval = this.cfg.localBackupInterval;
    const alarm = await api.alarms.get(this.localBackupAlarmName);
    // 0.5 minutes is the shortest the browser allows
    const backupDisabled = (! interval) || (interval < 0.5);

    // check last backup time, and if last + interval < now, backup now
    // because sometimes alarms don't persist across browser restarts, and
    // if a user sets interval=24h but they restart daily, it may never fire
    if (! backupDisabled) {
      let lastBackupTime = this.cfg.localBackupLastTimeCompleted;
      if (! lastBackupTime) lastBackupTime = 0;
      if ((lastBackupTime + (interval * 1000 * 60)) < Date.now()) {
        debug(`Bkgd.initLocalBackupAlarm: overdue, backing up now`);
        await this.tree.downloadBackupNow();
      }
    }

    debug(`Bkgd.initLocalBackupAlarm: reset=${reset} interval=${interval}, alarm=${alarm}, backupDisabled=${backupDisabled}`);

    // disable alarm if it exists and user doesn't want it
    // or if they changed the interval
    if (reset || backupDisabled) {
      if (alarm) {
        await api.alarms.clear(this.localBackupAlarmName);
        log(`${this.localBackupAlarmName} cancelled`);
      }
    }

    // we're done, if the user doesn't want backups
    if (backupDisabled) return;

    // create alarm if user wants it and it isn't scheduled yet
    if (reset || (! alarm)) {
      await api.alarms.create(this.localBackupAlarmName, {
        periodInMinutes: interval
      });
      log(`${this.localBackupAlarmName} interval set to ${interval/60} hour(s)`);
    }
  }

  async onAlarm (alarm) {
    await this.treeLoaded;
    debug(`Bkgd.onAlarm(${alarm.name})`, alarm);
    if (this.localBackupAlarmName === alarm.name) {
      debug(this.localBackupAlarmName);
      this.tree.downloadBackupNow();
    }
  }

  onExtensionIconClicked (tab, click) {
    // middle click
    if (click && click.button === 1) {
      debug('onExtensionIconClicked(middle)');
      // TODO: add this, for browsers which support it...
      // (but it seems like only Firefox supports it)
    }
    // left click
    else {
      debug('onExtensionIconClicked(left)');
      if (isFirefox) {
        api.sidebarAction.toggle();
      } else {
        // FIXME: sidePanel.isOpen() still doesn't exist, as of Chrome 143
        // nasty kludge, waiting on Chrome to add .isOpen()
        let isOpen = this.chromeSidepanelIsOpen[tab.windowId];
        if (undefined !== api.sidePanel.isOpen) {
          isOpen = api.sidePanel.isOpen({ windowId: tab.windowId });
        }
        if (isOpen) {
          // Chrome 141+
          // (WTF, why didn't this exist until 25 releases AFTER .open())
          api.sidePanel.close({ windowId: tab.windowId });
        } else {
          // Chrome 116+
          api.sidePanel.open({ windowId: tab.windowId });
        }
        this.chromeSidepanelIsOpen[tab.windowId] = (! isOpen);
      }
    }
    // right click uses a totally different API
    // because the browser handles it as a context menu,
    // and gives us the option to add items to that menu
  }

  async mergeOpenWindowsIntoTree () {
    log('mergeOpenWindowsIntoTree()');
    let windows;
    try {
      windows = await api.windows.getAll({ populate: true });
    } catch (err) {
      // somehow I got firefox into a weird state
      // where it couldn't even return a list of windows...
      return error('failed to get list of windows', err);
    }

    console.time('mergeOpenWindowsIntoTree');
    // attach browser windows to window nodes
    let attached = [];
    for (const window of windows) {
      debug(`Window ID: ${window.id}`);
      // detect whether window is already in tree
      // match by windowId (old, unreliable, windowId changes or goes stale)
      //let winNode = this.tree.root.getWindowId(window.id);
      // search for a Window in the tree with matching tabs
      let winNode = this.tree.findMatchingWindow(window);
      if (winNode) {
        winNode.load({ reason: 'mergeOpenWindowsIntoTree' });
      }
      // if nothing found, add new window node to the tree
      else {
        log(`couldn't find window ${window.id} node, making new node`);
        winNode = await this.tree.onWindowCreated(window,
          { reason: 'mergeOpenWindowsIntoTree' });
      }
      // mark this winNode as actually attached to a real window
      attached.push({ winNode, window });
    }

    // remove "loaded" status from window nodes which didn't get attached
    // (also affects their 'loaded' tab nodes)
    const winNodeList = this.tree.root.findNodes(
      (n) => { return n.isWindow(); });
    for (const node of winNodeList) {
      let found = false;
      for (const obj of attached) {
        if (node.id === obj.winNode.id) found = true;
      }
      if ((! found) && (node.isLoaded() || node.hasLoadedTabs())) {
        node.unload({ reason: 'mergeOpenWindowsIntoTree' });
      }
    }

    // attach tabs now
    for (const obj of attached) {
      const winNode = obj.winNode;
      const window = obj.window;
      for (const tab of window.tabs) {
        debug(`Tab ID: ${tab.id}, URL: ${tab.url}`, tab);
        // detect whether tab is already in tree
        // (it usually should be, since findMatchingWindow() attaches tabIds)
        const tabNode = this.tree.getNodeByTabId(tab.id);
        if (tabNode) continue;
        // if not, add new tab to the tree
        // TODO: ... in an appropriate position
        let destParent = winNode;
        let destIndex = winNode.nodes.length;
        if (tab.openerTabId && (tab.openerTabId !== tab.id)) {
          let found = this.tree.root.findNodes(
            (n) => { return (n.tabId === tab.openerTabId); });
          if (found.length > 0) {
            destParent = found[0];
            destIndex = destParent.nodes.length;
          } else {
            warn(`tab ${tab.id} has openerTabId ${tab.openerTabId} but no parent found`);
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
          }, { reason: 'mergeOpenWindowsIntoTree' });
      }
    }

    console.timeEnd('mergeOpenWindowsIntoTree');
    log('mergeOpenWindowsIntoTree() done');
  }

  async onWindowCreated (window, args) {
    // add new window to the tree
    // (note: window.id may have already been created by a prior event,
    //  so we need to search for it and attach to that node if it exists)
    debug(`bkgd.onWindowCreated: ID ${window.id}`, window);
    if (! args) args = {};
    if (! args.reason) args.reason = 'onWindowCreated';
    await this.treeLoaded;
    return this.tree.onWindowCreated (window, args);
  }

  async onWindowRemoved (windowId) {
    log(`bkgd.onWindowRemoved: ID ${windowId}`);
    // TODO: detect whether window was closed by user or by us
    await this.treeLoaded;
    // TODO
    const node = this.tree.root.getWindowId(windowId);
    if (node) {
      debug('bkgd.onWindowRemoved(): found window node', windowId, node);
      return node.windowClosed({ reason: 'onWindowRemoved' });
    }
    else {
      debug('bkgd.onWindowRemoved(): no window node found', windowId);
    }
  }

  async onWindowFocusChanged (windowId) {
    debug(`bkgd.onWindowFocusChanged(${windowId})`);
    await this.treeLoaded;
    const winNode = this.tree.root.getWindowId(windowId);
    // no node = no problem, because a non-browser window may be focused
    if (! winNode) return;

    // update the window geometry and stuff
    // (because Firefox has no onWindowBoundsChanged event)
    // (so this is a workaround for that)
    const win = await api.windows.get(windowId);
    if (win) { await this.tree.onWindowBoundsChanged(win, winNode); }

    // TODO: set window node as 'active' and set others as just 'loaded'?
    //   (so the focused window can have a brighter row in the tree view)
  }

  async onWindowBoundsChanged (win) {
    debug('bkgd.onWindowBoundsChanged', win);
    await this.treeLoaded;
    return this.tree.onWindowBoundsChanged(win);
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
    await this.treeLoaded;
    return this.tree.onTabCreated(tab);
  }

  async onTabRemoved (tabId, removeInfo) {
    // tabId: number
    // removeInfo.isWindowClosing: boolean
    // removeInfo.windowId: number
    debug(`bkgd.onTabRemoved(tabId=${tabId}, windowId=${removeInfo.windowId}, isWindowClosing=${removeInfo.isWindowClosing})`);
    await this.treeLoaded;
    return this.tree.onTabRemoved(tabId, removeInfo);
  }

  async onTabActivated (activeInfo) {
    // activeInfo.tabId: number
    // activeInfo.windowId: number
    debug(`bkgd.onTabActivated(tabId=${activeInfo.tabId}, windowId=${activeInfo.windowId})`);
    await this.treeLoaded;
    return this.tree.onTabActivated(activeInfo.windowId, activeInfo.tabId);
  }

  async onTabMoved (tabId, moveInfo) {
    // tab was moved within a window
    // tabId: number
    // moveInfo.fromIndex: number
    // moveInfo.toIndex: number
    // moveInfo.windowId: number
    debug(`bkgd.onTabMoved(tabId=${tabId}, windowId=${moveInfo.windowId}): ${moveInfo.fromIndex} -> ${moveInfo.toIndex}`);
    if (this.tabReorderInProgress)
      return debug('bkgd.onTabMoved ignored (tabReorderInProgress)');
    await this.treeLoaded;
    await this.tree.onTabMoved(tabId, moveInfo);
  }

  async onTabAttached (tabId, attachInfo) {
    // tabId: number
    // attachInfo.newPosition: number
    // attachInfo.newWindowId: number
    //   (may refer to a window which doesn't exist yet)
    debug(`bkgd.onTabAttached(tabId=${tabId}, windowId=${attachInfo.newWindowId}, ${attachInfo.newPosition})`);
    if (this.tabReorderInProgress)
      return debug('bkgd.onTabAttached ignored (tabReorderInProgress)');
    await this.treeLoaded;
    return this.tree.onTabAttached(tabId, attachInfo);
  }

  onTabDetached (tabId, detachInfo) {
    // tabId: number
    // detachInfo.oldPosition: number
    // detachInfo.oldWindowId: number
    debug(`bkgd.onTabDetached(tabId=${tabId}, windowId=${detachInfo.oldWindowId}, ${detachInfo.oldPosition})`);
    // blank, on purpose
    // we don't really need to do anything here
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
    debug(`bkgd.onTabUpdated(tabId=${tabId})`, changeInfo, tab);
    await this.treeLoaded;
    return this.tree.onTabUpdated(tabId, changeInfo, tab);
  }

  async onTabReplaced (addedTabId, removedTabId) {
    // "Fired when a tab is replaced with another tab due to prerendering or instant."
    // addedTabId: number
    // removedTabId: number
    debug(`bkgd.onTabReplaced(addedTabId=${addedTabId}, removedTabId=${removedTabId})`);
    await this.treeLoaded;
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
    await this.tree.onTabReplaced(addedTabId, removedTabId);
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

  async bkgd_getTree (msg) {
    await this.treeLoaded;  // ensure tree is loaded before sending it
    const response = {};
    response.nodes = this.tree.serializeNodes();
    return response;
  }

  async bkgd_generateTutorial (msg) {
    await this.treeLoaded;
    let parentNode = this.tree.root;
    if (msg.parentId) parentNode = this.tree.nodes[msg.parentId];
    await createNewUserTutorialNodes(this.tree, parentNode);
    return {};
  }

  async bkgd_loadSavedNode (msg) {
    await this.treeLoaded;  // ensure tree is loaded
    const response = {};
    let node = this.tree.nodes[msg.nodeId];
    if (! node) {
      const err = `bkgd_loadSavedNode(): no node found: "%{msg.nodeId}"`;
      error(err);
      return { error: err };
    }
    // if already loaded, do nothing
    if (node.isLoaded()) { return response; }
    // - if unloaded window node... grab all "wasLoaded" items and load them?
    if (node.isWindow()) {
      // TODO: is handled in Node.load()
      //   so no need to handle it here
    }
    // some browsers block some types of URLs
    if (isIllegalURL(this.url)) {
      response.result = `Error: Can't load forbidden URL: ${this.url}`;
      return response;
    }
    // - otherwise...
    // - get the parent window Node
    let windowNode = node.getWindowNode(false);
    // - if no window node, make one
    if (! windowNode) {
      // get parent and node index
      const parentNode = node.parent;
      // insert new window node in place of current node
      windowNode = await parentNode.addChild(node.indexOf(),
        { type: 'window' },
        { reason: 'bkgd_loadSavedNode:autoWindow' });
      // move current node as child of window node
      await node.moveTo(windowNode, 0,
        { reason: 'bkgd_loadSavedNode:autoWindow' });
    }
    // - if window not loaded, push window node to be loaded
    let needsWindow = false;
    if (! windowNode.isLoaded()) {
      debug(`bkgd_loadSavedNode(): needsWindow`, windowNode);
      needsWindow = true;
      // TODO
      this.windowsLoading.push(windowNode);
      // TODO: actually open the window?
    }
    // - push node to be loaded, and open it (new window or existing window)
    this.nodesLoading.push(node);
    const popNode = (node, failed = false) => {
      const index = this.nodesLoading.indexOf(node);
      if (index !== -1) {
        this.nodesLoading.splice(index, 1);
        if (failed) warn('bkgd_loadSavedNode failed:', node);
      }
    };
    setTimeout(() => { popNode(node, true); }, 3000);  // failsafe

    // actually open the tab
    const createProperties = {};
    createProperties.url = node.url;
    // work around Firefox bug https://bugzilla.mozilla.org/show_bug.cgi?id=1412498
    if (isFirefox && ['about:newtab', 'about:home'].includes(node.url))
      createProperties.url = 'about:blank';
    // opening as first tab in new window
    if (needsWindow) {
      const createData = windowNode.windowCreateData();
      createData.url = createProperties.url;
      debug('bkgd_loadSavedNode() creating saved window', createData);
      try {
        try {
          await api.windows.create(createData);
        } catch (err) {
          // handle "Error: Invalid value for bounds. Bounds must be at least 50% within visible screen space."
          if (err.message.includes('Invalid value for bounds')) {
            // if user left the window somewhere forbidden,
            // ignore their saved position
            // It's stupid that we have to do this, instead of the browser just
            // moving the window to an allowed position+size.
            delete createData.geometry;
            await api.windows.create(createData);
          }
          else { throw err; }
        }
      } catch (err) {
        this.windowsLoading.pop(windowNode);
        popNode(node);
        warn(`loadSavedTab failed: ${err}`);
        response.result = err;
      }
    }
    // opening as new tab in existing window
    else {
      createProperties.windowId = windowNode.windowId;
      // maybe don't fully load it?
      if (msg.discarded) {
        if (isFirefox) {
          createProperties.discarded = true;
          // only allowed for discarded URLs
          createProperties.title = node.title;
        }
        else createProperties.active = false;
      }
      // assign an "openerTab" if one exists
      // FIXME: fails sometimes and totally breaks the browser
      //   (like, it becomes unable to return a list of windows)
      //const openerNode = node.getLoadedParent();
      //if (openerNode) createProperties.openerTabId = openerNode.tabId;
      // TODO? set index
      //   (code which executes later fixes the tab order anyway)
      debug('bkgd_loadSavedNode() using existing window', createProperties);
      try {
        await api.tabs.create(createProperties);
      } catch (err) {
        popNode(node);
        warn(`loadSavedTab failed: ${err}`);
        response.result = err;
      }
    }
    //response.tabId = newTab.id;  // doesn't exist yet
    // TODO: need to modify onTabCreated and onWindowCreated
    //   to check a queue of nodes which are in the process of being loaded
    if (! response.result) response.result = 'ok';
    return response;
  }

  async bkgd_convertNodeToLoadedWindow (msg) {
    // assumes this node contains loaded tabs and is not a window or a tab
    await this.treeLoaded;  // ensure tree is loaded
    const response = {};
    let node = this.tree.nodes[msg.nodeId];
    if ((! node) || node.isRoot() || (node.url)) {
      const err = `bkgd_convertNodeToLoadedWindow(): invalid node`;
      error(err);
      return { error: err };
    }
    // convert a label to a window
    const changes = { type: 'window', loaded: false };
    const parentWindowNode = node.getWindowNode();
    if (parentWindowNode) changes.incognito = parentWindowNode.incognito;
    const changed = await node.setTabFields(
      changes, { reason: 'convertNodeToWindow' });
    //debug(`bkgd_convertNodeToLoadedWindow(): changed=${changed}`, changed);
    if (changed) {
      const r = await this.bkgd_loadSavedWindow(
        { windowNodeId: node.id, nodeId: node.id });
      if (r.result) response.result = r.result;
      else if (r.error) result.error = r.err;
    }
    else response.result = 'nop';
    return response;
  }

  async bkgd_convertNodeFromLoadedWindow (msg) {
    // assumes this node is a window with loaded tabs
    // and has a parent window with matching incognito status
    // (but parent might not be loaded)
    await this.treeLoaded;  // ensure tree is loaded
    const response = {};
    let node = this.tree.nodes[msg.nodeId];
    if ((! node) || (! node.canBeConvertedFromWindow())) {
      const err = `bkgd_convertNodeFromLoadedWindow(): invalid node`;
      error(err);
      return { error: err };
    }
    // convert a window to a label
    const changes = {
      type: '',
      loaded: false, wasLoaded: false,
      incognito: undefined,
    };
    const parentWindowNode = node.parent.getWindowNode();
    const changed = await node.setTabFields(
      changes, { reason: 'convertNodeFromWindow' });
    //debug(`bkgd_convertNodeFromLoadedWindow(): changed=${changed}`, changed);
    if (changed) {
      let r;
      if (parentWindowNode.isLoaded()) {
        debug(`bkgd_convertNodeFromLoadedWindow(loadedParent)`);
        r = await this.bkgd_reorderAllTabsInThisWindow(
          { nodeId: node.id });
      } else {
        debug(`bkgd_convertNodeFromLoadedWindow(unloadedParent)`);
        r = await this.bkgd_loadSavedWindow(
          { windowNodeId: parentWindowNode.id, nodeId: node.id });
      }
      if (r.result) response.result = r.result;
      else if (r.error) result.error = r.err;
    }
    else response.result = 'nop';
    return response;
  }

  async bkgd_loadSavedWindow (msg) {
    await this.treeLoaded;  // ensure tree is loaded
    const response = {};
    // this only gets called when moving loaded tab(s) to an unloaded window
    // so it requires the window node and the branch which got moved
    let windowNode = this.tree.nodes[msg.windowNodeId];
    let node = this.tree.nodes[msg.nodeId];
    if ((! windowNode) || (! node)) {
      const err = `bkgd_loadSavedWindow(): no nodes found`;
      error(err);
      return { error: err };
    }
    // if already loaded, do nothing
    if (windowNode.isLoaded()) { return response; }
    // list of open tabs in the new window
    const loadedKids = node.getLoadedTabs();
    if (node.isLoaded()) loadedKids.unshift(node);
    const tabIds = loadedKids.map((n) => n.tabId);
    // push window node to be loaded
    this.windowsLoading.push(windowNode);
    // actually open the window
    const createProperties = windowNode.windowCreateData();
    createProperties.tabId = tabIds[0];  // dang, it only allows one
    debug('bkgd_loadSavedWindow() creating saved window', createProperties, windowNode);
    try {
      const winObj = await api.windows.create(createProperties);
      debug('bkgd_loadSavedWindow() created window', winObj);
    } catch (err) {
      this.windowsLoading.pop(windowNode);
      warn(`loadSavedWindow failed: ${err}`);
      response.result = err;
    }
    // pull in the other tabs
    // (removed: other code has already done this at least once
    //  by the time this line runs)
    //await node.reorderAllTabsInThisWindow();
    // return success
    if (! response.result) response.result = 'ok';
    return response;
  }

  async bkgd_reorderAllTabsInThisWindow (msg) {
    // This function exists to avoid race conditions caused by multiple
    // threads trying to reorder tabs at the same time.  They are all
    // redirected here, so the requests can be processed without interfering
    // with each other.
    // Duplicate requests are ignored / debounced, since it only needs
    // to handle *one* event.
    await this.treeLoaded;  // ensure tree is loaded
    let node = this.tree.nodes[msg.nodeId];
    if (! node) {
      const err = `bkgd_reorderAllTabsInThisWindow(): no node found: "%{msg.nodeId}"`;
      error(err);
      return { error: err };
    }

    // event is already scheduled for handling, nothing further to do
    if (this.needsTabReorder) return { result: 'ok pending' };

    // debounce new requests until event is handled
    this.needsTabReorder = true;
    this.tabReorderDebounceTime = 100;  // ms

    // actually handle the event, but delayed, and only once per batch
    this.tabReorderTimeout = setTimeout(async () => {
      try {
        await node.reorderAllTabsInThisWindow();
      }
      //catch (err) {
      //  error(`bkgd_reorderAllTabsInThisWindow error:`, err);
      //}
      finally {
        this.needsTabReorder = false;
      }
    }, this.tabReorderDebounceTime);

    return { result: 'ok scheduled' };
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
        // imports always start collapsed
        // (avoids a ton of drawing during load)
        node.expanded = false;
        // generate a title
        const label = filename;
        if (node.label) node.label = `${label} (${node.label})`;
        else node.label = label;
        // generate a description
        const filenameStr = `Filename: ${filename}\n`;
        const importText = `${filenameStr}Session Started: ${ctimeStr}\nExported: ${etimeStr}\nImported: ${itimeStr}`;
        if (node.note) node.note = importText + '\n' + node.note;
        else node.note = importText;
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
        const newNode = await parent.addChild(destIndex, childDict,
          { reason: 'importFile' });
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

    return sessionRoot.countNodes();
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
    return rootNode.countNodes();
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
          details.label = `Tabs Outliner Session`;
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
          // create the root / session node's long note
          const ctimeStr = fmtDate(rootNode.ctime);
          const itimeStr = fmtDate(rootNode.sessionImportTime);
          const etimeStr = fmtDate(rootNode.sessionExportTime);
          let filenameStr = '';
          if (filename) filenameStr = `Filename: ${filename}\n`;
          rootNode.note = `${filenameStr}Session Started: ${ctimeStr}\nExported: ${etimeStr}\nImported: ${itimeStr}`;
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
          details.label = fields.marks.customTitle;
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
          if (! details.label) details.label = 'Window';
          if (fields.data) {
            const d = fields.data;
            // parse data.type for window type
            let winType = '';
            if (d.type && (d.type !== 'normal')) {
              // capitalize 1st letter
              winType = String(d.type).charAt(0).toUpperCase()
                + String(d.type).slice(1);
              details.label = `${winType} ${details.label}`;
            }
            // parse data.crashDetectedDate
            if (d.crashDetectedDate) {
              const dateStr = fmtDate(Number(d.crashDetectedDate));
              details.label = `${details.label} (crashed ${dateStr})`;
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
        // label-only nodes
        else if ('textnote' === fields.type) {
          // parse data.note
          details.label = fields.data.note;
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
        const newNode = await parent.addChild(destIndex, node,
          { reason: 'importFile' });
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

  async onCommand (command, tab) {
    debug(`Bkgd.onCommand(${command})`, tab);
    const bkgdCommands = [
      'unloadCurrentTab',
      'bookmarkCurrentTab',
      'unmarkAll',
      'backupSession',
    ];
    // decide whether Bkgd or TreeView should handle the command
    if (bkgdCommands.includes(command)) {
      // Bkgd can handle this
      const handler = this[`command_${command}`];
      // actually handle the event
      await handler.bind(this)(tab);
      return;
    }
    // otherwise, send the command to the current window's TreeView
    // get the focused window
    const window = await chrome.windows.getLastFocused();
    if (window) {
      debug(`Bkgd.onCommand(${command})`, window);
      // send a message to the sidepanel of that window
      emit(`treeview_onCommand`, {
        windowId: window.id,
        action: command,
        tab: tab
      });
    }
  }

  command_unloadCurrentTab (tab) {
    debug('Bkgd.command_unloadCurrentTab()', tab);
    let tabNode;
    if (tab) {
      tabNode = this.tree.getNodeByTabId(tab.id);
    } else {
      // TODO? find the current tab
      // (maybe ... maybe not, because if 'tab' is undefined,
      //  that probably means there isn't one and we should do nothing)
    }
    if (! tabNode) { return; }
    return tabNode.unload({ reason: 'userAction' });
  }

  async command_bookmarkCurrentTab (tab) {
    if (! tab) return;
    debug(`bookmark(${tab.title})`, tab);
    const tabNode = this.tree.getNodeByTabId(tab.id);
    if (! tabNode) return;
    // add a new bookmark node in place of tabNode,
    // and make tabNode the first child of the bookmark
    const parentNode = tabNode.parent;
    const bmNode = await parentNode.addChild(tabNode.indexOf(),
      { bookmark: true, loaded: false,
        url: tabNode.url, title: tabNode.title,
        label: tabNode.label, note: tabNode.note,
        checkbox: tabNode.checkbox, },
      { reason: 'userAction' });
    if (! bmNode) return error(`failed to add bookmark`, tabNode);
    const moved = await tabNode.moveTo(bmNode, 0, { reason: 'userAction'});
    if (! moved) return error(`failed to move tab into bookmark`,
      tabNode, bmNode);
    return moved;
  }

  command_unmarkAll (tab) {
    debug('Bkgd.command_unmarkAll()');
    return this.tree.unmarkAll({ reason: 'userAction' });
  }

  command_backupSession (tab) {
    debug('Bkgd.command_backupSession()');
    return this.tree.downloadBackupNow();
  }

}

const bkgd = new Bkgd();
bkgd.init();

