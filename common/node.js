// common/node.js: Node class (one unit of a tree)
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: GPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import { log, emit } from '/common/common.js';


export class Node {

  constructor (tree, parent) {
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
    this.faviconUrl = null;
    //this.$favicon = null;  // <img>
    //this.checkbox = false;
    this.expanded = true;
    this.loaded = false;
    this.wasLoaded = false;
    // children
    this.nodes = [];
  }

  destroy () {
  }

  toDict () {
    // make this object serializable for runtime.sendMessage()
    const d = {};
    d.id = this.id;
    d.parent = this.parent.id;
    d.note = this.note;
    d.title = this.title;
    d.url = this.url;
    d.faviconUrl = this.faviconUrl;
    d.expanded = this.expanded;
    d.loaded = this.loaded;
    d.wasLoaded = this.wasLoaded;
    d.nodes = this.nodes.map((n) => n.id);
    return d;
  }

  fromDict (d) {
    // restore values from a previously-dicted copy
    this.id = d.id;
    //this.parent.id = d.parent;  // restore this elsewhere
    this.note = d.note;
    this.title = d.title;
    this.url = d.url;
    this.faviconUrl = d.faviconUrl;
    this.expanded = d.expanded;
    this.loaded = d.loaded;
    this.wasLoaded = d.wasLoaded;
    //this.nodes = [];  // restore this elsewhere
  }

  deleteSelf () {  //  TODO: rename this, maybe just use destroy ()
    // root should refuse to delete itself
    if (this.isRoot()) return;
    // remove this node from its parent
    this.parent.nodes.splice(this.indexOf(), 1);
    // TODO: notify background (in NodeView)
    // TODO: update ancestor stat info
  }

  indexOf () {
    if (!this.parent) return 0;
    if (!this.parent.nodes) return 0;
    return this.parent.nodes.indexOf(this);
  }

  isRoot () {
    // root has no parent, or is its own parent
    return ((! this.parent) || (this.parent === this));
  }

  isLeaf () {
    return (0 === this.nodes.length);
  }

  hasKids () {
    return (0 < this.nodes.length);
  }

  isExpanded () {
    return this.expanded;
  }

  isCollapsed () {
    return (! this.expanded);
  }

  isVisible () {
    // TODO
    return true;
  }

  isLoaded () {
    return this.loaded;
  }

  countDescendants (filter) {
    let total = 0;
    for (const node of this.nodes) {
      if (filter) {
        if (filter(node)) total ++;
      }
      else total ++;
      total += node.countDescendants(filter);
    }
    return total;
  }

  addChild (index = 0, details, notify = true) {
    // details to pass:
    // id, note, title, url, faviconUrl, expanded
    const newNode = new this.constructor(this.tree, this);
    this.nodes.splice(index, 0, newNode);
    for (const key in details) {
      // if key isn't banned, copy it
      if (! ['parent', 'nodes', 'parentID'].includes(key))
        newNode[key] = details[key];
    }
    this.tree.nodes[newNode.id] = newNode;
    // tell other threads
    if (notify)
      emit('tree_nodeAdded',
        { parentID: this.id, index: index, node: newNode });
    return newNode;
  }

  // TODO
  setNote (text) {
    this.note = text;
  }

  newNodeID () {  // sub-classes should override this
  }

  firstSibling () {
    if (this.isRoot()) return this;
    return this.parent.nodes[0];
  }

  lastSibling () {
    if (this.isRoot()) return this;
    return this.parent.nodes[this.parent.nodes.length - 1];
  }

  prevVisibleNode () {
    // TODO: check if we're visible.  If not, return nearest visible parent
    // root node has no previous row
    if (this.isRoot()) return this;

    const myIndex = this.indexOf();

    // if we're the first child, return parent
    if (0 === myIndex) return this.parent;

    // if prev sibling leaf or collapsed, prev sibling
    const prevSibling = this.parent.nodes[myIndex - 1];
    if (prevSibling.isCollapsed() || prevSibling.isLeaf()) return prevSibling;

    // prev sibling expanded with kids
    // find last visible descendant of prev sibling
    return prevSibling.lastVisibleDescendant();
  }

  lastVisibleDescendant () {
    const lastChild = this.nodes[this.nodes.length - 1];
    // if leaf or collapsed, this is it
    if (lastChild.isCollapsed() || lastChild.isLeaf()) return lastChild;
    // otherwise recurse
    return lastChild.lastVisibleDescendant();
  }

  nextVisibleNode () {
    // TODO: check if we're visible.  If not, return nearest visible parent

    // if we have visible kids, return the first child
    if (this.hasKids() && this.isExpanded()) return this.nodes[0];

    // otherwise, search without looking at kids
    const nextNode = this.nextVisibleNodeNoKids();
    // avoid wrapping from last node to root
    if (nextNode.isRoot()) return this;
    // otherwise, assume this is correct
    return nextNode;
  }

  nextVisibleNodeNoKids () {
    // if we're root, there is no next non-child row
    if (this.isRoot()) return this;

    // if we're not the last child, return next sibling
    const myIndex = this.indexOf();
    if (this.parent.nodes.length > (myIndex + 1)) {
      const nextSibling = this.parent.nodes[myIndex + 1];
      return nextSibling;
    }

    // we're the last child, so escalate to the parent
    return this.parent.nextVisibleNodeNoKids();
  }

  nextVisibleNodeNotMyChild () {
    // find next visible node... but exclude our own kids
    const wasExpanded = this.expanded;
    this.expanded = false;
    const result = this.nextVisibleNode();
    this.expanded = wasExpanded;
    return result;
  }

  insertChild (node, index) {
    if (! node) return;
    this.nodes.splice(index, 0, node);
    node.parent = this;
  }

  moveTo (destParent, destIndex, notify = true) {
    // remove
    const prevParent = this.parent;
    let newIndex = destIndex;
    if (prevParent) {
      const oldIndex = this.indexOf();
      if (oldIndex >= 0) {
        prevParent.nodes.splice(oldIndex, 1);
        // special case if moving to a later spot in the same parent
        // because removing an item reduced the indexes after it
        if ((prevParent === destParent) && (destIndex > oldIndex)) {
          newIndex -= 1;
        }
      }
    }
    // ... and add
    destParent.insertChild(this, newIndex);
    // TODO: recalculate stats
    if (notify)
      emit('tree_nodeMoved',
        { nodeID: this.id, destParentID: destParent.id, destIndex: destIndex});
  }

  setExpanded (expanded, notify = true) {
    // abort on no-op
    if (expanded === this.expanded) return;
    // leaf is always expanded
    if (this.isLeaf()) {
      this.expanded = true;
      return;
    }
    // otherwise, twiddle the bit
    this.expanded = expanded;
    // TODO? recalculate stats
    if (notify)
      emit('tree_nodeChanged',
        { nodeID: this.id, type: 'setExpanded', expanded: this.expanded });
  }

}  // end class Node

