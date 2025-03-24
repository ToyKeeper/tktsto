// base32.js: simple base32 encode / decode
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: GPL-3.0-or-later

"use strict";

// Note: This only works up to javascript's maximum safe integer value,
// roughly 2**53 (because it uses float64 instead of int64)
// and this is *not* intended for use on arbitrary binary data
// ... and realistically, this shouldn't be used above 2**50
// (because that's the biggest number which fits in 10 digits of base32)

// Crockford's base32
//const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
const ALPHABET_SIZE = ALPHABET.length;

// integer: 0 to 2**50
// numDigits: 1 to 10
export function base32encode(integer, numDigits) {
  let text = "";
  for (; numDigits > 0; numDigits --) {
    let remainder = integer % ALPHABET_SIZE;
    text = ALPHABET.charAt(remainder) + text;
    integer = (integer - remainder) / ALPHABET_SIZE;
  }
  return text;
}

// text: '0' to 'zzzzzzzzzz' with optional leading '0's
export function base32decode(text) {
  let integer = text.split('').reverse()
    .reduce((total, letter, currentIndex) => {
      // TODO: parse upper-case
      const letterNum = ALPHABET.indexOf(letter);
      if (letterNum < 0) {
        throw `base32decode: invalid input "${text}"`;
      }
      return total + (letterNum * Math.pow(ALPHABET_SIZE, currentIndex));
    }, 0);
  return integer;
}

