// bkgd/treestore.js: TreeStore class
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: AGPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import { debug, log, warn, error } from '/common/common.js';
import { NodeStore } from './nodestore.js';
import { Tree } from '/common/tree.js';
import { IDB } from '/bkgd/idb.js';


export class TreeStore extends Tree {

  constructor (bkgd) {
    super(NodeStore);
    this.bkgd = bkgd;
    this.needsTutorial = false;
    this.db = new IDB();
    this.db.init();
  }

  async init () {
    super.init();
    // load the nodes from storage
    await this.loadTreeFromDB();
  }

  async loadTreeFromDB () {
    this.createRootNode();

    // try to load the root node by itself
    // if it doesn't exist in the DB, then save the root node
    // (to make sure root is the first node in the DB)
    const saved = await this.db.loadNode(this.root.id);
    if (! saved) {
      log(`TreeStore.createRootNode couldn't load root, fresh install?`);
      await this.db.saveNode(this.root);
      this.needsTutorial = true;
    }

    let nodeIds;

    // TODO: load latest snapshot if it's clean
    //const dirty = await api.storage.local.get(
    //  { isLatestSnapshotDirty: true });
    //if (! dirty) {
    //  console.time('db.loadCurrentSnapshot');
    //  nodeIds = await this.db.loadSnapshot('local');
    //  console.timeEnd('db.loadCurrentSnapshot');
    //} else
    {
      // load the slow way, one node at a time
      console.time('db.loadAllNodes');
      nodeIds = await this.db.loadAllNodes();
      console.timeEnd('db.loadAllNodes');
    }

    const numIds = Object.keys(nodeIds).length;
    debug(`loaded ${numIds} nodes`);
    if (! nodeIds['root'])
      return error(`loadTreeFromDB(): no root node in DB`);

    // restore session from serialized data
    console.time('TreeStore.rebuildNodeFromSerializedHash');
    const numLoaded = this.rebuildNodeFromSerializedHash(
      this.root, nodeIds);
    console.timeEnd('TreeStore.rebuildNodeFromSerializedHash');
    log(`loadTreeFromDB(): loaded ${numLoaded}/${numIds} nodes`);

    // if there's stale data in the DB
    // (happens sometimes during development)
    // delete all nodes which weren't linked into the tree
    if (numLoaded !== numIds) {
      let numDeleted = 0;
      let numKept = 0;
      for (const nodeId of Object.keys(nodeIds)) {
        if (this.nodes[nodeId]) { numKept ++; }
        else {
          await this.db.deleteNode(nodeId);
          numDeleted ++;
        }
      }
      log(`loadTreeFromDB(): deleted ${numDeleted} stale nodes, kept ${numKept}`);
    }
  }

}

