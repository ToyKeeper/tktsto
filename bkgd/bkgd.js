// bkgd/bkgd.js: main background script
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: GPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import { log, warn } from '/common/common.js';
import { IDGenerator } from '/common/id-generator.js';
import * as sidepanel from './sidepanel.js';
import { TreeStore } from './treestore.js';
import { base32encode } from '/common/base32.js';

log('/bkgd/bkgd.js running');

class Bkgd {

  constructor () {
  }

  async init () {
    await this.initConfig();
    this.idGen = new IDGenerator(this.clientID, 9, 2);

    sidepanel.init();
    this.tree = new TreeStore();
    this.tree.init();

    this.initMessageListener();
    this.initConnectListener();
  }

  initMessageListener () {
    api.runtime.onMessage.addListener( (msg, sender, sendResponse) => {
      this.onMessage(msg, sender, sendResponse);
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
    //log('bkgd onMessage', msg);
    if (! msg.msg) {
      warn('bkgd onMessage invalid', msg);
      sendResponse({error: 'invalid msg type'});
      return;
    }
    const handler = this[`${msg.msg}`];
    if (handler) {
      // actually handle the event
      //log(`bkgd: ${msg.msg}()`);
      handler.bind(this)(msg, sender, sendResponse);
    }
    else {
      // message was probably intended for someone else
      //log(`bkgd fn not found: ${msg.msg}`);
    }
  }

  bkgd_ping (msg, sender, sendResponse) {
    sendResponse(Date.now());
  }

  bkgd_newNodeID (msg, sender, sendResponse) {
    const newID = this.idGen.newID();
    sendResponse(newID);
  }

  bkgd_setClientID (msg, sender, sendResponse) {
    // FIXME: strip everything but a-zA-Z0-9
    this.clientID = msg.clientID;
    this.idGen.name = this.clientID;
  }

  bkgd_getTree (msg, sender, sendResponse) {
    const response = {};
    response.nodes = this.tree.serializeNodes();
    sendResponse(response);
  }

}

const bkgd = new Bkgd();
bkgd.init();

