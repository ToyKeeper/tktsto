// view/view.js: outline view script
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: GPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import { log } from '/common/common.js';

log('/view/view.js running');

class Tree {

  constructor () {
    this.document = document;
    this.window = window;
    this.$ = this.document.getElementById('tree-view');
    this.$nodes = this.document.createElement('ul');
    this.$nodes.classList.add('root-nodes');
    this.$.append(this.$nodes);
    // root nodes
    this.lastNodeID = 0;
    this.nodes = [];

    this.cursor = null;
    // shows info about most recent event
    this.statusBar = this.document.getElementById('status-bar');
    this.statusText = this.document.getElementById('status-text');
    // table mapping keys to actions
    // TODO: let user bind keys
    this.keyBindngs = {
      'a': 'addNode',
      'd': 'deleteNode',
      'ArrowUp': 'cursorUp',
      'ArrowDown': 'cursorDown',
      'none': 'none'
    };
  }

  destroy () {
  }

  init () {
    this.initKeyHandler();
  }

  setStatus (msg) {
    this.statusText.textContent = msg;
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
    const keyName = `${shift}${ctrl}${alt}${meta}${event.key}`;
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
        handler(this, event);
        // unsure if necessary
        event.preventDefault();
        event.stopPropagation();
      }
      else {
        this.setStatus(`handler not found: ${handlerName}`);
      }
    }
  }

  action_cursorUp(_this, event) {
    if (! _this.cursor) {
      if (_this.nodes) {
        _this.setCursor(_this.nodes[0]);
      }
      return;
    }
    let index = _this.cursor.indexOf() - 1;
    if (index >= 0) {
        _this.setCursor(_this.nodes[index]);
    }
  }

  action_cursorDown(_this, event) {
    if (! _this.cursor) {
      if (_this.nodes) {
        _this.setCursor(_this.nodes[0]);
      }
      return;
    }
    let index = _this.cursor.indexOf() + 1;
    if (index < _this.nodes.length) {
        _this.setCursor(_this.nodes[index]);
    }
  }

  action_addNode (_this, event) {
    // create the new node
    const node = new Node(_this, _this);
    // figure out where to put it in the tree
    let newIndex = 0;
    if (_this.cursor) {
      newIndex = _this.cursor.indexOf() + 1;
    }
    _this.nodes.splice(newIndex, 0, node);
    // assign a title
    const newID = _this.newNodeID();
    node.id = newID;
    node.note = `node ${newID}`;
    node.createDom();
    log(`added ${node.note}`);
    _this.setCursor(node);
  }

  action_deleteNode(_this, event) {
    log('deleteNode');
    if (_this.nodes.length <= 0) return;
    let delIndex = 0;
    if (_this.cursor) {
      delIndex = _this.cursor.indexOf();
    }
    //const node = _this.nodes.splice(_this.nodes.length - 1, 1);
    const node = _this.nodes.splice(delIndex, 1);
    if (node) {
      node[0].del();
    }
    if (! _this.nodes) _this.setCursor(null);
    else {
      let newCursor = _this.nodes[
          Math.max(0, Math.min(_this.nodes.length - 1, delIndex))
      ];
      _this.setCursor(newCursor);
    }
  }

  newNodeID () {
    this.lastNodeID ++;
    return this.lastNodeID;
  }

  setCursor(node) {
    if (this.cursor && (node !== this.cursor)) {
      this.cursor.removeCursor();
    }
    node.addCursor();
    this.cursor = node;
  }

}

class Node {

  constructor (tree, parent) {
    //this.id = get_next_available_node_id();
    // placement
    this.tree = tree;
    this.parent = parent;
    this.window = null;
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
    // DOM objects
    this.$ = null;  // outermost element is a <li>
    this.dom_div = null;  // <div> for note, title+url, favicon, etc
    this.$nodes = null;  // <ul>
  }

  destroy () {
    this.del();
  }

  del () {
    this.deleteDom();
  }

  indexOf () {
    if (!this.parent) return 0;
    if (!this.parent.nodes) return 0;
    return this.parent.nodes.indexOf(this);
  }

  createDom () {
    log('createDom');
    if (!this.tree.document) return;
    const doc = this.tree.document;

    log('createDom li');
    // create outermost node element
    this.$ = doc.createElement('li');
    //this.$.id = `node${this.id}`;
    this.$.classList.add('node');

    log('createDom div');
    // container for node title and details
    this.dom_div = doc.createElement('div');
    this.dom_div.classList.add('node-line');
    this.dom_div.innerHTML = `<span class="node-note">${this.note}</span> ~ <a class="node-link" href="${this.url}">${this.title}</a>`;
    this.$.append(this.dom_div);

    // container for node children
    if (this.expanded) {
      log('createDom ul');
      this.$nodes = doc.createElement('ul');
      this.$nodes.classList.add('subnodes');
    }

    // add to parent
    // FIXME: needs a way to specify where to insert the new node
    if (!this.parent) return;
    if (!this.parent.$nodes) return;
    log('createDom parent');
    this.parent.$nodes.append(this.$);
  }

  deleteDom () {
    log('deleteDom');
    if (this.$) {
      log('remove');
      this.$.remove();
    }
  }

  addCursor() {
    if (! this.dom_div) return;
    this.dom_div.classList.add('cursor');
  }

  removeCursor() {
    if (! this.dom_div) return;
    this.dom_div.classList.remove('cursor');
  }

  // TODO
  setNote (text) {
    this.note = text;
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
  let tree = new Tree();
  tree.init();
});

