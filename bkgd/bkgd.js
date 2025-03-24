// bkgd/bkgd.js: main background script
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: GPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import { log, warn } from '/common/common.js';
import { IDGenerator } from '/common/id-generator.js';
import * as sidepanel from './sidepanel.js';

log('/bkgd/bkgd.js running');

class Bkgd {

  constructor () {
    // TODO: load client name from storage
    // TODO: detect first run and generate random client name
    this.idGen = new IDGenerator('tv', 9, 2);
  }

  init () {
    sidepanel.init();
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

  onMessage (msg, sender, sendResponse) {
    log('bkgd onMessage', msg);
    if (! msg.msg) {
      warn('bkgd onMessage invalid', msg);
      sendResponse({error: 'invalid msg type'});
      return;
    }
    const handler = this[`${msg.msg}`];
    if (handler) {
      // actually handle the event
      log(`bkgd: ${msg.msg}()`);
      handler.bind(this)(msg, sender, sendResponse);
    }
    else {
      // message was probably intended for someone else
      log(`bkgd fn not found: ${msg.msg}`);
    }
  }

  bkgd_ping (msg, sender, sendResponse) {
    sendResponse(Date.now());
  }

  bkgd_newNodeID (msg, sender, sendResponse) {
    const newID = this.idGen.newID();
    sendResponse(newID);
  }

}

const bkgd = new Bkgd();
bkgd.init();

