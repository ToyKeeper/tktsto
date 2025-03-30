// view/treeview.js: TreeView class
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: GPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import { log } from '/common/common.js';
import { inputDialog } from '/common/dialog.js';
import { NodeView } from './nodeview.js';
// import { Tree } from '/common/tree.js';


//export class TreeView extends NodeView {
//export class TreeView extends Tree {
export class TreeView {

  constructor () {
    //super(null, null, window);

    // TODO: determine whether full view or single-window

    this.document = document;
    this.window = window;
    this.root = new NodeView(this, null, this.window);
    this.root.parent = this.root;
    this.root.id = 'root';
    this.root.note = 'root';

    this.$ = this.document.getElementById('tree-view');
    this.$ul = this.document.getElementById('tree-root');
    //this.root.$ = this.$;
    this.root.$render();
    this.root.$.classList.add('root-nodes');
    //this.root.$nodes.classList.remove('hidden');
    this.$ul.appendChild(this.root.$);
    //this.$.appendChild(this.root.$row);
    //this.$.appendChild(this.root.$nodes);
    //this.$root = this.document.createElement('ul');
    //this.$root.classList.add('root-nodes');
    //this.$.append(this.$root);

    this.cursor = null;
    // shows info about most recent event
    //this.$statusBar = this.document.getElementById('status-bar');
    this.$statusText = this.document.getElementById('status-text');
    // table mapping keys to actions
    // TODO: let user bind keys
    this.keyBindngs = {
      // test
      //'a': 'addNode',
      // add / remove nodes
      'd': 'deleteNode',
      'o': 'addNoteAsNextVisibleRow',
      // cursor movement
      'ArrowUp': 'cursorUp',
      'ArrowDown': 'cursorDown',
      'ArrowLeft': 'cursorLeft',
      'ArrowRight': 'cursorRight',
      'Home': 'cursorHome',
      'End': 'cursorEnd',
      // move current node
      'Shift+ArrowLeft': 'moveNodeLeft',
      'Shift+ArrowRight': 'moveNodeRight',
      // misc
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

  action_none (event) { }

  action_cursorUp (event) {
    if (! this.cursor) return this.setCursor(this.root);
    // move up one row
    this.setCursor(this.cursor.prevVisibleNode());
  }

  action_cursorDown (event) {
    if (! this.cursor) return this.setCursor(this.root);
    // move down one row
    this.setCursor(this.cursor.nextVisibleNode());
  }

  action_cursorLeft (event) {  // move cursor to parent
    if (! this.cursor) return this.setCursor(this.root);
    // ignore if root
    if (this.cursor.isRoot()) return;
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
      this.cursor.expanded = true;
      // TODO: draw freshly-expanded nodes
    }

    // move to 1st child
    this.setCursor(this.cursor.nodes[0]);
  }

  action_cursorHome (event) {
    if (! this.cursor) return this.setCursor(this.root);
    // move to first sibling
    this.setCursor(this.cursor.firstSibling());
  }

  action_cursorEnd (event) {
    if (! this.cursor) return this.setCursor(this.root);
    // move to last sibling
    this.setCursor(this.cursor.lastSibling());
  }

  action_cursorPgUp (event) {
  }

  action_cursorPgDown (event) {
  }

  action_moveNodeUp (event) {
  }

  action_moveNodeDown (event) {
  }

  action_moveNodeRight (event) {
    // skip no-op cases
    if (! this.cursor) return;
    if (this.cursor.isRoot()) return;
    // if already first child, do nothing
    if (0 === this.cursor.indexOf()) return;

    // TODO: move this logic to Node class
    // if prev sibling expanded,
    // make this node the last child of previous sibling
    const prevSibling = this.cursor.parent.nodes[this.cursor.indexOf() - 1];
    if (prevSibling.isExpanded()) {
      //this.cursor.moveTo(prevSibling, prevSibling.nodes.length);
    }
    // elif prev sibling collapsed,
    // make this node the *first* child of previous sibling
    // TODO: destination should be configurable
    else  {
      // TODO: where should cursor move to?
      //       new parent, or next row (stay in same place onscreen)?
      //const newCursor = this.cursor.prevVisibleNode();
      //const newCursor = this.cursor.nextVisibleNode();
      //this.cursor.moveTo(prevSibling, 0);
      //this.setCursor(newCursor);
    }
  }

  action_moveNodeLeft (event) {
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
    let destParent = this.root;
    let destIndex = 0;
    if (this.cursor) {
      // if leaf node: add as next sibling
      if (0 === this.cursor.nodes.length) {
        log('add to leaf');
        // FIXME:
        destParent = this.cursor.parent;
        destIndex = this.cursor.indexOf() + 1;
        //destParent = this.cursor;
        //destIndex = 0;
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
        destParent.nodes[destIndex+1].$);
    }
    log(`added ${newNode.note}`);
    this.setCursor(newNode);
  }

  //async action_addNode (event) {
  //  // create the new node
  //  const node = new NodeView(this, this, this.window);
  //  const newID = await this.root.newNodeID();
  //  node.id = newID;
  //  // figure out where to put it in the tree
  //  let newIndex = 0;
  //  if (this.cursor) {
  //    newIndex = this.cursor.indexOf() + 1;
  //  }
  //  const lengthBefore = this.root.nodes.length;
  //  this.root.nodes.splice(newIndex, 0, node);
  //  // assign a title
  //  node.note = `node ${newID}`;
  //  node.$render();
  //  // attach new node in the correct location
  //  if (this.expanded) {
  //    this.$root.classList.remove('hidden');
  //    this.root.$nodes.classList.remove('hidden');
  //    if ((lengthBefore === 0) || (newIndex >= lengthBefore)) {
  //      this.root.$nodes.appendChild(node.$);
  //    } else {
  //      this.root.$nodes.insertBefore(node.$, this.root.nodes[newIndex+1].$);
  //    }
  //  }
  //  log(`added ${node.note}`);
  //  this.setCursor(node);
  //}

  // TODO
  action_addChild (event) {
  }

  action_deleteNode(event) {
    log('deleteNode');
    // abort if nothing to delete
    if (this.root.nodes.length <= 0) return;
    if (! this.cursor) return;
    // never delete root
    if (this.cursor.isRoot()) return;

    // figure out where to put the cursor after deletion
    // move to next row when possible
    let newCursor = this.cursor.nextVisibleNode();
    // move to prev row if cursor is already on the last row
    if (newCursor === this.cursor) newCursor = this.cursor.prevVisibleNode();

    // remove this node
    const toDelete = this.cursor;
    toDelete.$destroy();
    toDelete.deleteSelf();

    // update the cursor
    this.setCursor(newCursor);
  }

  setCursor(node) {
    if (this.cursor && (node !== this.cursor)) this.cursor.removeCursor();
    if (node        && (node !== this.cursor)) node.addCursor();
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

