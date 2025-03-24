// options/options.js: options page script
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: GPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import { log } from '/common/common.js';

// pre-populate form with saved user options,
// and store new values when the user hits "save"
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('options-form');
  const clientIDInput = document.getElementById('client-id');

  // load saved client ID
  api.storage.local.get('clientID').then((result) => {
    if (result.clientID) {
      clientIDInput.value = result.clientID;
    }
  });

  // save on form submit
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const clientID = clientIDInput.value;
    api.storage.local.set({ clientID }).then(() => {
      alert('Saved!');
    });
    api.runtime.sendMessage({
      'msg':'bkgd_setClientID',
      'clientID': clientID
    });
  });
});

