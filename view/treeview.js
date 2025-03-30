// view/treeview.js: TreeView class
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: GPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import { log } from '/common/common.js';
import { inputDialog } from '/common/dialog.js';
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
      'o': 'addNoteAsNextVisibleRow',
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

  //addChild (...args) {
  //  return NodeView.addChild(...args);
  //}

  setStatus (msg) {
    this.$statusText.textContent = msg;
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

  keyHandler (event) {
    // don't try to handle key events while a dialog is visible
    if (this.dialogActive) return;
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

  async action_addNoteAsNextVisibleRow (event) {
    // how SHOULD this work?
    // - prompt for note text (manual add-node is always a note, right?)
    //   (node edit thing should let user edit the note, and maybe add a 
    //   checkbox and/or long note?)
    // - on dialog completed, continue with next steps:
    //   (can I use a Promise for that, or do I need a separate handler?)
    // - figure out where to put the new node
    //   (determine parent and index)
    //   - empty tree: 1st child of Tree
    //   - leaf node: add as next sibling
    //     (configurable option to add as 1st child?)
    //   - collapsed branch: add as next sibling
    //   - expanded branch: add as 1st child
    // - use base Node stuff to create a new node at position P with value V
    // - base Node stuff notifies other threads
    // - then render the new node
    // - ... and other threads add the node too,
    //   but with the old ID and no broadcast
    //
    // types of NodeView.addNode events...
    // - add note as next visible row
    // - add note as prev visible row
    // - add note as 1st child when cursor is on a leaf?
    //

    // prompt for new note text
    const result = await this.inputDialog({
      doc: document,
      title: 'Add Note',
      description: 'Enter note text:',
      value: ''
    });
    // abort if user cancelled
    if ((!result) || ('OK' !== result.button)) return;
    const noteText = result.value;

    // figure out where to put the new node (determine parent and index)
    // TODO: move this to its own function
    // default to first child of this TreeView if no cursor (like, empty tree)
    let destParent = this;
    let destIndex = 0;
    if (this.cursor) {
      // if leaf node: add as next sibling
      if (0 === this.cursor.nodes.length) {
        log('add to leaf');
        // FIXME:
        //destParent = this.cursor.parent;
        //destIndex = this.cursor.indexOf() + 1;
        destParent = this.cursor;
        destIndex = 0;
      }
      // expanded branch: add as first child
      else if (this.cursor.expanded) {
        log('add to expanded branch');
        destParent = this.cursor;
        destIndex = 0;
      }
      // collapsed branch: add as next sibling
      else {
        log('add to collapsed branch');
        destParent = this.cursor.parent;
        destIndex = this.cursor.indexOf() + 1;
      }
    }

    const lengthBefore = destParent.nodes.length;

    // add a new Node
    const newNode = await destParent.addChild({index: destIndex, note: noteText});
    log(destParent.nodes);

    // show it
    newNode.$render();

    // attach new node in the correct location
    destParent.$nodes.classList.remove('hidden');
    if ((lengthBefore === 0) || (destIndex >= lengthBefore)) {
      destParent.$nodes.appendChild(newNode.$);
    } else {
      destParent.$nodes.insertBefore(newNode.$,
        destParent.nodes[destIndex].$);
    }
    log(`added ${newNode.note}`);
    this.setCursor(newNode);
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
      node[0].$destroy();
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

