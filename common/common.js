// common/common.js: code shared by all scripts
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: AGPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';


export function _ (...args) {
  return api.i18n.getMessage(...args);
}


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


export const jsonSchema = 'https://toykeeper.net/tktsto/session-backup-json-schema-v1';


// unused
// make a date tuple similar to python
//export function dateTuple (date) {
//  if (undefined === date) date = new Date(Date.now());
//  const result = [
//    // year, month, day, hour, minute, second, ms, weekday, tzOffsetMinutes
//    date.getFullYear(), date.getMonth()+1, date.getDate(),
//    date.getHours(), date.getMinutes(), date.getSeconds(),
//    date.getMilliseconds(), date.getDay(), date.getTimezoneOffset()
//  ];
//  return result;
//}


// WTF, javascript doesn't have strftime()
export function dateTupleStrings (date) {
  if (undefined === date) date = new Date(Date.now());
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  // calculate timezone offset string, like '+05:00' or '-3:30'
  let tzOffset = date.getTimezoneOffset();
  const ipart = Math.floor(tzOffset);
  const fpart = tzOffset % 1;
  if (tzOffset < 0) tzOffset = String(ipart / 60.0);
  else tzOffset = '+' + String(ipart / 60.0);
  tzOffset = tzOffset + ':' + String(Math.floor(fpart * 60)).padStart(2, '0');
  // build the tuple of strings
  const result = [
    // year, month, day, hour, minute, second, ms, weekday, tzOffsetMinutes
    String(date.getFullYear()).padStart(4,'0'),
    String(date.getMonth()+1).padStart(2,'0'),  // getMonth() is 0 to 11
    String(date.getDate()).padStart(2,'0'),
    String(date.getHours()).padStart(2,'0'),
    String(date.getMinutes()).padStart(2,'0'),
    String(date.getSeconds()).padStart(2,'0'),
    String(date.getMilliseconds()).padStart(3,'0'),
    weekdays[date.getDay()],
    tzOffset
  ];
  return result;
}


export function fmtDate (date) {
  if (! date) return '';
  // serialized dates turn into a plain number; convert it back
  if ('number' === typeof date) date = new Date(date);
  // generate ISO 8601 style timestamp string in local time zone
  return date.toLocaleString("en-CA", { hour12: false });
}


export async function emit (name, args, retry = true) {
  if (emit.disabled) return;  // abort if we're turned off
  // ensure valid args
  if (!((typeof name === 'string') || (name instanceof String)))
    throw new TypeError(`emit(name): name was not a string: ${name}`);
  if (undefined === args) args = {};
  args['msg'] = name;
  // debug info except for noisy pings
  if ('bkgd_ping' !== name) debug(`emit(${name})`, args);
  // abort if we're the Bkgd script and there are no receivers
  if (emit.isBkgd && (0 === emit.bkgd.ports.length)) {
    debug('emit(bkgd): no receivers');
    return;
  }
  // dict-ify parameters so they can be serialized
  for (const key in args) {
    if (args[key] && args[key].toDict) args[key] = args[key].toDict();
  }
  // get ready to try more than once,
  // because sometimes the service worker gets killed
  // and needs a few moments to wake up before it can respond
  let response;
  let tryNum = 1;
  const maxTries = 10;
  const startTime = performance.now();
  while (retry && (! response) && (tryNum < maxTries)) {
    try {
      response = await api.runtime.sendMessage(args);
      retry = false;
      if ('bkgd_ping' !== name)
        debug(`emit(${name}) response:`, response);
    } catch (error) {
      log(`emit(${name}) error, try #${tryNum}`, error, args);
      tryNum ++;
      await new Promise(r => setTimeout(r, 50));  // wait 50ms
    }
  }
  if (tryNum >= maxTries) {
    // TODO: this is probably a serious error,
    // and should be escalated more than just a console log
    // (like, expose it in the UI somehow)
    error(`emit(${name}) exceeded maximum retries`, name, args);
  }
  const endTime = performance.now();
  if ('bkgd_ping' !== name)
    debug(`emit(${name}) elapsed: ${endTime - startTime} ms`);
  return response;
}


export function isIllegalURL (url) {
  if (! url) return false;

  let allowedPrefixes = [ 'http:', 'https:' ];
  let illegalPrefixes = [];

  if (isFirefox) {
    // Firefox has some annoying limitations on what extensions can do
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1275209
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1412498
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1420405
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1864001
    // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/create
    // May be allowed eventually?
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1266960
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1787179
    allowedPrefixes = [
      'about:blank',
      'about:home',  // allowed, but auto-redirects to about:blank
    ];
    illegalPrefixes = [
      'file:',
      'about:',
      'chrome:',
      'javascript:',
      'data:',
    ];
  }

  // always allow these (overrides illegalPrefixes)
  for (const prefix of allowedPrefixes)
    if (url.startsWith(prefix)) return false;

  // these are banned
  for (const prefix of illegalPrefixes)
    if (url.startsWith(prefix)) return true;

  // if no match, assume it's allowed
  return false;
}

