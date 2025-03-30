// view/nodeview.js: NodeView class
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: GPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import { log } from '/common/common.js';
import { Node } from '/common/node.js';


export class NodeView extends Node {

  // TODO: maybe rename 'window' to avoid conflict with global?
  constructor (tree, parent, window) {
    super(tree, parent);

    // FIXME: should be a window Node, not browser window?
    this.window = window;
    if (undefined === window) { }  // TODO
    // DOM objects
    this.$ = null;  // outermost element is a <li>
    this.$row = null;  // <div> for note, title+url, favicon, etc
    this.$nodes = null;  // <ul>
  }

  async newNodeID () {
    //super.newNodeID();  // unnecessary?
    const nextID = await api.runtime.sendMessage({msg: 'bkgd_newNodeID'});
    return nextID;
  }

  async addChild (...args) {
    const newNode = super.addChild(...args);
    newNode.window = this.window;
    if (! args.id) { newNode.id = await this.newNodeID(); }
    return newNode;
  }

  $render () {
    log('Node.$render');
    if (!this.tree.document) return;
    const doc = this.tree.document;

    log('Node.$render $');
    // create outermost node element
    if (! this.$) this.$ = doc.createElement('li');
    this.$.id = `node${this.id}`;
    this.$.classList.add('node');
    if (this.nodes && this.expanded) {
      this.$.classList.add('expanded');
      this.$.classList.remove('collapsed', 'leaf');
    }
    else if (this.nodes && (!this.expanded)) {
      this.$.classList.add('collapsed');
      this.$.classList.remove('expanded', 'leaf');
    }
    else {
      this.$.classList.add('leaf');
      this.$.classList.remove('expanded', 'collapsed');
    }

    log('Node.$render $row');
    // container for node title and details
    if (!this.Row) this.$row = doc.createElement('div');
    this.$row.classList.add('row');
    // TODO: separate function to render the Node $row
    //this.$row.innerHTML = `<span class="node-note">${this.note}</span> ~ <a class="node-link" href="${this.url}">${this.title}</a>`;
    this.$renderTitle();
    if (! this.$.contains(this.$row)) this.$.append(this.$row);

    // container for node children
    log('Node.$render $nodes');
    if (! this.$nodes) this.$nodes = doc.createElement('ul');
    if (! this.$.contains(this.$nodes)) this.$.append(this.$nodes);
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

  $renderTitle() {
    // is the link loaded in a tab?
    if (this.loaded) this.$row.classList.add('loaded');
    else this.$row.classList.remove('loaded');
    // is the page the window's current active tab?
    if (this.active) this.$row.classList.add('active');
    else this.$row.classList.remove('active');
    // title row text
    // full row: [3/14] @ Note Text ~ <a href="link">Link Title</a>
    // ... where "[3/14]" is num children open/total, and "@" is a favicon
    let mainText = '';
    if (this.note) {
      if (this.url) {  // note ~ href
        mainText = `<span class="node-note">${this.note}</span><span class="node-note-url-sep"> ~ </span><a class="node-link" href="${this.url}">${this.title}</a>`;
      }
      else {  // note only
        mainText = `<span class="node-note">${this.note}</span>`;
      }
    }
    else if (this.url) {  // href only
        mainText = `<a class="node-link" href="${this.url}">${this.title}</a>`;
    }
    else {  // totally blank
      mainText = `<span class="node-notitle">node ${this.id}</span>`;
    }
    // node stats
    let statsText = '';
    if (this.nodes.length > 0) {
      let openChildren = 0;  //  FIXME: count all open descendants
      let totalChildren = this.nodes.length;
      statsText = `<span class="node-stats">[<span class="node-stat-open">${openChildren}</span> / <span class="node-stat-total">${totalChildren}</span>]</span> `;
    }
    // TODO: favicon
    let faviconText = '';
    // combined output
    this.$row.innerHTML = `${statsText}${faviconText}${mainText}`;
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

}  // end class NodeView

