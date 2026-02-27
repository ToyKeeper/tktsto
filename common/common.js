// common/common.js: code shared by all scripts
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: AGPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';


export function _ (...args) {
  return api.i18n.getMessage(...args);
}


// 0: errors + warnings only
// 1: add log() messages
// 2: add debug() messages
export let verbosity = 2;


// log() functions (debug/log/warn/error) have an odd interface.
// They try to attach a relevant part of a stack trace
// unless instructed not to.  And since the relevant part might
// change depending on how deep the caller is,
// the caller can specify a depth.
// Depth is the first arg, but can be omitted.
// A depth of 0 means "no stack trace".
// A depth of 1 or more means "descend this many extra levels".
// If omitted, it adds a track with no extra depth.
// Examples:
//   log('text', extra): default (stack trace, regular depth)
//     -> logCaller(console.log, 0, 'text', extra);
//   log(0, 'text', extra): (no stack trace)
//     -> console.log('text', extra);
//   log(1, 'text', extra): (stack trace, +1 depth)
//     -> logCaller(console.log, 1, 'text', extra);


export function debug (...args) {
  if ((! verbosity) || (verbosity < 2)) return;
  logCallerMaybe(console.debug, ...args);
}


export function log (...args) {
  if (! verbosity) return;
  logCallerMaybe(console.log, ...args);
}


export function warn (...args) {
  logCallerMaybe(console.warn, ...args);
}


export function error (...args) {
  logCallerMaybe(console.error, ...args);
}


function logCallerMaybe (logger, depth, ...args) {
  if (Number.isFinite(depth)) {
    // log(0, 'text', extra): -> console.log('text', extra);
    // no stack trace
    if (0 === depth) logger(...args);
    // log(1, 'text', extra): -> logCaller(console.log, 1, 'text', extra);
    // deeper stack trace
    else logCaller(logger, depth, ...args);
  }
  // log('text', extra): -> logCaller(console.log, 0, 'text', extra);
  // default stack trace
  // (depth is a message here, not a depth)
  else logCaller(logger, 0, depth, ...args);
}


// oh boy, get ready for some JANK
// We want to log the "Class.methodName" and "/dir/file.js:lineNum"
// of the caller, but Javascript doesn't have proper stack trace objects
// or caller introspection...  so we have to parse
// a text representation of the stack trace,
// (which is different for each browser)
// to extract the relevant info.
// Regexes ahoy!
function logCaller (logger, depth, msg, ...args) {
  // log a message, but insert the name of the caller first
  // Example stack trace we're parsing (Chrome):
  //   Error
  //     at logCaller (common.js:35:15)
  //     at debug (common.js:15:3)
  //     at Bkgd.onWindowFocusChanged (bkgd.js:385:5)
  // Or in Firefox:
  //   logCaller@moz-extension://extId/common/common.js:53:17
  //   debug@moz-extension://extId/common/common.js:22:12
  //   ensureCursorVisible@moz-extension://extId/view/treeview.js:1753:12
  //   ...
  try {
    const err = new Error();
    //console.debug(`logCaller(${depth})`, err.stack);
    let match, fn, script, junk;
    if (isFirefox) {
      // funcName@moz-extension://extId/dir/file.js:123:45
      const line = err.stack.split('\n')[3 + depth];
      if (line)
        [match, fn, script] = line.match(/(.*)@.*:\/\/[^\/]+(\/.*)/);
    }
    else {  // Chrome
      // at async Class.funcName (ext://extId/file.js:123:45)
      // at async Class.funcName (/file.js:123:45)
      // at ext://extId/file.js:123:45
      // at /file.js:123:45
      const line = err.stack.split('\n')[4 + depth];
      if (line) {
        const m = line.match(/at (([^\(]+) \()?(.*:\/\/[^\/]+)?([^\)]+)\)?/);
        fn = m[2];
        script = m[4];
      }
    }
    if (fn || script) {
      fn = fn || '<anonymous>';
      logger(`${fn} ${script}\n${msg}`, ...args);
    }
    else logger(msg, ...args);
  } catch (err) {
    console.warn(err);
    logger(msg, ...args);
  }
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
  if ('bkgd_ping' !== name) debug(1, `emit(${name})`, args);
  // abort if we're the Bkgd script and there are no receivers
  if (emit.isBkgd && (0 === emit.bkgd.ports.length)) {
    debug(1, 'emit(bkgd): no receivers');
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
        debug(1, `emit(${name}) response:`, response);
    } catch (error) {
      log(1, `emit(${name}) error, try #${tryNum}`, error, args);
      tryNum ++;
      await new Promise(r => setTimeout(r, 50));  // wait 50ms
    }
  }
  if (tryNum >= maxTries) {
    // TODO: this is probably a serious error,
    // and should be escalated more than just a console log
    // (like, expose it in the UI somehow)
    error(1, `emit(${name}) exceeded maximum retries`, name, args);
  }
  const endTime = performance.now();
  if ('bkgd_ping' !== name)
    debug(1, `emit(${name}) elapsed: ${endTime - startTime} ms`);
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

