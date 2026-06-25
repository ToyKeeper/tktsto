// common/node.js: Node class (one unit of a tree)
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: AGPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox, isZenBrowser } from '/api.js';

import {
  log, warn, error, debug, emit, isIllegalURL, isNewTabPage
} from '/common/common.js';


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
    // misc window/tab states
    this.geometry = undefined;
    this.windowState = undefined;
    this.incognito = undefined;
    this.discarded = undefined;
    this.frozen = undefined;
    this.hidden = undefined;
    // attributes
    this.label = undefined;
    this.note = undefined;
    this.title = undefined;
    this.url = undefined;
    this.bookmark = undefined;
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
    // mtime: set when changed label, title, url, checkbox, ...
    // atime: set when expanded/collapsed, moved, unloaded, tab focused, ...
    // ltime: set when url last loaded
    this.ctime = Date.now();  // creation time (NOT posix style change time)
    this.mtime = Date.now();  // modification time
    this.atime = Date.now();  // access time
    this.ltime = undefined;  // loaded time (urls only)
    // children
    this.nodes = [];
  }

  destroy () {
  }

  toDict () {
    // make this object serializable for runtime.sendMessage()
    const d = {};
    for (const key of this.tree.dictable) d[key] = this[key];
    if (this.parent) d.parent = this.parent.id;
    else d.parent = this.id;
    d.nodes = this.nodes.map((n) => n.id);
    return d;
  }

  fromDict (d) {
    // restore values from a previously-dicted copy
    for (const key of this.tree.dictable) this[key] = d[key];
    //this.parent.id = d.parent;  // restore this elsewhere
    //this.nodes = [];  // restore this elsewhere
  }

  async deleteSelf (args) {  //  TODO: rename this, maybe just use destroy ()
    debug(`Node.deleteSelf(${args.reason}, ${this.id})`, args);
    // root should refuse to delete itself
    if (this.isRoot()) return false;

    // delete kids first
    if (this.hasKids()) {
      debug(`Node.deleteSelf(${this.nodes.length} kids)`);
      for (const node of this.nodes.slice()) {
        await node.deleteSelf(args);
      }
    }

    // unmark if necessary
    await this.setMarked(false, { reason: 'deleteSelf' });

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
    if ([
      'userAction', 'onTabRemoved', 'emptyWindowClosed'
    ].includes(args.reason)) {
      //debug(`Node.deleteSelf(${args.reason}): emitting`);
      await emit('tree_nodeDeleted',
        { nodeId: this.id, when: this.mtime });
    }
    //else debug(`Node.deleteSelf(${args.reason}): not emitting`);

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

    return true;  // node was deleted
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
    if (this.isRoot()) return false;
    // TODO: if deleting a window node, handle any loaded tabs specially
    //   (since loaded tabs cannot exist outside a window)
    let moved = 0;
    let total = this.nodes.length;
    if (this.hasKids()) {
      let newIndex = this.indexOf() + 1;
      // do it last-first so open tabs won't change order during the move
      // (forward order has issues with race conditions for open tabs)
      const reversed = [...this.nodes].reverse();
      for (const node of reversed) {
        if (await node.moveTo(this.parent, newIndex, args)) {
          moved ++;
        }
      }
    }
    debug(`promoteKids(moved ${moved} / ${total} kids)`);
    if (moved > 0) return true;
    return false;
  }

  indexOf () {
    if (!this.parent) return 0;
    if (!this.parent.nodes) return 0;
    return this.parent.nodes.indexOf(this);
  }

  serializeSubtree (acc = {}) {
    // capture this node and all descendants as a { id: dict, ... } hash,
    // suitable for rebuilding the subtree later (e.g. to undo a delete)
    acc[this.id] = this.toDict();
    for (const kid of this.nodes) kid.serializeSubtree(acc);
    return acc;
  }

  //indexOfTab () {
  //  if (! this.parent) return 0;
  //  const windowNode = this.getWindowNode();
  //  if (! windowNode) return 0;
  //  const tabList = windowNode.getLoadedTabs();
  //  if (! tabList) return 0;
  //  return tabList.indexOf(this);
  //}

  isRoot () {
    // root has no parent, or is its own parent
    return (('root' === this.id) || (! this.parent) || (this.parent === this));
  }

  isLeaf () {
    return (0 === this.nodes.length);
  }

  isWindow () {
    return ('window' === this.type);
  }

  isIncognito () {
    let windowNode;
    if (this.isWindow()) windowNode = this;
    else windowNode = this.getWindowNode();
    if (windowNode) return (!! windowNode.incognito);
    return false;
  }

  isBookmark () {
    return (!! this.url) && (!! this.bookmark);
  }

  hasKids () {
    return (0 < this.nodes.length);
  }

  hasKidsWithCheckboxes () {
    if (! this.hasKids()) return false;
    for (const kid of this.nodes)
      if (kid.hasCheckbox()) return true;
    return false;
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

  hasUnloadedTabs () {
    // check if any descendant are unloaded tabs or wasLoaded tabs
    // (but try to minimize the amount of CPU cycles to calculate this)
    for (const node of this.nodes)
      if (node.isUnloadedTab()) return true;
    for (const node of this.nodes)
      if ((! node.isWindow()) && node.hasUnloadedTabs()) return true;
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

  getLoadedAndUnloadedTabs () {
    const openTabs = this.findNodes(
      function (node) {
        return (
          (node.isLoaded() || node.isUnloadedTab())
          && (! node.isWindow())
        ); },
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
    //debug(`Node.shouldUnloadNotDelete: ${this.toLine()}`,
    //  this.label, this.note, this.checkbox);
    if (this.label
      || this.note
      || this.hasCheckbox()
      || (this.isPinned() && (! isNewTabPage(this.url)))
      || this.isBookmark()
      //|| (this.type !== '')  // is a window or something
    ) return true;
    // stop if we've gone deep enough
    if (! recurse) return false;
    // true if 1st-level kids are interesting
    // (like, if this plain tab has labels attached as children)
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

  isVisible (root) {
    // check if entire ancestry is expanded
    // and exists within the given root node
    if (undefined === root) root = this.tree.root;
    if (this === root) return true;  // root is "visible" by definition
    let parent = this.parent;
    while (true) {
      if (! parent) return false;  // can happen after a node was deleted
      if (parent.isCollapsed()) return false;
      // we've looked far enough, stop the search
      else if (parent === root) return true;
      // we've hit the true root instead of the viewRoot,
      // so assume we're outside of the viewScope and thus not visible
      else if (parent.isRoot()) return false;
      // look one level higher up
      parent = parent.parent;
    }
  }

  isTab () {
    return (! (! this.url));
  }

  isLoaded () {
    return this.loaded;
  }

  isLoadedTab () {
    return (this.url
      && this.loaded
      && (! this.isWindow()));
  }

  isWasLoadedTab () {
    return (this.url
      && this.wasLoaded
      && (! this.loaded)
      && (! this.isWindow())
      && (! this.isBookmark())
    );
  }

  isUnloadedTab () {
    if (this.url
      && (! this.isLoaded())
      && (! this.isWindow())
      && (! this.isBookmark())
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

  isLoadable () {
    if (this.isUnloadedTab()) return true;
    if (this.isBookmark()) return true;
    if (this.isUnloadedWindow() && this.hasUnloadedTabs()) return true;
    return false;
  }

  isBatchLoadable () {  // has loadable kids
    if (this.isRoot()) return false;
    if (this.isLeaf()) return false;

    // can batch load anything with unloaded tabs,
    // but only if it is a window, or is inside a window
    const winNode = this.isWindow() ? this : this.getWindowNode();
    if (winNode && this.hasUnloadedTabs()) return true;

    return false;
  }

  isUnloadable () {
    if (this.loaded || this.wasLoaded) return true;
    //if (this.url) return true;
    return false;
  }

  isMarkable () {
    if (this.isRoot()) return false;
    //if (this.isWindow()) return false;  // seems unnecessary
    //if (this.isWindow() && this.isLoaded()) return false;
    return true;
  }

  isDeletable () {
    if (this.isRoot()) return false;
    if (this.isWindow() && this.isLoaded()) return false;
    return true;
  }

  isPinnedBranch () {
    // true if this node is a label called "Pinned"
    // and is the first child of a window
    // ... and false otherwise
    if (('Pinned' !== this.label)
      || this.isTab()
      || this.isWindow()
      || this.isRoot()
      || (! this.parent.isWindow())
      || (0 !== this.indexOf())
    ) return false;
    return true;
  }

  isPinned () {
    // a node is "pinned" if it is in a branch called "Pinned", and
    // that branch is the first child of its window
    if (this.isWindow()) return false;
    const windowNode = this.getWindowNode();
    if (! windowNode) return false;
    if (windowNode.nodes?.length <= 0) return false;
    const firstChild = windowNode.nodes[0];
    if (! firstChild.isPinnedBranch()) return false;
    if (this === firstChild) return true;
    if (this.isChildOf(firstChild)) return true;
    return false;
  }

  isChildOf (node, includeSelf = false) {
    if (! node) return includeSelf;
    if (this === node) return includeSelf;
    if (node.isRoot()) return true;
    if (this.isRoot()) return false;
    let search = this;
    while (! search.isRoot()) {
      if (node === search.parent) return true;
      search = search.parent;
    }
    return false;
  }

  markedBy () {
    if (this.marked) return this;
    else if (this.isRoot()) return null;
    else return this.parent.markedBy();
  }

  toLine () {
    // return a short 1-line summary of the node
    let line = '';
    if (this.label) {
      if (this.title) line = `${this.label} ~ ${this.title}`;
      else line = this.label;
    }
    else if (this.title) line = this.title;
    else if (this.url) line = this.url;
    else if (this.isWindow()) line = `Window ${this.windowId}`;
    if (! line) line = `node ${this.id}`;
    return line;
  }

  toFullLine () {
    // return a longer 1-line summary of the node
    let line = '';
    // bullet point
    if (this.isLoaded()) line = '- ';
    else if (this.hasLoadedTabs()) line = '+ ';
    else line = '* ';
    // checkbox
    if (this.hasCheckbox()) {
      const cbText = this.checkboxText();
      line = `${line}[${cbText}] `;
    }
    // main text
    let urlTitle = this.title ? this.title : this.url;
    if (this.label) {
      if (urlTitle) line = `${line}${this.label} ~ [${urlTitle}](${this.url})`;
      else line = `${line}${this.label}`;
    }
    else if (this.title) line = `${line}[${this.title}](${this.url})`;
    else if (this.url) line = `${line}[${this.url}](${this.url})`;
    else if (this.isWindow()) line = `${line}Window ${this.windowId}`;
    else if (this.isRoot()) line = `${line}Session`;
    if (this.isWindow()) {
      // closed windows
      if (! this.isLoaded()) line = `${line} (closed)`;
      // incognito windows
      if (this.isIncognito()) line = `${line} (private)`;
      // geometry
      if (this.geometry) {
        const g = this.geometry;
        line = `${line} [${g[0]}x${g[1]}+${g[2]}+${g[3]}]`;
      }
    }
    // if all else fails
    if (! line) line = `${line}node ${this.id}`;
    return line;
  }

  asTextBranch (depth = 0, lines) {
    // render the entire sub-tree as text
    if (undefined === lines) lines = [];
    const line = '  '.repeat(depth) + this.toFullLine();
    lines.push(line);
    if (this.note) {
      for (const l of this.note.split('\n'))
        lines.push('  '.repeat(depth+1) + '> ' + l + '  ');
    }
    if (this.hasKids()) {
      for (const node of this.nodes)
        node.asTextBranch(depth+1, lines);
    }
    if (0 === depth) {
      lines.push('');  // ensure we end with a newline
      return lines.join('\n');
    }
    return lines;
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
      if (node === this) return error(`Node is its own child: ${this.toLine()}`);
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

  search (needle) {
    let matches = [];

    // search helpers
    const fields = ['label', 'title', 'url', 'note'];
    const strSearch = (node, text) => {
      text = text.toLowerCase();
      for (const field of fields) {
        if (node[field] && node[field].toLowerCase().includes(text))
          return true;
      }
      return false;
    };
    const regexSearch = (node, re) => {
      for (const field of fields) {
        if (node[field] && re.test(node[field])) return true;
      }
      return false;
    };
    const nodeSearch = (node, other) => {
      for (const field of fields) {
        if (node[field] && other[field]
          && (node[field] === other[field])
        ) return true;
      }
      return false;
    };

    // search by node to find duplicates
    if ('object' === typeof(needle)) {
      matches = this.findNodes( (n) => nodeSearch(n, needle) );
    }
    // search by text entry
    else if ('string' === typeof needle) {
      // make a list of regexes or plain strings
      const regexes = [];
      for (const word of needle.split(' ')) {
        try { regexes.push(new RegExp(word, 'i')); }
        catch (e) { regexes.push(word); }  // invalid regex = plain string
      }
      matches = this.findNodes(
        // must match *all* search terms
        (n) => {
          for (const re of regexes) {
            let found = false;
            if ('string' === typeof(re)) found = strSearch(n, re);
            else found = regexSearch(n, re);
            if (! found) return false;
          }
          return true;
        }
      );
    }

    return matches;
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
    // if window is boring and has no kids, just delete it
    if ((! this.hasKids()) && (! this.shouldUnloadNotDelete())) {
      debug('Node.windowClosed(): emptyWindowClosed');
      return await this.deleteSelf({ reason: 'emptyWindowClosed' });
    }
    // if window has no open tabs, mark it as unloaded
    else if (! this.hasLoadedTabs()) {
      //args.reason = 'windowClosed';
      // args.reason should already exist: tree_windowClosed or onWindowRemoved
      debug('Node.windowClosed(): unload');
      await this.unload(args);
    }
    // if open tabs, ... well fuck.  I don't know.
    // The browser *should* close the tabs first, right?  Right??
    else {
      // Vivaldi does this when closing a window
      // and it's fine... it closes the tabs afterward
      const loadedTabs = this.getLoadedTabs();
      debug(`Window closed with ${loadedTabs.length} open tabs: ${this.toLine()}`);
    }
    // notify others
    if ('onWindowRemoved' === args.reason)
      emit('tree_windowClosed',
        { nodeId: this.id, windowId: this.windowId,
          when: this.mtime });
  }

  async addChild (index = 0, details, args) {
    // details to pass:
    // id, label, note, title, url, faviconUrl, expanded
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
      'setPinned',
      'bkgd_loadSavedNode:autoWindow',
      'importFile', 'tutorial', 'reattachOrphanedNodes'
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

  async setNotes (label, note, args) {
    // abort on no-op
    if (! args) return;
    if ((label === this.label) && (note === this.note)) return;
    const wasPinnedBranch = this.isPinnedBranch();
    // Do The Thing
    this.label = label;
    this.note = note;
    // bump timestamp
    this.bump('mtime', args);
    // notify others
    if ('userAction' === args.reason)
      await emit('tree_nodeChanged',
        { nodeId: this.id, type: 'setNotes',
          label: this.label,
          note: this.note,
          when: this.mtime });

    // needs extra care if "Pinned" status changed while loaded
    if ( (wasPinnedBranch !== this.isPinnedBranch())
      && (this.hasLoadedTabs())
    ) {
      await this.reorderAllTabsInThisWindow();
    }

    return true;  // the data changed
  }

  hasCheckbox () {
    return (undefined !== this.checkbox);
  }

  checkboxText () {
    // return a text representation of the checkbox type+completion
    if (! this.hasCheckbox()) return '';
    const cbType = this.getCheckboxType();
    if ('percent' === cbType) {
      if (! this.checkboxPx) this.checkboxPx = 0.0;
      return String(Math.floor((this.checkboxPx * 100))) + '%';
    }
    else if ('ratio' === cbType) {
      // count isn't saved to DB, so calculate and cache it
      let total = this.checkboxKidCount;
      if ((! total) && (this.hasKidsWithCheckboxes())) {
        total = this.countNodes( (n) => n.hasCheckbox(), (n) => false );
        this.checkboxKidCount = total;
      }
      if (! total) { this.checkboxPx = 0; return '/'; }
      if (! this.checkboxPx) this.checkboxPx = 0;
      const done = Math.floor(this.checkboxPx * total);
      return `${done}/${total}`;
    }
    else return this.checkbox;
  }

  getCheckboxType () {
    let cbType = this.tree.checkboxClasses.get(this.checkbox);
    if (! cbType) cbType = 'other';
    return cbType;
  }

  async setCheckbox (value, args) {
    // abort on no-op
    if (! args) return;
    // Do The Thing
    const before = this.checkbox;
    const beforePx = this.checkboxPx;
    if (null === value) this.checkbox = undefined;
    else this.checkbox = value;
    // calculate percent
    if (undefined !== args.checkboxPx) this.checkboxPx = args.checkboxPx;
    let changed = ((before !== this.checkbox)
      || (beforePx !== args.checkboxPx));
    if ((undefined === args.checkboxPx) && this.hasCheckbox())
      this.checkboxPx = this.getCompletion(changed);

    // after everything, did it actually change?
    changed = ((before !== this.checkbox)
      || (beforePx !== this.checkboxPx));
    if (! changed) return;

    // update other nodes
    this.updateCheckboxes();
    // bump timestamp
    this.bump('mtime', args);
    // notify others
    if ('userAction' === args.reason)
      await emit('tree_nodeChanged',
        { nodeId: this.id, type: 'setCheckbox',
          checkbox: this.checkbox,
          checkboxPx: this.checkboxPx,
          when: this.mtime });
    return true;  // the data changed
  }

  updateCheckboxes () {
    // stop checking parents if we don't have any
    if (this.isRoot()) return;
    const parent = this.parent;
    // recalculate percentage
    if (this.hasCheckbox()) {
      const cbType = this.getCheckboxType();
      // percent is the average completion of its children
      //if ('percent' === cbType) {
      //if (['percent', 'todo', 'done', 'half-done'].includes(cbType)) {
      if (! ['', 'other', 'skip', 'fail'].includes(cbType)) {
        let total = 0;
        let complete = 0;
        for (const kid of this.nodes) {
          if (! kid.hasCheckbox()) continue;
          let kidType = kid.getCheckboxType();
          if (! kidType) kidType = 'other';
          total ++;
          complete += kid.getCompletion();
        }
        this.checkboxKidCount = total;
        let completion = 0;
        if (total > 0) {
          completion = complete / total;
          this.checkboxPx = completion;
          // automatically change between todo, half-done, and done
          if (['todo', 'half-done', 'done'].includes(cbType)) {
            if (completion < 0.5)
              this.checkbox = this.tree.checkboxTodoType;
            else if (completion < 0.9999)
              this.checkbox = this.tree.checkboxHalfDoneType;
            else this.checkbox = this.tree.checkboxDoneType;
          }
        }
      }
    }
    parent.updateCheckboxes();
    return true;
  }

  getCompletion (changed = false) {
    if (! this.hasCheckbox()) return 0;
    const cbType = this.getCheckboxType();
    switch (cbType) {
      case '':
      case 'other':
        return 0;  // always 0 even if checkboxPx is set
      case 'done':
      case 'skip':
      case 'fail':
        return 1;  // always 1 even if checkboxPx is set
      case 'percent':
      case 'ratio':
        return this.checkboxPx;
      default:
        if ((! changed)
          && (undefined !== this.checkboxPx)
          && this.hasKidsWithCheckboxes()
        ) { return this.checkboxPx; }
        else if ('half-done' === cbType) return 0.5;
        else return 0;
    }
  }

  windowCreateData () {
    // produce "createData" for api.windows.create(createData)
    // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/windows/create
    const createData = {};
    // TODO: add support for a "panel" window with only TKTSTO in it
    //       (for Tabs Outliner users who want a separate window)
    createData.type = 'normal';
    // restore incognito status
    if (undefined !== this.incognito) createData.incognito = this.incognito;
    // save and restore 'state': fullscreen, maximized, minimized
    if (undefined !== this.windowState) createData.state = this.windowState;
    // set window size and position
    if (this.geometry
      && (4 === this.geometry.length)
      // some window types make geometry a forbidden property
      && (! ['minimized', 'maximized', 'fullscreen']
          .includes(this.windowState))
    ) {
      createData.width = this.geometry[0];
      createData.height = this.geometry[1];
      createData.left = this.geometry[2];
      createData.top = this.geometry[3];
    }
    return createData;
  }

  canBeConvertedFromWindow () {
    if (! this.isWindow()) return false;
    // unloaded windows are easy
    if (! this.isLoaded()) return true;

    // if loaded, we need another window to move tabs to
    const parentWindow = this.parent.getWindowNode();
    // no parent window to move tabs to
    if (! parentWindow) return false;
    // incognito mismatch, can't move tabs between profiles
    if (this.isIncognito() !== parentWindow.isIncognito()) return false;
    // if parent not loaded, return true because caller will load parent
    //if (! parentWindow.isLoaded()) return false;

    return true;
  }

  async convertFromWindow (changes, args) {
    // no-op
    if (! this.canBeConvertedFromWindow()) return false;
    // below here, we know this is a window and is either unloaded
    // or has a parent window with the same incognito status

    debug(`convertFromWindow(): ${this.toLine()}`);

    let changed = false;

    const loadedTabs = this.getLoadedTabs();

    // not loaded
    if ((! this.isLoaded()) && (0 === loadedTabs.length)) {
      debug('convertFromWindow(): not loaded');
      changes.type = this.type = '';
      changes.incognito = this.incognito = undefined;
      changed = true;
    }
    // loaded
    else {
      // must let the bkgd handle it, requires stuff a view can't do
      const result = await emit('bkgd_convertNodeFromLoadedWindow',
        { nodeId: this.id });
      if ('ok' === result.result) return true;
      return false;
    }

    debug(`convertFromWindow(): ==> ${changed}`);
    return changed;
  }

  async convertToWindow (changes, args) {
    // if any loaded tabs in branch,
    // open a new window and move tabs there
    // or if unloaoded, just change node type
    debug(`convertToWindow(): ${this.toLine()}`);

    let changed = false;

    const parentWindowNode = this.getWindowNode();
    const loadedTabs = this.getLoadedTabs();

    // not loaded
    if ((! this.isLoaded()) && (0 === loadedTabs.length)) {
      debug('convertToWindow(): not loaded');
      changes.type = this.type = 'window';
      if (parentWindowNode)
        changes.incognito = this.incognito = parentWindowNode.incognito;
      changed = true;
    }
    // loaded
    else {
      debug(`convertToWindow(): isLoaded`);
      debug(`convertToWindow(): parentWindow = ${parentWindowNode.toLine()}`);
      // if no parent window, abort
      if (! parentWindowNode) {
        debug("Error: no parent window");
        if (this.tree.setStatus)
          this.tree.setStatus("Error: no parent window");
        return false;
      }
      // move all tabs to new window
      const result = await emit('bkgd_convertNodeToLoadedWindow',
        { nodeId: this.id });
      if ('ok' === result.result) return true;
      return false;
    }
    return false;
  }

  async setTabFields (changes, args) {
    if (! args) return;
    // abort on no-op
    if ({} === changes) return;

    let changed = false;

    // special care is needed if converting between a window and a note
    if ((undefined !== changes.type) && ('userAction' === args.reason)) {
      debug('setTabFields(isWindow)');
      // convert window to a note
      if (('window' === this.type) && (! changes.type)) {
        changed = await this.convertFromWindow(changes, args);
      }
      // convert note to a window
      else if (('window' !== this.type) && changes.type) {
        changed = await this.convertToWindow(changes, args);
      }
      // nothing changed
      else {
        debug('setTabFields(isWindow): no change');
        delete changes.isWindow;
      }
    }

    // bookmarks cannot be 'wasLoaded'
    if (changes.bookmark) changes.wasLoaded = false;

    // Do The Thing
    for (const [key, value] of Object.entries(changes)) this[key] = value;
    if (undefined !== changes.loaded) this.wasLoaded = changes.loaded;

    // TODO: check if actually changed
    // if ()
    changed = true;
    // bump timestamp
    this.bump('mtime', args);
    // notify others
    if ([
      'onTabCreated', 'onTabUpdated', 'onTabReplaced',
      'onWindowCreated', 'onWindowFocusChanged', 'onWindowBoundsChanged',
      'userAction', 'convertNodeToWindow', 'convertNodeFromWindow',
      'mergeOpenWindowsIntoTree'
    ].includes(args.reason))
      await emit('tree_nodeChanged',
        { nodeId: this.id, type: 'setTabFields',
          changes: changes,
          when: this.mtime });

    return changed;
  }

  async load (args) {
    // abort on no-op
    if (this.isLoaded()) return;
    if ((! this.isUnloadedTab()) && (! this.isUnloadedWindow())) return;
    if (! args) return;

    // Do The Thing
    this.loaded = false;  // will get set to true after tab actually loads
    this.wasLoaded = true;  // is loading
    if (! this.isWindow())
      this.pendingUrl = this.url;  // go here when the tab is ready
    if ('mergeOpenWindowsIntoTree' === args.reason)
      this.loaded = true;  // window/tab is already open

    // bump timestamp
    this.bump('atime', args);

    // notify others, if event originated here
    if (['userAction', 'onTabCreated', 'mergeOpenWindowsIntoTree',
      'restoreLoadedTab',
    ].includes(args.reason))
      await emit('tree_nodeChanged',
        { nodeId: this.id, type: 'load',
          when: this.atime });

    // AFTER everyone has marked the tab as loaded,
    // then it's finally safe to open the tab itself
    // if not already opened by browser, opened the tab
    if (['userAction', 'restoreLoadedTab'].includes(args.reason)) {
      // there's some jank involved, so it's much easier to
      // only let the bkgd script open the actual tab
      // (so it can keep some internal state for its onTabCreated handler
      //  and also open a saved window if necessary)
      if (! this.isWindow()) {  // load a saved tab
        const params = { nodeId: this.id, reason: args.reason,
              discarded: args.discarded,
              when: this.atime };
        if (this.tree.bkgd) await this.tree.bkgd.bkgd_loadSavedNode(params);
        else await emit('bkgd_loadSavedNode', params);
      }
      // if window, load the window
      else {
        debug(`loading saved window: ${this.id}`);
        // get a list of 'wasLoaded' tabs
        let tabList = this.findNodes(
          (node) => { return (node.wasLoaded && node.isUnloadedTab()); },
          (node) => { return ! node.isWindow(); }  // skip nested windows
        );
        // if window has no 'wasLoaded' tabs, just use the first tab
        if (tabList.length < 1) {
          tabList = this.findNodes(
            (node) => { return (node.isUnloadedTab()); },
            (node) => { return ! node.isWindow(); }  // skip nested windows
          );
          if (tabList.length > 1) tabList.length = 1;
        }
        // load everything in the list
        let first = true;
        for (const kid of tabList) {
          debug(`loading saved tab: ${kid.url}`);
          const tabArgs = { ...args };
          tabArgs.discarded = true;
          //tabArgs.reason = 'loadSavedWindow';  // eh, unnecessary
          if (! isIllegalURL(kid.url)) {
            await kid.load(tabArgs);
            // FIXME: find a better way to wait for window to open
            if (first) await new Promise(r => setTimeout(r, 500));
          }
          first = false;
        }
      }
    }
    return true;  // the data changed
  }

  async unload (args) {
    // abort on no-op
    if (! args) return;
    //if (! this.isLoaded() && (! this.wasLoaded)) return;
    if ((! this.url) && (! this.isWindow())) return;  // don't "unload" notes
    const wasActuallyLoaded = (this.loaded || this.tabId)
      && ('badTabId' !== args.reason);
    const isWindowClosing = ['onWindowUnloaded', 'onWindowRemoved'].includes(args.reason);

    // Do The Thing
    this.loaded = false;
    this.active = false;
    // ensure unloaded nodes are *not* attached to browser objects
    const tabId = this.tabId;  // save for later use
    const windowId = this.windowId;
    this.tabId = undefined;
    this.windowId = undefined;
    // save briefly so onTabRemoved can find it in a few milliseconds
    this.oldTabId = tabId;
    // distinguish between manual unload and "bkgd woken up by onTabRemoved"
    if (wasActuallyLoaded && (undefined !== tabId) && (! isWindowClosing))
      this.tabClosedReason = 'unload';

    // save loaded tabs on window close
    // (and convert loaded -> wasLoaded during crash recovery)
    if (isWindowClosing || ('mergeOpenWindowsIntoTree' === args.reason))
      this.wasLoaded = (isWindowClosing || wasActuallyLoaded);
    // propagate changes from other threads
    else if (undefined !== args.wasLoaded) this.wasLoaded = args.wasLoaded;
    // when unloading a tab manually, mark it as fully unloaded
    else if (wasActuallyLoaded) this.wasLoaded = false;
    // let user toggle wasLoaded state manually
    else if (('userAction' === args.reason) && (! wasActuallyLoaded))
      this.wasLoaded = (! this.wasLoaded);
    // bookmarks are always unloaded
    if (this.isBookmark()) this.wasLoaded = false;

    // bump timestamp (?)
    // TODO: (but are 'load' and 'unload' really modifications?)
    this.bump('mtime', args);

    // notify others, if event originated here
    if (['userAction',
      'onTabRemoved', 'onWindowRemoved', 'onWindowUnloaded',
      'mergeOpenWindowsIntoTree',
      'badTabId'
    ].includes(args.reason))
      await emit('tree_nodeChanged',
        { nodeId: this.id, type: 'unload',
          wasLoaded: this.wasLoaded,
          when: this.mtime });

    // if this was a window merge operation, ensure kids are unloaded
    if ('mergeOpenWindowsIntoTree' === args.reason) {
      const tabList = this.getLoadedTabs();
      for (const kid of tabList) {
        await kid.unload(args);
      }
      // remove stale tabIds too
      const stale = this.findNodes(
        (n) => n.tabId,
        (n) => (! n.isWindow())
      );
      for (const kid of stale) { kid.tabId = undefined; }
      return true;
    }

    // stop, if the only change was to remove the 'wasLoaded' state
    if (! wasActuallyLoaded) return true;

    // AFTER everyone has unloaded the tab from the tree,
    // then it's finally safe to close the tab itself
    // if not already closed by browser, close the tab
    if (['userAction', 'onWindowUnloaded'].includes(args.reason)) {
      // actually close the tab
      if (tabId) {
        try {
          await api.tabs.remove(tabId);
          //debug(`Node.deleteSelf() removed tab: "${tabId}"`);
        } catch (err) {
          warn(`Node.unloaded() failed: "${tabId}", ${err}`);
        }
      }
      else if (this.isWindow()) {  // a window has no tabId and it's fine
        debug(`unloading window ${windowId}: ${this.toLine()}`);
        // unload tabs manually, because some browsers report false
        // "isWindowClosing" state when a window is closing,
        // and then we end up with incorrect "wasLoaded" states
        const tabList = this.getLoadedTabs();
        // move focused tab to the end, so we'll close it last
        const activeTab = this.getActiveTab();
        const index = tabList.indexOf(activeTab);
        if (index > -1) { tabList.push(tabList.splice(index, 1)[0]); }
        // close the tabs
        for (const kid of tabList) {
          const tabArgs = { ...args };
          tabArgs.reason = 'onWindowUnloaded';
          await kid.unload(tabArgs);
        }
        // close the window too
        if (windowId) {
          try { await api.windows.remove(windowId); }
          catch (err) {
            // not actually an error, window was already closed
            // (and Firefox generates an error for that, while Chrome doesn't)
          }
        }
        // just in case, make sure we're not still marked active
        await this.setActive(false, {
          reason: 'onWindowRemoved', 'onWindowRemoved': true,
        });
      }
      else {
        warn(`Node.unload() called on Node with no tabId`, this);
      }
    }
    return true;  // the data changed
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

  prevVisibleNode (root) {
    // root node has no previous row
    if (this.isRoot()) return this;
    if (root === this) return this;
    if (root && (! this.isChildOf(root, false))) return root;

    // if not visible, find nearest visible parent
    let node = this;
    while ((! node.isRoot()) && (node !== root) && (! node.isVisible(root)))
    { node = node.parent; }
    if (node !== this) return node;

    // otherwise, we were visible and need to go up one row
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

  nextVisibleNode (root, enableKids = true) {
    // TODO: check if we're visible.  If not, return nearest visible parent
    if (root && (! this.isChildOf(root, true))) return root;

    // if we have visible kids, return the first child
    if (enableKids && this.hasKids() && this.isExpanded()) return this.nodes[0];

    // otherwise, search without looking at kids
    const nextNode = this.nextVisibleNodeNoKids(root);
    // avoid wrapping from last node to root
    if (nextNode.isRoot() || (nextNode === root)) return this;
    // ensure still in root
    if (root && (! nextNode.isChildOf(root, true))) return this;
    // otherwise, assume this is correct
    return nextNode;
  }

  nextVisibleNodeNoKids (root) {
    // if we're root, there is no next non-child row
    if (this.isRoot()) return this;
    if (root && (this === root)) return this;

    // if we're not the last child, return next sibling
    const myIndex = this.indexOf();
    if (this.parent.nodes.length > (myIndex + 1)) {
      const nextSibling = this.parent.nodes[myIndex + 1];
      return nextSibling;
    }

    // we're the last child, so escalate to the parent
    // but don't wrap around from bottom to top
    const candidate = this.parent.nextVisibleNodeNoKids(root);
    if (candidate.isRoot()
      || (candidate === root)
      || (candidate === this.parent)) return this;
    return candidate;
  }

  nextVisibleNodeNotMyChild (root) {
    // find next visible node... but exclude our own kids
    return this.nextVisibleNode(root, false);
  }

  insertChild (node, index) {
    if (! node) return;
    this.nodes.splice(index, 0, node);
    node.parent = this;
  }

  async moveTo (destParent, destIndex, args) {
    if (! args) { error(`Node.moveTo(): no args`); return false; }
    debug(`Node.moveTo(${args.reason})`, this, destParent, destIndex);
    // report errors to UI
    const self = this;
    function setStatus (msg, retval = false) {
      if (self.tree.setStatus) self.tree.setStatus(msg);
      return retval;
    }
    // abort on no-op
    if ((destParent === this.parent) && (destIndex === this.indexOf()))
      return setStatus('moveTo: already there');

    // handle pinned tabs specially... they're weird
    // - if window's 1st child is a pinned branch label,
    //   don't allow it to be moved
    //   and don't allow anything to take its place
    if (this.isPinnedBranch() && this.hasLoadedTabs())
      return setStatus("moveTo: can't move pinned branch");
    const targetNode = destParent.nodes[destIndex];
    if (targetNode && targetNode.isPinnedBranch() && targetNode.hasLoadedTabs())
      return setStatus("moveTo: can't move pinned branch");

    // don't allow moving loaded tabs between incognito and regular windows
    // and don't allow moving loaded tabs entirely out of a window
    const oldWindowNode = this.getWindowNode();
    const oldParentWindowNode = this.parent.getWindowNode();
    const newWindowNode = destParent.getWindowNode();
    const thisHasLoadedTabs = this.isLoaded() || this.hasLoadedTabs();
    if (thisHasLoadedTabs && (! this.isWindow())) {
      if (! newWindowNode) {
        if (! this.url) {  // not a tab or a bookmark
          // convert heading to a window
          const changed = await this.convertToWindow({ type: 'window' }, {});
          if (! changed) return setStatus('convert to window failed');
          // wait for browser to catch up
          await new Promise(r => setTimeout(r, 250));
        }
        else return setStatus('moveTo: no destination window');
      }
      else if (oldWindowNode.isIncognito() !== newWindowNode.isIncognito()) {
        return setStatus("moveTo: incognito mismatch");
      }
    }

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
      debug('Node.moveTo() becoming own child, promoting kids first...', this.toLine());
      // stop if becoming our own first child
      if ((this === destParent) && (0 === destIndex))
        return setStatus("moveTo: can't become own 1st child");
      // stop if becoming self
      if (! this.hasKids()) return setStatus("moveTo: can't replace self");
      // becoming our own direct child
      if (this === destParent) {
        // figure out new destination after promoting kids
        destParent = destParent.parent;
        destIndex = this.indexOf() + destIndex + 1;
        debug(`new destination: child ${destIndex} of ${destParent.toLine()}`);
      }
      await this.promoteKids({ reason: 'moveTo' });
    }

    // remove from old parent ...
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

        // checkboxes might need recalculation
        // TODO: user config option to toggle this behavior
        if (this.hasCheckbox()) { prevParent.updateCheckboxes(); }

        // bump old parent timestamp
        prevParent.bump('mtime', args);
      }
    }
    // ... and add to new parent
    destParent.insertChild(this, newIndex);

    // bump new parent timestamp
    destParent.bump('mtime', args);

    // if new parent is marked, unmark self
    if (this.marked) {
      const markedParent = this.findParent((n) => n.marked);
      if (markedParent) await this.setMarked(false, { reason: 'moveTo' });
    }

    // checkboxes might need recalculation
    // TODO: user config option to toggle this behavior
    if (this.hasCheckbox()) { this.updateCheckboxes(); }

    // TODO: recalculate stats
    if ([
      'userAction',
      'onTabMoved', 'onTabRemoved', 'onTabAttached',
      'moveTo',
      'setPinned',
      'bkgd_loadSavedNode:autoWindow'
    ].includes(args.reason)) {
      emit('tree_nodeMoved',
        { nodeId: this.id,
          destParentId: destParent.id, destIndex: destIndex,
          when: destParent.mtime });

      // loaded tabs need extra care when they move
      if (('moveTo' !== args.reason)
        && (this.isLoaded() || this.hasLoadedTabs())
        && (! this.isWindow())
      ) {
        // if loaded tab moved to unloaded window, load the window
        const newWindow = this.getWindowNode();
        if (newWindow && (! newWindow.isLoaded())) {
          await emit('bkgd_loadSavedWindow', {
            reason: 'moveTo.loadedTabToUnloadedWindow',
            windowNodeId: newWindow.id,
            nodeId: this.id });
        }
        // TODO? if loaded tab moved so it's not in a window,
        //   create a new window to hold it?
        //   Nope, that case is blocked earlier in moveTo()
        //else if (! newWindow) {
        //}

        // ensure tabs are in the correct order
        await destParent.reorderAllTabsInThisWindow();
      }

      // update the tab's openerTabId if possible
      // (can't do this until after reordering,
      //  in case we moved to a new window,
      //  because opener must be in same window)
      this.updateOpenerTabId();

      // if this node has loaded kids, update their openerTabIds too
      const loadedKids = this.getLoadedTabs();
      for (const kid of loadedKids) kid.updateOpenerTabId();

    }

    // maybe convert window back to a heading, if dropped into another window
    if (this.tree.cfg.convertFromWindowWhenDroppedIntoWindow
      && ('userAction' === args.reason)
      && thisHasLoadedTabs && this.isWindow()
      && newWindowNode && (newWindowNode !== oldParentWindowNode)
      && this.canBeConvertedFromWindow()
    ) {
      // convert window to a heading
      const changed = await this.convertFromWindow({}, {});
      if (! changed) return setStatus('convert from window failed');
    }

    return true;  // the data changed
  }

  async setExpanded (expanded, args) {
    //debug(`setExpanded: ${this.expanded} => ${expanded}`, args);
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
    if (changed && ('userAction' === args.reason)) {
      await emit('tree_nodeChanged',
        { nodeId: this.id, type: 'setExpanded', expanded: this.expanded,
          when: this.atime });

      if (isFirefox) await this.syncTabHideState();
    }

    return true;
  }

  async syncTabHideState (forceShow = false) {
    // forceShow: call tabs.show() on everything, period
    // (is used after turning off hideCollapsedTabs in Options)

    if (! isFirefox) return;  // only Firefox has tabs.hide()

    if ((! forceShow) && (! this.tree.cfg.hideCollapsedTabs)) return;

    // don't hide entire windows
    // (it gets weird when a parent window collapses a child window,
    //  and the child window's TreeView gets all greyed out)
    if ((! forceShow) && this.isWindow() && (! this.isExpanded())) return;

    // we only care about visibility within the current window
    // (if entire window is in a collapsed branch, it should still
    //  count as visible... even in Session mode)
    let viewRoot;
    if (this.isWindow()) viewRoot = this;
    else viewRoot = this.tree.viewRoot || this.tree.root;
    //debug(`viewRoot: ${viewRoot.toLine()}`);

    const tabNodeList = this.getLoadedTabs();
    const hideTabIds = [];
    const showTabIds = [];
    for (const node of tabNodeList) {
      if (node.tabId) {
        const shouldBeVisible =
          node.isVisible(viewRoot) || node.isPinned() || node.isActive();
        // show if hidden and needs to be visible
        if (forceShow || (node.hidden && shouldBeVisible))
          showTabIds.push(node.tabId);
        // hide if visible but needs to be hidden
        else if ((! node.hidden) && (! shouldBeVisible))
          hideTabIds.push(node.tabId);
      }
    }
    if (showTabIds.length > 0) {
      debug(`show: ${showTabIds}`);
      await api.tabs.show(showTabIds);
    }
    if (hideTabIds.length > 0) {
      debug(`hide: ${hideTabIds}`);
      await api.tabs.hide(hideTabIds);
    }
  }

  async setMarked (marked, args) {
    if (! args) return;
    // abort on no-op
    if (marked === this.marked) return;
    // refuse to mark root node
    if (this.isRoot()) return;
    // refuse to mark window nodes
    //if (this.isWindow()) return;
    //if (this.isWindow() && this.isLoaded()) return;

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
      await emit('tree_nodeChanged',
        { nodeId: this.id, type: 'setMarked', marked: this.marked,
          when: when });

    return true;
  }

  async setActive (active, args) {
    if (! args) return;
    // abort on no-op
    if ((active === this.active) && (! args.onWindowRemoved)) return;
    // do we need to sync the hidden state?
    let syncHide = false;
    // Do The Thing
    this.active = active;
    // bump timestamp
    if (active) this.bump('atime', args);
    // sync loaded state, maybe
    if (undefined !== args.loaded) this.loaded = args.loaded;
    // let others know
    if (['userAction', 'onTabActivated', 'onTabAttached',
      'onWindowFocusChanged', 'onWindowRemoved',
      'reorderAllTabsInThisWindow'
    ].includes(args.reason)) {
      // in case the 'loaded' state somehow got desynced or corrupted,
      // this event means we know it *must* be in a loaded state
      if (active) this.loaded = true;
      // let others know
      await emit('tree_nodeChanged',
        { ...args, nodeId: this.id, type: 'setActive', active: this.active,
          loaded: this.loaded,
          when: this.atime });

      syncHide = true;
    }

    // if we're the originator and the tab isn't focused, focus it
    if (active && ('userAction' === args.reason))
      await api.tabs.update(this.tabId, { active: true });

    if (isFirefox && syncHide) {
      const windowNode = this.getWindowNode(true);
      if (windowNode) await windowNode.syncTabHideState();
    }

    return true;
  }

  getActiveTab () {
    const nodes = this.findNodes(
      function (node) { return node.isActive() && node.isLoaded(); },
      function (node) { return ! node.isWindow(); }
    );
    const tabNode = nodes[0];
    if (! tabNode) {
      // this happens when opening a new window,
      // and no tab has been set as active yet
      debug("Node.getActiveTab(): can't find active tab");
      return null;
    }
    return tabNode;
  }

  async setActiveTab (args) {
    // this syncs a window node's 'active' states based on browser window state
    // changes are debounced, executed only after changes stop happening
    // skip no-op cases
    if (! args) return;
    // this should only be called on window nodes
    if (! this.isWindow()) return;

    // handle the changes after no events have occurred for this long
    // (handle 1st event quickly, then debounce repeated events
    //  until they stop)
    const delayTime = 250;  // ms
    let actualDelay = delayTime;
    const now = Date.now();
    const sinceLast = now - this.lastSetActiveTabTime;
    this.lastSetActiveTabTime = now;
    if ((NaN === sinceLast) || (sinceLast > delayTime)) actualDelay = 10;
    // reset our timer on each new event
    // so it only fires after events stop coming in
    if (this.setActiveTabTimer) {
      clearTimeout(this.setActiveTabTimer);
    }

    this.setActiveTabTimer = setTimeout(async () => {
      let changed = false;

      try {
        // auto-detect which tab is active
        const [tab] = await chrome.tabs.query(
          { active: true, windowId: this.windowId });
        if (! tab) return;

        // get a list of this window's tabs
        const tabList = this.getLoadedAndUnloadedTabs();
        // find the newly-active tab node
        let tabNode;
        for (const node of tabList) {
          if (tab.id === node.tabId) tabNode = node;
        }
        if (! tabNode) {
          // bugfix: Vivaldi panels are briefly "active" when current tab closes
          // and they generate spurious "setActiveTab" events
          // so ignore errors on those
          // also, this may be trying to set the active tab on a window
          // after the window was closed, which isn't a problem
          if (! this.tree.tabBlacklist[`${tab.id}`])
            warn(`Node.setActiveTab(): can't find tab "${tab.id}"`);
        }

        // mark all other active tabs in this window as not-active
        for (const node of tabList) {
          if ((node !== tabNode) && node.isActive()) {
            await node.setActive(false, args);
            changed = true;
          }
        }

        // mark the new tab as active
        if (tabNode && (! tabNode.active)) {
          await tabNode.setActive(true, args);
          changed = true;
        }
        return changed;

      }
      finally {
        // get ready for next time
        this.setActiveTabTimer = null;
        this.lastSetActiveTabTime = Date.now();
        return changed;
      }
    }, actualDelay);

    const result = await this.setActiveTabTimer;
    return result;
  }

  async setPinned (pinned, args) {
    // This is *only* for use in response to an onTabUpdated event,
    // like if the user right-clicked a tab in the browser's tab bar,
    // then clicked "Pin" or "Unpin".  There is no explicit user action
    // in TKTSTO to pin or unpin a tab, because it happens as a side
    // effect of moving a tab into a special "Pinned" branch.
    debug(`Node.setPinned(${pinned})`, args);
    if (! args) return;
    // abort on no-op
    if (pinned === this.isPinned()) return;
    // can only run this in the bkgd process
    if (! this.tree.bkgd) return;
    // abort if not invoked by the correct event
    if ('onTabUpdated' !== args.reason) return;

    // do the thing
    const windowNode = this.getWindowNode();
    if (! windowNode) return;
    if (windowNode.nodes.length <= 0) return;
    let changed = false;
    // if became unpinned, move out of the "Pinned" node
    if (! pinned) {
      // become 2nd child of window (1st child is "Pinned")
      changed = await this.moveTo(windowNode, 1, { reason: 'setPinned' });
      return changed;
    }
    // if became pinned, move to a child of the "Pinned" node
    // but first, ensure there *is* a "Pinned" node
    else {
      const windowFirstChild = windowNode.nodes[0];
      let pinnedBranch = windowFirstChild;
      let destIndex;
      if ((! windowFirstChild) || (! windowFirstChild.isPinnedBranch())) {
        // create a "Pinned" branch
        pinnedBranch = await windowNode.addChild(0,
          { label: 'Pinned', render: true },
          { reason: 'setPinned' });
        if (! pinnedBranch) return;
        // become first and only child of brand new "Pinned"
        destIndex = 0;
      } else {
        // become last child of "Pinned"
        destIndex = pinnedBranch.nodes.length;
      }
      // move into "Pinned" branch
      changed = await this.moveTo(pinnedBranch, destIndex,
        { reason: 'setPinned' });
      return changed;
    }

    return changed;
  }

  async reorderAllTabsInThisWindow () {
    debug(`Node.reorderAllTabsInThisWindow(${this.tabReorderInProgress}):`, this);
    // abort on no-op
    if ((! this.isLoaded()) && (! this.hasLoadedTabs())) return;
    // find this tab's window
    const windowNode = this.getWindowNode(true);
    if (! windowNode) return;
    if (! windowNode.windowId) return;

    // only the bkgd can handle this
    if (! this.tree.bkgd) {
      // tell the bkgd to reorder the tabs
      await emit('bkgd_reorderAllTabsInThisWindow',
        { nodeId: this.id });
      return;
    }

    // ensure window actually still exists
    let winObj;
    try { winObj = await api.windows.get(windowNode.windowId); }
    catch (e) {
      return log(`can't reorder tabs, window already closed: ${windowNode.windowId}`);
    }

    // drop reorder requests when one is already pending
    const bkgd = this.tree.bkgd;
    if (bkgd.tabReorderInProgress) return;

    // actually handle the request
    try {
      bkgd.tabReorderInProgress = true;

      // wait a moment; Firefox wants this sometimes
      // (like, when dragging a tab to the void,
      //  it needs to create a window before the tabs can be reordered)
      await new Promise(resolve => setTimeout(resolve, 50));

      // try to move the tabs... maybe try a few times
      // (keep trying until the browser stops blocking reorder requests)
      let success = false;
      let tries = 0;
      const msPerTry = 500;
      const maxTrySeconds = 30;  // how long will a user do a single drag?
      while ((! success) && (tries < (maxTrySeconds * 1000 / msPerTry))) {
        tries ++;

        // get a list of all loaded tab nodes in this window node, in order
        const tabNodeList = windowNode.getLoadedTabs();

        // tell browser to move *all* tabs in this window to that order
        const tabIds = [];
        const updates = [];
        for (const node of tabNodeList) {
          if (node.tabId) {
            tabIds.push(node.tabId);
            // ... and update the pinned status too
            updates.push({
              tabId: node.tabId,
              updateProperties: { pinned: node.isPinned() }
            });
          }
        }

        // Zen Browser is fucked
        let zeroIndex = 0;
        if (isZenBrowser) {
          const tabArray = await api.tabs.query(
            { windowId: windowNode.windowId });
          zeroIndex = tabArray[0].index;
        }

        debug(`Node.reorderAllTabsInThisWindow():`,
          zeroIndex, tabIds, updates);

        // attempt to reorder the tabs
        const results = [];
        let movePromise;
        if (tabIds.length > 0) {
          // pull tabs into the correct window first
          results.push( api.tabs.move(tabIds,
            { index: zeroIndex, windowId: windowNode.windowId }) );
          // then we can update pinned status
          for (const { tabId, updateProperties } of updates) {
            if (tabId)
              results.push( api.tabs.update(tabId, updateProperties) );
          }
          // and then finally move tabs to the correct order
          movePromise = api.tabs.move(tabIds,
            { index: zeroIndex, windowId: windowNode.windowId });
          results.push(movePromise);
        }
        if (movePromise) {
          movePromise.then(
            () => success = true,
            () => success = false);
        }
        // must try / catch while awaiting each promise,
        // because otherwise only the first error is caught
        // (this generates a ton of errors in Brave when dragging a tab)
        const errors = [];
        for (const promise of results) {
          try { await promise; }
          catch (err) { errors.push(err); }
        }
        if (errors.length <= 0) {
          if (isFirefox) await this.syncTabHideState();
          debug('tab reorder success');
          //success = true;
        } else {
          // handle Brave's "Error: Tabs cannot be edited right now (user may be dragging a tab)."
          if (errors.some((err) =>
            err.message.includes('Tabs cannot be edited right now'))
          ) {
            // wait before trying again
            debug(`Tab reorder blocked, trying again in ${msPerTry}ms...`);
            bkgd.tabReorderStalled = true;
            await new Promise(resolve => setTimeout(resolve, msPerTry));
            bkgd.tabReorderStalled = false;
          }
          for (const err of errors) {
            if (err.message.includes('Tabs cannot be edited right now')) {
              // already handled above
            }
            else if (err.message.includes('No window with id')) {
              // Chrome makes and deletes a window so fast we can't query it
              debug(err);
            }
            // tabIds are out of sync with browser
            // so attempt to fix the issue and try again
            else if (
              err.message.includes('Invalid tab ID:')  // Firefox
              || err.message.includes('No tab with id:')  // Chrome
            ) {
              warn('Invalid tab ID', err);
              // unset node.tabId and try again
              let handled = false;
              let badId = Number(err.message.split(' ').pop());
              if (badId) {
                const badNode = this.tree.getNodeByTabId(badId);
                if (badNode) {
                  await badNode.unload({ reason: 'badTabId' });
                  // remove tabId from our list
                  const index = tabIds.indexOf(badId);
                  if (-1 !== index) {
                    tabIds.splice(index, 1);
                    handled = true;
                  }
                }
              }
              if (! handled) throw err;
            } else { throw err; }
          }
        }
      }
      if (bkgd.onTabAttachedRequested) {
        // ensure only one tab is 'active'
        debug(`reset active tab afterward`);
        await windowNode.setActiveTab({ reason: 'reorderAllTabsInThisWindow' });
        bkgd.onTabAttachedRequested = false;
      }
    }
    // all other errors should still be allowed
    catch (err) {
      error(`Node.reorderAllTabsInThisWindow() error:`, err);
    }
    finally {
      //bkgd.tabReorderInProgress = false;
      queueMicrotask(() => bkgd.tabReorderInProgress = false);
    }
    return;
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
    // Firefox needs opener = self, but in Chrome that's an error
    if (isChrome && (opener === this.tabId)) return;
    try {
      return await api.tabs.update(this.tabId, { openerTabId: opener });
    } catch (err) {
      if (err.message.includes('Tabs cannot be edited right now')) {
        // Brave does this in the middle of moving a tab,
        // and we need to just ignore it
      }
      else {
        // can happen if tab just moved to a new window, and its parent
        // hasn't been officially marked as part of the new window yet
        warn(`Node.updateOpenerTabId(): ${err}`);
      }
    }
  }

}  // end class Node

