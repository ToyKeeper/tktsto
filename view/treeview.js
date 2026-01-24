// view/treeview.js: TreeView class
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: AGPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import { log, debug, warn, error, emit } from '/common/common.js';
import { buildEventName } from '/common/events.js';
import { inputDialog, checkboxDialog, nodeEditDialog } from '/common/dialog.js';
import { NodeView } from './nodeview.js';
import { Tree } from '/common/tree.js';
import { Mutex } from '/common/mutex.js';


export class TreeView extends Tree {

  constructor () {
    super(NodeView);

    // TODO: determine whether full view or single-window

    try {
      this.document = document;
      this.window = window;
    } catch (err) {
      // This instance is NOT a real tree view...
      // ... just an instance created for some other purpose
      // (like during the tutorial, to get a list of keyBindngs)
      this.isInert = true;
    }

    if (! this.isInert) {
      this.initElements();
    }

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
      'e': 'editNode',
      ///// task status
      //'x': 'toggleTaskDone',
      //'t': 'taskLeaderKey',
      't': 'taskEdit',
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
      'Shift+P': 'pasteMarkedBefore',
      // TODO: leader key for batch processing of other things,
      //   like delete and maybe sort and checkbox actions and ...
      ///// buttons
      'b': 'backupSession',
      ///// misc
      'i': 'detailsButton',
      'Shift+?': 'generateTutorial',
      'Tab': 'none',  // suppress default Tab handling
      'none': 'none'
    };
    // mouse click bindings
    this.mouseBindings = {
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
  }

  destroy () {
  }

  initElements () {
    this.$body = this.document.getElementById('body');
    this.$ = this.document.getElementById('tree-view');
    this.$treeRoot = this.document.getElementById('tree-root');

    // stylesheets
    this.$themeBase = this.document.getElementById('theme-base');
    this.$themeVariant = this.document.getElementById('theme-variant');
    this.$styleOptions = this.document.getElementById('style-options');
    this.$userStyles = this.document.getElementById('user-styles');

    this.cursor = null;

    this.$viewScopeBtn = this.document.getElementById('view-scope-btn');

    // zoom buttons
    this.$zoomOutBtn = this.document.getElementById('zoom-out-btn');
    this.$zoomInBtn = this.document.getElementById('zoom-in-btn');
    // number of steps per "octave"
    this.zoomSteps = 12;
    this.zoomMax = 3;
    this.zoomMin = 1 / this.zoomMax;

    // shows info about most recent event
    //this.$statusBar = this.document.getElementById('status-bar');
    this.$statusText = this.document.getElementById('status-text');
    this.$detailsBox = this.document.getElementById('details-box');
    this.$detailsBtn = this.document.getElementById('details-btn');
    // TODO: this should load from config
    this.detailsState = 1;  // 0=off, 1=notes, 2=details
    // open a tree view in a new tab
    this.$treeViewInTabBtn = this.document.getElementById('tree-view-in-tab-btn');
    // click to save a session backup
    this.$backupBtn = this.document.getElementById('backup-btn');
    // open the extension's options page
    this.$optionsBtn = this.document.getElementById('options-btn');
    // help the project survive, and help me pay rent
    this.$donateBtn = this.document.getElementById('donate-btn');
    // open the extension's help page
    this.$helpBtn = this.document.getElementById('help-btn');

    // count of marked nodes when non-zero
    this.$markedCount = this.document.getElementById('marked-count');

    // node row hover menu
    this.$hoverMenu = this.document.getElementById('hover-menu');

  }

  async init () {
    super.init();
    // misc handlers
    this.initBodyHandlers();
    this.initKeyHandler();
    this.initMouseHandler();
    this.initButtonHandlers();
    await this.loadConfig();
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
    let defaultViewScope = 'window';
    // 1st window defaults to Session mode, others use Window mode
    if (this.windowNode.parent.isRoot() && (0 === this.windowNode.indexOf()))
    { defaultViewScope = 'session'; }
    this.viewScope = await this.getWindowConfig('viewScope', defaultViewScope);
    if (! this.viewScope) this.viewScope = defaultViewScope;

    this.$renderViewScopeBtn();

    this.zoomLevel = 1.0;
    this.setZoomLevel();

    this.$renderWholeTree();

    // apply the user's detail box setting
    this.$renderDetailsBtn();

    // build the hover menu
    this.$renderHoverMenu();

    // ensure the cursor is somewhere sane when sidepanel opens
    this.ensureCursorVisible();
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
      this.setCursor(newCursor, true);
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

  async loadConfig () {
    this.cursorFollowsActiveTab = await this.getConfig(
      'cursorFollowsActiveTab', true);
  }

  initStorageObserver () {
    api.storage.onChanged.addListener( this.storageObserver.bind(this) );
  }

  async storageObserver (changes) {
    debug(`TreeView.storageObserver()`, changes);
    if (changes.expandedRowPrefix) {
      this.updateStyleOptions();
    }
    if (changes.theme) {
      this.updateTheme();
    }
    if (changes.cursorFollowsActiveTab) {
      this.cursorFollowsActiveTab = changes.cursorFollowsActiveTab.newValue;
    }
    if (changes.treeViewZoomLevel) {
      this.setZoomLevel();
    }
  }

  async getConfig (varName, defaultValue) {
    const key = varName;
    const result = await api.storage.local.get(key);
    if (undefined !== result[key]) return result[key];
    return defaultValue;
  }

  setConfig (varName, value) {
    const vars = {};
    vars[varName] = value;
    return api.storage.local.set(vars);
  }

  getWindowConfig (varName, defaultValue) {
    // can't do anything unless we know which window we are
    if (! this.windowNode) return;
    // load from config, per window
    return this.getConfig(
      `TreeView.${varName}.${this.windowNode.id}`,
      defaultValue);
  }

  setWindowConfig (varName, value) {
    // can't do anything unless we know which window we are
    if (! this.windowNode) return;
    // save to config, per window
    return this.setConfig(
      `TreeView.${varName}.${this.windowNode.id}`,
      value);
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

  onMarkedCountHover () {
    this.hideHoverMenu();
  }

  onMarkedCountClick (event) {
    this.action_pasteMarked(event);
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
    this.$treeRoot.addEventListener('dragstart',
      (event) => { this.mouseEvent('DragStart', event) });
    this.$treeRoot.addEventListener('drag',
      (event) => { this.mouseEvent('Drag', event) });
    this.$treeRoot.addEventListener('drop',
      (event) => { this.mouseEvent('Drop', event) });
    this.$treeRoot.addEventListener('dragend',
      (event) => { this.mouseEvent('DragEnd', event) });
    this.$treeRoot.addEventListener('dragleave',
      (event) => { this.mouseEvent('DragLeave', event) });
    this.$treeRoot.addEventListener('dragover',
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
    // calculate a more complete name for this event,
    // then call the keyboard event dispatcher
    const keyName = buildEventName(event);
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
    // ensure nothing gets focused / highlighted
    this.document.activeElement.blur();
    // assign an event name based on modifier keys, event type, mouse button
    const eventName = buildEventName(event, eventType);
    //this.setStatus(`mouse: ${eventName}`);
    // identify which row the event was in, if any
    let node;  // which Tree Node object was clicked?
    let $target = event.target;
    let $node;  // Node's ul.node element
    let $row;  // Node's div.row element
    let $elem;  // most specific element we care about
    //debug(`mouseEvent(${eventType}):`, $target);
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
    //debug(`${eventName} ${node.id} `, node, this.$mouseRow);
    //debug(`node: ${node.id}: ${node.toLine()}`, node);
    // identify which part of the row the event was in
    let rowX, rowY, rowWid, rowHgt;
    if ($row) {
      //debug(`clientXY(${event.clientX},${event.clientY}), rowOffset(${$row.offsetLeft},${$row.offsetTop})`);
      rowX = event.clientX - ($row.offsetLeft * this.zoomLevel);
      rowY = event.clientY - ($row.offsetTop * this.zoomLevel);
      rowWid = $row.clientWidth * this.zoomLevel;
      rowHgt = $row.clientHeight * this.zoomLevel;
    }
    this.$mouseRowX = rowX;
    this.$mouseRowY = rowY;
    this.$mouseRowWid = rowWid;
    this.$mouseRowHgt = rowHgt;
    //debug(`mouseEvent(): rowXY(${rowX},${rowY}) rowWidHgt(${rowWid}x${rowHgt})`);

    // call a handler
    const handlerName = this.mouseBindings[eventName];
    if (handlerName) {
      const handler = this[`action_${handlerName}`];
      if (handler) {
        if (! ['mouseHoverMenu', 'rejectEvent'].includes(handlerName))
          this.setStatus(`mouse: ${handlerName}`);
        // equivalent to this.handler(event);
        await handler.bind(this)(event);
      }
    }
  }

  mouseLeave (event) {
    this.hideHoverMenu();
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

  async action_cursorRight (event) {
    // expand current node and move cursor to 1st child
    // default
    if (! this.cursor) return this.setCursor(this.root);

    // if no kids, do nothing
    if (this.cursor.isLeaf()) return;

    // don't go into sub-windows in Window view mode
    if (('window' === this.viewScope)
      && (this.cursor !== this.viewRoot)
      && (this.cursor.isWindow())) return;

    // expand if necessary
    if (! this.cursor.isExpanded()) {
      await this.cursor.setExpanded(true, { reason: 'userAction' });
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
    await this.cursorNodeMoveTo(destParent, destIndex, 'up');
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

    // move it
    const moved = await this.cursorNodeMoveTo(destParent, destIndex, 'right');
    if (moved) this.setCursor(newCursor);
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

    // add a new Node
    let nodeType = '';
    if (result.isWindow) nodeType = 'window';
    const newNode = await destParent.addChild(destIndex,
      { label: result.label, note: result.note, type: nodeType,
        render: true },
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

    // move keyboard cursor if this was a mouse click
    if (cursor !== this.cursor) await this.setCursor(cursor);

    // delete depending on the node type and state
    const toDelete = cursor;
    const line = cursor.toLine();
    // if leaf, just delete it... simple
    if (cursor.isLeaf()) {
      //debug('delete leaf node');
      toDelete.deleteSelf({ reason: 'userAction' });
      this.setStatus(`deleted ${line}`);
    }
    // don't delete an open window; unload it instead
    else if (cursor.isWindow() && cursor.isLoaded()) {
      return await this.action_unloadNode(event);
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
  }

  action_unloadNode (event) {
    debug('action_unloadNode');
    // choose mouse or keyboard cursor based on event type
    let cursor = this.whichCursor(event);
    // abort if nothing to unload
    if (! cursor) return;
    //if (! cursor.isLoaded()) return;

    cursor.unload({ reason: 'userAction' });
    this.setStatus(`unloaded ${cursor.toLine()}`);
  }

  action_loadNode (event) {
    debug('action_loadNode');
    return this.action_loadOrEditNode(event, false);
  }

  action_loadOrEditNode (event, allowEdit = true) {
    debug('action_loadOrEditNode');
    if ('command' !== event.type) {
      event.preventDefault();
      event.stopPropagation();
    }
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
      if (allowEdit) this.action_editNode(event);
    }
  }

  action_toggleExpanded (event) {
    debug('action_toggleExpanded()');
    // skip no-op cases
    if (! this.cursor) return;
    // don't act on sub-windows in Window view mode
    if (('window' === this.viewScope)
      && (this.cursor.isWindow())
      && (this.cursor !== this.viewRoot)) return;
    // otherwise, twiddle the state
    const toggled = ! this.cursor.expanded;
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
      || ((undefined !== result.url) && (cursor.url !== result.url));
    const hasLoadedTabs = cursor.isLoaded() || cursor.hasLoadedTabs();

    // attempt to change loaded window's incognito status
    // (should never happen)
    if (hasLoadedTabs && incognitoChanged) {
      this.setStatus("editNode: Can't change incognito on loaded window");
      return false;
    }
    // loaded window status changed
    // TODO: offload to other function
    // TODO: must send bkgd a signal to handle it,
    //       because it'll require opening or closing windows
    else if (hasLoadedTabs && isWindowChanged) {
      error('editNode(): Edit type not yet implemented.', cursor, result);
      this.setStatus('editNode: Edit type not yet implemented');
      return false;

      //debug('editNode(): convert window');
      //const changes = { label: result.label, note: result.note };
      //if (! cursor.isLoaded()) changes.incognito = result.incognito;
      //if (cursor.isWindow() !== result.isWindow) {
      //  changes.type = result.isWindow ? 'window' : '';
      //  if (! result.isWindow) changes.wasLoaded = false;
      //}
      //await cursor.setTabFields(changes, { reason: 'userAction' });
      //this.setStatus(`Edited ${cursor.toLine()}`);
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

    // unloaded tab can edit title+url too
    if (pageDataChanged && cursor.isUnloadedTab()) {
      const changed = await cursor.setTabFields(
        { label: result.label, note: result.note,
          url: result.url, title: result.title },
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
    // place the cursor
    await this.setCursor(this.mouseNode);
    // maybe modify a checkbox
    if (this.$mouseElem.classList.contains('node-checkbox')) {
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
      debug(`mouseRowX (${this.$mouseRowX}), leftWidth (${leftWidth})`);
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
    this.mouseDragStartNode = this.mouseNode;
    // attach a text representation in case the user drops into a text field
    const plainText = this.mouseDragStartNode.asTextBranch();
    event.dataTransfer.setData('text', plainText);
    // change how the node looks
    this.mouseDragStartNode.$.classList.add('dragging');
    // default drag image obscures drop target, so make a smaller one
    let dragImage = this.document.getElementById('drag-arrow');
    event.dataTransfer.setDragImage(dragImage, 0, 12);
  }

  action_mouseDrag (event) {
  }

  getMouseDragTarget (event) {
    const result = {};
    // drop target
    let sourceNode = this.mouseDragStartNode;
    let targetNode = this.mouseNode;
    // abort on no-op
    if (! targetNode) return result;
    // don't move a parent into its own child list
    if (sourceNode && targetNode.isChildOf(sourceNode)) return result;
    // where did the data come from?
    if (this.mouseDragStartNode) result.source = 'internal';
    else result.source = 'external';
    // source and target confirmed
    result.sourceNode = sourceNode;
    result.targetNode = targetNode;
    // external drops are complicated
    if ('external' === result.source) {
      const types = event.dataTransfer.types;
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
    // figure out where to drop it
    const drop = this.getMouseDragTarget(event);
    // abort on no-op
    if (! drop.targetNode) return;
    // remove styles of previous drop target
    this.clearDropTargetNodeStyles();
    // save new drop target
    this.dropTargetNode = drop.targetNode;
    // set styles on new drop target
    let elem = ('drop-target-left' === drop.targetClass)
      ? drop.targetNode.$ : drop.targetNode.$row;
    elem.classList.add(drop.targetClass);
    if ('external' === drop.source)
      elem.classList.add(`drop-external-${drop.type}`);
  }

  async action_mouseDrop (event) {
    event.preventDefault();
    // figure out where to drop it
    const drop = this.getMouseDragTarget(event);
    // abort on no-op
    if (! drop.targetNode) return;
    if (drop.targetNode === drop.sourceNode) return;
    // internal source: move the node
    if ('internal' === drop.source) {
      const moved = await drop.sourceNode.moveTo(
        drop.destParent, drop.destIndex,
        { reason: 'userAction' });
      if (moved) this.setStatus(`moved node: ${drop.sourceNode.toLine()}`);
      else this.setStatus(`move failed: ${drop.sourceNode.toLine()}`);
    }
    // external source: try to attach external data
    else {
      debug('action_mouseDrop', event, event.dataTransfer.types);
      // add links as new link nodes
      if ('url' === drop.type) {
        let newNode = await drop.destParent.addChild(drop.destIndex,
          { url: drop.url, title: drop.title, render: true },
          { reason: 'userAction' });
        this.setStatus(`Added node: ${newNode.toLine()}`);
      }
      // plain text note
      else if ('text' === drop.type) {
        let attached = false;
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
          this.setStatus(`Added node: ${newNode.toLine()}`);
          attached = true;
        }
        // single line: use as label, if label is empty
        if (! drop.text.includes('\n') && (! attached)) {
          if (! drop.targetNode.label) {
            await drop.targetNode.setNotes(
              drop.text, drop.targetNode.note,
              { reason: 'userAction' });
            this.setStatus(`Added label to ${drop.targetNode.toLine()}`);
            attached = true;
          }
        }
        // multiple lines or fall-through: add to note
        if (! attached) {
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
          this.setStatus(`Added note to ${drop.targetNode.toLine()}`);
        }
      }
    }
    // clean up, just in case
    // (because 'dragend' event doesn't trigger sometimes)
    this.action_mouseDragEnd(event);
  }

  action_mouseDragEnd (event) {
    // abort on no-op
    //if (! this.mouseDragStartNode) return;
    // fix how the node looks
    if (this.mouseDragStartNode)
      this.mouseDragStartNode.$.classList.remove('dragging');
    // clear data
    this.mouseDragStartNode = undefined;
    this.clearDropTargetNodeStyles();
  }

  action_mouseDragLeave (event) {
    this.clearDropTargetNodeStyles();
  }

  $renderHoverMenu () {
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
    // skip extra drawing if the menu hasn't changed
    if (this.hoverMenuLast === this.mouseNode) return;
    this.hoverMenuLast = this.mouseNode;
    // adjust menu position
    const rect = this.$mouseRow.getBoundingClientRect();
    let hTop = (rect.top + window.scrollY - (3 * this.zoomLevel))
      / this.zoomLevel;
    this.$hoverMenu.style.top = String(hTop) + 'px';
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
    // show or hide the 'task' button
    if ((! this.mouseNode.hasCheckbox()) && (! this.mouseNode.isRoot()))
      this.$hoverMenuTask.style.display = 'inline-block';
    else this.$hoverMenuTask.style.display = 'none';
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

  setCursor (node, instant=false) {
    //debug(`TreeView.setCursor(): ${node.toLine()}`);
    // ensure cursor is on a visible node in our view scope
    const viewRoot = this.viewRoot;
    if ((! node.isInViewScope()) || (! node.isVisible(viewRoot))) {
      // if node is visible, put cursor on it
      // if node exists but is hidden, put cursor on visible parent
      // otherwise put cursor on window node
      let visibleNode = node ? node : viewRoot;
      if ((visibleNode !== viewRoot) && (! visibleNode.isVisible(viewRoot)))
        visibleNode = visibleNode.prevVisibleNode(viewRoot);
      node = visibleNode;
      //debug(`TreeView.setCursor(-->): ${node.toLine()}`);
    }

    // update the cursor position
    if (this.cursor && (node !== this.cursor)) this.cursor.removeCursor();
    if (node        && (node !== this.cursor)) node.addCursor();
    this.cursor = node;

    // details box
    if (node) {
      // show and update node detail box
      this.updateDetailsBox();
      // ensure node is visible
      node.scrollIntoView(instant);
    }
    else {
      this.hideDetailsBox();
    }
  }

  async ensureCursorVisible () {
    const viewRoot = this.viewRoot;
    //debug(`TreeView.ensureCursorVisible(cursor):`, this.cursor);
    //debug(`TreeView.ensureCursorVisible(viewRoot):`, viewRoot);

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
    // show the active tab and put the cursor on it
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
      if ((visibleNode !== viewRoot) && (! visibleNode.isVisible(viewRoot)))
        visibleNode = visibleNode.prevVisibleNode(viewRoot);
      debug(`TreeView.ensureCursorVisible(visibleNode)`, visibleNode);
      return this.setCursor(visibleNode);
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
    this.$.scrollTop = scrollBefore;
  }

  hideDetailsBox () {
    this.$detailsBox.classList.add('hidden');
  }

  initBkgdPort () {
    this.port = api.runtime.connect();
    this.port.onDisconnect.addListener(async () => {
      debug("TreeView.port disconnected, reconnecting...");
      await new Promise(r => setTimeout(r, 100));
      this.initBkgdPort();
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
    // open a tree view in a new tab
    this.$treeViewInTabBtn.addEventListener('click', () => {
      this.onTreeViewInTabBtnClick();
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
  }

  $renderViewScopeBtn () {
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

  async openLinkInNewTab (url, internal=true) {
    const createProperties = {};
    if (internal)
      createProperties.url = api.runtime.getURL(url);
    else
      createProperties.url = url;
    const [tab] = await api.tabs.query(
      { active: true, windowId: this.windowId });
    debug(`openLinkInNewTab() parent tab:`, tab);
    createProperties.openerTabId = tab.id;
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
    let newzoom = this.zoomLevel;
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
    this.setZoomLevel(newzoom);
  }

  async setZoomLevel (zoomLevel) {
    // per window
    //const savedZoomLevel = await this.getWindowConfig('zoomLevel', 1.0);
    // global
    const savedZoomLevel = await this.getConfig('treeViewZoomLevel', 1.0);
    //debug(`setZoomLevel(${zoomLevel}, ${savedZoomLevel})`);
    if (! zoomLevel) {
      zoomLevel = savedZoomLevel;
    }
    zoomLevel = Math.min(Math.max(zoomLevel, this.zoomMin), this.zoomMax);

    // update the view
    this.document.documentElement.style.setProperty('--zoom-level', zoomLevel);
    this.zoomLevel = zoomLevel;

    // persist preference
    if (zoomLevel !== savedZoomLevel) {
      // per window
      //await this.setWindowConfig('zoomLevel', zoomLevel);
      // global
      await this.setConfig('treeViewZoomLevel', zoomLevel);
      this.setStatus(`Zoom: ${(100 * this.zoomLevel).toFixed(2)}%`);
    }

    // grey out or activate zoom buttons if maxed out
    const grey = 'greyed-out';
    if (zoomLevel >= this.zoomMax) this.$zoomInBtn.classList.add(grey);
    else this.$zoomInBtn.classList.remove(grey);
    if (zoomLevel <= this.zoomMin) this.$zoomOutBtn.classList.add(grey);
    else this.$zoomOutBtn.classList.remove(grey);
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
        await handler.bind(this)({ type: 'command' });
      }
      finally { unlock(); }
      return;
    }
  }

}

