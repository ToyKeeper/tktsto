// common/config.js: Config class
// Copyright (C) 2026 Selene ToyKeeper
// SPDX-License-Identifier: AGPL-3.0-or-later

"use strict";
import { api } from '/api.js';

import {
  log, debug, warn, error, emit
} from '/common/common.js';


// Config object
// Example usage:
// this.cfg = new Config();
// this.cfg.init({
//   'someOption': true,
//   'otherOption': 'green',
//   'thirdOption': 5.7,
// });
// if (this.cfg.someOption) { do stuff; }
// element.style.color = this.cfg.otherOption;
// this.cfg.watch('thirdOption', (key, oldVal, newVal) => {
//   do something with new value for 'thirdOption';
// });
// Items like `cfg.someOption` have their value updated automatically,
// so no watcher is needed if you just check the value on demand,
// and don't need to do anything special when it changes.
export class Config {

  constructor () {
    // default value for each key
    this.defaults = {};
    // separate list of actual config keys,
    // so we can distinguish which ones are config keys
    // and which ones are class members
    // Map<key, true>
    this.keys = new Map();
    // functions to call when a value changes
    // Map<key, Array<{callback, delay}>>
    this.watchers = new Map();
  }

  async init (defaults) {
    this.defaults = defaults;
    this.initStorageObserver();
    await this.getMany(this.defaults);
  }

  initStorageObserver () {
    api.storage.onChanged.addListener( this.storageObserver.bind(this) );
  }

  storageObserver (changes, area) {
    //debug(`${area} changes:`, changes);
    if ('local' !== area) return;

    for (const [key, { newValue, oldValue }] of Object.entries(changes)) {
      // update our cached copy
      if (this.keys.has(key)) {
        debug(`${key}: ${oldValue} -> ${newValue}`);
        this[key] = newValue;
      }

      // notify observers, if there are any
      if (! this.watchers.has(key)) continue;
      const watchers = this.watchers.get(key);
      // debounce if any watcher has a delay
      const maxDelay = Math.max(...watchers.map(w => w.delay));
      if (maxDelay > 0) {
        // clear old timer
        if (this.debounceTimers.has(key)) {
          clearTimeout(this.debounceTimers.get(key));
        }

        const timer = setTimeout(() => {
          this.debounceTimers.delete(key);
          this.callWatchers(key, newValue, oldValue);
        }, maxDelay);

        this.debounceTimers.set(key, timer);
      }
      else { this.callWatchers(key, newValue, oldValue); }
    }
  }

  // add a watcher to the pile
  watch (key, callback, delay = 0) {
    if (! this.watchers.has(key)) { this.watchers.set(key, []); }
    this.watchers.get(key).push({ callback, delay });
  }

  // activate the watchers, call the callbacks
  callWatchers (key, newValue, oldValue) {
    const watchers = this.watchers.get(key);
    if (! watchers) return;

    for (const { callback } of watchers) {
      try {
        callback(key, newValue, oldValue);
      } catch (err) {
        warn(`Config watcher for "${key}" failed:`, err);
      }
    }
  }

  async getMany (vars) {
    const items = await api.storage.local.get(vars);
    for (const [key, value] of Object.entries(items)) {
      this.keys.set(key, true);
      this[key] = value;
      debug(`${key} => ${value}`);
    }
  }

  async get (key, defaultValue) {
    let value = defaultValue;
    if (undefined === value) value = this.defaults[key];
    const result = await api.storage.local.get(key);
    if (undefined !== result[key]) value = result[key];
    this.keys.set(key, true);
    this[key] = value;
    return value;
  }

  async set (key, value) {
    const vars = {};
    vars[key] = value;
    this.keys.set(key, true);
    this[key] = value;
    return await api.storage.local.set(vars);
  }

}

