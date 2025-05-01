// view/treeview.js: TreeView class
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: AGPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import { log, debug, warn, error, emit } from '/common/common.js';
import { inputDialog } from '/common/dialog.js';
import { NodeView } from './nodeview.js';
import { Tree } from '/common/tree.js';
import { Mutex } from '/common/mutex.js';


export class TreeView extends Tree {

  constructor () {
    super(NodeView);

    // TODO: determine whether full view or single-window

    this.document = document;
    this.window = window;

    this.$ = this.document.getElementById('tree-view');
    this.$treeRoot = this.document.getElementById('tree-root');

    // stylesheets
    this.$themeBase = this.document.getElementById('theme-base');
    this.$themeVariant = this.document.getElementById('theme-variant');
    this.$styleOptions = this.document.getElementById('style-options');
    this.$userStyles = this.document.getElementById('user-styles');

    this.cursor = null;

    this.$viewScopeBtn = this.document.getElementById('view-scope-btn');

    // shows info about most recent event
    //this.$statusBar = this.document.getElementById('status-bar');
    this.$statusText = this.document.getElementById('status-text');
    this.$detailsBox = this.document.getElementById('details-box');
    this.$detailsBtn = this.document.getElementById('details-btn');
    // TODO: this should load from config
    this.detailsState = 1;  // 0=off, 1=notes, 2=details
    // click to save a session backup
    this.$backupBtn = this.document.getElementById('backup-btn');

    // count of marked nodes when non-zero
    this.$markedCount = this.document.getElementById('marked-count');

    // node row hover menu
    this.$hoverMenu = this.document.getElementById('hover-menu');

    // TODO: buttons to zoom this TreeView
    // https://developer.chrome.com/docs/extensions/reference/api/tabs#type-ZoomSettings
    // api.tabs.setZoom(tabId?, zoomFactor, callback?)
    // api.tabs.getZoom(tabId?, callback?)
    //   cb(zoomFactor)
    // api.tabs.onZoomChange.addListener(cb)
    //   cb(ZoomChangeInfo)
    //     zci.newZoomFactor
    //     zci.oldZoomFactor
    //     zci.tabId
    //     zci.zoomSettings
    // Must get the sidepanel's tabId first though?
    // await api.tabs.query({active:true, currentWindow:true})
    // await api.tabs.query({active:true, windowId:(await api.windows.getCurrent()).id})
    // https://stackoverflow.com/questions/76456744/chrome-extension-get-tab-id-in-sidepanel

    // table mapping keys to actions
    // TODO: let user bind keys
    this.keyEventMutex = new Mutex();
    this.keyBindngs = {
      // test
      //'a': 'addNode',
      ///// add / remove nodes
      'Enter': 'loadOrEditNode',
      'd': 'deleteNode',
      'u': 'unloadNode',
      'o': 'addNodeAsNextVisibleRow',
      'Shift+O': 'addNodeAsPrevVisibleRow',
      ///// edit nodes
      'Space': 'toggleExpanded',
      'e': 'editNotes',
      ///// task status
      //'x': 'toggleTaskDone',
      //'t': 'taskLeaderKey',
      ///// search
      //'/': 'beginSearch',
      //'Shift+*': 'searchForCurrent',  // match current label, url, or title
      //'Ctrl+f': 'beginSearch',
      //'Ctrl+g': 'nextSearchResult',
      //'n': 'nextSearchResult',
      //'Shift+N': 'prevSearchResult',
      //'Escape': 'endSearch',
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
      'Shift+Home': 'moveNodeHome',
      'Shift+End': 'moveNodeEnd',
      ///// mark / paste
      'm': 'toggleMarked',
      'Shift+M': 'unmarkAll',
      'p': 'pasteMarked',
      //'Shift+P': 'pasteMarkedBefore',
      // TODO: leader key for batch processing of other things,
      //   like delete and maybe sort and checkbox actions and ...
      ///// buttons
      'b': 'backupSession',
      ///// misc
      'Tab': 'none',  // suppress default Tab handling
      'none': 'none'
    };
    // mouse click bindings
    this.mouseBindings = {
      // mouseover should show a hover menu thingy
      'MouseOver': 'mouseHoverMenu',
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
  }

  destroy () {
  }

  async init () {
    super.init();
    this.initKeyHandler();
    this.initMouseHandler();
    this.initButtonHandlers();
    this.initStorageObserver();
    // get the window this view is attached to
    this.windowObj = await api.windows.getCurrent();
    this.windowId = this.windowObj.id;
    // TODO: load config...
    this.nodesPerPage = 20;
    // init stylesheets
    this.updateTheme();
    this.updateStyleOptions();
    this.updateUserStyles();
    // init connection to bkgd
    await this.initBkgdPort();
    this.initBkgdPing();
    // TODO: load the nodes from storage and render them
    await this.loadTreeFromBkgd(false);

    //this.root = new NodeView(this, null, this.window);
    this.root.window = this.window;

    // figure out which window we are and whether to view the whole tree
    this.windowNode = this.root.getWindowId(this.windowId);
    this.viewScope = await this.getWindowConfig('viewScope', 'session');
    this.$renderViewScopeBtn();

    this.$renderWholeTree();

    // apply the user's detail box setting
    this.$renderDetailsBtn();

    // build the hover menu
    this.$renderHoverMenu();

    // ensure the current tab is visible when sidepanel opens
    this.moveCursorToActiveTab();
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
      this.setCursor(newCursor);
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

  initStorageObserver () {
    api.storage.onChanged.addListener( this.storageObserver.bind(this) );
  }

  storageObserver (changes) {
    if (changes.expandedRowPrefix) {
      this.updateStyleOptions();
    }
    if (changes.theme) {
      this.updateTheme();
    }
  }

  async getWindowConfig (varName, defaultValue) {
    // can't do anything unless we know which window we are
    if (! this.windowNode) return;
    // load from config, per window
    const key = `TreeView.${varName}.${this.windowNode.id}`;
    const result = await api.storage.local.get(key);
    if (undefined !== result[key]) return result[key];
    return defaultValue;
  }

  setWindowConfig (varName, value) {
    // can't do anything unless we know which window we are
    if (! this.windowNode) return;
    // save button state to config storage, per window
    const vars = {};
    vars[`TreeView.${varName}.${this.windowNode.id}`] = value;
    return api.storage.local.set(vars);
  }

  async updateTheme () {
    const themes = {
      'TK Night': ['tk', 'tk-night'],
      'TK Day': ['tk', 'tk-day']
    };
    const data = await api.storage.local.get('theme');
    if (data.theme && themes[data.theme]) {
      const theme = themes[data.theme];
      this.$themeBase.href = `/themes/${theme[0]}.css`;
      this.$themeVariant.href = `/themes/${theme[1]}.css`;
    }
  }

  async updateStyleOptions () {
    let styleText = '';
    let data;
    // '+' marker drawn before expanded rows?
    data = await api.storage.local.get({ 'expandedRowPrefix': true });
    let expandedRowPrefix = '';
    if (data.expandedRowPrefix) {
      styleText = styleText
        + "\n.expanded.row::before {"
        + `\n  content: "+";`
        + '\n  margin-left: -2px;'
        + '\n  margin-right: -2px;'
        + '\n}';
    }
    // apply the changes
    this.$styleOptions.textContent = styleText;
  }

  updateUserStyles () {
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

  async inputDialog (...args) {
    // disable key event handling while dialog is active
    this.dialogActive = true;
    const result = await inputDialog(...args);
    this.dialogActive = false;
    return result;
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
    this.$treeRoot.addEventListener('mouseover',
      (event) => { this.mouseEvent('mouseover', event) });
    // hide the hover menu when the mouse leaves the tree view
    this.$.addEventListener('mouseleave',
      (event) => { this.hideHoverMenu(); });
  }

  buildEventName (event) {
    const shift = (event.shiftKey && (event.key != 'Shift')) ? 'Shift+' : '';
    const ctrl = (event.ctrlKey && (event.key != 'Control')) ? 'Ctrl+' : '';
    const alt = (event.altKey && (event.key != 'Alt')) ? 'Alt+' : '';
    const meta = (event.metaKey && (event.key != 'Meta')) ? 'Meta+' : '';
    let eventName;
    if ('keydown' === event.type) {
      let eventKey = event.key;
      if (eventKey === ' ') eventKey = 'Space';
      eventName = eventKey;
    }
    else if (['mousedown', 'mouseup', 'click', 'dblclick'].includes(event.type)) {
      const buttonNames = ['Left', 'Middle', 'Right'];
      const clickNames = { mousedown: 'Press', mouseup: 'Release',
        click: 'Click', dblclick: 'DblClick' };
      const buttonName = buttonNames[event.button];
      const clickName = clickNames[event.type];
      if (buttonName) {
        eventName = `Mouse${clickName}${buttonName}`;
      }
    }
    else if ('mouseover' === event.type) {
      eventName = 'MouseOver';
    }
    const fullEventName = `${shift}${ctrl}${alt}${meta}${eventName}`;
    event.processedName = fullEventName;
    return fullEventName;
  }

  keyHandler (event) {
    // don't try to handle key events while a dialog is visible
    if (this.dialogActive) return;
    // calculate a more complete name for this event,
    // then call the keyboard event dispatcher
    const keyName = this.buildEventName(event);
    this.setStatus(`keydown: ${keyName}`);
    return this.dispatchInputEvent(event);
  }

  async dispatchInputEvent (event) {
    // look up the event name to see if it's mapped to an action
    // ... then call that action
    const handlerName = this.keyBindngs[event.processedName];
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
    // don't try to handle mouse events while a dialog is visible
    if (this.dialogActive) return;
    //debug(`mouseEvent(${eventType}):`, event);
    // assign an event name based on modifier keys, event type, mouse button
    const eventName = this.buildEventName(event);
    //this.setStatus(`mouse: ${eventName}`);
    // identify which row the event was in, if any
    let node;  // which Tree Node object was clicked?
    let $target = event.target;
    let $node;  // Node's ul.node element
    let $row;  // Node's div.row element
    let $elem;  // most specific element we care about
    while ($target) {
      const className = $target.classList[0];
      if ((! $elem) && [
        'node-stats', 'node-link', 'node-label',
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
    //debug(`${eventName} ${node.id} `, node, this.$mouseRow);
    //debug(`node: ${node.id}`, node);
    // identify which part of the row the event was in
    let rowX, rowY, rowWid, rowHgt;
    if ($row) {
      rowX = event.clientX - $row.offsetLeft;
      rowY = event.clientY - $row.offsetTop;
      rowWid = $row.clientWidth;
      rowHgt = $row.clientHeight;
    }
    this.$mouseRowX = rowX;
    this.$mouseRowY = rowY;
    this.$mouseRowWid = rowWid;
    this.$mouseRowHgt = rowHgt;

    // call a handler
    const handlerName = this.mouseBindings[eventName];
    if (handlerName) {
      const handler = this[`action_${handlerName}`];
      if (handler) {
        if (! ['mouseHoverMenu', 'rejectEvent'].includes(handlerName))
          this.setStatus(`mouse: ${handlerName}`);
        // eat default browser action unless handler wants it
        if ('none' !== handlerName) {
          event.preventDefault();
          event.stopPropagation();
        }
        // equivalent to this.handler(event);
        await handler.bind(this)(event);
      }
    }
  }

  whichCursor (event) {
    // decide whether to act on mouse hover node or keyboard cursor node
    // based on the event type
    if ('click' === event.type) return this.mouseNode;
    else return this.cursor;
  }

  action_none (event) { }

  action_rejectEvent (event) {  // block browser's default handler
    event.preventDefault();
    event.stopPropagation();
  }

  action_cursorUp (event) {
    if (! this.cursor) return this.setCursor(this.root);
    // move up one row
    this.setCursor(this.cursor.prevVisibleNode(this.viewRoot));
  }

  action_cursorDown (event) {
    if (! this.cursor) return this.setCursor(this.root);
    // move down one row
    this.setCursor(this.cursor.nextVisibleNode(this.viewRoot));
  }

  action_cursorLeft (event) {  // move cursor to parent
    if (! this.cursor) return this.setCursor(this.root);
    // ignore if root
    if (this.cursor.isRoot()) return;
    if (this.viewRoot === this.cursor) return;
    // move to parent
    this.setCursor(this.cursor.parent);
  }

  action_cursorRight (event) {
    // expand current node and move cursor to 1st child
    // default
    if (! this.cursor) return this.setCursor(this.root);

    // if no kids, do nothing
    if (this.cursor.isLeaf()) return;

    // expand if necessary
    if (! this.cursor.isExpanded()) {
      this.cursor.setExpanded(true, { reason: 'userAction' });
    }

    // move to 1st child
    this.setCursor(this.cursor.nodes[0]);
  }

  action_cursorHome (event) {
    if (! this.cursor) return this.setCursor(this.root);
    // move to first sibling
    const node = this.cursor.firstSibling();
    if (node.isChildOf(this.viewRoot, true))
      this.setCursor(node);
  }

  action_cursorEnd (event) {
    if (! this.cursor) return this.setCursor(this.root);
    // move to last sibling
    const node = this.cursor.lastSibling();
    if (node.isChildOf(this.viewRoot, true))
      this.setCursor(node);
  }

  action_cursorPgUp (event) {
    if (! this.cursor) return this.setCursor(this.root);
    // move up N rows
    let node = this.cursor;
    for (let i=0; i<this.nodesPerPage; i++)
      node = node.prevVisibleNode(this.viewRoot);
    this.setCursor(node);
  }

  action_cursorPgDown (event) {
    if (! this.cursor) return this.setCursor(this.root);
    // move up N rows
    let node = this.cursor;
    for (let i=0; i<this.nodesPerPage; i++)
      node = node.nextVisibleNode(this.viewRoot);
    this.setCursor(node);
  }

  async action_moveNodeUp (event) {
    debug('TreeView.action_moveNodeUp()');

    // if root or 1st child of root, or if outside of root, do nothing
    if (! this.cursor) return;
    if (this.cursor.isRoot()) return;
    if (! this.cursor.isChildOf(this.viewRoot, false)) return;
    if (this.cursor.parent.isRoot() && (0 === this.cursor.indexOf())) return;
    if ((this.cursor.parent === this.viewRoot) && (0 === this.cursor.indexOf())) return;

    // node can be moved up; take position of previous visible row
    const prevRow = this.cursor.prevVisibleNode();
    const destParent = prevRow.parent;
    const destIndex = prevRow.indexOf();

    // move it
    await this.cursor.moveTo(destParent, destIndex, { reason: 'userAction' });
    this.setStatus(`moved up: ${this.cursor.toLine()}`);
  }

  async action_moveNodeDown (event) {
    debug('TreeView.action_moveNodeDown()');

    // if root, or outside of root, do nothing
    if (! this.cursor) return;
    if (this.cursor.isRoot()) return;
    if (! this.cursor.isChildOf(this.viewRoot, false)) return;

    // take position of next visible row outside our own branch, probably
    const nextRow = this.cursor.nextVisibleNodeNotMyChild(this.viewRoot);
    // figure out where to move to
    let destParent;
    let destIndex;
    // if we're the last row in the tree, promote to last child of parent
    if (nextRow === this.cursor) {
      if (this.cursor.parent.isRoot()) return;
      if (this.cursor.parent === this.viewRoot) return;
      destParent = this.cursor.parent.parent;
      destIndex = this.cursor.parent.indexOf() + 1;
    }
    // if next row is an expanded parent, move before 1st child
    else if (nextRow.hasKids() && nextRow.isExpanded()) {
      destParent = nextRow;
      destIndex = 0;
    }
    else {  // take position of next visible row
      destParent = nextRow.parent;
      destIndex = nextRow.indexOf() + 1;
    }

    // move it
    await this.cursor.moveTo(destParent, destIndex, { reason: 'userAction' });
    this.setStatus(`moved down: ${this.cursor.toLine()}`);
  }

  async action_moveNodeUpNoDescend (event) {
    debug('TreeView.action_moveNodeUpNoDescend()');

    // if 1st child of root, do nothing
    if (! this.cursor) return;
    if (this.cursor.isRoot()) return;
    if (! this.cursor.isChildOf(this.viewRoot, false)) return;
    if (this.cursor.parent.isRoot() && (0 === this.cursor.indexOf())) return;
    if ((this.cursor.parent === this.viewRoot) && (0 === this.cursor.indexOf())) return;

    // node can be moved up
    let destParent;
    let destIndex;
    // if 1st child, take parent's parent and index
    if (0 === this.cursor.indexOf()) {
      destParent = this.cursor.parent.parent;
      destIndex = destParent.indexOf();
    }
    // if prev sibling, take its index
    else {
      destParent = this.cursor.parent;
      destIndex = this.cursor.indexOf() - 1;
    }

    // actually move it
    await this.cursor.moveTo(destParent, destIndex, { reason: 'userAction' });
    this.setStatus(`moved up: ${this.cursor.toLine()}`);
  }

  action_moveNodeDownNoDescend (event) {
    // TODO: this one is somewhat more complicated
    //this.setStatus(`moved down: ${this.cursor.toLine()}`);
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
    let newCursor = this.cursor;
    // if destParent expanded, make this node the last child
    if (destParent.isExpanded()) {
      destIndex = destParent.nodes.length;
    }
    // if new parent collapsed, make this node the *first* child
    // TODO: destination should be configurable
    else {
      destIndex = 0;
      newCursor = destParent;
      //newCursor = this.cursor.nextVisibleNode();
    }

    await this.cursor.moveTo(destParent, destIndex, { reason: 'userAction' });
    this.setCursor(newCursor);
    this.setStatus(`moved right: ${this.cursor.toLine()}`);
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
    await this.cursor.moveTo(destParent, destIndex, { reason: 'userAction' });
    this.setStatus(`moved left: ${this.cursor.toLine()}`);
  }

  async addNodeAsPrevOrNextVisibleRow (position) {
    // ensure valid position: prev or next
    if (undefined === position) position = 'next';
    if ('next' !== position) position = 'prev';

    // prompt for new label text
    const result = await this.inputDialog({
      doc: document,
      title: 'Add Node',
      description: 'Enter label text:',
      value: ''
    });
    // abort if user cancelled
    if ((!result) || ('OK' !== result.button)) return;
    const labelText = result.value;

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

    // add a new Node
    const newNode = await destParent.addChild(destIndex,
      { label: labelText, render: true },
      { reason: 'userAction' });
    //log(destParent.nodes);
    this.setCursor(newNode);
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
    if (cursor === this.viewRoot) return;
    // don't delete an open window
    if (this.cursor.isWindow() && this.cursor.isLoaded()) return;
    // do nothing if cursor is outside of viewRoot
    if (! this.cursor.isChildOf(this.viewRoot, false)) return;

    // figure out where to put the cursor after deletion
    let newCursor = this.cursor;  // default if cursor === mouseNode
    if (cursor === this.cursor) {
      // move to next row when possible
      newCursor = this.cursor.nextVisibleNode();
      // move to prev row if cursor is already on the last row
      if (newCursor === this.cursor) newCursor = this.cursor.prevVisibleNode();
    }

    // delete depending on the node type and state
    const toDelete = cursor;
    const line = cursor.toLine();
    // if leaf, just delete it... simple
    if (cursor.isLeaf()) {
      //debug('delete leaf node');
      toDelete.deleteSelf({ reason: 'userAction' });
      this.setStatus(`deleted ${line}`);
    }
    // TODO: if window and has open tabs, things get complicated
    // if expanded, promote kids then delete parent
    else if (cursor.isExpanded()) {
      //debug('promote kids and delete parent');
      // TODO: let user configure "promote all kids" or "promote 1st child"
      const numKids = toDelete.nodes.length;
      toDelete.deleteSelfAndPromoteKids({ reason: 'userAction' });
      //toDelete.deleteSelfAndPromote1stKid({ reason: 'userAction' });
      //this.setStatus(`deleted 1 node and promoted ${numKids} sub-nodes`);
      this.setStatus(`deleted ${line}`);
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
      toDelete.deleteSelf({ reason: 'userAction' });
      this.setStatus(`deleted ${numToDelete} nodes`);
    }

    // update the cursor
    this.setCursor(newCursor);
  }

  action_unloadNode(event) {
    debug('action_unloadNode');
    // choose mouse or keyboard cursor based on event type
    let cursor = this.whichCursor(event);
    // abort if nothing to unload
    if (! cursor) return;
    //if (! cursor.isLoaded()) return;

    cursor.unload({ reason: 'userAction' });
    this.setStatus(`unloaded ${cursor.toLine()}`);
  }

  action_loadNode(event) {
    return this.action_loadOrEditNode(event, false);
  }

  action_loadOrEditNode(event, allowEdit = true) {
    debug('action_loadOrEditNode');
    // abort if nothing to do
    if (! this.cursor) return;
    let cursor = this.cursor;

    // if unloaded tab, load it
    if (cursor.isUnloadedTab()) {
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
      if (allowEdit) this.action_editNotes(event);
    }
  }

  action_toggleExpanded (event) {
    debug('action_toggleExpanded()');
    // skip no-op cases
    if (! this.cursor) return;
    const toggled = ! this.cursor.expanded;
    this.cursor.setExpanded(toggled, { reason: 'userAction' });
    const verbed = toggled ? 'Expanded' : 'Collapsed';
    this.setStatus(`${verbed} ${this.cursor.toLine()}`);
  }

  async action_editNotes (event) {
    debug('action_editNotes()');
    // choose mouse or keyboard cursor based on event type
    let cursor = this.whichCursor(event);
    // skip no-op cases
    if (! cursor) return;

    // prompt for new label/note text
    const result = await this.inputDialog({
      doc: document,
      title: 'Edit Notes',
      description: 'Label',
      value: cursor.label,
      textArea: true,
      textAreaLabel: 'Notes',
      textAreaValue: cursor.note
    });
    // abort if user cancelled
    if ((!result) || ('OK' !== result.button)) return;
    // update the node
    const labelText = result.value;
    const noteText = result.textAreaValue;
    //debug('action_editNotes():', labelText, noteText);
    cursor.setNotes(labelText, noteText, { reason: 'userAction' });
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
    this.setStatus(`${verbed} ${this.cursor.toLine()}`);
  }

  async action_unmarkAll (event) {
    debug('action_unmarkAll()');
    await this.unmarkAll({ reason: 'userAction' });
    this.setStatus(`Unmarked all nodes`);
  }

  async action_pasteMarked (event) {
    // skip no-op cases
    if (! this.cursor) return;
    debug('action_pasteMarked()');

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

    // TODO: sort the markedNodes list by order in tree
    //   instead of order added to list
    let numMoved = 0;
    for (const nodeId of this.markedNodes) {
      const node = this.nodes[nodeId];
      // special case: moving from/to same parent can get weird
      const pastingToSameParent = (node.parent === destParent);
      const oldIndex = node.indexOf();
      // move the node
      await node.moveTo(destParent, destIndex, { reason: 'userAction' });
      numMoved ++;
      // adjust if special case was triggered
      if (pastingToSameParent) {
        if (oldIndex < destIndex)
          destIndex --;
      }
      // next paste goes at next slot
      destIndex ++;
    }
    this.setStatus(`Moved ${numMoved} nodes`);
  }

  // TODO
  async action_pasteMarkedBefore (event) {
  }

  async action_backupSession (event) {
    return await this.downloadBackupNow();
  }

  async action_mousePressLeft (event) {
    // abort on no-op
    if (! this.mouseNode) return;
    // place the cursor
    await this.setCursor(this.mouseNode);
    // maybe toggle expanded
    if (this.$mouseRow) {
      // if user clicked the left ~1em of the row, toggle expand
      // (or if they clicked the node stats widget)
      if ((this.$mouseRowX <= this.$mouseRowHgt)
        || (this.$mouseElem
          && this.$mouseElem.classList.contains('node-stats'))
      ) {
        await this.action_toggleExpanded(event);
      }
    }
  }

  action_mouseHoverMenu (event) {
    //debug(`action_mouseHoverMenu ${this.mouseNode.toLine()}`);
    if (this.mouseNode && this.$mouseRow) return this.showHoverMenu();
    else return this.hideHoverMenu();
  }

  $renderHoverMenu () {
    const doc = this.document;

    function makeBtn (_this, className, label, funcName) {
      const $div = doc.createElement('div');
      $div.classList.add(className);
      $div.innerText = label;
      // TODO: get label from user's keybinding table
      //let binding;
      // make the button do something when clicked
      const func = function (event) {
        _this[`action_${funcName}`].bind(_this)(event);
        _this.showHoverMenu();  // update display in case style changed
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
    if (! this.$hoverMenuEdit) {
      this.$hoverMenuEdit = makeBtn(this, 'edit-button', 'E', 'editNotes');
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
    // skip extra drawing if the menu hasn't changed
    if (this.hoverMenuLast === this.mouseNode) return;
    this.hoverMenuLast = this.mouseNode;
    // adjust menu position
    const rect = this.$mouseRow.getBoundingClientRect();
    this.$hoverMenu.style.top = String(rect.top + window.scrollY - 3) + 'px';
    // show or hide the 'unload' button
    if (this.mouseNode.isUnloadable()) {
      this.$hoverMenuUnload.style.display = 'inline-block';
      this.$hoverMenuUnload.classList.remove('unloaded');
    }
    else if (this.mouseNode.isUnloadedTab()) {
      this.$hoverMenuUnload.style.display = 'inline-block';
      this.$hoverMenuUnload.classList.add('unloaded');
    }
    else this.$hoverMenuUnload.style.display = 'none';
    // show or hide the 'mark' button
    if (this.mouseNode.isMarkable())
      this.$hoverMenuMark.style.display = 'inline-block';
    else this.$hoverMenuMark.style.display = 'none';
    // show or hide the 'delete' button
    if (this.mouseNode.isDeletable())
      this.$hoverMenuDelete.style.display = 'inline-block';
    else this.$hoverMenuDelete.style.display = 'none';
    // show the menu
    this.$hoverMenu.classList.remove('hidden');
  }

  setCursor (node) {
    if (this.cursor && (node !== this.cursor)) this.cursor.removeCursor();
    if (node        && (node !== this.cursor)) node.addCursor();
    this.cursor = node;
    if (node) {
      // show and update node detail box
      this.updateDetailsBox();
      // ensure node is visible
      node.scrollIntoView();
    }
    else {
      this.hideDetailsBox();
    }
  }

  ensureCursorVisible () {
    if (! this.cursor) return this.setCursor(this.root);

    if (this.cursor.isVisible()) return;

    debug('TreeView.ensureCursorVisible(): fixing invisible cursor');
    let parent = this.cursor.parent;
    while ((!parent.isRoot()) && (! parent.isVisible()))
      parent = parent.parent;
    this.setCursor(parent);
  }

  async moveCursorToActiveTab () {
    // find the current window in the tree
    const win = await api.windows.getCurrent();
    const windowId = win.id;
    //debug(`windowId: ${windowId}`);
    let found = this.root.findNodes((node) => {
      return (node.isWindow() && (windowId === node.windowId));
    });
    // abort if not found
    if (found.length <= 0) return;

    // make sure window node is at the top of the view
    const windowNode = found[0];
    windowNode.scrollToTop();
    //debug(`windowNode: ${windowNode.windowId}`);
    // show the active tab and put the cursor on it
    const activeTabNode = windowNode.getActiveTab();
    if (activeTabNode) {
      this.setCursor(activeTabNode);
      //activeTabNode.scrollIntoView();
    }
  }

  updateDetailsBox () {
    if (! this.cursor) return;
    // only show details if its button is in a 'pressed' state
    this.cursor.$renderDetails(this.$detailsBox);
  }

  hideDetailsBox () {
    this.$detailsBox.classList.add('hidden');
  }

  initBkgdPort () {
    this.port = api.runtime.connect();
    this.port.onDisconnect.addListener(() => {
      debug("TreeView.port disconnected, reconnecting...");
      setTimeout(this.initBkgdPort, 100);
    });
  }

  initBkgdPing () {
    this.bkgdPing = setInterval(this.pingBkgd, 15 * 1000);
  }

  async pingBkgd () {
    // keep service worker alive
    // so it won't have to keep reloading the tree from persistent storage
    const before = Date.now();
    //const response = await api.runtime.sendMessage({ 'msg': 'bkgd_ping' });
    const response = await emit('bkgd_ping');
    const after = Date.now();
    if (! response) { return warn('bkgd ping failed'); }
    const elapsed = after - before;
    const oneway = response - before;
    if (elapsed > 30)  // don't log fast pings, only slow pings
      debug(`view => bkgd ping: 0 -> ${oneway} ms -> ${elapsed} ms`);
  }

  initButtonHandlers () {
    // when view-scope-btn clicked, toggle session vs window view mode
    this.$viewScopeBtn.addEventListener('click', () => {
      this.onViewScopeBtnClick();
    });
    // when details-btn clicked, toggle the details box
    this.$detailsBtn.addEventListener('click', () => {
      this.onDetailsBtnClick();
    });
    // save a session backup when clicked
    this.$backupBtn.addEventListener('click', () => {
      this.onBackupBtnClick();
    });
  }

  onViewScopeBtnClick () {
    if ('session' === this.viewScope) this.viewScope = 'window';
    else this.viewScope = 'session';
    // save button state to config storage, per window
    this.setWindowConfig('viewScope', this.viewScope);
    // update the display
    this.$renderViewScopeBtn();
    this.$renderWholeTree();
    this.setStatus(`View scope: ${this.viewScope}`);
  }

  $renderViewScopeBtn () {
    // Capitalize word and place it inside the button
    const label = this.viewScope.charAt(0).toUpperCase()
      + this.viewScope.slice(1);
    this.$viewScopeBtn.innerText = label;
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
        if (this.cursor) this.cursor.scrollIntoView();
        break;
      // 2 = full / all details
      case 2:
      default:
        this.$detailsBtn.classList.add('pressed');
        //this.$detailsBtn.classList.remove('half-pressed');
        this.$detailsBtn.innerText = 'Details';
        this.updateDetailsBox();
        if (this.cursor) this.cursor.scrollIntoView();
        break;
    }
  }

  onBackupBtnClick () {
    this.action_backupSession();
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
        await handler.bind(this)({ type: 'command' });
      }
      finally { unlock(); }
      return;
    }
  }

}

