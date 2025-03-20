// view/view.js: outline view script
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: GPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import { log } from '/common/common.js';

log('/view/view.js running');

class Node {

  constructor (tree, parent, window) {
    //this.id = get_next_available_node_id();
    // placement
    this.tree = tree;
    this.parent = parent;
    // attributes
    this.note = null;
    //this.$note = null;  // <span>
    //this.long_note = null;
    this.title = null;
    this.url = null;
    //this.$url = null;  // <a>
    this.favicon_url = null;
    //this.$favicon = null;  // <img>
    //this.checkbox = false;
    this.expanded = true;
    this.loaded = false;
    this.wasLoaded = false;
    // children
    this.nodes = [];
    // is this Node part of a view?
    if (window) {
      this.window = window;
      // DOM objects
      this.$ = null;  // outermost element is a <li>
      this.$row = null;  // <div> for note, title+url, favicon, etc
      this.$nodes = null;  // <ul>
    }
  }

  destroy () {
    this.del();
  }

  del () {
    if (this.window) this.$destroy();
  }

  indexOf () {
    if (!this.parent) return 0;
    if (!this.parent.nodes) return 0;
    return this.parent.nodes.indexOf(this);
  }

  $render () {
    log('Node.$render');
    if (!this.tree.document) return;
    const doc = this.tree.document;

    log('Node.$render $');
    // create outermost node element
    this.$ = doc.createElement('li');
    this.$.id = `node${this.id}`;
    this.$.classList.add('node');

    log('Node.$render $row');
    // container for node title and details
    this.$row = doc.createElement('div');
    this.$row.classList.add('row');
    // TODO: separate function to render the Node $row
    this.$row.innerHTML = `<span class="node-note">${this.note}</span> ~ <a class="node-link" href="${this.url}">${this.title}</a>`;
    this.$.append(this.$row);

    // container for node children
    log('Node.$render $nodes');
    this.$nodes = doc.createElement('ul');
    this.$nodes.classList.add('nodes');
    this.$nodes.classList.add('hidden');

    // add to parent (nope, nevermind, let the parent do that on its own)
    // needs a way to specify where to insert the new node
    //if (!this.parent) return;
    //if (!this.parent.$nodes) return;
    //log('Node.$render parent');
    //this.parent.$nodes.append(this.$);
  }

  $destroy () {
    log('$destroy');
    if (this.$) {
      log('remove');
      this.$.remove();
    }
  }

  scrollIntoView() {
    if (this.$row) this.$row.scrollIntoView({
      behavior: "instant",  // smooth or instant
      block: "nearest",  // vertical scroll policy, "nearest" or "center"
      inline: "start"  // horizontal, left
    });
  }

  scrollToTop() {
    if (this.$) this.$.scrollIntoView({
      behavior: "instant",  // smooth or instant
      block: "start",  // vertical scroll policy
      inline: "start"  // horizontal, left
    });
  }

  addCursor() {
    if (! this.$row) return;
    this.$row.classList.add('cursor');
  }

  removeCursor() {
    if (! this.$row) return;
    this.$row.classList.remove('cursor');
  }

  // TODO
  setNote (text) {
    this.note = text;
  }

}

class Tree extends Node {

  constructor () {
    super(null, null);

    this.tree = this;

    // FIXME: should get new node IDs from TreeStore in bkgd.js
    // This here is just a temporary kludge
    this.lastNodeID = 0;
  }

  newNodeID () {
    this.lastNodeID ++;
    return this.lastNodeID;
  }

}

class TreeView extends Tree {

  constructor () {
    super();

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
    // TODO: scroll cursor into view
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
    // TODO: scroll cursor into view
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

  action_addNode (event) {
    // create the new node
    const node = new Node(this, this, this.window);
    const newID = this.newNodeID();
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

}

/*
document.addEventListener('DOMContentLoaded', () => {
  const treediv = document.getElementById('tree-view');
  const list = document.getElementById('nestedList');
  let currentItem = list.firstChild; // Starting point

  // Helper functions
  const createListItem = (text = 'New Item') => {
    const li = document.createElement('li');
    li.textContent = text;
    return li;
  };

  const highlightItem = (item) => {
    document.querySelectorAll('li').forEach(li => li.style.backgroundColor = '');
    if (item) {
      item.style.backgroundColor = '#d3d3d3'; // Highlight color
    }
  };

  highlightItem(currentItem);

  document.addEventListener('keydown', (event) => {
    switch (event.key) {
      case 'ArrowUp':
        if (currentItem.previousElementSibling) {
          currentItem = currentItem.previousElementSibling;
          highlightItem(currentItem);
        }
        break;
      case 'ArrowDown':
        if (currentItem.nextElementSibling) {
          currentItem = currentItem.nextElementSibling;
          highlightItem(currentItem);
        }
        break;
      case ' ':
        if (currentItem.children.length > 0) {
          currentItem.innerHTML = currentItem.innerHTML.includes('<ul>') ? currentItem.textContent : `${currentItem.textContent}<ul></ul>`;
        } else {
          const childList = document.createElement('ul');
          currentItem.appendChild(childList);
        }
        break;
      case 'a':
        if (currentItem.parentNode) {
          const newSibling = createListItem();
          currentItem.parentNode.insertBefore(newSibling, currentItem.nextSibling);
        }
        break;
      case 'c':
        const childList = currentItem.querySelector('ul') || document.createElement('ul');
        if (!currentItem.contains(childList)) {
          currentItem.appendChild(childList);
        }
        childList.appendChild(createListItem());
        break;
      case 'd':
        if (currentItem.parentNode) {
          const parent = currentItem.parentNode;
          currentItem.remove();
          currentItem = parent.firstChild || null;
          highlightItem(currentItem);
        }
        break;
      case 'Enter':
        const newText = prompt('Edit item text:', currentItem.textContent);
        if (newText !== null) {
          currentItem.textContent = newText;
        }
        break;
    }
  });
});
*/

// init when page is ready
document.addEventListener('DOMContentLoaded', () => {
  let tree = new TreeView();
  tree.init();
});

