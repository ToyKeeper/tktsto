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
    // re-attach all orphaned nodes
    if (numLoaded !== numIds) {
      await this.reattachOrphanedNodes(nodeIds);
    }
  }

  async reattachOrphanedNodes (nodeIds) {
    const newParentName = 'lost+found';

    // first, find or create a 'lost+found/' node to hold others
    let lostFound;
    for (const node of this.root.nodes) {
      if (newParentName === node.label) {
        lostFound = node;
        break;
      }
    }
    if (! lostFound) {
      lostFound = await this.root.addChild(this.root.nodes.length,
        { label: newParentName, note: 'orphaned nodes found during fsck' },
        { reason: 'reattachOrphanedNodes' });
    }
    const lfDict = lostFound.toDict();
    const modifiedNodes = [lostFound.id];

    // second, attach orphans to lost+found
    for (const nodeId of Object.keys(nodeIds)) {
      const parentId = nodeIds[nodeId].parent;
      // if parent id not in the database, attach it as an orphan
      if (undefined === nodeIds[parentId]) {
        nodeIds[nodeId].parent = lostFound.id;
        lfDict.nodes.push(nodeId);
        modifiedNodes.push(nodeId);
      }
    }

    // actually load the orphaned nodes now
    nodeIds[lostFound.id] = lfDict;
    const numAttached = this.rebuildNodeFromSerializedHash(lostFound, nodeIds);
    //log(`reattachOrphanedNodes: attached ${numAttached} orphans`);

    // write changes to database
    for (const nodeId of modifiedNodes) {
      const node = this.nodes[nodeId];
      await this.db.saveNode(node);
    }

    warn(`reattachOrphanedNodes(): attached ${numAttached} orphans under ${newParentName}`);
  }

}

