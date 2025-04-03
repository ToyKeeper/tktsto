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

  $render () {
    log('Node.$render');
    if (!this.tree.document) return;
    const doc = this.tree.document;

    log('Node.$render $');
    // create outermost node element
    if (! this.$) this.$ = doc.createElement('li');
    this.$.id = `node${this.id}`;
    this.$.classList.add('node');
    if (this.hasKids() && this.isExpanded()) {
      this.$.classList.add('expanded');
      this.$.classList.remove('collapsed', 'leaf');
    }
    else if (this.hasKids() && this.isCollapsed()) {
      this.$.classList.add('collapsed');
      this.$.classList.remove('expanded', 'leaf');
    }
    else {
      this.$.classList.add('leaf');
      this.$.classList.remove('expanded', 'collapsed');
    }

    log('Node.$render $row');
    // container for node title and details
    if (!this.$row) this.$row = doc.createElement('div');
    this.$renderTitle();
    if (! this.$.contains(this.$row)) this.$.append(this.$row);

    // container for node children
    log('Node.$render $nodes');
    if (! this.$nodes) this.$nodes = doc.createElement('ul');
    if (! this.$.contains(this.$nodes)) this.$.append(this.$nodes);
    this.$nodes.classList.add('nodes');
    if (this.isCollapsed()) {
      this.$nodes.classList.add('hidden');
    } else {
      this.$nodes.classList.remove('hidden');
    }

    // are we marked?
    if (this.marked) {
      this.$.classList.add('marked');
      this.$row.classList.add('marked');
    }
    else {
      this.$.classList.remove('marked');
      this.$row.classList.remove('marked');
    }

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

  $renderTitle () {
    // reset classes
    //this.$row.className = 'row';
    this.$row.classList.add('row');
    // copy classes from outer element
    //this.$row.classList.add(...this.$.classList);
    for (const label of ['leaf', 'expanded', 'collapsed']) {
      if (this.$.classList.contains(label))
        this.$row.classList.add(label);
      else
        this.$row.classList.remove(label);
    }
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
    // FIXME: instead of innerHTML, use safer Element creation and innerText
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
    // TODO: unsure if always include stats or only when collapsed
    //if (this.hasKids() && this.isCollapsed()) {
    if (this.hasKids()) {
      //  count all open descendants
      const openChildren = this.countDescendants(
        function (node) { return node.isLoaded(); }
      );
      const totalChildren = this.countDescendants();
      // only show "open" if non-zero
      if (openChildren > 0)
        statsText = `<span class="node-stats">[<span class="node-stat-open">${openChildren}</span>/<span class="node-stat-total">${totalChildren}</span>]</span> `;
      else
        statsText = `<span class="node-stats">[<span class="node-stat-total">${totalChildren}</span>]</span> `;
    }
    // TODO: favicon
    let faviconText = '';
    // combined output
    this.$row.innerHTML = `${statsText}${faviconText}${mainText}`;
  }

  $refreshAncestry () {
    // update displayed info for this node and all its parents
    this.$render();
    if (! this.isRoot()) this.parent.$refreshAncestry();
  }

  $renderChildren () {
    this.$render();
    if (this.isExpanded()) {
      for (const node of this.nodes) {
        this.$insertChild(node, node.indexOf());
        node.$renderChildren();
      }
    }
  }

  $destroyChildren () {
    this.$nodes.classList.add('hidden');
    for (const node of this.nodes) {
      node.$destroy();
      // TODO: unsure if I need to recurse
    }
  }

  async deleteSelf (...extra) {
    if (this.isRoot()) return;  // never delete root
    const oldParent = this.parent;
    await super.deleteSelf(...extra);
    this.$destroy();  // un-render
    // update parent node stats and decorations
    if (oldParent) oldParent.$refreshAncestry();
  }

  async addChild (index, details, ...extra) {
    //log('NodeView.addChild():', details);
    // index is required; assume 1st child if not given
    if (undefined === index) index = 0;
    // save for later
    const prevNodeAtIndex = this.nodes[index];

    // must allocate ID before creating node and emitting notifications
    if (! details.id) { details.id = await this.newNodeID(); }
    // create new Node object
    const newNode = super.addChild(index, details, ...extra);
    newNode.window = this.window;  // redundant?

    // display it
    if (details.render) {
      //this.expandAndShow();
      this.$nodes.classList.remove('hidden');

      // show it
      newNode.$render();

      // attach new node in the correct location
      if (prevNodeAtIndex) {
        this.$nodes.insertBefore(newNode.$, prevNodeAtIndex.$);
      } else {
        this.$nodes.appendChild(newNode.$);
      }
      // refresh displayed info
      this.$refreshAncestry();
    }

    return newNode;
  }

  $insertChild (node, index) {
    // TODO: update displayed stats?
    // if moving to invisible spot, delete render
    if ((! this.isVisible()) || (this.isCollapsed())) {
      node.$destroy();
      this.$refreshAncestry();
      return;
    }
    // otherwise, render and insert child elements
    node.$render();
    this.$nodes.classList.remove('hidden');
    // attach new node in the correct location
    const prevElementAtIndex = this.$nodes.children[index];
    if (prevElementAtIndex) {
      this.$nodes.insertBefore(node.$, prevElementAtIndex);
    } else {
      this.$nodes.appendChild(node.$);
    }
    // refresh displayed info
    this.$refreshAncestry();
  }

  setNote (text, ...extra) {
    // if no change, do nothing
    if (text === this.note) return;
    // do it
    super.setNote(text, ...extra);
    // show it
    this.$render();
  }

  scrollIntoView () {
    if (this.$row) this.$row.scrollIntoView({
      behavior: "instant",  // smooth or instant
      block: "nearest",  // vertical scroll policy, "nearest" or "center"
      inline: "start"  // horizontal, left
    });
  }

  scrollToTop () {
    if (this.$) this.$.scrollIntoView({
      behavior: "instant",  // smooth or instant
      block: "start",  // vertical scroll policy
      inline: "start"  // horizontal, left
    });
  }

  addCursor () {
    if (! this.$row) return;
    this.$.classList.add('cursor-node');
    this.$row.classList.add('cursor');
  }

  removeCursor () {
    if (! this.$row) return;
    this.$.classList.remove('cursor-node');
    this.$row.classList.remove('cursor');
  }

  moveTo (destParent, destIndex, ...extra) {
    const oldParent = this.parent;
    super.moveTo(destParent, destIndex, ...extra);

    destParent.$insertChild(this, destIndex);
    // refresh old parent if needed
    if (oldParent != destParent) oldParent.$refreshAncestry();

    // update the #marked-count widget
    // (can change when nodes move into / out of marked nodes)
    this.tree.updateMarkedCount();

    // TODO: if has cursor and new position hidden,
    // move cursor to nearest visible parent
    // (when can this actually happen though,
    //  in cases where it isn't already handled?)

    // TODO: move tabs around
    // TODO: handle window changes
    if (this.window !== this.parent.window) {
      // moved to new window
      this.window = this.parent.window;
      if (this.isLoaded()) {
        // TODO: move tab to new window
      }
    }
  }

  setExpanded (expanded, ...extra) {
    const wasExpanded = this.expanded;
    super.setExpanded(expanded, ...extra);

    // if no change, do nothing
    if (wasExpanded === this.expanded) return;

    // if collapsing, delete subtree and show stats
    if (wasExpanded) {
      this.$destroyChildren();
      // TODO: update + show stats
      this.$render();
    }
    // if expanding, create subtree and hide stats
    else {
      this.$renderChildren();
      // TODO: hide stats
      this.$render();
    }
  }

  setMarked (marked, ...extra) {
    // if no change, do nothing
    if (marked === this.marked) return;
    super.setMarked(marked, ...extra);

    this.$render();

    // update the #marked-count widget
    this.tree.updateMarkedCount();
  }

}  // end class NodeView

