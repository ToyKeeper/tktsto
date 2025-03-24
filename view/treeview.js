// view/treeview.js: TreeView class
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: GPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import { log } from '/common/common.js';
import { NodeView } from './nodeview.js';


//export class TreeView extends Tree {
export class TreeView extends NodeView {

  constructor () {
    super(null, null, window);

    this.tree = this;

    // TODO: determine whether full view or single-window

    this.document = document;
    this.window = window;
    this.$ = this.document.getElementById('tree-view');
    this.$nodes = this.document.createElement('ul');
    this.$nodes.classList.add('root-nodes');
    this.$.append(this.$nodes);

    this.cursor = null;
    // shows info about most recent event
    //this.$statusBar = this.document.getElementById('status-bar');
    this.$statusText = this.document.getElementById('status-text');
    // table mapping keys to actions
    // TODO: let user bind keys
    this.keyBindngs = {
      'a': 'addNode',
      'd': 'deleteNode',
      'ArrowUp': 'cursorUp',
      'ArrowDown': 'cursorDown',
      'Tab': 'none',  // suppress default Tab handling
      'none': 'none'
    };
  }

  destroy () {
  }

  init () {
    this.initKeyHandler();
    this.initBkgdPing();
    // TODO: load the nodes from storage and render them
  }

  async newNodeID () {
    const nextID = await api.runtime.sendMessage({msg: 'bkgd_newNodeID'});
    return nextID;
  }

  setStatus (msg) {
    this.$statusText.textContent = msg;
  }

  initKeyHandler () {
    // must wrap it in an anon function to fix scoping issues
    // (calling this.keyHandler unwrapped runs in HtmllDocument scope
    //  instead of Tree scope)
    this.document.addEventListener('keydown',
      (event) => { this.keyHandler(event) }
    );
  }

  keyHandler (event) {
    // calculate a more complete name for this event,
    // then call the keyboard event dispatcher
    const shift = (event.shiftKey && (event.key != 'Shift')) ? 'Shift+' : '';
    const ctrl = (event.ctrlKey && (event.key != 'Control')) ? 'Ctrl+' : '';
    const alt = (event.altKey && (event.key != 'Alt')) ? 'Alt+' : '';
    const meta = (event.metaKey && (event.key != 'Meta')) ? 'Meta+' : '';
    let eventKey = event.key;
    if (eventKey === ' ') eventKey = 'Space';
    const keyName = `${shift}${ctrl}${alt}${meta}${eventKey}`;
    this.setStatus(`keydown: ${keyName}`);
    event.processedName = keyName;
    return this.dispatchInputEvent(event);
  }

  dispatchInputEvent (event) {
    // look up the event name to see if it's mapped to an action
    // ... then call that action
    const handlerName = this.keyBindngs[event.processedName];
    if (handlerName) {
      // bindable actions detectable by naming convention
      const handler = this[`action_${handlerName}`];
      if (handler) {
        // actually handle the event
        this.setStatus(`handler: ${handlerName}`);
        handler.bind(this)(event);  // equivalent to this.handler(event);
        // unsure if necessary
        event.preventDefault();
        event.stopPropagation();
      }
      else {
        this.setStatus(`handler not found: ${handlerName}`);
      }
    }
  }

  action_none(event) { }

  action_cursorUp(event) {
    if (! this.cursor) {
      if (this.nodes) {
        this.setCursor(this.nodes[0]);
      }
      return;
    }
    let index = this.cursor.indexOf() - 1;
    if (index >= 0) {
        this.setCursor(this.nodes[index]);
    }
  }

  action_cursorDown(event) {
    if (! this.cursor) {
      if (this.nodes) {
        this.setCursor(this.nodes[0]);
      }
      return;
    }
    let index = this.cursor.indexOf() + 1;
    if (index < this.nodes.length) {
        this.setCursor(this.nodes[index]);
    }
  }

  async action_addNode (event) {
    // create the new node
    const node = new NodeView(this, this, this.window);
    const newID = await this.newNodeID();
    node.id = newID;
    // figure out where to put it in the tree
    let newIndex = 0;
    if (this.cursor) {
      newIndex = this.cursor.indexOf() + 1;
    }
    const lengthBefore = this.nodes.length;
    this.nodes.splice(newIndex, 0, node);
    // assign a title
    node.note = `node ${newID}`;
    node.$render();
    // attach new node in the correct location
    if (this.expanded) {
      this.$nodes.classList.remove('hidden');
      if ((lengthBefore === 0) || (newIndex >= lengthBefore)) {
        this.$nodes.appendChild(node.$);
      } else {
        this.$nodes.insertBefore(node.$, this.nodes[newIndex+1].$);
      }
    }
    log(`added ${node.note}`);
    this.setCursor(node);
  }

  // TODO
  action_addChild (event) {
  }

  action_deleteNode(event) {
    log('deleteNode');
    if (this.nodes.length <= 0) return;
    let delIndex = 0;
    if (this.cursor) {
      delIndex = this.cursor.indexOf();
    }
    //const node = this.nodes.splice(this.nodes.length - 1, 1);
    const node = this.nodes.splice(delIndex, 1);
    if (node) {
      node[0].del();
    }
    if (! this.nodes) this.setCursor(null);
    else {
      let newCursor = this.nodes[
          Math.max(0, Math.min(this.nodes.length - 1, delIndex))
      ];
      this.setCursor(newCursor);
    }
  }

  setCursor(node) {
    if (this.cursor && (node !== this.cursor)) {
      this.cursor.removeCursor();
    }
    if (node) node.addCursor();
    this.cursor = node;
    if (node) node.scrollIntoView();
  }

  initBkgdPing () {
    this.bkgdPing = setInterval(this.pingBkgd, 10 * 1000);
  }

  async pingBkgd () {
    // keep service worker alive
    // so it won't have to keep reloading the tree from persistent storage
    const before = Date.now();
    const response = await api.runtime.sendMessage({ 'msg': 'bkgd_ping' });
    const after = Date.now();
    if (! response) { return warn('bkgd ping failed'); }
    const elapsed = after - before;
    const oneway = response - before;
    log(`view => bkgd ping: 0 -> ${oneway} ms -> ${elapsed} ms`);
  }

}

