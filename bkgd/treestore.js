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
    let numToReattach = 1;  // start with 1 for the lost+found node

    // first, find or create a 'lost+found/' node to hold others
    let lostFound;
    for (const node of this.root.nodes) {
      if (newParentName === node.label) {
        lostFound = node;
        break;
      }
    }
    if (! lostFound) {
      log(`fsck: making new ${newParentName} node`);
      lostFound = await this.root.addChild(this.root.nodes.length,
        { label: newParentName, note: 'orphaned nodes found during fsck' },
        { reason: 'reattachOrphanedNodes' });
    }
    const lfDict = lostFound.toDict();
    const modifiedNodes = [lostFound.id];

    // warn about nodes not attached to the tree
    // and list some human-readable info about them
    for (const nodeId of Object.keys(nodeIds)) {
      let n = nodeIds[nodeId];
      if (undefined === this.nodes[nodeId]) {
        numToReattach ++;
        let summary = `${n.label} ~ ${n.title} [${n.url}]`;
        log(`fsck: detached node: ${summary}`, n);
      }
    }

    // second, attach orphans to lost+found
    // (entire branches may have been detached, and attaching the top-most
    //  node of each detached branch should recover the whole thing)
    for (const nodeId of Object.keys(nodeIds)) {
      const parentId = nodeIds[nodeId].parent;
      const n = nodeIds[nodeId];
      const p = nodeIds[parentId];
      // attach to lost+found if:
      // - parent ID not in the database
      // - node is its own parent
      // - parent doesn't recognize child
      if ((undefined === p)  // parent ID not in database
        || ((parentId === nodeId) && ('root' !== nodeId))  // is own parent
        || (! p.nodes.includes(nodeId))  // parent doesn't expect this child
      ) {
        log('fsck: attaching orphan to lost+found:', nodeIds[nodeId]);
        nodeIds[nodeId].parent = lostFound.id;
        nodeIds[nodeId].loaded = false;
        nodeIds[nodeId].wasLoaded = false;
        lfDict.nodes.push(nodeId);
        modifiedNodes.push(nodeId);
      }
    }

    // actually attach the orphaned nodes now
    nodeIds[lostFound.id] = lfDict;
    const numAttached = this.rebuildNodeFromSerializedHash(lostFound, nodeIds);

    // write changes to database
    for (const nodeId of modifiedNodes) {
      const node = this.nodes[nodeId];
      await this.db.saveNode(node);
    }

    // summary
    warn(`fsck: reattachOrphanedNodes() attached ${numAttached} orphans under ${newParentName}`);
    if (numToReattach !== numAttached) {
      warn(`fsck: attached ${numAttached} nodes but expected ${numToReattach}`);
    }
  }

}

