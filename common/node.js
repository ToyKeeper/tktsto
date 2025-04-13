// common/node.js: Node class (one unit of a tree)
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: GPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import { log, warn, error, debug, emit } from '/common/common.js';


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
    this.active = false;
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
      'active',
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
    //debug(`Node.deleteSelf(${this.id})`, msg, notify);
    // root should refuse to delete itself
    if (this.isRoot()) return;

    // default parameters
    if (!msg) msg = { onTabRemoved: false };

    // delete kids first
    if (this.hasKids()) {
      for (const node of this.nodes.slice()) {
        await node.deleteSelf(msg, notify);
      }
    }

    if (this.isLoaded()) {
      // delete this item from its parent window's tab cache
      this.loaded = false;
      this.updateTabCache();
      this.loaded = true;
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
      await emit('tree_nodeDeleted', { nodeId: this.id,
        onTabRemoved: msg.onTabRemoved,
        when: this.mtime });

    // TODO: ideally, this should wait until all threads have finished
    //       handling the tree_nodeDeleted event, but await only waits
    //       for the first response ... but it seems to at least get
    //       the events in the correct order regardless?

    // close tab if it's open (but only if we're the originator of this event)
    if (notify && this.isLoaded()) {
      // if not already closed by browser
      if (!msg || (!msg.onTabRemoved)) {
        // close the tab
        if (this.tabId) {
          //debug(`Node.deleteSelf(${this.id}) removing tab "${this.tabId}"...`);
          try {
            await api.tabs.remove(this.tabId);
            //debug(`Node.deleteSelf() removed tab: "${this.tabId}"`);
          } catch (err) {
            warn(`Node.deleteSelf() tried to remove tab twice: "${this.tabId}"`);
          }
        }
        else warn(`Node.deleteSelf() can't close tab because no tabId`, this);
      }
    }

  }

  async deleteSelfAndPromoteKids (msg, notify = true) {
    debug('Node.deleteSelfAndPromoteKids()');
    // root should refuse to delete itself
    if (this.isRoot()) return;

    // take care of the kids first
    await this.promoteKids(msg, notify);

    // remove this node from its parent
    await this.deleteSelf(msg, notify);
  }

  async promoteKids (msg, notify = true) {
    debug('Node.promoteKids()');
    // root should refuse to promote its kids
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

  isParentOf (childNode) {
    if (this.isRoot()) return true;
    while (! childNode.isRoot()) {
      if (this === childNode) return true;
      childNode = childNode.parent;
    }
    return false;
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

  //countLoadedTabs () {
  //  const numOpenTabs = this.countDescendants(
  //    function (node) { return node.isLoaded(); }
  //  );
  //  return numOpenTabs;
  //}

  getLoadedTabs () {
    // FIXME: should handle nested window nodes
    //   (only cache tabs which are in this window, not a sub-window)
    const openTabs = this.findNodes(
      function (node) { return node.isLoaded(); }
    );
    return openTabs;
  }

  getWindowNode () {
    // find the nearest open window in our ancestry
    if (this.isWindow() && this.isLoaded()) return this;
    if (this.isRoot()) return null;
    return this.parent.getWindowNode();
  }

  getLoadedParent () {
    if (this.isRoot()) return null;
    if (this.isWindow()) return null;
    if (this.parent.isRoot()) return null;
    if (this.parent.isWindow()) return null;
    if (this.parent.isLoaded() && this.parent.tabId) return this.parent;
    return this.parent.getLoadedParent();
  }

  shouldUnloadNotDelete (recurse = true) {
    // true if node has any metadata worth keeping
    if (this.note
      || this.longNote
      || this.checkbox
      //|| (this.type !== '')  // is a window or something
    ) return true;
    // stop if we've gone deep enough
    if (! recurse) return false;
    // true if 1st-level kids are interesting
    // (like, if this plain tab has notes attached as children)
    for (const node of this.nodes) {
      if (node.shouldUnloadNotDelete(false)) return true;
    }
    // false if node is plain / boring and has no interesting metadata
    return false;
  }

  updateTabCache () {
    // find nearest 'window' node and re-generate its list of open tabs
    if (this.isRoot()) return;
    else if (this.isWindow()) {
      this.tabs = this.getLoadedTabs();
      this.tabIds = this.tabs.reduce((acc, node) => {
        acc[node.tabId] = node;
        return acc;
      }, {});
      //this.tabIds = {};
      //for (const node of this.tabs) {
      //  this.tabIds[node.tabId] = node;
      //}
      debug(`updateTabCache(): Window ${this.windowId}: ${this.tabs.length} tabs`, this.tabIds);
    }
    else return this.parent.updateTabCache();
  }

  isExpanded () {
    return this.expanded;
  }

  isCollapsed () {
    return (! this.expanded);
  }

  isVisible () {
    // check if entire ancestry is expanded
    let parent = this.parent;
    while (true) {
      if (parent.isCollapsed()) return false;
      if (parent.isRoot()) return true;
      parent = parent.parent;
    }
  }

  isLoaded () {
    return this.loaded;
  }

  isUnloadedTab () {
    if (this.url
      && (!this.isLoaded())
      && (!this.isWindow())
    ) return true;
    return false;
  }

  isUnloadedWindow () {
    if (this.isWindow()
      && (!this.isLoaded())
    ) return true;
    return false;
  }

  isActive () { return this.active; }

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
      //debug(`findNodes(${node.id}): ${fn(node)}`, node);
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
    // TODO: maybe redundant?  (bkgd will notice and generate events)
    if (newNode.isLoaded()) this.updateTabCache();
    // bump timestamp
    this.bump('mtime', msg);
    // tell other threads
    if (notify)
      emit('tree_nodeAdded',
        { parentId: this.id, index: index, node: newNode,
          when: this.mtime });
    debug(`Node.addChild() => "${newNode.id}"`);
    return newNode;
  }

  setNote (text, longNote, msg, notify = true) {
    // abort on no-op
    if ((text === this.note) && (longNote === this.longNote)) return;
    // Do The Thing
    this.note = text;
    this.longNote = longNote;
    // bump timestamp
    this.bump('mtime', msg);
    // notify others
    if (notify)
      emit('tree_nodeChanged',
        { nodeId: this.id, type: 'setNote',
          note: this.note,
          longNote: this.longNote,
          when: this.mtime });
  }

  setTabFields (changes, msg, notify = true) {
    // abort on no-op
    if ({} === changes) return;
    // Do The Thing
    for (const [key, value] of Object.entries(changes)) this[key] = value;
    // if the tabId changed, update cache
    if (changes.tabId) this.updateTabCache();
    // bump timestamp
    this.bump('mtime', msg);
    // notify others
    if (notify)
      emit('tree_nodeChanged',
        { nodeId: this.id, type: 'setTabFields',
          changes: changes,
          when: this.mtime });
  }

  async load (msg, notify = true) {
    // abort on no-op
    if (this.isLoaded()) return;
    if (! this.isUnloadedTab()) return;
    // TODO: if window, load the window
    // Do The Thing
    this.loaded = false;  // will get set to true after tab actually loads
    this.pendingUrl = this.url;  // go here when the tab is ready
    // TODO: maybe redundant?  (bkgd will notice and generate events)
    //this.updateTabCache();  // can't cache, tabId hasn't been allocated yet
    // bump timestamp
    this.bump('atime', msg);
    // notify others
    if (notify)
      await emit('tree_nodeChanged',
        { nodeId: this.id, type: 'load',
          onTabCreated: true,  // tell others the tab is already open
          when: this.atime });

    // AFTER everyone has marked the tab as loaded,
    // then it's finally safe to open the tab itself
    // if not already opened by browser, opened the tab
    if (!msg || (!msg.onTabCreated)) {
      // actually open the tab
      const createProperties = {};

      // When loading a saved tab, we need to attach extra data
      // while creating the tab, to tell the onTabCreated() handler
      // that the tab is restoring a saved tab, so it should
      // re-attach the old Node instead of making a new one.
      // But only place to attach data is the tab URL.
      // So we put the nodeId in the URL instead of the real URL,
      // and attach the real URL to the Node
      // so it can be redirected as soon as the tab is ready for a real URL.
      //createProperties.url = this.url;  // should be this, but
      //createProperties.url = `about:blank?nodeId=${this.id}`;
      createProperties.url = api.runtime.getURL('/node.html')
        + `?id=${this.id}`;

      //createProperties.active = true;  // <-- unsure if it should be active
      // TODO: handle case when node is not in a loaded window
      createProperties.windowId = this.windowId;
      //createProperties.windowId = this.getWindow().windowId;
      // TODO: figure out where this tab should go in the window
      //createProperties.index = this.getWindowTabIndex();
      // set openerTabId if possible
      if (this.parent && this.parent.isLoaded() && this.parent.tabId)
        createProperties.openerTabId = this.parent.tabId;
      const newTab = api.tabs.create(createProperties);
      // TODO: attach newTab to this, and delete newly-created Node
    }
  }

  async unload (msg, notify = true) {
    // abort on no-op
    if (! this.isLoaded()) return;
    // Do The Thing
    this.loaded = false;
    this.active = false;
    // remove self from parent's tab cache
    // TODO: maybe redundant?  (bkgd will notice and generate events)
    this.updateTabCache();
    // bump timestamp (?)
    // TODO: (but are 'load' and 'unload' really modifications?)
    this.bump('mtime', msg);
    // notify others
    if (notify)
      await emit('tree_nodeChanged',
        { nodeId: this.id, type: 'unload',
          onTabRemoved: true,  // tell others the tab is already closed
          when: this.mtime });

    // AFTER everyone has unloaded the tab from the tree,
    // then it's finally safe to close the tab itself
    // if not already closed by browser, close the tab
    if (!msg || (!msg.onTabRemoved)) {
      // actually close the tab
      if (this.tabId) {
        try {
          await api.tabs.remove(this.tabId);
          //debug(`Node.deleteSelf() removed tab: "${this.tabId}"`);
        } catch (err) {
          warn(`Node.unloaded() tried to remove tab twice: "${this.tabId}"`);
        }
      }
      else warn(`Node.unload() called on Node with no tabId`, this);
    }
    // TODO: if window, unload the window
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

  async moveTo (destParent, destIndex, msg, notify = true) {
    debug('Node.moveTo()', this, destParent, destIndex);
    // TODO: handle window nodes specially
    //   - refuse to move one window into another
    //   - update windowId while moving non-window nodes
    //   - remove tabs from old window, add tabs to new window
    //   - only do actual window operations if notify=true
    //     (or maybe only do them if this.tree.bkgd exists?)
    //     (meaning we are a service worker, not a view)
    const prevWindowId = this.windowId;
    // special case: moving a parent into its own child list
    // (this happens when moving a tab to the right in the tab bar,
    //  when that tab has loaded children)
    // Before:
    //   - a
    //     - b
    //       - c
    // After:
    //   - b
    //     - a
    //     - c
    if ((this === destParent) || (this.isParentOf(destParent))) {
      debug('Node.moveTo() becoming own child, promoting kids first...');
      await this.promoteKids(undefined, false);
    }
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
        // remove self from old parent's tab cache maybe
        // TODO: maybe redundant?  (bkgd will notice and generate events)
        if (this.isLoaded()) prevParent.updateTabCache();
        // bump old parent timestamp
        prevParent.bump('mtime', msg);
      }
    }
    // ... and add
    destParent.insertChild(this, newIndex);

    // add self to new parent's tab cache maybe
    // TODO: maybe redundant?  (bkgd will notice and generate events)
    if (this.isLoaded()) this.updateTabCache();

    // bump new parent timestamp
    destParent.bump('mtime', msg);

    // if new parent is marked, unmark self
    if (this.marked) {
      const markedParent = this.findParent((n) => n.marked);
      if (markedParent) this.setMarked(false, msg, false);
    }

    // TODO: recalculate stats
    if (notify) {
      emit('tree_nodeMoved',
        { nodeId: this.id,
          destParentId: destParent.id, destIndex: destIndex,
          when: destParent.mtime });

      // TODO: if a loaded tab was moved so it's not in a window,
      //   create a new window to hold it

      await this.reorderAllTabsInThisWindow();

      // update the tab's openerTabId if possible
      // (can't do this until after reordering,
      //  in case we moved to a new window,
      //  because opener must be in same window)
      this.updateOpenerTabId();

      // if this node has loaded kids, update their openerTabIds too
      const loadedKids = this.getLoadedTabs();
      for (const kid of loadedKids) kid.updateOpenerTabId();

    }
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

  setActive (active, msg, notify = true) {
    // abort on no-op
    if (active === this.active) return;
    // Do The Thing
    this.active = active;
    // bump timestamp
    if (active) this.bump('atime', msg);
    // let others know
    if (notify)
      emit('tree_nodeChanged',
        { nodeId: this.id, type: 'setActive', active: this.active,
          when: this.atime });

    // if we're the originator and the tab isn't focused, focus it
    if (active && msg && msg.activateTab)
      api.tabs.update(this.tabId, { active: true });
  }

  setActiveTab (tabId, notify = true) {
    // this should only be called on window nodes
    if (! this.isWindow()) return;
    let tabNode = this.tabIds[tabId];
    // if it wasn't cached, look it up
    if (! tabNode) {
      //const nodes = this.findNodes((node) =>
      const nodes = this.tree.root.findNodes((node) =>
        { return node.isLoaded() && (tabId === node.tabId); });
      tabNode = nodes[0];
    }
    if (! tabNode) {
      // TODO: handle the error better
      return error(`Node.setActiveTab(): can't find tab "${tabId}"`);
    }

    // mark all other active tabs in this window as not-active
    for (const node of this.tabs) {
      if (node.isActive()) node.setActive(false, null, notify);
    }

    // mark the new tab as active
    tabNode.setActive(true, null, notify);
  }

  reorderAllTabsInThisWindow () {
    // abort on no-op
    if (! this.isLoaded()) return;
    // find this tab's window
    const windowNode = this.getWindowNode();
    if (! windowNode) return;
    if (! windowNode.windowId) return;
    // get a list of all loaded tabs in this window, in order
    const tabList = windowNode.getLoadedTabs();
    // tell browser to move *all* tabs in this window to that order
    const tabIds = [];
    for (const node of tabList) tabIds.push(node.tabId);
    debug(`Node.reorderAllTabsInThisWindow():`, tabIds);
    return api.tabs.move(tabIds, { index: 0, windowId: windowNode.windowId });
  }

  async updateOpenerTabId () {
    if (! this.isLoaded()) return;
    if (! this.tabId) return;
    const nearestLoadedParent = this.getLoadedParent();
    let opener;
    if (nearestLoadedParent)
      opener = nearestLoadedParent.tabId;
    else
      opener = this.tabId;
    try {
      return await api.tabs.update(this.tabId, { openerTabId: opener });
    } catch (err) {
      // can happen if tab just moved to a new window, and its parent
      // hasn't been officially marked as part of the new window yet
      warn(`Node.updateOpenerTabId(): ${err}`);
    }
  }

}  // end class Node

