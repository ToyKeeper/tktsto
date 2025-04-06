// common/node.js: Node class (one unit of a tree)
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: GPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import { log, debug, emit } from '/common/common.js';


export class Node {

  constructor (tree, parent) {
    //this.id = get_next_available_node_id();
    // placement
    this.tree = tree;
    this.parent = parent;
    // '', 'window', or 'tab'
    this.type = '';
    // browser attachment
    this.windowId = null;
    this.tabId = null;
    // attributes
    this.note = null;
    this.longNote = null;
    this.title = null;
    this.url = null;
    this.faviconUrl = null;
    this.expanded = true;
    this.loaded = false;
    //this.wasLoaded = false;
    this.marked = false;
    // checkbox: task completion and other task statuses
    this.checkbox = null;  // null or single character
    this.checkboxPx = null;  // percent complete, calculated and cached
    // timestamps
    // ctime: set when node first created only
    // mtime: set when changed note, title, url, checkbox, ...
    // atime: set when expanded/collapsed, moved, unloaded, tab focused, ...
    // ltime: set when url last loaded
    this.ctime = Date.now();  // creation time (NOT posix style change time)
    this.mtime = Date.now();  // modification time
    this.atime = Date.now();  // access time
    this.ltime = null;  // loaded time (urls only)
    // children
    this.nodes = [];
    // fields to copy when serializing to/from dict
    this.dictable = [
      'id',
      'type',
      'windowId',
      'tabId',
      'note',
      'longNote',
      'title',
      'url',
      'faviconUrl',
      'expanded',
      'loaded',
      'marked',
      'checkbox',
      'ctime',
      'mtime',
      'atime'
    ];
  }

  destroy () {
  }

  toDict () {
    // make this object serializable for runtime.sendMessage()
    const d = {};
    for (const key of this.dictable) d[key] = this[key];
    d.parent = this.parent.id;
    d.nodes = this.nodes.map((n) => n.id);
    return d;
  }

  fromDict (d) {
    // restore values from a previously-dicted copy
    for (const key of this.dictable) this[key] = d[key];
    //this.parent.id = d.parent;  // restore this elsewhere
    //this.nodes = [];  // restore this elsewhere
  }

  async deleteSelf (msg, notify = true) {  //  TODO: rename this, maybe just use destroy ()
    // root should refuse to delete itself
    if (this.isRoot()) return;

    // delete kids first
    if (this.hasKids()) {
      for (const node of this.nodes.slice()) {
        await node.deleteSelf(msg, notify);
      }
    }

    // unmark if necessary
    this.setMarked(false, msg, false);
    // remove this node from its parent
    this.parent.bump('mtime', msg);
    this.parent.nodes.splice(this.indexOf(), 1);
    this.parent = null;

    // delete from tree cache
    delete this.tree.nodes[this.id];
    if (this.isWindow()) delete this.tree.windows[this.windowId];

    // TODO: update ancestor stat info

    // bump timestamp
    this.bump('mtime', msg);
    // notify others
    if (notify)
      await emit('tree_nodeDeleted', { nodeId: this.id, when: this.mtime });
  }

  async deleteSelfAndPromoteKids (msg, notify = true) {
    debug('Node.deleteSelfAndPromoteKids()');
    // root should refuse to delete itself
    if (this.isRoot()) return;
    // TODO: if deleting a window node, handle any loaded tabs specially
    //   (since loaded tabs cannot exist outside a window)
    if (this.hasKids()) {
      let newIndex = this.indexOf();
      for (const node of this.nodes.slice()) {
        newIndex ++;
        await node.moveTo(this.parent, newIndex, msg, notify);
      }
    }

    // remove this node from its parent
    await this.deleteSelf(msg, notify);
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

  isWindow () {
    return ('window' === this.type);
  }

  hasKids () {
    return (0 < this.nodes.length);
  }

  hasLoadedTabs () {
    // check if any descendant are loaded
    // (but try to minimize the amount of CPU cycles to calculate this)
    for (const node of this.nodes)
      if (node.isLoaded()) return true;
    for (const node of this.nodes)
      if (node.hasLoadedTabs()) return true;
    return false;
  }

  getLoadedTabs () {
    const openTabs = this.countDescendants(
      function (node) { return node.isLoaded(); }
    );
    return openTabs;
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

  markedBy () {
    if (this.marked) return this;
    else if (this.isRoot()) return null;
    else return this.parent.markedBy();
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

  findNodes (fn, found) {
    if (undefined === found) found = [];
    for (const node of this.nodes) {
      debug(`findNodes(${node.id}: ${fn(node)}`, node);
      if (fn(node)) found.push(node);
      if (node.hasKids()) node.findNodes(fn, found);
    }
    return found;
  }

  findParent (fn) {
    //debug('findParent', this.parent, fn(this.parent));
    // search ancestors for one which satisfies the "fn" condition
    // stop recursion at root
    if (this.isRoot()) return null;
    const found = fn(this.parent);
    if (found) return this.parent;
    return this.parent.findParent(fn);
  }

  forEachRecursive (fn) {
    for (const node of this.nodes) {
      fn(node);
      node.forEachRecursive(fn);
    }
  }

  bump (tStampName, msg) {
    // ignore invalid requests
    if (! ['ctime', 'mtime', 'atime'].includes(tStampName)) return;
    // bump the timestamp
    if (msg && msg.when) this[tStampName] = msg.when;
    else this[tStampName] = Date.now();
  }

  async windowClosed (msg, notify = true) {
    // window was closed by user
    // windows require special care
    // this shouldn't happen, but just in case, ignore non-windows
    if (! this.isWindow()) return;
    // if window has no kids, just delete it
    if (! this.hasKids()) {
      await this.deleteSelf(msg, false);
    }
    // if window has no open tabs, mark it as unloaded
    else if (! this.hasLoadedTabs()) {
      await this.unload(msg, false);
    }
    // if open tabs, ... well fuck.  I don't know.
    // The browser *should* close the tabs first, right?  Right??
    else {
      error('window closed while still having open tabs');
    }
    // notify others
    if (notify)
      emit('tree_windowClosed',
        { nodeId: this.id, windowId: this.windowId,
          when: this.mtime });
  }

  addChild (index = 0, details, msg, notify = true) {
    // details to pass:
    // id, note, title, url, faviconUrl, expanded
    const newNode = new this.constructor(this.tree, this);
    this.nodes.splice(index, 0, newNode);
    for (const key in details) {
      // if key isn't banned, copy it
      if (! ['parent', 'nodes', 'parentId'].includes(key))
        newNode[key] = details[key];
    }
    // update the tree caches
    this.tree.nodes[newNode.id] = newNode;
    if (newNode.isWindow())
      this.tree.windows[newNode.windowId] = newNode;
    // bump timestamp
    this.bump('mtime', msg);
    // tell other threads
    if (notify)
      emit('tree_nodeAdded',
        { parentId: this.id, index: index, node: newNode,
          when: this.mtime });
    return newNode;
  }

  setNote (text, msg, notify = true) {
    // abort on no-op
    if (text === this.note) return;
    // Do The Thing
    this.note = text;
    // bump timestamp
    this.bump('mtime', msg);
    // notify others
    if (notify)
      emit('tree_nodeChanged',
        { nodeId: this.id, type: 'setNote', note: this.note,
          when: this.mtime });
  }

  unload (msg, notify = true) {
    // abort on no-op
    if (! this.isLoaded()) return;
    // Do The Thing
    // TODO: if tab, unload the tab
    //   if window, unload the window
    this.loaded = false;
    // bump timestamp
    this.bump('mtime', msg);
    // notify others
    if (notify)
      emit('tree_nodeUnloaded',
        { nodeId: this.id, when: this.mtime });
  }

  newNodeId () {  // sub-classes should override this
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

  moveTo (destParent, destIndex, msg, notify = true) {
    debug('Node.moveTo()', this, destParent, destIndex);
    // TODO: handle window nodes specially
    //   - refuse to move one window into another
    //   - update windowId while moving non-window nodes
    //   - remove tabs from old window, add tabs to new window
    //   - only do actual window operations if notify=true
    //     (or maybe only do them if this.tree.bkgd exists?)
    //     (meaning we are a service worker, not a view)
    const prevWindowId = this.windowId;
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
        // bump old parent timestamp
        prevParent.bump('mtime', msg);
      }
    }
    // ... and add
    destParent.insertChild(this, newIndex);

    // bump new parent timestamp
    destParent.bump('mtime', msg);

    // if new parent is marked, unmark self
    if (this.marked) {
      const markedParent = this.findParent((n) => n.marked);
      if (markedParent) this.setMarked(false, msg, false);
    }

    // TODO: recalculate stats
    if (notify)
      emit('tree_nodeMoved',
        { nodeId: this.id,
          destParentId: destParent.id, destIndex: destIndex,
          when: destParent.mtime });
  }

  setExpanded (expanded, msg, notify = true) {
    // abort on no-op
    if (expanded === this.expanded) return;
    // leaf is always expanded
    if (this.isLeaf()) {
      this.expanded = true;
      return;
    }
    // otherwise, twiddle the bit
    this.expanded = expanded;

    // bump timestamp
    this.bump('atime', msg);

    // TODO? recalculate stats
    if (notify)
      emit('tree_nodeChanged',
        { nodeId: this.id, type: 'setExpanded', expanded: this.expanded,
          when: this.atime });
  }

  setMarked (marked, msg, notify = true) {
    // abort on no-op
    if (marked === this.marked) return;
    // refuse to mark root node
    if (this.isRoot()) return;
    // refuse to mark window nodes
    if (this.isWindow()) return;

    if (marked) {
      // reject mark request if ancestor is already marked,
      // because that means we're already marked by association
      const markedParent = this.findParent((n) => n.marked);
      if (markedParent) return;

      // unmark children, because they will now be marked by association
      this.forEachRecursive((node) => { node.setMarked(false, false); });
    }

    // otherwise, twiddle the bit
    this.marked = marked;

    // update Tree's list of marked nodes
    this.tree.nodeMarkChanged(this);

    // 'msg' and the timestamp aren't actually used,
    // but they're included for consistency with other calls
    let when;
    if (msg && msg.when) when = msg.when;
    else when = Date.now();

    // TODO? recalculate stats
    if (notify)
      emit('tree_nodeChanged',
        { nodeId: this.id, type: 'setMarked', marked: this.marked,
          when: when });
  }

}  // end class Node

