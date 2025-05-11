// bkgd/idb.js: IndexedDB manager class
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: AGPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import { debug, log, warn, error } from '/common/common.js';

export class IDB {

  constructor () {
    this.dbSchemaNum = 1;
    this.dbName = 'TKTSTO';
    this.nodeDbName = 'Nodes';
    this.snapDbName = 'Snapshots';
    this.txnDbName = 'Transactions';
  }

  init () {
    this.db = this.openIDB();
  }

  // open IndexedDB and create the ObjectStores if needed
  // use 'await this.db;' before doing any database operations
  openIDB () {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbSchemaNum);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        // create 'Nodes'
        if (! db.objectStoreNames.contains(this.nodeDbName)) {
          db.createObjectStore(this.nodeDbName, { keyPath: 'key' });
          log(`IDB created: ${this.nodeDbName}`);
        }
        // create 'Snapshots'
        if (! db.objectStoreNames.contains(this.snapDbName)) {
          db.createObjectStore(this.snapDbName, { keyPath: 'key' });
          log(`IDB created: ${this.snapDbName}`);
        }
        // create 'Transactions'
        if (! db.objectStoreNames.contains(this.txnDbName)) {
          db.createObjectStore(this.txnDbName, { keyPath: 'key' });
          log(`IDB created: ${this.txnDbName}`);
        }
      };
      request.onsuccess = (event) => {
        log(`IDB opened: ${this.dbName}`);
        resolve(event.target.result);
      };
      request.onerror = (event) => {
        warn(`IDB open failed: ${event.target.error}`);
        reject(event.target.error);
      };
    });
  }

  setDirty () {
    // nodeDb has changed since the latest snapshot
    return api.storage.local.set({ isLatestSnapshotDirty: true });
  }

  loadNode (nodeId) {
    return this.loadObj(this.nodeDbName, nodeId);
  }

  saveNode (node) {
    this.setDirty();
    return this.saveObj(this.nodeDbName, node.id, node.toDict());
  }

  deleteNode (nodeId) {
    this.setDirty();
    return this.deleteObj(this.nodeDbName, nodeId);
  }

  async loadAllNodes () {
    const db = await this.db;
    return new Promise((resolve, reject) => {
      const txn = db.transaction(this.nodeDbName, 'readonly');
      const store = txn.objectStore(this.nodeDbName);
      const nodes = {};
      // open a cursor to iterate over all entries
      const request = store.openCursor();
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const node = JSON.parse(cursor.value.data);
          nodes[node.id] = node;
          //debug(`IDB.loadAllNodes(${node.id})`);
          cursor.continue();
        } else {
          resolve(nodes);
        }
      };
      request.onerror = (event) => reject(event.target.error);
    });
  }

  loadSnapshot (sessionName) {
    return this.loadObj(this.snapDbName, sessionName);
  }

  saveSnapshot (sessionName, tree) {
    return saveObj(this.snapDbName, sessionName, tree.serializeNodes());
  }

  deleteSnapshot (sessionName) {
    return this.deleteObj(this.snapDbName, sessionName);
  }

  // load an individual object
  async loadObj (dbName, key) {
    const db = await this.db;
    return new Promise((resolve, reject) => {
      const txn = db.transaction(dbName, 'readonly');
      const store = txn.objectStore(dbName);
      const request = store.get(key);
      request.onsuccess = (event) => {
        if (event.target.result) {
          // parse the JSON string back to an object
          resolve(JSON.parse(event.target.result.data));
        } else {
          resolve(null);
        }
      };
      request.onerror = (event) => reject(event.target.error);
    });
  }

  // save an individual Object
  async saveObj (dbName, key, obj) {
    const db = await this.db;
    return new Promise((resolve, reject) => {
      const txn = db.transaction(dbName, 'readwrite');
      const store = txn.objectStore(dbName);
      const data = JSON.stringify(obj);
      const request = store.put({ key, data });
      request.onsuccess = () => resolve();
      request.onerror = (event) => reject(event.target.error);
    });
  }

  async deleteObj (dbName, key) {
    const db = await this.db;
    return new Promise((resolve, reject) => {
      const txn = db.transaction(dbName, 'readwrite');
      const store = txn.objectStore(dbName);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = (event) => reject(event.target.error);
    });
  }

}

