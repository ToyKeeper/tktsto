// common/common.js: code shared by all scripts
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: GPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

export function debug (...args) {
  console.debug(...args);
}

export function log (...args) {
  console.log(...args);
}

export function warn (...args) {
  console.warn(...args);
}

export function error (...args) {
  console.error(...args);
}

export async function emit (name, args, retry = true) {
  // ensure valid args
  if (!((typeof name === 'string') || (name instanceof String)))
    throw new TypeError(`emit(name): name was not a string: ${name}`);
  if (undefined === args) args = {};
  args['msg'] = name;
  // dict-ify parameters so they can be serialized
  for (const key in args) {
    if (args[key].toDict) args[key] = args[key].toDict();
  }
  debug('emit()', args);
  // get ready to try more than once,
  // because sometimes the service worker gets killed
  // and needs a few moments to wake up before it can respond
  let response;
  let tryNum = 1;
  const maxTries = 100;
  while (retry && (! response) && (tryNum < maxTries)) {
    try {
      response = await api.runtime.sendMessage(args);
      retry = false;
      debug('emit() response:', response);
    } catch (error) {
      log(`emit() error, try #${tryNum}`, error, args);
      tryNum ++;
      await new Promise(r => setTimeout(r, 10));  // wait 10ms
    }
  }
  if (tryNum >= maxTries) {
    // TODO: this is probably a serious error,
    // and should be escalated more than just a console log
    // (like, expose it in the UI somehow)
    error('emit() exceeded maximum retries', name, args);
  }
  return response;
}

