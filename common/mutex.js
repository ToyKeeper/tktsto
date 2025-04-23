// common/mutex.js: Mutex class
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: GPL-3.0-or-later

"use strict";

// simple mutex class
// Usage:
// const mutex = new Mutex();
// async function foo() {
//   const unlock = await mutex.lock();
//   try { await whatever(); }
//   finally { unlock(); }
// }

export class Mutex {
  constructor () {
    this._locking = Promise.resolve();
  }

  lock () {
    let unlockNext;
    let willLock = new Promise(resolve => unlockNext = () => { resolve(); });
    let willUnlock = this._locking.then(() => unlockNext);
    this._locking = this._locking.then(() => willLock);
    return willUnlock;
  }
}

