// view/treeview.js: TreeView class
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: AGPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import {
  emit, log, debug, warn, error
} from '/common/common.js';
import { ThemedPage } from '/themes/themes.js';
import { buildEventName } from '/common/events.js';
import { inputDialog, checkboxDialog, nodeEditDialog } from '/common/dialog.js';
import { NodeView } from './nodeview.js';
import { Tree } from '/common/tree.js';
import { Mutex } from '/common/mutex.js';


export class TreeView extends Tree {

  constructor (args = {}) {
    super(NodeView);

    this.document = document;
    this.window = window;

    this.treeViewLoaded = new Promise(resolve => {
      this.resolveTreeViewLoaded = resolve;
    });

    // false = interactive "real" TreeView
    // true = static read-only TreeView for demonstration purposes
    this.isInert = args.isInert;

    this.cfgDefaults = { ...this.cfgDefaults,
      cursorFollowsActiveTab: true,
      activeTabExpandsItsParents: true,
      nodesPerPage: 20,
      doubleClickMs: 500,
      treeViewZoomLevel: 1.0,
      alwaysShowNodeStats: true,
      wasLoadedNodeStats: true,
      hideTopButtonsDuringSearch: false,
      loadCollapsedBranchStyle: 'ask',
      loadExpandedBranchStyle: 'ask',
      unloadCollapsedBranchStyle: 'ask',
      unloadExpandedBranchStyle: 'ask',
      deleteExpandedBranchStyle: 'ask',
    };
    // TODO: determine whether full view or single-window

    // { nodeId: node, ... }
    this.expandOverrides = {};

    // undo/redo stacks of { label, undo: async fn, redo: async fn } entries
    this.undoStack = [];
    this.redoStack = [];
  }

  destroy () {
  }

  initElements () {
    const doc = this.document;
    this.$body = doc.getElementById('body');
    if (! this.$) this.$ = doc.getElementById('tree-view');
    if (! this.$treeRoot) this.$treeRoot = doc.getElementById('tree-root');

    this.cursor = null;

    this.$topBar = doc.getElementById('top-bar');
    this.$bottomBar = doc.getElementById('bottom-bar');

    this.$viewScopeBtn = doc.getElementById('view-scope-btn');

    // undo / redo buttons
    this.$undoBtn = doc.getElementById('undo-btn');
    this.$redoBtn = doc.getElementById('redo-btn');

    // zoom buttons (kept compact, alongside undo/redo)
    this.$zoomOutBtn = doc.getElementById('zoom-out-btn');
    this.$zoomInBtn = doc.getElementById('zoom-in-btn');
    // number of steps per "octave"
    this.zoomSteps = 12;
    this.zoomMax = 3;
    this.zoomMin = 1 / this.zoomMax;

    this.$searchBar = doc.getElementById('search-bar');
    this.$searchEntry = doc.getElementById('search-entry');
    this.$searchCount = doc.getElementById('search-count');
    if (! this.isInert) {
      this.$searchEntry.addEventListener('input', (event) => {
        return this.onSearchEntryUpdated(event);
      });
      this.$searchEntry.addEventListener('focus', (event) => {
        return this.onSearchEntryFocused(event);
      });
      this.$searchEntry.addEventListener('blur', (event) => {
        return this.onSearchEntryUnfocused(event);
      });
    }

    // drag-n-drop scroll zone size
    this.dragScrollZone = 0.15;  // 15% top and bottom

    // shows info about most recent event
    //this.$statusBar = doc.getElementById('status-bar');
    this.$statusText = doc.getElementById('status-text');
    this.$detailsBox = doc.getElementById('details-box');
    this.$detailsBtn = doc.getElementById('details-btn');
    // TODO: this should load from config
    this.detailsState = 1;  // 0=off, 1=notes, 2=details
    // open a tree view in a new tab
    this.$treeViewInTabBtn = doc.getElementById('tree-view-in-tab-btn');
    // click to save a session backup
    this.$backupBtn = doc.getElementById('backup-btn');
    // open the extension's options page
    this.$optionsBtn = doc.getElementById('options-btn');
    // help the project survive, and help me pay rent
    this.$donateBtn = doc.getElementById('donate-btn');
    // open the extension's help page
    this.$helpBtn = doc.getElementById('help-btn');

    // count of marked nodes when non-zero
    this.$markedCount = doc.getElementById('marked-count');

    // node row hover menu
    this.$hoverMenu = doc.getElementById('hover-menu');

    // some functions don't work in incognito windows in Chrome-based browsers
    // because of its "spanning" vs "split" modes for incognito extensions
    // (we use "spanning" mode, because "split" mode would break tktsto)
    if (isChrome && (! this.isInert)) {
      api.windows.getCurrent({ populate: false}, win => {
        if (win.incognito) {
          // grey out buttons to warn the user they won't work as expected
          if (this.$treeViewInTabBtn) this.$treeViewInTabBtn.classList.add('greyed-out');
          if (this.$optionsBtn) this.$optionsBtn.classList.add('greyed-out');
          if (this.$helpBtn) this.$helpBtn.classList.add('greyed-out');
        }
      });
    }
  }

  async init () {
    await super.init();

    this.document = document;
    this.window = window;

    this.initElements();

    if (! this.isInert) {
      this.themedPage = new ThemedPage('/view/sidepanel');
      this.themedPage.init();

      this.keyEventMutex = new Mutex();

      // misc handlers
      this.initBodyHandlers();
      this.initKeyHandler();
      this.initMouseHandler();
      this.initButtonHandlers();

      // config watchers
      this.cfg.watch('treeViewZoomLevel',
        (key, newVal, oldVal) => this.setZoomLevel(newVal, oldVal));
      this.setZoomLevel(this.cfg.treeViewZoomLevel, this.cfg.treeViewZoomLevel);

      // clear "expanded" overrides when this option is turned off
      this.cfg.watch('activeTabExpandsItsParents',
        (key, newVal, oldVal) => {
          if (! newVal) {
            this.expandOverrideClear();
            this.ensureCursorVisible();
            this.$renderWholeTree();
          }
        },
        1000  // debounce a bit since this change is expensive
      );
    }

    // config watchers for inert DocTreeViews
    this.cfg.watch('alwaysShowNodeStats', () => this.$renderWholeTree());
    this.cfg.watch('wasLoadedNodeStats', () => this.$renderWholeTree());

    this.nodeIdMimeType = 'application/x-tktsto-node-id';
    // get the window this view is attached to
    this.windowObj = await api.windows.getCurrent();
    this.windowId = this.windowObj.id;

    if (! this.isInert) {
      // init connection to bkgd
      await this.initBkgdPort();
      this.initBkgdPing();
      this.id = await this.newNodeId();
      // TODO: load the nodes from storage and render them
      await this.loadTreeFromBkgd(false);
    }

    //this.root = new NodeView(this, null, this.window);
    this.root.window = this.window;

    // figure out which window we are and whether to view the whole tree
    if (this.isInert) {
      this.viewScope = 'session';
    } else {
      this.windowNode = this.root.getWindowId(this.windowId);
      let defaultViewScope = 'window';
      // 1st window defaults to Session mode, others use Window mode
      if (this.windowNode.parent.isRoot() && (0 === this.windowNode.indexOf()))
      { defaultViewScope = 'session'; }
      this.viewScope = await this.getWindowConfig('viewScope', defaultViewScope);
      if (! this.viewScope) this.viewScope = defaultViewScope;

      await this.detectTabOrSidepanel();
      this.registerWithBkgd();
    }

    this.$renderViewScopeBtn();

    this.$renderWholeTree();

    // apply the user's detail box setting
    this.$renderDetailsBtn();

    // build the hover menu
    this.$renderHoverMenu();

    // ensure the cursor is somewhere sane when sidepanel opens
    this.ensureCursorVisible();

    // let listeners know the tree is loaded
    this.resolveTreeViewLoaded();
  }

  async loadTreeFromBkgd (render = true) {
    // save any state which needs to be restored on new Tree
    let oldCursor;
    if (this.cursor) {
      oldCursor = this.cursor.id;
    }

    // load the tree
    await super.loadTreeFromBkgd();

    // render ... everything
    if (render) this.$renderWholeTree();

    this.updateMarkedCount();

    // restore state
    if (oldCursor) {
      const newCursor = this.nodes[oldCursor];
      await this.setCursor(newCursor, { instant: true });
    }
  }

  $renderWholeTree () {
    // display the entire tree
    if (('session' === this.viewScope) || (! this.windowNode))
      this.viewRoot = this.root;
    // display only this window
    else if ('window' === this.viewScope)
      this.viewRoot = this.windowNode;
    // show the nodes
    this.viewRoot.$render();
    this.viewRoot.$renderChildren();
    if (this.root.$) this.root.$.classList.add('root-nodes');
    // add the view root node to the page
    if (this.$treeRoot.childNodes.length > 0) {
      this.$treeRoot.replaceChild(
        this.viewRoot.$,
        this.$treeRoot.childNodes[0]);
    }
    else this.$treeRoot.appendChild(this.viewRoot.$);
  }

  setStatus (msg) {
    this.$statusText.textContent = msg;
  }

  async getWindowConfig (varName, defaultValue) {
    // can't do anything unless we know which window we are
    if (! this.windowNode) return;
    // load from config, per window
    const key = `TreeView.${varName}.${this.windowNode.id}`;
    if (this.cfg[key]) return this.cfg[key];
    else return this.cfg.get(key, defaultValue);
  }

  setWindowConfig (varName, value) {
    // can't do anything unless we know which window we are
    if (! this.windowNode) return;
    // save to config, per window
    const key = `TreeView.${varName}.${this.windowNode.id}`;
    return this.cfg.set(key, value);
  }

  updateMarkedCount () {
    // add a "+" to the number if any marked nodes have kids
    let plus = '';
    for (const nodeId of this.markedNodes) {
      const node = this.nodes[nodeId];
      if (node.hasKids()) {
        plus = '+';
        break;
      }
    }
    // update the counter widget
    this.$markedCount.innerText = `${this.markedNodes.length}${plus}`;
    if (this.markedNodes.length <= 0)
      this.$markedCount.classList.add('hidden');
    else this.$markedCount.classList.remove('hidden');
  }

  onMarkedCountHover () {
    this.hideHoverMenu();
  }

  onMarkedCountClick (event) {
    this.action_pasteMarked(event);
  }

  showSearch () {
    this.$searchBar.classList.remove('hidden');
    this.$searchCount.classList.remove('hidden');
  }

  hideSearch () {
    this.$searchBar.classList.add('hidden');
    this.$searchCount.classList.add('hidden');
  }

  focusSearchBar () {
    this.$searchEntry.classList.add('focus');
    this.$searchEntry.focus();
  }

  unfocusSearchBar () {
    this.$searchEntry.classList.remove('focus');
    this.$searchEntry.blur();
  }

  async startSearch () {
    // hover menu unfocuses $searchEntry, force hide it
    this.hideHoverMenu();
    // disable the main key event handler while $searchEntry is focused
    this.searchCaptureInput = true;
    // separate flag for whether a search is in progress,
    // even when main key event handler is enabled
    this.searchActive = true;
    this.showSearch();
    if (this.cfg.hideTopButtonsDuringSearch) {
      this.$topBar.classList.add('hidden');
    }
    await this.updateSearch();
    this.focusSearchBar();
  }

  keepSearchAndReleaseFocus () {
    // give keyboard focus back to main TreeView
    // but let the search stay active
    debug('keepSearchAndReleaseFocus');
    this.searchCaptureInput = false;
    this.searchActive = true;
    this.unfocusSearchBar();
  }

  async cancelSearch () {
    this.$topBar.classList.remove('hidden');
    this.unfocusSearchBar();
    this.hideSearch();
    this.searchString = '';
    this.$searchEntry.value = '';
    this.searchMatchNum = 0;
    this.searchTotal = 0;
    await this.updateSearch();
    this.searchCaptureInput = false;
    this.searchActive = false;
  }

  async updateSearch () {
    if (! this.searchString) {
      this.searchMatchNum = 0;
      this.searchTotal = 0;
      this.searchMatches = [];
      this.updateSearchCount();
      // don't collapse the most recent match yet
      //await this.activateSearchMatch(null);
      return;
    }

    const matches = this.viewRoot.search(this.searchString);
    this.searchMatches = matches;
    this.searchTotal = matches.length;
    if (matches.length <= 0) {
      this.searchMatchNum = 0;
      this.searchTotal = 0;
      await this.activateSearchMatch(null);
    }
    else if (matches.includes(this.cursor)) {
      await this.activateSearchMatch(this.cursor);
    }
    else {
      await this.activateSearchMatch(matches[0]);
    }
  }

  async activateSearchMatch (node) {
    debug(`${node?.toLine()}`);
    const oldMatch = this.searchMatch;
    const newMatch = node;
    this.searchMatch = newMatch;

    if (newMatch) {
      this.hideHoverMenu();
      await this.expandOverride(newMatch, true);
    }
    if (oldMatch && (oldMatch !== newMatch))
      await this.expandOverride(oldMatch, null);
    if (newMatch) {
      // wait for expansion changes to take effect before moving cursor
      setTimeout(() => { this.setCursor(newMatch); }, 1);
    }
    this.updateSearchCount();
  }

  updateSearchCount () {
    let num, denom;
    if (this.searchMatches) {
      this.searchTotal = this.searchMatches.length;
      if (this.searchMatch)
        this.searchMatchNum = this.searchMatches.indexOf(this.searchMatch);
      else this.searchMatchNum = 0;
      num = this.searchMatchNum + 1;
      denom = this.searchTotal;
      if (! denom) num = '-';
    } else {
      this.searchTotal = 0;
      this.searchMatchNum = 0;
      num = '-';
      denom = '0';
    }
    this.$searchCount.innerText = `${num}/${denom}`;
  }

  async action_beginSearch () {
    // search by text entry
    debug('beginSearch');
    await this.startSearch();
  }

  async action_searchForCurrent (event) {
    // search by node
    debug('searchForCurrent');
    const cursor = this.whichCursor(event);
    if (! cursor) return;
    this.searchString = cursor;
    this.$searchEntry.value = `node:${cursor.id}`;
    await this.startSearch();
    await this.keepSearchAndReleaseFocus();
  }

  async action_endSearch () {
    // cancel the search, or un-override expanded branches
    debug('endSearch');
    if (this.searchActive) await this.cancelSearch();
    else await this.expandOverrideClear();
  }

  async action_nextSearchResult (event, prev = false) {
    debug(`prev: ${prev}`);
    if (this.searchMatches.length > 0) {
      if (prev) {
        this.searchMatchNum --;
        if (this.searchMatchNum < 0)
          this.searchMatchNum = this.searchMatches.length - 1;
      } else {
        this.searchMatchNum = (this.searchMatchNum + 1) % this.searchTotal;
      }
      const newMatch = this.searchMatches[this.searchMatchNum];
      await this.activateSearchMatch(newMatch);
    }
  }

  action_prevSearchResult (event) {
    return this.action_nextSearchResult(event, true);
  }

  searchKeyHandler (event) {
    const keyName = buildEventName(event);
    // allow specific events to fall through to non-search key handler
    const passThru = {
      //'Escape' : true,
      'ArrowUp' : true,
      'ArrowDown' : true,
      'PageUp' : true,
      'PageDown' : true,
    };
    if (passThru[keyName]) return true;

    switch (keyName) {
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.cancelSearch();
        break;
      case 'Enter':
        event.preventDefault();
        event.stopPropagation();
        this.keepSearchAndReleaseFocus();
        break;
      default:
        // gaaaaah, search entry keeps getting unfocused
        // after each keystroke... why???
        // (but only if I haven't clicked in it)
        //setTimeout(() => this.$searchEntry.focus(), 1);
        // okay, the problem was the hover menu... it blurs $searchEntry
        // as soon as it appears ... so hiding it eliminated the need
        // for this icky kludge
        break;
    }
  }

  async onSearchEntryUpdated (event) {
    if (! this.searchActive) return;

    // debounce, so it won't update too fast while typing
    if (this.onSearchEntryUpdatedTimer)
      clearTimeout(this.onSearchEntryUpdatedTimer);
    this.onSearchEntryUpdatedTimer = setTimeout(() => {
      const oldVal = this.searchString;
      const newVal = this.$searchEntry.value;
      debug(`search: ${newVal}`);
      this.searchString = newVal;
      if (newVal !== oldVal) this.updateSearch();
    }, 250);
  }

  onSearchEntryFocused (event) {
    debug('focus');
    this.searchCaptureInput = true;
    this.$searchEntry.classList.add('focus');
  }

  onSearchEntryUnfocused (event) {
    debug('unfocus');
    this.searchCaptureInput = false;
    this.$searchEntry.classList.remove('focus');
  }

  async expandOverrideClear () {
    // un-override all locally-expanded nodes
    for (const [nodeId, node] of Object.entries(this.expandOverrides)) {
      await this.expandOverride(node, null);
    }
  }

  async expandOverride (node, expand) {
    // expand: true or null
    // (expand or unset)
    // (was going to support "false = collapse" too, but there's no need)
    if (! node) return;
    //debug(`${expand}, ${node.toLine()}`)
    const viewRoot = this.viewRoot;
    if (expand) {
      this.expandOverrides[node.id] = node;
      // force expand
      const origNode = node;
      node = node.parent;
      // override a node and all its parents
      while (node && node.isChildOf(viewRoot)) {
        //debug(`override ${node.toLine()}`);
        await node.setExpanded(true, {
          reason: 'override', localOverride: true,
        });
        node = node.parent;
      }
    }
    //else if (false === expand) {
    //}
    else if (this.expandOverrides[node.id]) {
      // TODO: redraw affected node
      delete this.expandOverrides[node.id];
      let n = node;
      // un-override a node and its parents,
      // until it intersects another override's parents
      while (n && n.isChildOf(viewRoot) && (! n.isExpandedOverride())) {
        await n.setExpanded(n.expanded, {
          reason: 'override', localOverride: true,
        });
        n = n.parent;
      }
    }
  }

  async inputDialog (...args) {
    // disable key event handling while dialog is active
    this.dialogActive = true;
    const result = await inputDialog(...args);
    this.dialogActive = false;
    return result;
  }

  async nodeEditDialog (...args) {
    // disable key event handling while dialog is active
    this.dialogActive = true;
    const result = await nodeEditDialog(...args);
    this.dialogActive = false;
    return result;
  }

  async checkboxDialog (...args) {
    // disable key event handling while dialog is active
    this.dialogActive = true;
    const result = await checkboxDialog(...args);
    this.dialogActive = false;
    return result;
  }

  initBodyHandlers () {
    // absolutely NEVER scroll horizontally
    this.$body.addEventListener('scroll', () => { this.$body.scrollLeft = 0; });
    //
    this.window.addEventListener('focus', () => {
      this.$body.classList.remove('unfocused');
    });
    this.window.addEventListener('blur', () => {
      this.$body.classList.add('unfocused');
    });
  }

  initKeyHandler () {
    // must wrap it in an anon function to fix scoping issues
    // (calling this.keyHandler unwrapped runs in HtmllDocument scope
    //  instead of Tree scope)
    this.document.addEventListener('keydown',
      (event) => { this.keyHandler(event) }
    );
  }

  initMouseHandler () {
    // block default click on tree nodes (left click shouldn't open links)
    this.$treeRoot.addEventListener('click',
      (event) => { this.mouseEvent('click', event) });
    this.$treeRoot.addEventListener('mousedown',
      (event) => { this.mouseEvent('mousedown',event) });
    this.$treeRoot.addEventListener('dblclick',
      (event) => { this.mouseEvent('dblclick', event) });
    // drag-n-drop
    this.$.addEventListener('dragstart',
      (event) => { this.mouseEvent('DragStart', event) });
    this.$.addEventListener('drag',
      (event) => { this.mouseEvent('Drag', event) });
    this.$.addEventListener('drop',
      (event) => { this.mouseEvent('Drop', event) });
    this.$.addEventListener('dragend',
      (event) => { this.mouseEvent('DragEnd', event) });
    this.$.addEventListener('dragleave',
      (event) => { this.mouseEvent('DragLeave', event) });
    this.$.addEventListener('dragover',
      (event) => { this.mouseEvent('DragOver', event) });
    // show/hide the hover menu
    this.$treeRoot.addEventListener('mouseover',
      (event) => { this.mouseEvent('mouseover', event) });
    // hide the hover menu when the mouse leaves the tree view
    this.$.addEventListener('mouseleave',
      (event) => { this.mouseLeave(event) });
  }

  keyHandler (event) {
    // don't try to handle key events while a dialog is visible
    if (this.dialogActive) return;
    // pause regular handling while user is typing in search terms
    if (this.searchCaptureInput) {
      const passThru = this.searchKeyHandler(event);
      if (! passThru) return;
    }
    // calculate a more complete name for this event,
    // then call the keyboard event dispatcher
    const keyName = buildEventName(event);
    this.setStatus(`keydown: ${keyName}`);
    return this.dispatchInputEvent(event);
  }

  async dispatchInputEvent (event) {
    // look up the event name to see if it's mapped to an action
    // ... then call that action
    const handlerName = keyBindings[event.processedName];
    if (handlerName) {
      // bindable actions detectable by naming convention
      const handler = this[`action_${handlerName}`];
      if (handler) {
        // unsure if necessary
        event.preventDefault();
        event.stopPropagation();
        this.hideHoverMenu();
        // actually handle the event, but only one at a time
        const unlock = await this.keyEventMutex.lock();
        try {
          this.setStatus(`key: ${handlerName}`);
          await handler.bind(this)(event);  // equivalent to this.handler(event);
        }
        finally { unlock(); }
      }
      else {
        this.setStatus(`handler not found: ${handlerName}`);
      }
    }
  }

  async mouseEvent (eventType, event) {
    //debug(`TreeView.mouseEvent(${eventType})`, event);
    // don't try to handle mouse events while a dialog is visible
    if (this.dialogActive) return;
    if (this.searchCaptureInput) return;

    // stop scrolling if mouse left the tree view
    if ((isFirefox && (! event.relatedTarget))
      || ((0 === event.x) && (0 === event.x)))
      this.dragScrollSpeed = 0;

    //debug(`mouseEvent(${eventType}):`, event);
    // ensure nothing gets focused / highlighted
    this.document.activeElement.blur();
    // assign an event name based on modifier keys, event type, mouse button
    const eventName = buildEventName(event, eventType);
    //this.setStatus(`mouse: ${eventName}`);
    // identify which row the event was in, if any
    let node = this.root;  // which Tree Node object was clicked?
    let $target = event.target;
    let $node;  // Node's ul.node element
    let $row;  // Node's div.row element
    let $elem;  // most specific element we care about
    //debug(`mouseEvent(${eventType}):`, $target, event);
    while ($target && $target.classList) {
      const className = $target.classList[0];
      if ((! $elem) && [
        'node-stats', 'node-link', 'node-label', 'node-checkbox',
        'row', 'node' ].includes(className)
      ) $elem = $target;
      if ($target.classList.contains('row')) $row = $target;
      if ($target.classList.contains('node')) {
        $node = $target;
        break;  // don't search outside the current node
      }
      $target = $target.parentNode;
    }
    if ($node && $node.id.startsWith('node')) {
      const nodeId = $node.id.slice(4);
      node = this.nodes[nodeId];
    }
    // save these so event handlers can use them
    this.mouseNode = node;
    this.$mouseNode = $node;
    this.$mouseRow = $row;
    this.$mouseElem = $elem;
    this.mouseNodeNonRoot = this.mouseNode;

    // sometimes we need a non-root node, like for drag-n-drop
    if (this.mouseNode?.isRoot()) {
      // check the bounding box of each root-level item,
      // find the closest one above the mouse
      const y = event.clientY;
      let bestTop = -Infinity;
      for (const node of this.viewRoot.nodes) {
        const rect = node.$.getBoundingClientRect();
        if (rect.top <= y && rect.top > bestTop) {
          this.mouseNodeNonRoot = node;
          bestTop = rect.top;
        }
      }
    }

    //debug(`${eventName} ${node.id} `, node, this.$mouseRow);
    //debug(`node: ${node.id}: ${node.toLine()}`, node);
    // identify which part of the row the event was in
    const zoomLevel = this.cfg.treeViewZoomLevel;
    let rowX, rowY, rowWid, rowHgt;
    if ($row) {
      //debug(`clientXY(${event.clientX},${event.clientY}), rowOffset(${$row.offsetLeft},${$row.offsetTop})`);
      rowX = event.clientX - ($row.offsetLeft * zoomLevel);
      rowY = event.clientY - ($row.offsetTop * zoomLevel);
      rowWid = $row.clientWidth * zoomLevel;
      rowHgt = $row.clientHeight * zoomLevel;
    }
    this.$mouseRowX = rowX;
    this.$mouseRowY = rowY;
    this.$mouseRowWid = rowWid;
    this.$mouseRowHgt = rowHgt;
    //debug(`mouseEvent(): rowXY(${rowX},${rowY}) rowWidHgt(${rowWid}x${rowHgt})`);

    // call a handler
    const handlerName = mouseBindings[eventName];
    if (handlerName) {
      const handler = this[`action_${handlerName}`];
      if (handler) {
        if (! [
          'mouseHoverMenu', 'rejectEvent', 'mouseDragEnd'
        ].includes(handlerName))
          this.setStatus(`mouse: ${handlerName}`);
        // equivalent to this.handler(event);
        await handler.bind(this)(event);
      }
    }
  }

  mouseLeave (event) {
    //debug('TreeView.mouseLeave()');
    this.hideHoverMenu();
    this.dragScrollSpeed = 0;
  }

  whichCursor (event) {
    // decide whether to act on mouse hover node or keyboard cursor node
    // based on the event type
    if ('click' === event.type) return this.mouseNode;
    // do nothing if cursor is outside of viewRoot
    else if (! this.cursor.isInViewScope()) return null;
    // normal keyboard event
    else return this.cursor;
  }

  action_none (event) { }

  action_rejectEvent (event) {  // block browser's default handler
    event.preventDefault();
    event.stopPropagation();
  }

  async action_cursorUp (event) {
    if (! this.cursor) return await this.setCursor(this.root);
    // move up one row
    await this.setCursor(this.cursor.prevVisibleNode(this.viewRoot));
  }

  async action_cursorDown (event) {
    if (! this.cursor) return await this.setCursor(this.root);
    // move down one row
    await this.setCursor(this.cursor.nextVisibleNode(this.viewRoot));
  }

  async action_cursorLeft (event) {  // move cursor to parent
    if (! this.cursor) return await this.setCursor(this.root);
    // ignore if root
    if (this.cursor.isRoot()) return;
    if (this.viewRoot === this.cursor) return;
    // move to parent
    await this.setCursor(this.cursor.parent);
  }

  async action_cursorRight (event) {
    // expand current node and move cursor to 1st child
    // default
    if (! this.cursor) return await this.setCursor(this.root);

    // if no kids, do nothing
    if (this.cursor.isLeaf()) return;

    // expand if necessary
    if (! this.cursor.isExpanded()) {
      await this.cursor.setExpanded(true, { reason: 'userAction' });
    }

    // move to 1st child
    await this.setCursor(this.cursor.nodes[0]);
  }

  async action_cursorHome (event) {
    if (! this.cursor) return await this.setCursor(this.root);
    // move to first sibling
    const node = this.cursor.firstSibling();
    if (node.isChildOf(this.viewRoot, true))
      await this.setCursor(node);
  }

  async action_cursorEnd (event) {
    if (! this.cursor) return await this.setCursor(this.root);
    // move to last sibling
    const node = this.cursor.lastSibling();
    if (node.isChildOf(this.viewRoot, true))
      await this.setCursor(node);
  }

  async action_cursorPgUp (event) {
    if (! this.cursor) return await this.setCursor(this.root);
    // move up N rows
    let node = this.cursor;
    for (let i=0; i<this.cfg.nodesPerPage; i++)
      node = node.prevVisibleNode(this.viewRoot);
    await this.setCursor(node);
  }

  async action_cursorPgDown (event) {
    if (! this.cursor) return await this.setCursor(this.root);
    // move up N rows
    let node = this.cursor;
    for (let i=0; i<this.cfg.nodesPerPage; i++)
      node = node.nextVisibleNode(this.viewRoot);
    await this.setCursor(node);
  }

  async cursorNodeMoveTo(destParent, destIndex, direction) {
    const moved = await this.cursor.moveTo(
      destParent, destIndex,
      { reason: 'userAction' });
    if (moved) this.setStatus(`moved ${direction}: ${this.cursor.toLine()}`);
    return moved;
  }

  async action_moveNodeUp (event) {
    debug('TreeView.action_moveNodeUp()');

    // if root or 1st child of root, or if outside of root, do nothing
    const cursor = this.cursor;
    if (! cursor) return;
    if (cursor.isRoot()) return;
    if (! cursor.isChildOf(this.viewRoot, false)) return;
    if (cursor.parent.isRoot() && (0 === cursor.indexOf())) return;
    if ((cursor.parent === this.viewRoot) && (0 === cursor.indexOf())) return;

    // node can be moved up
    const prevRow = cursor.prevVisibleNode();
    const destParent = prevRow.parent;
    let destIndex;

    // if prev row is our parent or sibling, take its place
    if ((prevRow === cursor.parent) || (prevRow.parent === cursor.parent)) {
      destIndex = prevRow.indexOf();
    }
    // otherwise dive into an expanded branch
    // (move right to become prev row's next sibling)
    else {
      destIndex = prevRow.indexOf() + 1;
    }

    // move it
    await this.cursorNodeMoveTo(destParent, destIndex, 'up');
  }

  async action_moveNodeDown (event) {
    debug('TreeView.action_moveNodeDown()');

    // if root, or outside of root, do nothing
    const cursor = this.cursor;
    if (! cursor) return;
    if (cursor.isRoot()) return;
    if (! cursor.isChildOf(this.viewRoot, false)) return;

    // take position of next visible row outside our own branch, probably
    const nextRow = cursor.nextVisibleNodeNotMyChild(this.viewRoot);
    // figure out where to move to
    let destParent;
    let destIndex;
    // if we're the last row in the tree, promote to last child of parent
    if (nextRow === cursor) {
      if (cursor.parent.isRoot()) return;
      if (cursor.parent === this.viewRoot) return;
      destParent = cursor.parent.parent;
      destIndex = cursor.parent.indexOf() + 1;
    }
    // next row is our sibling and an expanded parent: move before 1st child
    else if (nextRow.hasKids() && nextRow.isExpanded()
      && (nextRow.parent === cursor.parent)
    ) {
      destParent = nextRow;
      destIndex = 0;
    }
    else {
      destParent = nextRow.parent;
      if (destParent === cursor.parent) {
        // next row is our sibling; swap places with it
        destIndex = nextRow.indexOf() + 1;
      } else {
        // exit an expanded branch
        // dedent (move left) and take exact position of next visible row
        destIndex = nextRow.indexOf();
      }
    }

    // move it
    await this.cursorNodeMoveTo(destParent, destIndex, 'down');
  }

  async action_moveNodeUpNoDescend (event) {
    debug('TreeView.action_moveNodeUpNoDescend()');

    const cursor = this.cursor;
    const viewRoot = this.viewRoot;

    // if root, or 1st child of root, do nothing
    if (! cursor) return;
    if (cursor.isRoot() || (cursor === viewRoot)) return;
    if ((cursor.parent.isRoot() || (cursor.parent === viewRoot))
      && (0 === cursor.indexOf())) return;
    if (! cursor.isInViewScope()) return;

    // node can be moved up
    let destParent;
    let destIndex;
    // if 1st child, take parent's parent and index
    if (0 === cursor.indexOf()) {
      destParent = cursor.parent.parent;
      destIndex = cursor.parent.indexOf();
    }
    // if prev sibling, take its index
    else {
      destParent = cursor.parent;
      destIndex = cursor.indexOf() - 1;
    }

    // actually move it
    await this.cursorNodeMoveTo(destParent, destIndex, 'up');
  }

  async action_moveNodeDownNoDescend (event) {
    debug('TreeView.action_moveNodeDownNoDescend()');

    const cursor = this.cursor;
    const viewRoot = this.viewRoot;

    // if root, or last child of root, do nothing
    if (! cursor) return;
    if (cursor.isRoot() || (cursor === viewRoot)) return;
    if ((cursor.parent.isRoot() || (cursor.parent === viewRoot))
      && (cursor.indexOf() >= (cursor.parent.nodes.length - 1))) return;
    if (! cursor.isInViewScope()) return;

    // node can be moved down
    const nextVisible = cursor.nextVisibleNodeNoKids(viewRoot);
    const destParent = nextVisible.parent;
    const destIndex = nextVisible.indexOf() + 1;

    // actually move it
    await this.cursorNodeMoveTo(destParent, destIndex, 'down');
  }

  async action_moveNodeRight (event) {
    // skip no-op cases
    if (! this.cursor) return;
    if (this.cursor.isRoot()) return;
    if (! this.cursor.isChildOf(this.viewRoot, false)) return;
    // if already first child, do nothing
    if (0 === this.cursor.indexOf()) return;

    // TODO? move this logic to Node class
    // new parent is previous sibling
    const destParent = this.cursor.parent.nodes[this.cursor.indexOf() - 1];

    let destIndex;
    // if destParent expanded, make this node the last child
    if (destParent.isExpanded()) {
      destIndex = destParent.nodes.length;
    }
    // if new parent collapsed, make this node the *first* child
    // TODO: destination should be configurable
    else {
      destIndex = 0;
    }

    // move it
    const moved = await this.cursorNodeMoveTo(destParent, destIndex, 'right');
  }

  async action_moveNodeLeft (event) {
    // skip no-op cases
    if (! this.cursor) return;
    if (this.cursor.isRoot()) return;
    if (this.cursor.parent.isRoot()) return;
    if (! this.cursor.isChildOf(this.viewRoot, false)) return;
    if (! this.cursor.parent.isChildOf(this.viewRoot, false)) return;

    // become next sibling of parent
    const destParent = this.cursor.parent.parent;
    const destIndex = this.cursor.parent.indexOf() + 1;

    // move it
    await this.cursorNodeMoveTo(destParent, destIndex, 'left');
  }

  async getActiveTabThisWindow () {
    // find our window
    let winNode = viewRoot;
    if ('session' === this.viewScope) {
      // find the current window in the tree
      const win = await api.windows.getCurrent();
      let found = viewRoot.findNodes((node) => {
        return (node.isWindow() && (win.id === node.windowId));
      });
      if (found.length > 0) winNode = found[0];
    }
    const activeTabNode = winNode.getActiveTab();
    return activeTabNode;
  }

  async action_prevOrNextTab (event, which = 'next') {
    debug(`action_prevOrNextTab(${which})`, event);
    if ('command' !== event.type) {
      return;  // this is a command-only action
    }

    const winNode = this.root.getWindowId(this.windowId);
    let activeTabNode = this.getNodeByTabId(event.tab.id);
    if (! activeTabNode) activeTabNode = winNode.getActiveTab();
    const loadedTabNodes = winNode.getLoadedTabs();
    let oldTabIndex = loadedTabNodes.indexOf(activeTabNode);
    debug(`action_prevOrNextTab(${which} ${oldTabIndex})`, winNode, activeTabNode, loadedTabNodes);
    if (oldTabIndex < 0) {
      warn('action_prevOrNextTab(): current tab not found');
      return;
    }

    let newTabIndex = oldTabIndex;
    if ('next' === which) {
      newTabIndex ++;
      if (newTabIndex >= loadedTabNodes.length) newTabIndex = 0;
    } else {
      newTabIndex --;
      if (newTabIndex < 0) newTabIndex = loadedTabNodes.length - 1;
    }
    const newTab = loadedTabNodes[newTabIndex];
    await newTab.setActive(true, { reason: 'userAction' });
  }

  action_prevTab (event) {
    return this.action_prevOrNextTab(event, 'prev');
  }

  action_nextTab (event) {
    return this.action_prevOrNextTab(event, 'next');
  }

  async addNodeAsPrevOrNextVisibleRow (position) {
    // ensure valid position: prev or next
    if (undefined === position) position = 'next';
    if ('next' !== position) position = 'prev';

    // pretend to be a node
    const fake = {
      label: '', note: '',
      isWindow: () => false,
      isLoaded: () => false,
      isRoot: () => false,
    };
    // prompt for details
    const result = await this.nodeEditDialog({
      doc: this.document, title: 'Add Node', node: fake
    });

    // abort if user cancelled
    if ((!result) || ('OK' !== result.button)) return;

    // figure out where to put the new node (determine parent and index)
    let destParent = this.root;  // default if empty tree or no cursor
    let destIndex = 0;
    if (this.cursor) {
      // if root, just make new 1st child
      if (this.cursor.isRoot() || (this.cursor === this.viewRoot)) {
        destParent = this.cursor;
        destIndex = 0;
      }
      // add new row before this one
      else if ('prev' === position) {
        // in all 'prev' cases, just insert a new sibling before self
        destParent = this.cursor.parent;
        destIndex = this.cursor.indexOf();
      }
      // if leaf node: add as next sibling
      // or collapsed branch: add as next sibling
      else if (this.cursor.isLeaf() || this.cursor.isCollapsed()) {
        //log('add to leaf or collapsed');
        destParent = this.cursor.parent;
        destIndex = this.cursor.indexOf() + 1;
      }
      // expanded branch: add as first child
      else {
        //log('add to expanded branch');
        destParent = this.cursor;
        destIndex = 0;
      }
    }

    // don't unpin "Pinned"
    let destNode = destParent.nodes[destIndex];
    if (destNode?.isPinnedBranch()) {
      if (destNode.isCollapsed()) { destIndex ++; }  // next sibling
      else { destParent = destNode; destIndex = 0; }  // first child
    }

    // add a new Node
    let nodeType = '';
    if (result.isWindow) nodeType = 'window';
    const newNode = await destParent.addChild(destIndex,
      { label: result.label, note: result.note, type: nodeType,
        render: true },
      { reason: 'userAction' });
    //log(destParent.nodes);
    await this.setCursor(newNode);
    //debug(`added "${newNode.label}"`);
    this.setStatus(`added ${this.cursor.toLine()}`);
  }

  async action_addNodeAsNextVisibleRow (event) {
    return await this.addNodeAsPrevOrNextVisibleRow('next');
  }

  async action_addNodeAsPrevVisibleRow (event) {
    return await this.addNodeAsPrevOrNextVisibleRow('prev');
  }

  async action_deleteNode(event) {
    debug('deleteNode');
    // abort if nothing to delete
    if (this.root.nodes.length <= 0) return;
    // choose mouse or keyboard cursor based on event type
    let cursor = this.whichCursor(event);
    // skip no-op cases
    if (! cursor) return;
    // never delete root
    if (cursor.isRoot()) return;

    // move keyboard cursor if this was a mouse click
    if (cursor !== this.cursor) await this.setCursor(cursor);

    // delete depending on the node type and state
    const toDelete = cursor;
    const line = cursor.toLine();
    // remember where it lived so the delete can be undone
    const parentId = toDelete.parent.id;
    const delIndex = toDelete.indexOf();
    const rootId = toDelete.id;
    // if leaf, just delete it... simple
    if (cursor.isLeaf()) {
      //debug('delete leaf node');
      const dicts = toDelete.serializeSubtree();
      await toDelete.deleteSelf({ reason: 'userAction' });
      this.pushUndo(
        this.$makeWholeDeleteUndo(rootId, dicts, parentId, delIndex, line));
      this.setStatus(`deleted ${line}`);
    }
    // don't delete an open window; unload it instead
    else if (cursor.isWindow() && cursor.isLoaded()) {
      return await this.action_unloadNode(event);
    }
    // if expanded, promote kids then delete parent
    else if (cursor.isExpanded() && cursor.hasKids()) {
      let dStyle = this.cfg.deleteExpandedBranchStyle;
      const numToDelete = 1 + toDelete.countNodes();
      if ('ask' === dStyle) {
        const result = await this.inputDialog({
          doc: document,
          title: 'Delete Nodes',
          input: false,
          description: `Delete one node or all ${numToDelete} nodes?`,
          buttons: ['Cancel', 'One', 'All']  // Cancel is default
        });
        // abort if user cancelled
        if ((!result) || (! ['All', 'One'].includes(result.button))) return;
        dStyle = result.button.toLowerCase();
      }
      if ('one' === dStyle) {
        const ownDict = toDelete.toDict();
        const kidIds = toDelete.nodes.map((k) => k.id);
        await toDelete.deleteSelfAndPromoteKids({ reason: 'userAction' });
        this.pushUndo(this.$makePromoteDeleteUndo(
          rootId, ownDict, parentId, delIndex, kidIds, line));
        this.setStatus(`deleted ${line}`);
      }
      //else if ('row1' === dStyle) {
      //  // FIXME: write this?
      //  await toDelete.deleteSelfAndPromoteFirstKid({ reason: 'userAction' });
      //  this.setStatus(`deleted ${line}`);
      //}
      else if ('all' === dStyle) {
        const dicts = toDelete.serializeSubtree();
        await toDelete.deleteSelf({ reason: 'userAction' });
        this.pushUndo(
          this.$makeWholeDeleteUndo(rootId, dicts, parentId, delIndex, line));
        this.setStatus(`deleted ${numToDelete} nodes`);
      }
    }
    // if collapsed, delete entire branch
    else {
      //debug('deleting entire branch recursively');
      // TODO: ask the user for confirmation
      const numToDelete = 1 + toDelete.countNodes();
      const result = await this.inputDialog({
        doc: document,
        title: 'Delete Nodes',
        input: false,
        description: `Really delete ${numToDelete} nodes?`,
        buttons: ['Cancel', 'OK']  // Cancel is default
      });
      // abort if user cancelled
      if ((!result) || ('OK' !== result.button)) return;
      // otherwise, actually delete it
      const dicts = toDelete.serializeSubtree();
      await toDelete.deleteSelf({ reason: 'userAction' });
      this.pushUndo(
        this.$makeWholeDeleteUndo(rootId, dicts, parentId, delIndex, line));
      this.setStatus(`deleted ${numToDelete} nodes`);
    }
  }

  $makeWholeDeleteUndo (rootId, dicts, parentId, index, label) {
    const self = this;
    return {
      label: `delete ${label}`,
      undo: async () => {
        const toRoot = await self.restoreSubtree(rootId, dicts, parentId, index);
        if (toRoot) return `restored ${label} to root (original parent gone)`;
      },
      redo: async () => {
        const n = self.nodes[rootId];
        if (n) await n.deleteSelf({ reason: 'userAction' });
      },
    };
  }

  $makePromoteDeleteUndo (rootId, ownDict, parentId, index, kidIds, label) {
    const self = this;
    return {
      label: `delete ${label}`,
      undo: async () => {
        const toRoot = await self.restoreNodeAndAdopt(
          rootId, ownDict, parentId, index, kidIds);
        if (toRoot) return `restored ${label} to root (original parent gone)`;
      },
      redo: async () => {
        const n = self.nodes[rootId];
        if (n) await n.deleteSelfAndPromoteKids({ reason: 'userAction' });
      },
    };
  }

  async action_unloadNode (event) {
    debug('action_unloadNode');
    // choose mouse or keyboard cursor based on event type
    let cursor = this.whichCursor(event);
    // abort if nothing to unload
    if (! cursor) return;

    // non-window branch w/ loaded tabs needs special care
    if (cursor.hasLoadedTabs() && (! cursor.isWindow())) {
      const loadedTabs = cursor.getLoadedTabs();
      loadedTabs.reverse();  // unload from bottom to top
      if (cursor.isLoadedTab()) loadedTabs.push(cursor);
      // TODO: sort loadedTabs so active tab (if any) is last
      const cursorLoaded = cursor.isLoadedTab();
      const numLoaded = loadedTabs.length;

      // check user prefs for what to do
      let actionStyle = cursor.isCollapsed()
        ? this.cfg.unloadCollapsedBranchStyle
        : this.cfg.unloadExpandedBranchStyle;

      // can't use a dialog without a mouse when invoked via command
      // so change "ask" to "one"
      if (('ask' === actionStyle) && ('command' === event.type))
      { actionStyle = 'one'; }

      // ask, if we're gonna
      if ('ask' === actionStyle) {
        let description;
        let buttons;
        if (cursorLoaded) {
          description = `Unload one (cursor) tab or all ${numLoaded} tabs?`;
          buttons = ['Cancel', 'One', 'All'];  // Cancel is default
        } else {
          description = `Unload all ${numLoaded} tabs?`;
          buttons = ['Cancel', 'All'];  // Cancel is default
        }
        const result = await this.inputDialog({
          doc: document,
          title: 'Unload Tabs',
          input: false,
          description: description,
          buttons: buttons,
        });
        // abort if user cancelled
        if ((!result) || (! ['All', 'One'].includes(result.button))) return;
        actionStyle = result.button.toLowerCase();
      }
      if ('one' === actionStyle) {
        const success = await cursor.unload({ reason: 'userAction' });
        if (success) this.setStatus(`unloaded ${cursor.toLine()}`);
        else this.setStatus(`failed to unload ${cursor.toLine()}`);
      }
      else if ('all' === actionStyle) {
        let numSucceeded = 0;
        let numFailed = 0;
        for (const tabNode of loadedTabs) {
          const success = await tabNode.unload(
            { reason: 'userAction', wasLoaded: true });
          if (success) numSucceeded ++;
          else numFailed ++;
        }
        const failText = (numFailed ? `, ${numFailed} failed` : '');
        this.setStatus(`unloaded ${numSucceeded} nodes${failText}`);
      }
    }
    else {
      cursor.unload({ reason: 'userAction' });
      this.setStatus(`unloaded ${cursor.toLine()}`);
    }
  }

  async action_loadNode (event) {
    debug('action_loadNode');
    if ('command' !== event.type) {
      event.preventDefault();
      event.stopPropagation();
    }
    // choose mouse or keyboard cursor based on event type
    let cursor = this.whichCursor(event);
    // abort if nothing to do
    if (! cursor) return;

    // some cases need an action other than "load tabs"
    if (cursor.isLeaf()
      || cursor.isUnloadedWindow()
      || (cursor.isLoadedTab() && (! cursor.isActive()))
    ) return this.action_loadOrEditNode(event, false);

    // gather some data about the kids (god that sounds wrong)
    const loadedTabs = cursor.findNodes(
      (n) => n.isLoadedTab(), (n) => (! n.isWindow())
    );  loadedTabs.reverse();
    if (cursor.isLoadedTab()) loadedTabs.push(cursor);

    const wasLoadedTabs = cursor.findNodes(
      (n) => n.isWasLoadedTab(), (n) => (! n.isWindow())
    );  wasLoadedTabs.reverse();
    if (cursor.isWasLoadedTab()) wasLoadedTabs.push(cursor);

    const unloadedTabs = cursor.findNodes(
      (n) => n.isUnloadedTab(), (n) => (! n.isWindow())
    );  unloadedTabs.reverse();
    if (cursor.isUnloadedTab()) unloadedTabs.push(cursor);

    //debug('loadedTabs, wasLoadedTabs, unloadedTabs:', loadedTabs, wasLoadedTabs, unloadedTabs);

    const noUnloadedTabs = ((wasLoadedTabs.length <= 0)
      && (unloadedTabs.length <= 0));
    if (noUnloadedTabs) {
      if (cursor.isBookmark())
        return this.action_loadOrEditNode(event, false);
      // nothing to do, everything is already loaded
      this.setStatus('nothing to load');
      return;
    }

    // check user prefs for what to do
    let actionStyle = cursor.isCollapsed()
      ? this.cfg.loadCollapsedBranchStyle
      : this.cfg.loadExpandedBranchStyle;

    // can't use a dialog without a mouse when invoked via command
    // so change "ask" to "one"
    if (('ask' === actionStyle) && ('command' === event.type))
    { actionStyle = 'one'; }

    // if cursor is the only node affected, we don't need to ask what to do
    if (wasLoadedTabs[0] === cursor) actionStyle = 'one';
    else if ((wasLoadedTabs.length === 0)
      && (unloadedTabs[0] === cursor))
      actionStyle = 'one';

    // decide what we're loading
    // (the queue puts the top-most row last, so focus will go to the tab
    //  which is closest to the original cursor position, because that tab
    //  gets loaded last)
    let numToLoad = wasLoadedTabs.length;
    let styleToLoad = 'wasLoaded';
    let queue = wasLoadedTabs;
    if (! numToLoad) {
      numToLoad = unloadedTabs.length;
      styleToLoad = 'unloaded';
      queue = unloadedTabs;
    }

    // if cursor is unaffected, the "one" actionStyle makes no sense
    const cursorInQueue = (queue[queue.length - 1] === cursor);

    // this would be the appropriate time ask, if we're gonna
    if ('ask' === actionStyle) {
      let description;
      let buttons;
      if (cursorInQueue) {
        description = `Load one (cursor) or all ${numToLoad} ${styleToLoad} tabs?`;
        buttons = ['Cancel', 'One', 'All'];  // Cancel is default
      } else {
        description = `Load all ${numToLoad} ${styleToLoad} tabs?`;
        buttons = ['Cancel', 'All'];  // Cancel is default
      }
      const result = await this.inputDialog({
        doc: document,
        title: 'Load Tabs',
        input: false,
        description: description,
        buttons: buttons,
      });
      // abort if user cancelled
      if ((!result) || (! ['All', 'One'].includes(result.button))) return;
      actionStyle = result.button.toLowerCase();
    }

    if ('one' === actionStyle) {
      if (cursor.isBookmark())
        return this.action_loadOrEditNode(event, false);
      const success = await cursor.load({ reason: 'userAction' });
      if (success) this.setStatus(`loaded ${cursor.toLine()}`);
      else this.setStatus(`failed to load ${cursor.toLine()}`);
    }
    else if ('all' === actionStyle) {
      let numSucceeded = 0;
      let numFailed = 0;
      for (const tabNode of queue) {
        const success = await tabNode.load({ reason: 'userAction' });
        if (success) numSucceeded ++;
        else numFailed ++;
      }
      const failText = (numFailed ? `, ${numFailed} failed` : '');
      this.setStatus(`loaded ${numSucceeded} nodes${failText}`);

      // setActive tab events can get confused when loading so much so fast,
      // so do it explicitly afterward
      const lastLoaded = queue[queue.length - 1];
      if (lastLoaded) {
        const winNode = lastLoaded.getWindowNode();
        if (winNode) {
          setTimeout(() =>
            winNode.setActiveTab({ reason: 'action_loadNodeBatch' }),
            500);
        }
      }
    }
  }

  async action_loadOrEditNode (event, allowEdit = true) {
    debug('action_loadOrEditNode');
    if ('command' !== event.type) {
      event.preventDefault();
      event.stopPropagation();
    }
    // choose mouse or keyboard cursor based on event type
    let cursor = this.whichCursor(event);
    // abort if nothing to do
    if (! cursor) return;

    // if bookmark, clone a new child and load it
    if (cursor.isBookmark()) {
      const newNode = await cursor.addChild(0,
        { url: cursor.url, title: cursor.title, render: true },
        { reason: 'userAction' });
      if (! newNode) return this.setStatus(`failed to load ${cursor.toLine()}`);
      newNode.load({ reason: 'userAction' });
      this.setStatus(`loaded ${newNode.toLine()}`);
    }
    // if unloaded tab, load it
    else if (cursor.isUnloadedTab()) {
      cursor.load({ reason: 'userAction' });
      this.setStatus(`loaded ${cursor.toLine()}`);
    }
    // if loaded tab but not focused, focus it
    else if (cursor.isLoaded()
      && (!cursor.isActive())
      && (!cursor.isWindow())
    ) {
      cursor.setActive(true, { reason: 'userAction' });
    }
    // if unloaded window, load it
    else if (cursor.isUnloadedWindow()) {
      cursor.load({ reason: 'userAction' });
      this.setStatus(`loaded ${cursor.toLine()}`);
    }
    // if note or focused tab or window, edit it
    else {
      if (allowEdit) this.action_editNode(event);
    }
  }

  action_toggleExpanded (event) {
    debug('action_toggleExpanded()');
    // skip no-op cases
    if (! this.cursor) return;
    // twiddle the state
    const toggled = ! this.cursor.isExpanded();
    this.cursor.setExpanded(toggled, { reason: 'userAction' });
    const verbed = toggled ? 'Expanded' : 'Collapsed';
    this.setStatus(`${verbed} ${this.cursor.toLine()}`);
  }

  async action_editNode (event) {
    debug('action_editNode()');
    // choose mouse or keyboard cursor based on event type
    let cursor = this.whichCursor(event);
    // skip no-op cases
    if (! cursor) return;

    // prompt for new label/note text
    const result = await this.nodeEditDialog({
      doc: this.document, title: 'Edit Node', node: cursor
    });
    debug('editNode(result):', result);
    // abort if user cancelled
    if ((!result) || ('OK' !== result.button)) {
      this.setStatus('editNode: cancelled');
      return;
    }

    // what changed?
    const isWindowChanged = (undefined !== result.isWindow)
      && ((!! cursor.isWindow()) !== (!! result.isWindow));
    const incognitoChanged = (undefined !== result.incognito)
      && ((!! cursor.isIncognito()) !== (!! result.incognito));
    const pageDataChanged =
      ((undefined !== result.title) && (cursor.title !== result.title))
      || ((undefined !== result.url) && (cursor.url !== result.url))
      || ((undefined !== result.bookmark) && (cursor.bookmark !== result.bookmark))
      ;
    const hasLoadedTabs = cursor.isLoaded() || cursor.hasLoadedTabs();

    // attempt to change loaded window's incognito status
    // (should never happen)
    if (hasLoadedTabs && incognitoChanged) {
      this.setStatus("editNode: Can't change incognito on loaded window");
      return false;
    }
    // loaded window status changed
    else if (hasLoadedTabs && isWindowChanged) {
      debug('editNode(): convert loaded window');
      const changes = { label: result.label, note: result.note };
      changes.type = result.isWindow ? 'window' : '';
      if (! result.isWindow) changes.wasLoaded = false;
      const changed = await cursor.setTabFields(
        changes, { reason: 'userAction' });
      if (changed) this.setStatus(`Edited ${cursor.toLine()}`);
      return changed;
    }
    // unloaded window status changed
    // or unloaded window incognito status changed
    else if (isWindowChanged || incognitoChanged) {
      const changes = { label: result.label, note: result.note };
      if (isWindowChanged) changes.type = result.isWindow ? 'window' : '';
      if (incognitoChanged) changes.incognito = result.incognito;
      if (! result.isWindow) changes.wasLoaded = false;
      const changed = await cursor.setTabFields(
        changes, { reason: 'userAction' });
      if (changed) this.setStatus(`Edited ${cursor.toLine()}`);
      return changed;
    }

    // below here, we know window and incognito status didn't change

    // unloaded tab can edit title+url+bookmark too
    if (pageDataChanged && (cursor.isUnloadedTab() || cursor.isBookmark())) {
      const changed = await cursor.setTabFields(
        { label: result.label, note: result.note,
          url: result.url, title: result.title, bookmark: result.bookmark },
        { reason: 'userAction' });
      if (changed) this.setStatus(`Edited ${cursor.toLine()}`);
      return changed;
    }

    // note-only changes are simple
    if ((cursor.label !== result.label) || (cursor.note !== result.note)) {
      const changed = await cursor.setNotes(
        result.label, result.note, { reason: 'userAction' });
      if (changed) this.setStatus(`Edited ${cursor.toLine()}`);
      return changed;
    }

    // every allowed case is handled,
    // so it looks like nothing changed
    this.setStatus(`Unchanged: ${cursor.toLine()}`);
    return false;
  }

  async action_taskEdit (event) {
    debug('action_taskEdit()');
    // choose mouse or keyboard cursor based on event type
    let cursor = this.whichCursor(event);
    // skip no-op cases
    if (! cursor) return;
    if (cursor.isRoot()) return;

    // prompt for new label/note text
    const result = await this.checkboxDialog({
      doc: document,
      title: 'Edit Task',
      description: cursor.toLine(),
      value: cursor.checkbox,
      classes: this.checkboxClasses,
      buttons: ['OK', 'Delete']
    });
    // abort if user cancelled
    if (!result) return;

    // update the node
    let newValue = result.checkbox;
    if ('OK' === result.button) return;
    else if ('Delete' === result.button) newValue = undefined;
    const px = result.checkboxPx;
    // user manually set a numeric percent value
    if (undefined !== px) cursor.setCheckbox(newValue,
      { checkboxPx: px, reason: 'userAction' });
    // user didn't set a percent value
    else cursor.setCheckbox(newValue, { reason: 'userAction' });
    this.setStatus(`Edited ${cursor.toLine()}`);
  }

  action_toggleMarked (event) {
    debug('action_toggleMarked()');
    // choose mouse or keyboard cursor based on event type
    let cursor = this.whichCursor(event);
    // skip no-op cases
    if (! cursor) return;
    const toggled = ! cursor.marked;
    cursor.setMarked(toggled, { reason: 'userAction' });
    const verbed = toggled ? 'Marked' : 'Unmarked';
    this.setStatus(`${verbed} ${cursor.toLine()}`);
  }

  async action_unmarkAll (event) {
    debug('action_unmarkAll()');
    await this.unmarkAll({ reason: 'userAction' });
    this.setStatus(`Unmarked all nodes`);
  }

  async action_pasteMarked (event, before=false) {
    // skip no-op cases
    if (! this.cursor) return;
    debug(`action_pasteMarked(before=${before})`);

    // find the right place to put the marked nodes
    let destParent;
    let destIndex;
    const markedParent = this.cursor.markedBy();
    if (this.cursor.isRoot()) {
      destParent = this.cursor;
      destIndex = 0;
    }
    else if (markedParent) {
      // haha, I see you... trying to dive into your own belly button
      // but this is a strict No Infinite Recursion Zone
      destParent = markedParent.parent;
      destIndex = markedParent.indexOf();
    }
    else if (before) {
      // if pasting before, just paste at the cursor's position
      destParent = this.cursor.parent;
      destIndex = this.cursor.indexOf();
    }
    else if (this.cursor.hasKids() && this.cursor.isExpanded()) {
      // if expanded with kids, paste as new first children
      destParent = this.cursor;
      destIndex = 0;
    }
    else {
      // otherwise, paste as next sibling(s)
      destParent = this.cursor.parent;
      destIndex = this.cursor.indexOf() + 1;
    }

    // markedNodes are pasted in the order marked,
    // NOT the order they appear in the tree...
    // because this makes it easy to do manual sorting
    // (like, to reverse a set, just mark them in reverse order
    //  then paste in-place to change the order)
    let numMoved = 0;
    let numFailed = 0;
    let moved = false;
    for (const nodeId of this.markedNodes) {
      const node = this.nodes[nodeId];
      // special case: moving from/to same parent can get weird
      const pastingToSameParent = (node.parent === destParent);
      const oldIndex = node.indexOf();
      // move the node
      moved = await node.moveTo(destParent, destIndex, { reason: 'userAction' });
      if (moved) numMoved ++;
      else numFailed ++;
      // adjust if special case was triggered
      if (pastingToSameParent) {
        if (oldIndex < destIndex)
          destIndex --;
      }
      // next paste goes at next slot
      destIndex ++;
    }
    if (numFailed > 0)
      this.setStatus(`Moved ${numMoved} nodes, ${numFailed} failed`);
    else this.setStatus(`Moved ${numMoved} nodes`);
  }

  async action_pasteMarkedBefore (event) {
    return await this.action_pasteMarked(event, true);
  }

  async action_backupSession (event) {
    return await this.downloadBackupNow();
  }

  async action_generateTutorial (event) {
    let parentId;
    if (this.windowNode) parentId = this.windowNode.id;
    else if (this.root.nodes.length > 0) parentId = this.root.nodes[0].id;
    else parentId = this.root.id;
    return await emit('bkgd_generateTutorial', { parentId });
  }

  async action_mousePressLeft (event) {
    // abort on no-op
    if (! this.mouseNode) return;
    // save for later potential drag-n-drop
    this.mouseDragStartNode = this.mouseNodeNonRoot;
    // place the cursor (and *don't* await)
    this.setCursor(this.mouseNodeNonRoot,
      { instant: false, scrollDelay: this.cfg.doubleClickMs });
    // maybe modify a checkbox
    if (this.$mouseElem?.classList.contains('node-checkbox')) {
      await this.action_taskEdit(event);
      return;
    }
    // maybe toggle expanded
    if (this.$mouseRow) {
      let leftWidth = this.$mouseRowHgt;
      // wider target area when a checkbox exists and node-stats doesn't
      if (this.mouseNode.checkbox
        && this.mouseNode.isExpanded()
        && this.mouseNode.hasKids())
      {
        const $cb = this.mouseNode.$.querySelector('.node-checkbox');
        if ($cb) leftWidth += $cb.offsetWidth;
      }
      //debug(`mouseRowX (${this.$mouseRowX}), leftWidth (${leftWidth})`);
      // if user clicked the left ~1em of the row, toggle expand
      // (or if they clicked the node stats widget)
      if ((this.$mouseRowX <= leftWidth)
        || (this.$mouseElem
          && this.$mouseElem.classList.contains('node-stats'))
      ) {
        await this.action_toggleExpanded(event);
      }
    }
  }

  action_mouseHoverMenu (event) {
    //debug(`action_mouseHoverMenu ${this.mouseNode.toLine()}`);
    event.preventDefault();
    event.stopPropagation();
    if (this.mouseNode && this.$mouseRow) return this.showHoverMenu();
    else return this.hideHoverMenu();
  }

  action_mouseDragStart (event) {
    // abort on no-op
    if (! this.mouseNode) return;

    // save for later
    // (was saved already during mousePressLeft)
    // (it's too late to detect now, view may have scrolled)
    if (! this.mouseDragStartNode) this.mouseDragStartNode = this.cursor;
    //if (! this.mouseDragStartNode) this.mouseDragStartNode = this.mouseNode;
    //this.mouseDragStartNode = this.mouseNode;

    // add info for internal use
    // browser blocks event.dataTransfer.getData() during a drag,
    // so we have to embed the data into the mimetype itself :(
    const mimeTypeHack = `${this.nodeIdMimeType}-${this.mouseDragStartNode.id}`;
    event.dataTransfer.setData(mimeTypeHack, this.mouseDragStartNode.id);
    event.dataTransfer.setData(this.nodeIdMimeType, this.mouseDragStartNode.id);

    // attach a text representation in case the user drops into a text field
    const plainText = this.mouseDragStartNode.asTextBranch();
    event.dataTransfer.setData('text', plainText);

    // change how the node looks
    this.mouseDragStartNode.$.classList.add('dragging');
    // default drag image obscures drop target, so make a smaller one
    let dragImage = this.document.getElementById('drag-arrow');
    event.dataTransfer.setDragImage(dragImage, 0, 12);

    // let other funcs know to behave differently during a drag
    this.dragInProgress = true;

    // this gets in the way during a drag
    this.hideHoverMenu();
  }

  action_mouseDrag (event) {
  }

  getMouseDragTarget (event) {
    const result = {};
    // drop target
    let sourceNode;
    let targetNode = this.mouseNodeNonRoot;
    //debug(`targetNode:`, targetNode);
    // abort on no-op
    if (! targetNode) return result;

    // where did the data come from?
    const types = event.dataTransfer.types;
    // internal (from a TreeView in this extension)
    if (types.includes(this.nodeIdMimeType)) {
      result.source = 'internal';
      // drop within a single sidepanel, or from one sidepanel to another
      let nodeId = event.dataTransfer.getData(this.nodeIdMimeType);
      if (! nodeId) {
        // 1st method only works at the end of a drag, not during the middle
        // extract node ID from the mimetype itself
        const prefix = this.nodeIdMimeType + '-';
        nodeId = types.find(t => t.startsWith(prefix))?.slice(prefix.length);
      }
      //debug(`nodeId: ${nodeId}`, nodeId);
      if (nodeId) {
        sourceNode = this.nodes[nodeId];
        if (! sourceNode) {
          // return result;
          // dragged from other tktsto instance with different node IDs?
          result.source = undefined;
        }
      } // else { debug('no nodeId'); }
      // don't move a parent into its own child list
      if (sourceNode === targetNode) return result;
      if (sourceNode && targetNode.isChildOf(sourceNode)) return result;
    }

    // drop from some other source
    if (! result.source) {
      //debug('source: external');
      result.source = 'external';
      sourceNode = undefined;
    }

    // source and target confirmed
    result.sourceNode = sourceNode;
    result.targetNode = targetNode;
    // external drops are complicated
    if ('external' === result.source) {
      result.sourceNode = undefined;
      // URL (Firefox)
      if (types.includes('text/x-moz-url')) {
        result.type = 'url';
        result.title = event.dataTransfer.getData('text/x-moz-url-desc');
        result.url = event.dataTransfer.getData('text/x-moz-url-data');
        if (! result.url)
          result.url = event.dataTransfer.getData('text/x-moz-url');
        if (! result.title) result.title = result.url;
      }
      else if (types.includes('text/uri-list')) {
        result.type = 'url';
        // WTF, uri-list is plain text, one URL per line, with comments
        // https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Recommended_drag_types
        const text = event.dataTransfer.getData('text/plain');
        const html = event.dataTransfer.getData('text/html');
        //const uriList = event.dataTransfer.getData('text/uri-list');
        //debug(`drop:`, text, html, uriList);
        if (text) result.url = text;
        if (html) {
          // why is this not included as a field by default??
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, "text/html");
          const a = doc.querySelector("a");
          result.title = a.textContent;
          if (result.title)  // clean up extra whitespace
            result.title = result.title.trim().replace(/\s+/g, ' ');
        }
      }
      // plain text
      else if (types.includes('text/plain')) {
        result.type = 'text';
        // apparently can't get the data until drop happens :(
        result.text = event.dataTransfer.getData('text/plain');
        //debug(result.text);
      }
    }
    // if user dropped in right part of row, drop as 1st child
    if (this.$mouseRow && (this.$mouseRowX >= (this.$mouseRowWid / 5))) {
      result.destParent = targetNode;
      result.destIndex = 0;
      result.targetClass = 'drop-target-right';
    }
    // if user dropped outside row or in the left part of the row,
    // drop as next sibling
    else {
      result.destParent = targetNode.parent;
      result.destIndex = targetNode.indexOf() + 1;
      result.targetClass = 'drop-target-left';
    }
    return result;
  }

  clearDropTargetNodeStyles () {
    if (this.dropTargetNode) {
      for (const elem of [this.dropTargetNode.$, this.dropTargetNode.$row])
        for (const cl of [...elem.classList])
          if (cl.startsWith('drop-')) elem.classList.remove(cl);
    }
  }

  action_mouseDragOver (event) {
    // apparently "drop" won't work unless we eat this event
    event.preventDefault();
    // Scroll when near the top or bottom of the tree view
    this.scrollDuringDrag (event);
    // figure out where to drop it
    const drop = this.getMouseDragTarget(event);
    // remove styles of previous drop target
    this.clearDropTargetNodeStyles();
    // abort on no-op
    if (! drop.targetNode) return;
    // save new drop target
    this.dropTargetNode = drop.targetNode;
    // set styles on new drop target
    let elem = (
        ('drop-target-left' === drop.targetClass)
        && (drop.targetNode !== this.root)
      ) ? drop.targetNode.$ : drop.targetNode.$row;
    elem.classList.add(drop.targetClass);
    if ('external' === drop.source)
      elem.classList.add(`drop-external-${drop.type}`);
  }

  scrollDuringDrag (event) {
    // Scroll when near the top or bottom of the tree view
    const rect = this.$.getBoundingClientRect();
    const y = event.clientY - rect.top; // mouse position inside element
    const height = rect.height;
    const scrollZone = height * this.dragScrollZone;
    this.maxDragScrollSpeed = height * this.dragScrollZone * 0.25;

    //debug(`scroll? ${y}/${height} (0..${scrollZone}, ${height - scrollZone}..${height})`);
    if (y < scrollZone) {
      // near top
      const intensity = 1 - y / scrollZone;
      // negative = scroll up
      this.dragScrollSpeed = -intensity * this.maxDragScrollSpeed;
    } else if (y > (height - scrollZone)) {
      // near bottom
      const intensity = (y - (height - scrollZone)) / scrollZone;
      // positive = scroll down
      this.dragScrollSpeed = intensity * this.maxDragScrollSpeed;
    } else {
      this.dragScrollSpeed = 0;
    }

    // begin scrolling, maybe
    if (this.dragScrollSpeed && (! this.dragAnimationFrame)) {
      this.dragAnimationFrame = requestAnimationFrame(this.updateDragScroll.bind(this));
    }
  }

  updateDragScroll () {
    // scroll the tree view during a drag-n-drop
    //debug(`updateDragScroll(${this.dragScrollSpeed})`);

    // ramp up to target scroll speed by simulating inertia
    if (undefined === this.actualScrollSpeed) this.actualScrollSpeed = 0;
    this.actualScrollSpeed =
      (this.actualScrollSpeed * 0.9)
      + (this.dragScrollSpeed * 0.1);

    // stop when the numbers are too small
    const min = 1.0 / 60;  // stop at 1 pixel per 60 frames
    let fudge = 0;
    if (isFirefox) fudge = 0.2;  // Firefox scrolls up too long
    if ((-(min+fudge) <= this.actualScrollSpeed)
      && (this.actualScrollSpeed < min))
      this.actualScrollSpeed = 0;

    // scroll
    if (this.actualScrollSpeed) {
      this.$.scrollTop += this.actualScrollSpeed;
      this.dragAnimationFrame = requestAnimationFrame(this.updateDragScroll.bind(this));
    } else {
      this.dragAnimationFrame = null;
    }
  }

  async action_mouseDrop (event) {
    event.preventDefault();

    // clean up at the end
    let finished = false;
    const finish = (msg) => {
      debug(`mouseDrop.finish(): ${msg}`);
      this.dragInProgress = false;
      // only finish once
      if (finished) return;
      finished = true;
      if (msg) this.setStatus(msg);
      this.action_mouseDragEnd(event);
    }

    // figure out where to drop it
    const drop = this.getMouseDragTarget(event);
    // abort on no-op
    if (! drop.targetNode) return finish('drop aborted (no target)');
    // internal source: move the node
    if ('internal' === drop.source) {
      if (drop.targetNode === drop.sourceNode) return finish('drop aborted (self target)');
      // don't move a parent into its own child list
      if (drop.targetNode.isChildOf(drop.sourceNode))
        return finish('drop aborted (own child)');
      // prevent cursor from disappearing or jumping
      const wasCursor = this.cursor === drop.sourceNode;
      if (wasCursor && (drop.destParent.isCollapsed()))
        this.setCursor(drop.destParent);
      // move it
      const moved = await drop.sourceNode.moveTo(
        drop.destParent, drop.destIndex,
        { reason: 'userAction' });
      if (moved) return finish(`moved node: ${drop.sourceNode.toLine()}`);
      else {
        // undo cursor change if move failed
        if (wasCursor && (this.cursor !== drop.sourceNode))
          this.setCursor(drop.sourceNode);
        return finish(`move failed: ${drop.sourceNode.toLine()}`);
      }
    }
    // external source: try to attach external data
    else {
      debug('action_mouseDrop', event, event.dataTransfer.types);
      // add links as new link nodes
      if ('url' === drop.type) {
        let newNode = await drop.destParent.addChild(drop.destIndex,
          { url: drop.url, title: drop.title, render: true },
          { reason: 'userAction' });
        return finish(`Added node: ${newNode.toLine()}`);
      }
      // plain text note
      else if ('text' === drop.type) {
        // right edge of node: create new child node with note
        if ('drop-target-right' === drop.targetClass) {
          let label, note;
          if (drop.text.includes('\n')) {
            const lines = drop.text.split('\n');
            label = lines[0];
            note = lines.slice(1).join('\n');
          }
          else label = drop.text;
          let newNode = await drop.destParent.addChild(drop.destIndex,
            { label: label, note: note, render: true },
            { reason: 'userAction' });
          return finish(`Added node: ${newNode.toLine()}`);
        }
        // single line: use as label, if label is empty
        if (! drop.text.includes('\n')) {
          if (! drop.targetNode.label) {
            await drop.targetNode.setNotes(
              drop.text, drop.targetNode.note,
              { reason: 'userAction' });
            return finish(`Added label to ${drop.targetNode.toLine()}`);
          }
        }
        // multiple lines or fall-through: add to note
        if (true) {
          let note = drop.targetNode.note;
          if (! note) note = '';
          // TODO: user pref for append / prepend
          let sep, newNote;
          const mode = 'prepend';
          if ('append' === mode) {
            sep = ((!note) || note.endsWith('\n')) ? '' : '\n';
            newNote = note + sep + drop.text;
          }
          else {
            sep = ((!note) || drop.text.endsWith('\n')) ? '' : '\n';
            newNote = drop.text + sep + note;
          }
          await drop.targetNode.setNotes(
            drop.targetNode.label, newNote,
            { reason: 'userAction' });
          return finish(`Added note to ${drop.targetNode.toLine()}`);
        }
      }
    }
    // clean up, just in case
    // (because 'dragend' event doesn't trigger sometimes)
    finish('drop cleanup');
  }

  action_mouseDragEnd (event) {
    // fix how the node looks
    if (this.mouseDragStartNode)
      this.mouseDragStartNode.$.classList.remove('dragging');
    // clear data
    this.mouseDragStartNode = undefined;
    this.clearDropTargetNodeStyles();
    // allow hoverMenu to be displayed again
    this.dragInProgress = false;
    // stop any scrolling in progress
    this.dragScrollSpeed = 0;
    this.actualScrollSpeed = 0;
  }

  action_mouseDragLeave (event) {
    //debug('action_mouseDragLeave()', event);
    this.clearDropTargetNodeStyles();
  }

  $renderHoverMenu () {
    if (! this.$hoverMenu) return;

    const doc = this.document;

    function makeBtn (_this, className, label, funcName) {
      const $div = doc.createElement('div');
      $div.classList.add(className);
      $div.innerText = label;
      // add a tooltip
      $div['title'] = funcName;
      $div['data-toggle'] = 'tooltip';
      // TODO: get label from user's keybinding table
      //let binding;
      // make the button do something when clicked
      const func = function (event) {
        _this[`action_${funcName}`].bind(_this)(event);
        _this.hideHoverMenu();  // will re-appear if still over a node
      }
      if (func) $div.addEventListener('click', func);
      //const func = _this[`action_${funcName}`];
      //if (func) $div.addEventListener('click', func.bind(_this));
      // add the button to the menu
      _this.$hoverMenu.append($div);
      return $div;
    }
    if (! this.$hoverMenuUnload) {
      this.$hoverMenuUnload = makeBtn(this, 'unload-button', 'U', 'unloadNode');
    }
    if (! this.$hoverMenuLoad) {
      this.$hoverMenuLoad = makeBtn(this, 'load-button', 'L', 'loadNode');
    }
    if (! this.$hoverMenuTask) {
      this.$hoverMenuTask = makeBtn(this, 'task-button', 'T', 'taskEdit');
    }
    if (! this.$hoverMenuEdit) {
      this.$hoverMenuEdit = makeBtn(this, 'edit-button', 'E', 'editNode');
    }
    if (! this.$hoverMenuMark) {
      this.$hoverMenuMark = makeBtn(this, 'mark-button', 'M', 'toggleMarked');
    }
    if (! this.$hoverMenuDelete) {
      this.$hoverMenuDelete = makeBtn(this, 'delete-button', 'D', 'deleteNode');
    }
  }

  hideHoverMenu () {
    //debug('hideHoverMenu');
    this.$hoverMenu.classList.add('hidden');
    this.hoverMenuLast = undefined;
  }

  showHoverMenu () {
    //debug(`showHoverMenu: ${this.mouseNode.toLine()}`);
    // skip if we're in the middle of a drag-n-drop
    if (this.dragInProgress || this.smoothScrollHideHoverMenu) return;
    // hover menu totally breaks $searchEntry, so don't allow it
    // (hover menu steals focus somehow, if mouse is over the TreeView)
    if (this.searchCaptureInput) return;
    // skip extra drawing if the menu hasn't changed
    if (this.hoverMenuLast === this.mouseNode) return;
    this.hoverMenuLast = this.mouseNode;
    const mouseNode = this.mouseNode;

    // adjust menu position
    const rect = this.$mouseRow.getBoundingClientRect();
    const zoomLevel = this.cfg.treeViewZoomLevel;
    let hTop = (rect.top + window.scrollY - (3 * zoomLevel))
      / zoomLevel;
    this.$hoverMenu.style.top = String(hTop) + 'px';

    // show or hide the 'unload' button
    if (mouseNode.isUnloadable() || mouseNode.hasLoadedTabs()) {
      this.$hoverMenuUnload.style.display = 'inline-block';
      this.$hoverMenuUnload.classList.remove('unloaded');
    }
    else if (mouseNode.isUnloadedTab()) {
      this.$hoverMenuUnload.style.display = 'inline-block';
      this.$hoverMenuUnload.classList.add('unloaded');
    }
    else this.$hoverMenuUnload.style.display = 'none';

    // show or hide the 'load' button
    const loadable = mouseNode.isBatchLoadable();
    if (loadable) {
      this.$hoverMenuLoad.style.display = 'inline-block';
      this.$hoverMenuLoad.classList.remove('loaded');
    }
    else this.$hoverMenuLoad.style.display = 'none';

    // show or hide the 'task' button
    if ((! mouseNode.hasCheckbox()) && (! mouseNode.isRoot()))
      this.$hoverMenuTask.style.display = 'inline-block';
    else this.$hoverMenuTask.style.display = 'none';

    // show or hide the 'mark' button
    if (mouseNode.isMarkable())
      this.$hoverMenuMark.style.display = 'inline-block';
    else this.$hoverMenuMark.style.display = 'none';

    // show or hide the 'delete' button
    if (mouseNode.isDeletable())
      this.$hoverMenuDelete.style.display = 'inline-block';
    else this.$hoverMenuDelete.style.display = 'none';

    // show the menu
    this.$hoverMenu.classList.remove('hidden');
  }

  async setCursor (node, args) {
    // { instant: false, scrollDelay: 0, expand: false}) {
    //debug(`TreeView.setCursor(): ${node.toLine()}`);
    // ensure cursor is on a visible node in our view scope
    const viewRoot = this.viewRoot;
    if ((! node.isInViewScope()) || (! node.isVisible(viewRoot))) {
      if (false) {}  // I was going to handle overrides here, but aborted
      // might still want to do this later?
      //if (args?.expand) {
      //  // un-expand any previous override
      //  const prevCursor = this.cursor;
      //}
      else {
        // if node is visible, put cursor on it
        // if node exists but is hidden, put cursor on visible parent
        // otherwise put cursor on window node
        let visibleNode = node ? node : viewRoot;
        if ((visibleNode !== viewRoot) && (! visibleNode.isVisible(viewRoot)))
          visibleNode = visibleNode.prevVisibleNode(viewRoot);
        node = visibleNode;
        //debug(`TreeView.setCursor(-->): ${node.toLine()}`);
      }
    }

    // update the cursor position
    if (this.cursor && (node !== this.cursor)) this.cursor.removeCursor();
    if (node        && (node !== this.cursor)) node.addCursor();
    this.cursor = node;

    // details box
    if (node) {
      // show and update node detail box
      this.updateDetailsBox();

      // maybe wait a moment to let user finish a double click
      let scrollDuration = 200;  // TODO: load from this.scrollDurationDefault
      if (args?.scrollDelay) {
        scrollDuration = args.scrollDelay;
        await new Promise(r => setTimeout(r, args.scrollDelay));
      }

      // ensure node is visible
      if (args?.instant) scrollDuration = 0;
      this.scrollNodeIntoView(node, scrollDuration);
    }
    else {
      this.hideDetailsBox();
    }
  }

  async ensureCursorVisible () {
    if (this.isInert) return;
    const viewRoot = this.viewRoot;
    this.dragInProgress = false;
    //debug(`TreeView.ensureCursorVisible(cursor):`, this.cursor);
    //debug(`TreeView.ensureCursorVisible(viewRoot):`, viewRoot);

    // when cursor node is pasted into collapsed branch,
    // and branch is in the view scope,
    // move cursor to nearest visible parent
    const cursor = this.cursor;
    if (cursor?.isInViewScope() && (! cursor.isVisible(viewRoot))) {
      const newCursor = cursor.prevVisibleNode(viewRoot);
      if (newCursor) return await this.setCursor(newCursor, { instant: true });
    }

    // move the cursor to this window's active tab
    // (or its nearest visible parent within the view scope)
    // find our window
    let winNode = viewRoot;
    if ('session' === this.viewScope) {
      // find the current window in the tree
      const win = await api.windows.getCurrent();
      let found = viewRoot.findNodes((node) => {
        return (node.isWindow() && (win.id === node.windowId));
      });
      if (found.length > 0) winNode = found[0];
    }
    //winNode.scrollToTop();
    const activeTabNode = winNode.getActiveTab();
    //debug(`TreeView.ensureCursorVisible(activeTabNode):`, activeTabNode);

    // ensure cursor exists and is inside our view scope
    if ((! this.cursor)
      || (! this.cursor.isInViewScope())
      || (! this.cursor.isVisible(viewRoot))
    ) {
      //debug('TreeView.ensureCursorVisible(): no cursor or out of scope');
      // if active tab visible, put cursor on it
      // if active tab exists but is hidden, put cursor on visible parent
      // otherwise put cursor on window node
      let visibleNode = activeTabNode ? activeTabNode : viewRoot;
      if ((visibleNode !== viewRoot) && (! visibleNode.isVisible(viewRoot))) {
        if (this.cfg.activeTabExpandsItsParents) {
          visibleNode.setActive(true, { localOverride: true });
        } else {
          visibleNode = visibleNode.prevVisibleNode(viewRoot);
        }
      }
      debug(`TreeView.ensureCursorVisible(visibleNode)`, visibleNode);
      return await this.setCursor(visibleNode, { instant: true });
    }
    return await this.setCursor(this.cursor, { instant: true });
  }

  scrollNodeIntoView (node, duration = 200) {
    if (! node?.$row) return;

    // ensure row is visible,
    // and has a sufficient margin
    // between the row and the edge of the tree view
    const $container = this.$;  // div#tree-view
    const rowRect = node.$row.getBoundingClientRect();
    const containerRect = $container.getBoundingClientRect();

    // zoom makes the values weird
    // (scroll goes to the wrong position without zoom compensation)
    const zoomLevel = this.cfg.treeViewZoomLevel;
    const rowTop = rowRect.top / zoomLevel;
    const rowBottom = rowRect.bottom / zoomLevel;
    const cTop = containerRect.top / zoomLevel;
    const cBottom = containerRect.bottom / zoomLevel;

    // TODO: make scroll margin configurable
    // percent of the view height
    const margin = Math.floor(0.25 * (cBottom - cTop));

    let newScrollTop = $container.scrollTop;

    // if row is above the visible area, scroll down
    if (rowTop < cTop + margin) {
      newScrollTop -= (cTop + margin - rowTop);
    }

    // if row is below the visible area, scroll up
    else if (rowBottom > cBottom - margin) {
      newScrollTop += (rowBottom - (cBottom - margin));
    }

    // bounds check
    const maxScrollTop = $container.scrollHeight - $container.clientHeight;
    newScrollTop = Math.max(0, Math.min(newScrollTop, maxScrollTop));

    // always stay scrolled all the way to the left
    $container.scrollLeft = 0;

    // instant
    if (duration < 1) $container.scrollTop = newScrollTop;
    // smooth
    // (helps reduce jitter from details box appearing and disappearing)
    else this.smoothScrollTo(newScrollTop, duration);
  }

  smoothScrollTo (scrollTop, duration = 200) {
    //debug(`TreeView.smoothScrollTo(${this.$.scrollTop} => ${scrollTop}, ${duration})`);
    // abort if nothing changed
    if (Math.round(scrollTop) === Math.round(this.$.scrollTop)) return;
    if (this.smoothScrollInProgress &&
      (Math.round(scrollTop) === Math.round(this.smoothScrollTop))) return;

    // adjust vertical scroll position gradually,
    // animating for "duration" ms
    this.smoothScrollStartTime = performance.now();
    this.smoothScrollDuration = duration;
    this.smoothScrollTop = scrollTop;

    // if we're not already scrolling, start a scroll animation
    // (otherwise, no need to start a *new* animation sequence)
    if (! this.smoothScrollInProgress) {
      this.smoothScrollInProgress = true;
      // no hover menu while scrolling, plz
      this.hideHoverMenu();
      requestAnimationFrame(this.smoothScrollStep.bind(this));
    }
  }

  smoothScrollStep (now) {
    function easeOutQuad (t) {
      return t * (2 - t);
    }

    // abort if tree is already scrolling for other reasons
    if (this.dragInProgress) return;

    // given "now" can be *before* smoothScrollStartTime on loaded systems
    // so take a fresh timestamp instead and make sure elapsed can never
    // be less than zero (which causes scrolling in the wrong direction)
    now = performance.now();
    const elapsed = Math.max(0, now - this.smoothScrollStartTime);
    const progress = Math.min(elapsed / this.smoothScrollDuration, 1);
    const eased = easeOutQuad(progress);

    const $container = this.$;
    const start = $container.scrollTop;
    const distance = this.smoothScrollTop - start;
    // last frame should land exactly on target
    if (progress >= 1) $container.scrollTop = this.smoothScrollTop;
    else $container.scrollTop = start + (distance * eased);

    if (progress < 1) {
      this.smoothScrollInProgress = true;
      this.smoothScrollHideHoverMenu = true;
      if (this.scrollCompleteTimer) clearTimeout(this.scrollCompleteTimer);
      requestAnimationFrame(this.smoothScrollStep.bind(this));
    }
    else {
      //debug(`smoothScrollStep(): ${$container.scrollTop} => ${this.smoothScrollTop}`);
      this.smoothScrollInProgress = false;
      // allow the hover menu to appear again, after scrolling is done
      const scrollComplete = () => {
        this.smoothScrollHideHoverMenu = false;
      }
      if (this.scrollCompleteTimer) clearTimeout(this.scrollCompleteTimer);
      this.scrollCompleteTimer = setTimeout(
        scrollComplete, this.smoothScrollDuration);
    }
  }

  updateDetailsBox () {
    if (! this.cursor) return;
    // bugfix: preserve scroll position
    // (if scrollbar is touching the bottom, Chrome anchors it there
    //  and it can make the entire view position jump,
    //  but we want the top anchored instead)
    const scrollBefore = this.$.scrollTop;
    // only show details if its button is in a 'pressed' state
    this.cursor.$renderDetails(this.$detailsBox);
    // restore scroll position
    if (! this.smoothScrollInProgress) this.$.scrollTop = scrollBefore;
  }

  hideDetailsBox () {
    this.$detailsBox.classList.add('hidden');
  }

  initBkgdPort () {
    this.port = api.runtime.connect();
    //debug('port', this.port);
    this.port.onDisconnect.addListener(async () => {
      debug("TreeView.port disconnected, reconnecting...");
      await new Promise(r => setTimeout(r, 100));
      this.initBkgdPort();
      this.registerWithBkgd();
    });
    // tell bkgd about us, after we've had a chance to load
    //setTimeout(() => { this.registerWithBkgd(); }, 1000);
  }

  initBkgdPing () {
    this.bkgdPing = setInterval(() => { return this.pingBkgd(); }, 15 * 1000);
  }

  async pingBkgd () {
    // keep service worker alive
    // so it won't have to keep reloading the tree from persistent storage
    // also, update the bkgd on our ID and status
    const msg = this.registerWithBkgd(false);
    const before = Date.now();
    //const response = await api.runtime.sendMessage({ 'msg': 'bkgd_ping' });
    const response = await emit('bkgd_ping', msg);
    const after = Date.now();
    if (! response) { return warn('bkgd ping failed'); }
    const elapsed = after - before;
    const oneway = response - before;
    if (elapsed > 30)  // don't log fast pings, only slow pings
      debug(`view => bkgd ping: 0 -> ${oneway} ms -> ${elapsed} ms`);
  }

  registerWithBkgd (send = true) {
    const msg = {
      treeId: this.id,
      windowId: this.windowId,
      viewScope: this.viewScope,
      viewType: this.viewType,
    };
    // needs to send via Port.postMessage() instead of runtime.sendMessage()
    // because it needs Port.onDisconnect to detect when a TreeView closes
    // and this associates the TreeView.id with a port
    if (send) emit('bkgdPort_registerTreeView', msg, { port: this.port });
    return msg;
  }

  async detectTabOrSidepanel () {
    const tab = await api.tabs.getCurrent();
    // no tab = sidepanel, in every browser I'm aware of
    if (! tab) this.viewType = 'sidepanel';
    else {
      // Firefox, and most Chrome browsers: tab = running in a tab
      // Vivaldi: sidepanel is also a tab (but not listed in its own window)
      const realTabs = await api.tabs.query({ windowId: tab.windowId });
      const isRealTab = realTabs.some((t) => (t.id === tab.id));
      this.viewType = isRealTab ? 'tab' : 'sidepanel';
    }
    log(`running in ${this.viewType} mode`);
  }

  initButtonHandlers () {
    // when view-scope-btn clicked, toggle session vs window view mode
    this.$viewScopeBtn.addEventListener('click', () => {
      this.onViewScopeBtnClick();
    });
    // open a tree view in a new tab
    this.$treeViewInTabBtn.addEventListener('click', () => {
      this.onTreeViewInTabBtnClick();
    });
    // undo / redo
    if (this.$undoBtn) this.$undoBtn.addEventListener('click', () => {
      this.onUndoBtnClick();
    });
    if (this.$redoBtn) this.$redoBtn.addEventListener('click', () => {
      this.onRedoBtnClick();
    });
    // zoom in and out
    this.$zoomOutBtn.addEventListener('click', () => {
      this.onZoomBtn(-1);
    });
    this.$zoomInBtn.addEventListener('click', () => {
      this.onZoomBtn(1);
    });
    // when details-btn clicked, toggle the details box
    this.$detailsBtn.addEventListener('click', () => {
      this.onDetailsBtnClick();
    });
    // save a session backup when clicked
    this.$backupBtn.addEventListener('click', () => {
      this.onBackupBtnClick();
    });
    // open the options page
    this.$optionsBtn.addEventListener('click', () => {
      this.onOptionsBtnClick();
    });
    // help me survive
    this.$donateBtn.addEventListener('click', () => {
      this.onDonateBtnClick();
    });
    // open the user manual
    this.$helpBtn.addEventListener('click', () => {
      this.onHelpBtnClick();
    });
    // "marked count" widget
    this.$markedCount.addEventListener('mouseover', () => {
      this.onMarkedCountHover();
    });
    this.$markedCount.addEventListener('click', () => {
      this.onMarkedCountClick();
    });
  }

  // ---- undo / redo ------------------------------------------------------

  pushUndo (entry) {
    // entry: { label, undo: async () => {}, redo: async () => {} }
    this.undoStack.push(entry);
    // a fresh action invalidates the redo history
    this.redoStack = [];
    this.$renderUndoRedoBtns();
  }

  $renderUndoRedoBtns () {
    if (this.$undoBtn)
      this.$undoBtn.classList.toggle('greyed-out', this.undoStack.length === 0);
    if (this.$redoBtn)
      this.$redoBtn.classList.toggle('greyed-out', this.redoStack.length === 0);
  }

  onUndoBtnClick () { return this.action_undo({ type: 'click' }); }
  onRedoBtnClick () { return this.action_redo({ type: 'click' }); }

  async action_undo (event) {
    const entry = this.undoStack.pop();
    if (! entry) { this.setStatus('nothing to undo'); return; }
    // undo() may return a status note (e.g. when it relocated the node);
    // prefer it over the generic message so it isn't overwritten/lost
    const note = await entry.undo();
    this.redoStack.push(entry);
    this.$renderUndoRedoBtns();
    this.setStatus(note || `undid: ${entry.label}`);
  }

  async action_redo (event) {
    const entry = this.redoStack.pop();
    if (! entry) { this.setStatus('nothing to redo'); return; }
    const note = await entry.redo();
    this.undoStack.push(entry);
    this.$renderUndoRedoBtns();
    this.setStatus(note || `redid: ${entry.label}`);
  }

  // turn a serialized node dict back into addChild() details:
  // a restored node comes back unloaded, since its live tab (if any) is gone
  $restoreDetails (dict) {
    const details = { ...dict, render: true };
    delete details.parent;
    delete details.nodes;
    details.tabId = undefined;
    details.windowId = undefined;
    if (details.loaded) details.wasLoaded = true;
    details.loaded = false;
    details.active = false;
    return details;
  }

  // resolve where a restored node should go.  if its original parent is
  // no longer in the tree, fall back to appending at the end of root.
  // returns toRoot=true when that fallback happened (so the caller can
  // tell the user, rather than silently relocating the node).
  $resolveRestoreParent (parentId, index) {
    let parent = this.nodes[parentId];
    let toRoot = false;
    if (! parent) {
      parent = this.root;
      index = parent.nodes.length;  // append at end of root
      toRoot = true;
    }
    return { parent, index, toRoot };
  }

  // rebuild a whole deleted subtree (from Node.serializeSubtree()) under
  // parentId at index, restoring each node's original id and order.
  // returns true if the original parent was gone and it went to root.
  async restoreSubtree (rootId, dicts, parentId, index) {
    const { parent, index: at, toRoot } =
      this.$resolveRestoreParent(parentId, index);
    const restored = await this.$rebuildNode(rootId, dicts, parent, at);
    if (restored) await this.setCursor(restored);
    return toRoot;
  }

  async $rebuildNode (id, dicts, parent, index) {
    const dict = dicts[id];
    if (! dict) return null;
    const newNode = await parent.addChild(
      index, this.$restoreDetails(dict), { reason: 'userAction' });
    const childIds = dict.nodes || [];
    for (let i = 0; i < childIds.length; i++)
      await this.$rebuildNode(childIds[i], dicts, newNode, i);
    return newNode;
  }

  // undo a "delete node, promote its kids" operation: recreate just the
  // node, then move its (still-alive) promoted kids back underneath it
  async restoreNodeAndAdopt (rootId, ownDict, parentId, index, kidIds) {
    const { parent, index: at, toRoot } =
      this.$resolveRestoreParent(parentId, index);
    const newNode = await parent.addChild(
      at, this.$restoreDetails(ownDict), { reason: 'userAction' });
    for (let i = 0; i < kidIds.length; i++) {
      const kid = this.nodes[kidIds[i]];
      if (kid) await kid.moveTo(newNode, i, { reason: 'userAction' });
    }
    await this.setCursor(newNode);
    return toRoot;
  }

  onViewScopeBtnClick () {
    if ('session' === this.viewScope) this.viewScope = 'window';
    else this.viewScope = 'session';
    // save button state to config storage, per window
    this.setWindowConfig('viewScope', this.viewScope);
    // update the display
    this.$renderViewScopeBtn();
    this.$renderWholeTree();
    this.ensureCursorVisible();
    this.setStatus(`View scope: ${this.viewScope}`);
    // tell bkgd we changed viewScope
    this.registerWithBkgd();
  }

  $renderViewScopeBtn () {
    if (! this.$viewScopeBtn) return;
    // Capitalize word and place it inside the button
    const label = this.viewScope.charAt(0).toUpperCase()
      + this.viewScope.slice(1);
    this.$viewScopeBtn.innerText = label;
  }

  action_detailsButton (event) {
    // hotkey version of the "details" button
    return this.onDetailsBtnClick();
  }

  onDetailsBtnClick () {
    // it's a 3-state button: off, short, full (none, notes, details)
    this.detailsState = (this.detailsState + 1) % 3;
    // save button state to config storage
    // TODO: should this be per-view or global?
    //api.storage.local.set({ 'TreeView.detailsState': this.detailsState });
    //api.storage.local.set({
    //  'TreeView(${this.windowId}).detailsState': this.detailsState });
    this.$renderDetailsBtn();
  }

  $renderDetailsBtn () {
    if (! this.$detailsBtn) return;

    switch (this.detailsState) {
      // 0 = off / none
      case 0:
        this.$detailsBtn.classList.remove('pressed');
        //this.$detailsBtn.classList.remove('half-pressed');
        this.$detailsBtn.innerText = 'Details';
        this.hideDetailsBox();
        break;
      // 1 = short / notes only
      case 1:
        //this.$detailsBtn.classList.remove('pressed');
        //this.$detailsBtn.classList.add('half-pressed');
        this.$detailsBtn.classList.add('pressed');
        this.$detailsBtn.innerText = 'Notes';
        this.updateDetailsBox();
        if (this.cursor) this.scrollNodeIntoView(this.cursor);
        break;
      // 2 = full / all details
      case 2:
      default:
        this.$detailsBtn.classList.add('pressed');
        //this.$detailsBtn.classList.remove('half-pressed');
        this.$detailsBtn.innerText = 'Details';
        this.updateDetailsBox();
        if (this.cursor) this.scrollNodeIntoView(this.cursor);
        break;
    }
  }

  async openLinkInNewTab (url, internal=true) {
    const createProperties = {};
    if (internal)
      createProperties.url = api.runtime.getURL(url);
    else
      createProperties.url = url;
    // if we're in Tabs Outliner mode, open in cursor's window
    // otherwise open in our own window
    let windowId;
    if ('session' === this.viewScope) {
      const winNode = this.cursor.getWindowNode();
      if (winNode) windowId = winNode.windowId;
    }
    if (! windowId) {
      const win = await api.windows.getCurrent({ populate: false });
      windowId = win.id;
    }
    const [tab] = await api.tabs.query({ active: true, windowId });
    debug(`openLinkInNewTab() parent tab:`, tab);
    createProperties.windowId = tab.windowId;
    // Chrome can't open internal pages in incognito windows
    if (internal && isChrome && tab.incognito) { }
    else createProperties.openerTabId = tab.id;
    api.tabs.create(createProperties);
  }

  openInternalPage (url) {
    return this.openLinkInNewTab(url, true);
  }

  openExternalPage (url) {
    return this.openLinkInNewTab(url, false);
  }

  onTreeViewInTabBtnClick () {
    this.openInternalPage('/view/sidepanel.html');
  }

  onZoomBtn (direction) {
    const zoomStepSize = Math.pow(2, 1.0 / this.zoomSteps);

    // adjust the zoom
    let newzoom = this.cfg.treeViewZoomLevel;
    if (direction > 0) newzoom *= zoomStepSize;
    else if (direction < 0) newzoom /= zoomStepSize;
    else newzoom = 1;

    // round to nearest clean ratio if it's close
    function snapToRatio(value, tolerance = 0.01) {
      const ratios = [1/4, 1/2, 1, 2, 4];
      for (const r of ratios) {
        const diff = Math.abs(value - r) / r;  // relative difference
        if (diff <= tolerance) {
          return r;  // snap to the clean ratio
        }
      }
      return value; // leave unchanged
    }

    // clean up the value
    newzoom = snapToRatio(newzoom);

    // ... and set it
    this.cfg.set('treeViewZoomLevel', newzoom);
    //this.setZoomLevel(newzoom);
  }

  async setZoomLevel (zoomLevel, oldZoomLevel) {
    zoomLevel = Math.min(Math.max(zoomLevel, this.zoomMin), this.zoomMax);

    // update the view
    this.document.documentElement.style.setProperty('--zoom-level', zoomLevel);
    this.zoomLevel = zoomLevel;

    if (! this.isInert) {
      if (zoomLevel !== oldZoomLevel) {
        this.setStatus(`Zoom: ${(100 * this.zoomLevel).toFixed(2)}%`);
      }
    }

    // grey out or activate zoom buttons if maxed out
    if (this.$zoomInBtn) {
      const grey = 'greyed-out';
      if (zoomLevel >= this.zoomMax) this.$zoomInBtn.classList.add(grey);
      else this.$zoomInBtn.classList.remove(grey);
      if (zoomLevel <= this.zoomMin) this.$zoomOutBtn.classList.add(grey);
      else this.$zoomOutBtn.classList.remove(grey);
    }
  }

  onBackupBtnClick () {
    this.action_backupSession();
  }

  onOptionsBtnClick () {
    this.openInternalPage('/options/options.html');
  }

  onDonateBtnClick () {
    // redirects to the correct page,
    // handy if I need to change platforms
    this.openExternalPage('https://toykeeper.net/tktsto/donate');
  }

  onHelpBtnClick () {
    this.openInternalPage('/docs/index.html');
  }

  tree_nodeAdded (msg, sender, sendResponse) {
    msg.node.render = true;
    return super.tree_nodeAdded(msg, sender, sendResponse);
  }

  async onMessage (msg, sender, sendResponse) {
    // if message not for us, let parent class handle it
    if (!(msg && msg.msg && msg.msg.startsWith('treeview_')))
      return super.onMessage(msg, sender, sendResponse);

    debug(`TreeView.onMessage(${msg.msg})`, this.windowId);

    // ignore messages for other windows
    if (msg.windowId !== this.windowId) return;

    debug(`TreeView.onMessage(${msg.msg})`, msg);
    if ('treeview_onCommand' === msg.msg) {
      // don't do any of this when a dialog box exists
      if (this.dialogActive) return;
      // turn this off in case it's still visible
      this.hideHoverMenu();
      // find the matching 'action_doStuff' function
      const actionName = `action_${msg.action}`;
      const handler = this[actionName];
      // actually handle the event, but only one at a time
      const unlock = await this.keyEventMutex.lock();
      try {
        this.setStatus(`key: ${msg.action}`);
        // event type tells handlers to use keyboard cursor, not mouse
        //await handler.bind(this)({ type: 'command',  tab: msg.tab });
        await handler.bind(this)({ type: 'command',  ...msg });
      }
      finally { unlock(); }
      return;
    }
  }

}


// table mapping keys to actions
// TODO: let user bind keys
export const keyBindings = {
  // test
  ///// add / remove nodes
  'Enter': 'loadOrEditNode',
  'D': 'deleteNode',
  'L': 'loadNode',
  'U': 'unloadNode',
  'O': 'addNodeAsNextVisibleRow',
  'Shift+O': 'addNodeAsPrevVisibleRow',
  ///// edit nodes
  'Space': 'toggleExpanded',
  'E': 'editNode',
  ///// task status
  'T': 'taskEdit',
  ///// search
  '/': 'beginSearch',
  'Shift+*': 'searchForCurrent',  // match current label, url, or title
  //'Ctrl+F': 'beginSearch',
  //'Ctrl+G': 'nextSearchResult',
  'N': 'nextSearchResult',
  'Shift+N': 'prevSearchResult',
  'Escape': 'endSearch',
  ///// cursor movement
  'ArrowUp': 'cursorUp',
  'ArrowDown': 'cursorDown',
  'ArrowLeft': 'cursorLeft',
  'ArrowRight': 'cursorRight',
  'PageUp': 'cursorPgUp',
  'PageDown': 'cursorPgDown',
  'Home': 'cursorHome',
  'End': 'cursorEnd',
  ///// move current node
  // move by one visible row, period
  'Shift+ArrowUp': 'moveNodeUp',
  'Shift+ArrowDown': 'moveNodeDown',
  // move by one sibling, never going to a deeper level (but maybe higher)
  'Shift+PageUp': 'moveNodeUpNoDescend',
  'Shift+PageDown': 'moveNodeDownNoDescend',
  // move shallower or deeper
  'Shift+ArrowLeft': 'moveNodeLeft',
  'Shift+ArrowRight': 'moveNodeRight',
  // move to first / last position
  // TODO: implement these
  'Shift+Home': 'moveNodeHome',
  'Shift+End': 'moveNodeEnd',
  ///// mark / paste
  'M': 'toggleMarked',
  'Shift+M': 'unmarkAll',
  'P': 'pasteMarked',
  'Shift+P': 'pasteMarkedBefore',
  // TODO: leader key for batch processing of other things,
  //   like delete and maybe sort and checkbox actions and ...
  ///// buttons
  'B': 'backupSession',
  ///// misc
  'I': 'detailsButton',
  'Shift+?': 'generateTutorial',
  'Tab': 'none',  // suppress default Tab handling
  'none': 'none'
};


// mouse click bindings
export const mouseBindings = {
  // mouseover should show a hover menu thingy
  'MouseOver': 'mouseHoverMenu',
  // drag-n-drop stuff
  'MouseDragStart': 'mouseDragStart',
  'MouseDrag': 'mouseDrag',
  'MouseDrop': 'mouseDrop',
  'MouseDragEnd': 'mouseDragEnd',
  'MouseDragLeave': 'mouseDragLeave',
  'MouseDragOver': 'mouseDragOver',
  // do nothing on 'click' event
  'MouseClickLeft': 'rejectEvent',
  // double click does the same thing as 'Enter'
  'MouseDblClickLeft': 'loadOrEditNode',
  // place cursor and maybe expand/collapse node
  'MousePressLeft': 'mousePressLeft',
  // allow middle click to pass as-is, and open link in a new tab
  'MousePressMiddle': 'none',
  // allow right click to open normal context menu
  'MousePressRight': 'none',
};

