// id-generator.js: generate unique IDs
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: GPL-3.0-or-later

// generates IDs in the form "abcdefghij-123-name"
// where the first part is a timestamp (ms resolution) (base32)
// ... 2nd part is a sub-ms sequence counter (base32) (omitted if zero)
// ... and 3rd part is an arbitrary text string like a hostname
// IDs can be easily sorted by creation time
// allows a single user to generate many unique IDs per ms per host
// with no collision and no need for coordination between hosts
//
// recommended settings: 9 date digits, 2 sequence digits
// (allows over 1000 years of IDs, with 1024 IDs per millisecond per host)
// (handles every millisecond until the date 3084-12-12)
// (8 date digits ended at 2004-11-03)
// (9 date digits lasts until 3084-12-12)
// (10 date digits lasts until 37648-05-06)
//
// the seq digits are probably unnecessary, but might be needed for specific
// cases like importing an entire tree, when it could potentially cause more
// than one transaction per ms and each transaction needs a unique ID

"use strict";

import { base32encode } from '/common/base32.js';

export class IDGenerator {

  constructor (name, dateDigits, seqDigits) {
    this.name = name;
    this.dateDigits = 9;
    if (dateDigits) this.dateDigits = dateDigits;  // max 10 digits
    this.seqDigits = 2;
    if (seqDigits) this.seqDigits = seqDigits;  // max 10 digits
    this.maxSeq = 2 ** (5 * this.seqDigits);
    this.date = 0;  // last timestamp encountered
    this.seq = 0;  // sequential counter within a single timestamp
  }

  newID (when) {
    let now = when;
    if (when === undefined) { now = Date.now(); }
    // if this timestamp has already been used,
    // increment the sequence counter instead
    if (now === this.date) { this.seq ++; }
    // new timestamp, start with sequence counter of zero
    else { this.seq = 0; }
    // if we exceeded the maximum IDs per timestamp...
    if (this.seq >= this.maxSeq) {
      // TODO: wait for a new timestamp maybe?  throw an error?
      throw `exceeded maximum IDs for timestamp ${now}`;
    }
    this.date = now;
    // generate and return the ID string
    const d32 = base32encode(now, this.dateDigits);
    let s32 = '';  // omit sequence digits if zero
    if (this.seq > 0) { s32 = base32encode(this.seq, this.seqDigits); }
    return d32 + '-' + s32 + '-' + this.name;
  }

}

