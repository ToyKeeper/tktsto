// common/node.js: Node class (one unit of a tree)
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: AGPL-3.0-or-later

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
    this.windowId = undefined;
    this.tabId = undefined;
    // attributes
    this.note = undefined;
    this.longNote = undefined;
    this.title = undefined;
    this.url = undefined;
    this.faviconUrl = undefined;
    this.expanded = true;
    this.loaded = false;
    this.active = false;
    this.wasLoaded = false;
    this.marked = false;
    // checkbox: task completion and other task statuses
    this.checkbox = undefined;  // null or single character
    this.checkboxPx = undefined;  // percent complete, calculated and cached
    // timestamps
    // ctime: set when node first created only
    // mtime: set when changed note, title, url, checkbox, ...
    // atime: set when expanded/collapsed, moved, unloaded, tab focused, ...
    // ltime: set when url last loaded
    this.ctime = Date.now();  // creation time (NOT posix style change time)
    this.mtime = Date.now();  // modification time
    this.atime = Date.now();  // access time
    this.ltime = undefined;  // loaded time (urls only)
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
      'wasLoaded',
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

  async deleteSelf (args) {  //  TODO: rename this, maybe just use destroy ()
    debug(`Node.deleteSelf(${args.reason}, ${this.id})`, args);
    // root should refuse to delete itself
    if (this.isRoot()) return;

    // delete kids first
    if (this.hasKids()) {
      for (const node of this.nodes.slice()) {
        await node.deleteSelf(args);
      }
    }

    // unmark if necessary
    this.setMarked(false, { reason: 'deleteSelf' });

    // remove this node from its parent
    this.parent.bump('mtime', args);
    this.parent.nodes.splice(this.indexOf(), 1);
    this.parent = null;

    // delete from tree cache
    delete this.tree.nodes[this.id];
    // TODO: update ancestor stat info

    // bump timestamp
    this.bump('mtime', args);
    // notify others
    if (['userAction', 'onTabRemoved'].includes(args.reason))
      await emit('tree_nodeDeleted',
        { nodeId: this.id, when: this.mtime });

    // TODO: ideally, this should wait until all threads have finished
    //       handling the tree_nodeDeleted event, but await only waits
    //       for the first response ... but it seems to at least get
    //       the events in the correct order regardless?

    // close tab if it's open (but only if we're the originator of this event)
    if (('userAction' === args.reason) && this.isLoaded()) {
      // TODO: handle deleting a loaded window
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

  async deleteSelfAndPromoteKids (args) {
    debug('Node.deleteSelfAndPromoteKids()');
    // root should refuse to delete itself
    if (this.isRoot()) return;

    // if the tab was already closed, remove its tab ID
    // so we won't try to sort it in the tab bar
    if ('onTabRemoved' === args.reason) this.tabId = null;

    // FIXME: if this is a window with loaded tabs,
    // the tabs will need a new window... maybe just refuse the request?

    // take care of the kids first
    await this.promoteKids(args);

    // remove this node from its parent
    await this.deleteSelf(args);
  }

  async promoteKids (args) {
    debug('Node.promoteKids()');
    // root should refuse to promote its kids
    if (this.isRoot()) return;
    // TODO: if deleting a window node, handle any loaded tabs specially
    //   (since loaded tabs cannot exist outside a window)
    if (this.hasKids()) {
      let newIndex = this.indexOf();
      for (const node of this.nodes.slice()) {
        newIndex ++;
        await node.moveTo(this.parent, newIndex, args);
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
      if ((! node.isWindow()) && node.isLoaded()) return true;
    for (const node of this.nodes)
      if ((! node.isWindow()) && node.hasLoadedTabs()) return true;
    return false;
  }

  //countLoadedTabs () {
  //  const numOpenTabs = this.countNodes(
  //    function (node) { return (node.isLoaded() && (! node.isWindow())); },
  //    // don't recurse into nested windows
  //    function (node) { return ! node.isWindow(); }
  //  );
  //  return numOpenTabs;
  //}

  getLoadedTabs () {
    const openTabs = this.findNodes(
      function (node) { return (node.isLoaded() && (! node.isWindow())); },
      // don't recurse into nested windows
      function (node) { return ! node.isWindow(); }
    );
    return openTabs;
  }

  getWindowNode (loadedOnly = false) {
    // find the nearest matching window in our ancestry
    if (this.isWindow() && ((! loadedOnly) || this.isLoaded())) return this;
    if (this.isRoot()) return null;
    return this.parent.getWindowNode(loadedOnly);
  }

  getWindowId (windowId) {
    if (this.isWindow() && (windowId === this.windowId)) return this;
    // breadth-first search minimizes cpu time needed
    // since windows tend to be near the root
    for (const node of this.nodes) {
      if (node.isWindow() && (windowId === node.windowId)) return node;
    }
    // if not found, recurse
    for (const node of this.nodes) {
      const found = node.getWindowId(windowId);
      if (found) return found;
    }
    return null;
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

  isUnloadable () {
    if (this.loaded || this.wasLoaded) return true;
    return false;
  }

  isMarkable () {
    if (this.isRoot()) return false;
    if (this.isWindow()) return false;  // TODO: unnecessary maybe?
    return true;
  }

  isDeletable () {
    if (this.isRoot()) return false;
    return true;
  }

  markedBy () {
    if (this.marked) return this;
    else if (this.isRoot()) return null;
    else return this.parent.markedBy();
  }

  countNodes (filter, recurseFilter) {
    let total = 0;
    for (const node of this.nodes) {
      if (filter) { if (filter(node)) total ++; }
      else total ++;
      let shouldRecurse = true;
      if (recurseFilter) shouldRecurse = recurseFilter(node);
      if (shouldRecurse)
        total += node.countNodes(filter, recurseFilter);
    }
    return total;
  }

  findNodes (filter, recurseFilter, found) {
    if (undefined === found) found = [];
    for (const node of this.nodes) {
      //debug(`findNodes(${node.id}): ${filter(node)}`, node);
      if (filter) { if (filter(node)) found.push(node); }
      else found.push(node);
      if (node.hasKids()) {
        let shouldRecurse = true;
        if (recurseFilter) shouldRecurse = recurseFilter(node);
        if (shouldRecurse)
          node.findNodes(filter, recurseFilter, found);
      }
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

  async windowClosed (args) {
    if (! args) return error('Node.windowClosed() requires args');
    // window was closed by user
    // windows require special care
    // this shouldn't happen, but just in case, ignore non-windows
    if (! this.isWindow()) return;
    // if window has no kids, just delete it
    if (! this.hasKids()) {
      await this.deleteSelf({ reason: 'emptyWindowClosed' });
    }
    // if window has no open tabs, mark it as unloaded
    else if (! this.hasLoadedTabs()) {
      //args.reason = 'windowClosed';
      // args.reason should already exist: tree_windowClosed or onWindowRemoved
      await this.unload(args);
    }
    // if open tabs, ... well fuck.  I don't know.
    // The browser *should* close the tabs first, right?  Right??
    else {
      error('window closed while still having open tabs');
    }
    // notify others
    if ('onWindowRemoved' === args.reason)
      emit('tree_windowClosed',
        { nodeId: this.id, windowId: this.windowId,
          when: this.mtime });
  }

  async addChild (index = 0, details, args) {
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
    // bump timestamp
    this.bump('mtime', args);
    // tell other threads
    if ([
      'userAction',
      'onTabCreated', 'onTabAttached', 'onWindowCreated',
      'bkgd_loadSavedNode:autoWindow',
      'importFile'
    ].includes(args.reason))
      emit('tree_nodeAdded',
        { parentId: this.id, index: index, node: newNode,
          when: this.mtime });

    if ([
      'userAction',
      'onTabCreated', 'onTabAttached', 'onWindowCreated'
    ].includes(args.reason)) {
      // make sure the tab bar matches the tree
      await this.reorderAllTabsInThisWindow();
      this.updateOpenerTabId();
    }
    debug(`Node.addChild() => "${newNode.id}"`);
    return newNode;
  }

  setNote (text, longNote, args) {
    // abort on no-op
    if (! args) return;
    if ((text === this.note) && (longNote === this.longNote)) return;
    // Do The Thing
    this.note = text;
    this.longNote = longNote;
    // bump timestamp
    this.bump('mtime', args);
    // notify others
    if ('userAction' === args.reason)
      emit('tree_nodeChanged',
        { nodeId: this.id, type: 'setNote',
          note: this.note,
          longNote: this.longNote,
          when: this.mtime });
  }

  setTabFields (changes, args) {
    if (! args) return;
    // abort on no-op
    if ({} === changes) return;
    // Do The Thing
    for (const [key, value] of Object.entries(changes)) this[key] = value;
    if (undefined !== changes.loaded) this.wasLoaded = changes.loaded;
    // bump timestamp
    this.bump('mtime', args);
    // notify others
    if ([
      'onTabCreated', 'onTabUpdated', 'onTabReplaced',
      'onWindowCreated', 'onWindowFocusChanged'
    ].includes(args.reason))
      emit('tree_nodeChanged',
        { nodeId: this.id, type: 'setTabFields',
          changes: changes,
          when: this.mtime });
  }

  async load (args) {
    // abort on no-op
    if (this.isLoaded()) return;
    if (! this.isUnloadedTab()) return;
    if (! args) return;

    // TODO: if window, load the window

    // Do The Thing
    this.loaded = false;  // will get set to true after tab actually loads
    this.wasLoaded = true;  // is loading
    this.pendingUrl = this.url;  // go here when the tab is ready

    // bump timestamp
    this.bump('atime', args);

    // notify others, if event originated here
    if (['userAction', 'onTabCreated'].includes(args.reason))
      await emit('tree_nodeChanged',
        { nodeId: this.id, type: 'load',
          when: this.atime });

    // AFTER everyone has marked the tab as loaded,
    // then it's finally safe to open the tab itself
    // if not already opened by browser, opened the tab
    if ('userAction' === args.reason) {
      // there's some jank involved, so it's much easier to
      // only let the bkgd script open the actual tab
      // (so it can keep some internal state for its onTabCreated handler
      //  and also open a saved window if necessary)
      await emit('bkgd_loadSavedNode',
        { nodeId: this.id, reason: args.reason, when: this.atime });
    }
  }

  async unload (args) {
    // abort on no-op
    if (! args) return;
    if (! this.isLoaded() && (! this.wasLoaded)) return;
    const wasActuallyLoaded = this.loaded;

    // Do The Thing
    this.loaded = false;
    this.active = false;
    this.wasLoaded = false;

    // bump timestamp (?)
    // TODO: (but are 'load' and 'unload' really modifications?)
    this.bump('mtime', args);

    // notify others, if event originated here
    if (['userAction', 'onTabRemoved', 'onWindowClosed'].includes(args.reason))
      await emit('tree_nodeChanged',
        { nodeId: this.id, type: 'unload',
          when: this.mtime });

    // stop, if the only change was to remove the 'wasLoaded' state
    if (! wasActuallyLoaded) return;

    // AFTER everyone has unloaded the tab from the tree,
    // then it's finally safe to close the tab itself
    // if not already closed by browser, close the tab
    if ('userAction' === args.reason) {
      // actually close the tab
      if (this.tabId) {
        try {
          await api.tabs.remove(this.tabId);
          //debug(`Node.deleteSelf() removed tab: "${this.tabId}"`);
        } catch (err) {
          warn(`Node.unloaded() tried to remove tab twice: "${this.tabId}"`);
        }
      }
      else if (this.isWindow()) {}  // a window has no tabId and it's fine
      else {
        warn(`Node.unload() called on Node with no tabId`, this);
      }
    }
    // TODO: if window, unload all tabs in the window
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

  async moveTo (destParent, destIndex, args) {
    debug(`Node.moveTo(${args.reason})`, this, destParent, destIndex);
    // abort on no-op
    if ((destParent === this.parent) && (destIndex === this.indexOf()))
      return;
    // TODO: handle window nodes specially
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
      await this.promoteKids({ reason: 'moveTo' });
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
        // bump old parent timestamp
        prevParent.bump('mtime', args);
      }
    }
    // ... and add
    destParent.insertChild(this, newIndex);

    // bump new parent timestamp
    destParent.bump('mtime', args);

    // if new parent is marked, unmark self
    if (this.marked) {
      const markedParent = this.findParent((n) => n.marked);
      if (markedParent) this.setMarked(false, { reason: 'moveTo' });
    }

    // TODO: recalculate stats
    if ([
      'userAction',
      'onTabMoved', 'onTabRemoved', 'onTabAttached',
      'bkgd_loadSavedNode:autoWindow'
    ].includes(args.reason)) {
      emit('tree_nodeMoved',
        { nodeId: this.id,
          destParentId: destParent.id, destIndex: destIndex,
          when: destParent.mtime });

      // TODO: if loaded tab moved to unloaded window, load the window
      // TODO: if loaded tab moved so it's not in a window,
      //   create a new window to hold it
      // (and in both cases, handle all loaded kids)

      if (this.isLoaded() || this.hasLoadedTabs())
        await destParent.reorderAllTabsInThisWindow();

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

  setExpanded (expanded, args) {
    if (! args) return;
    // abort on no-op
    if (expanded === this.expanded) return;
    const wasExpanded = this.expanded;
    // leaf is always expanded
    if (this.isLeaf()) this.expanded = true;
    // otherwise, twiddle the bit
    else this.expanded = expanded;
    const changed = (wasExpanded !== this.expanded);

    // bump timestamp
    if (changed) this.bump('atime', args);

    // TODO? recalculate stats
    if (changed && ('userAction' === args.reason))
      emit('tree_nodeChanged',
        { nodeId: this.id, type: 'setExpanded', expanded: this.expanded,
          when: this.atime });
  }

  setMarked (marked, args) {
    if (! args) return;
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
      this.forEachRecursive((node) => {
        node.setMarked(false, { reason: 'self' }); });
    }

    // otherwise, twiddle the bit
    this.marked = marked;

    // update Tree's list of marked nodes
    this.tree.nodeMarkChanged(this);

    // the timestamp isn't actually used,
    // but it's included for consistency with other calls
    let when;
    if (args.when) when = args.when;
    else when = Date.now();

    // TODO? recalculate stats
    if ('userAction' === args.reason)
      emit('tree_nodeChanged',
        { nodeId: this.id, type: 'setMarked', marked: this.marked,
          when: when });
  }

  setActive (active, args) {
    if (! args) return;
    // abort on no-op
    if (active === this.active) return;
    // Do The Thing
    this.active = active;
    // bump timestamp
    if (active) this.bump('atime', args);
    // let others know
    if (['userAction', 'onTabActivated',
      'reorderAllTabsInThisWindow'
    ].includes(args.reason))
      emit('tree_nodeChanged',
        { nodeId: this.id, type: 'setActive', active: this.active,
          when: this.atime });

    // if we're the originator and the tab isn't focused, focus it
    if (active && ('userAction' === args.reason))
      api.tabs.update(this.tabId, { active: true });
  }

  getActiveTab () {
    const nodes = this.findNodes(function (node)
      { return node.isActive() && node.isLoaded(); });
    const tabNode = nodes[0];
    if (! tabNode) {
      // this happens when opening a new window,
      // and no tab has been set as active yet
      debug("Node.getActiveTab(): can't find active tab");
      return null;
    }
    return tabNode;
  }

  setActiveTab (tabId, args) {
    if (! args) return;
    // this should only be called on window nodes
    if (! this.isWindow()) return;
    const tabList = this.getLoadedTabs();
    let tabNode;
    for (const node of tabList) { if (tabId === node.tabId) tabNode = node; }
    // if it wasn't found, check the entire tree
    if (! tabNode) {  // FIXME: remove this, it shouldn't happen
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
    for (const node of tabList) {
      if (node.isActive()) node.setActive(false, args);
    }

    // mark the new tab as active
    tabNode.setActive(true, args);
  }

  async reorderAllTabsInThisWindow () {
    debug(`Node.reorderAllTabsInThisWindow():`, this);
    // abort on no-op
    if ((! this.isLoaded()) && (! this.hasLoadedTabs())) return;
    // find this tab's window
    const windowNode = this.getWindowNode(true);
    if (! windowNode) return;
    if (! windowNode.windowId) return;
    // get a list of all loaded tabs in this window, in order
    const tabList = windowNode.getLoadedTabs();
    // verify which tab is active, and deactivate all others
    const result = await api.tabs.query(
      { active: true, windowId: windowNode.windowId });
    const activeTab = result[0];
    if (activeTab) windowNode.setActiveTab(activeTab.id,
      { reason: 'reorderAllTabsInThisWindow' });
    // tell browser to move *all* tabs in this window to that order
    const tabIds = [];
    for (const node of tabList)
      if (node.tabId) tabIds.push(node.tabId);
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

