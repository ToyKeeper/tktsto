// bkgd/nodestore.js: NodeStore class
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: AGPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import { debug, log, warn, error } from '/common/common.js';
import { Node } from '/common/node.js';
import { Mutex } from '/common/mutex.js';


// TODO
export class NodeStore extends Node {

  constructor (...args) {
    super(...args);
    // don't write other things during the middle of a transaction
    this.writeLock = new Mutex();
  }

  newNodeId () {
    // NodeView.newNodeId() and NodeStore.newNodeId()
    // are totally different, and Node.newNodeId() doesn't exist
    //super.newNodeId();  // unnecessary, doesn't exist
    const nodeId = this.tree.bkgd.idGen.newId();
    debug(`NodeStore.newNodeId(): ${nodeId}`);
    return nodeId;
  }

  async saveIfChanged (promise) {
    const changed = await promise;
    if (changed) {
      const unlock = await this.writeLock.lock();
      try { await this.tree.db.saveNode(this); }
      finally { unlock(); }
    }
    return changed;
  }

  async deleteSelf (args) {
    debug(`NodeStore.deleteSelf(${args.reason}, ${this.id})`, args);
    const nodeId = this.id;  // save for later
    const parent = this.parent;

    // let parent class do its thing
    const changed = await super.deleteSelf(args);
    // if delete failed, skip the rest
    if (changed) {
      const unlock = await this.writeLock.lock();
      try {
        // parent child list changed
        if (parent && parent.id && (parent.id !== nodeId))
          await this.tree.db.saveNode(parent);
        // remove from database
        await this.tree.db.deleteNode(nodeId);
      }
      finally { unlock(); }
    }

    return changed;
  }

  async addChild (index, details, ...extra) {
    // index is required; assume 1st child if not given
    if (undefined === index) index = 0;

    debug(`NodeStore.addChild(${index})`, details);
    // must allocate ID before creating node and emitting notifications
    if (! details.id) { details.id = this.newNodeId(); }

    // create new Node object
    const newNode = await super.addChild(index, details, ...extra);
    if (newNode) {
      const unlock = await this.writeLock.lock();
      try {
        // add child to database
        await this.tree.db.saveNode(newNode);
        // parent changed too
        await this.tree.db.saveNode(this);
      }
      finally { unlock(); }
    }

    return newNode;
  }

  async setNotes (label, note, args) {
    debug(`NodeStore.setNotes(${args.reason}, ${this.id})`, args);
    return await this.saveIfChanged(super.setNotes(label, note, args));
  }

  async setCheckbox (value, args) {
    debug(`NodeStore.setCheckbox(${args.reason}, ${this.id})`, args);
    return await this.saveIfChanged(super.setCheckbox(value, args));
  }

  async updateCheckboxes () {
    debug(`NodeStore.updateCheckboxes(${this.id})`);

    // save checkbox states before
    const parents = [];
    let node = this;
    while (! node.isRoot()) {
      parents.push([node, node.checkbox, node.checkboxPx]);
      node = node.parent;
    }

    const changed = await super.updateCheckboxes();
    if (changed) {
      const unlock = await this.writeLock.lock();
      try {
        // if any parents changed, save them too
        for (const [n, checkbox, checkboxPx] of parents) {
          if ((n.checkbox !== checkbox) || (n.checkboxPx !== checkboxPx))
            await this.tree.db.saveNode(n);
        }
      }
      finally { unlock(); }
    }

    return changed;
  }

  async setTabFields (changes, args) {
    debug(`NodeStore.setTabFields(${args.reason}, ${this.id})`, args);
    return await this.saveIfChanged(super.setTabFields(changes, args));
  }

  async load (args) {
    debug(`NodeStore.load(${args.reason}, ${this.id})`, args);
    return await this.saveIfChanged(super.load(args));
  }

  async unload (args) {
    debug(`NodeStore.unload(${args.reason}, ${this.id})`, args);
    return await this.saveIfChanged(super.unload(args));
  }

  async moveTo (destParent, destIndex, args) {
    debug(`NodeStore.moveTo(${args.reason}, ${this.id})`, args);
    const prevParent = this.parent;

    const changed = await super.moveTo(destParent, destIndex, args);
    if (changed) {
      const unlock = await this.writeLock.lock();
      try {
        await this.tree.db.saveNode(this);
        if (destParent)
          await this.tree.db.saveNode(destParent);
        if (prevParent && (prevParent !== destParent))
          await this.tree.db.saveNode(prevParent);
      }
      finally { unlock(); }
    }

    return changed;
  }

  async setExpanded (expanded, args) {
    debug(`NodeStore.setExpanded(${args.reason}, ${this.id})`, args);
    return await this.saveIfChanged(super.setExpanded(expanded, args));
  }

  async setMarked (marked, args) {
    debug(`NodeStore.setMarked(${args.reason}, ${this.id})`, args);
    return await this.saveIfChanged(super.setMarked(marked, args));
  }

  async setActive (active, args) {
    debug(`NodeStore.setActive(${args.reason}, ${this.id})`, args);
    return await this.saveIfChanged(super.setActive(active, args));
  }

}

