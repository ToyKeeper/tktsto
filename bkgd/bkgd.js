// bkgd/bkgd.js: main background script
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: GPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import { log, debug, warn } from '/common/common.js';
import { IDGenerator } from '/common/id-generator.js';
import * as sidepanel from './sidepanel.js';
import { TreeStore } from './treestore.js';
import { base32encode } from '/common/base32.js';

log('/bkgd/bkgd.js running');

class Bkgd {

  constructor () {
    // help event handlers wait until init is finished
    this.configLoaded = new Promise(resolve => {
      this.resolveConfigLoaded = resolve;
    });
    this.treeLoaded = new Promise(resolve => {
      this.resolveTreeLoaded = resolve;
    });
  }

  init () {
    // if I understand correctly, this needs to NOT be async,
    // because that means listeners aren't registered immediately at startup,
    // which means it misses messages until init is finished...
    // but instead, it needs to register listeners *immediately* and then
    // make them handle "waiting on init" conditions when events come in
    // (by receiving events but delaying the processing until init is done)
    this.initMessageListener();
    this.initConnectListener();

    // tell the browser the sidepanel can be opened via hotkey or icon click
    sidepanel.init();

    this.initConfig().then(() => {
      this.idGen = new IDGenerator(this.clientID, 9, 2);
      this.resolveConfigLoaded();  // let listeners know the config is ready

      this.tree = new TreeStore();
      this.tree.init();
      // TODO: use tree node dict as idGen ID cache
      // TODO: make IDGenerator check a cache to avoid duplicates
      //this.idGen.cache = this.tree.nodes;
      //  TODO: actually load the tree from storage
      // this.tree.loadFromIDB().then(() => {
      //   this.resolveTreeLoaded();
      // });
      this.resolveTreeLoaded();  // let listeners know the tree is loaded
    });

  }

  initMessageListener () {
    api.runtime.onMessage.addListener( (msg, sender, sendResponse) => {
      return this.onMessage(msg, sender, sendResponse);
    });
  }

  // TODO: Do I actually need this?
  initConnectListener () {
    //api.runtime.onConnect.addListener( (msg, sender, sendResponse)
    //  => { this.onConnect(msg, sender, sendResponse) }
    //);
  }

  async initConfig () {
    // load client name from storage
    const result = await api.storage.local.get('clientID');
    if (result.clientID) {
      this.clientID = result.clientID;
      log(`clientID: ${this.clientID}`);
    } else {
      // detect first run and generate random client name
      // generate 2-digit base32 string
      let num = Math.floor(Math.random() * (32**2));
      this.clientID = base32encode(num, 2);
      await api.storage.local.set({ 'clientID': this.clientID });
      log(`rand clientID: ${this.clientID}`);
    }
  }

  onMessage (msg, sender, sendResponse) {
    // reject broken messages
    if (! msg.msg) {
      const err = 'bkgd onMessage: invalid msg type';
      warn(err, msg);
      sendResponse({error: err});
      return;
    }
    // if message is for someone else, ignore it and abort
    if (! msg.msg.startsWith('bkgd_')) return;

    // onMessage handlers can't be async,
    // because async functions return a Promise
    // and then the message channel gets closed before calling sendResponse()
    // so instead we return true to keep the channel open,
    // and invoke the real handler, which can take as much time as it needs

    // call async handler synchronously
    this.onBkgdMessage(msg, sender, sendResponse);
    // "claim" this message, indicating we'll respond async,
    // and keep the message channel open
    // (but if we don't respond within a few seconds,
    //  it'll generate an error, so there is a time limit)
    return true;
  }

  async onBkgdMessage (msg, sender, sendResponse) {
    debug('bkgd onMessage', msg);
    // look up the appropriate message handler
    const handler = this[`${msg.msg}`];
    if (handler) {
      //await this.configLoaded;  // wait for config to finish loading
      // actually handle the event
      //debug(`bkgd: ${msg.msg}()`);
      const result = await handler.bind(this)(msg);
      //debug('bkgd sendResponse:', result);
      sendResponse(result);
      return;
    }
    // if no handler found, send an error
    // because we promised to send a response, so now it's mandatory
    // and if we don't, the caller's "emit()" will retry
    const err = `bkgd fn not found: ${msg.msg}`;
    sendResponse({ error: err });
    return error(err);
  }

  async bkgd_ping (msg) {
    return Date.now();
  }

  async bkgd_newNodeID (msg) {
    //debug('bkgd_newNodeID()', msg);
    await this.configLoaded;  // wait for config to finish loading
    const newID = this.idGen.newID();
    //debug(`bkgd_newNodeID() => "${newID}"`);
    return newID;
  }

  async bkgd_setClientID (msg) {
    await this.configLoaded;  // wait for config to finish loading
    // FIXME: strip everything but a-zA-Z0-9
    // TODO: save to config
    this.clientID = msg.clientID;
    this.idGen.name = this.clientID;
  }

  async bkgd_getTree (msg) {
    await this.treeLoaded;  // ensure tree is loaded before sending it
    const response = {};
    response.nodes = this.tree.serializeNodes();
    return response;
  }

}

const bkgd = new Bkgd();
bkgd.init();

