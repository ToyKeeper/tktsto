// options/options.js: options page script
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: GPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import { log, warn, debug, emit } from '/common/common.js';

log('options.js running');

function initClientIdForm () {
  const form = document.getElementById('options-form');
  const clientIdInput = document.getElementById('client-id');

  // load saved client ID
  api.storage.local.get('clientId').then((result) => {
    if (result.clientId) {
      clientIdInput.value = result.clientId;
    }
  });

  // save on form submit
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const clientId = clientIdInput.value;
    // FIXME: strip everything except letters and numbers from ID
    api.storage.local.set({ clientId }).then(() => {
      alert('Saved!');
    });
    api.runtime.sendMessage({
      'msg':'bkgd_setClientId',
      'clientId': clientId
    });
  });
}

function initBackupsForm () {
  // humanFriendlyBackups checkbox
  const $humanFriendlyBackups = document.getElementById('humanFriendlyBackups');
  api.storage.local.get('humanFriendlyBackups').then((result) => {
    if (undefined !== result.humanFriendlyBackups) {
      $humanFriendlyBackups.checked = result.humanFriendlyBackups;
    }
  });
  // save on click
  $humanFriendlyBackups.addEventListener('click', (event) => {
    //debug(`humanFriendlyBackups: ${$humanFriendlyBackups.checked}`, $humanFriendlyBackups);
    const humanFriendlyBackups = $humanFriendlyBackups.checked;
    api.storage.local.set({ humanFriendlyBackups });
  });
}

function initSessionRestoreForm () {
  // generate an onClicked handler
  function fileUploadHandler($id, signalName) {
    function onClicked () {
      log(`${$id}-button clicked`);
      const $button = document.getElementById(`${$id}-button`);
      const fileInput = document.getElementById(`${$id}-input`);
      const $buttonOrigText = $button.innerText;
      if (fileInput.files.length === 0) {
        alert("Please select a file first.");
        return;
      }

      //const file = fileInput.files[0]; {
      for (const file of fileInput.files) {
        log(`loading ${file.name} (${file.type}) (${file.size} bytes) ...`);
        const reader = new FileReader();

        if ('application/json' !== file.type) {
          alert(`Unsupported file type "${file.type}", must be "application/json".`);
          return;
        }

        reader.onerror = function (event) {
          err = 'file load failed';
          warn(err, event);
          alert(err);
        }

        reader.onload = function (event) {
          log(`${$id} loaded`);
          let fileContent = event.target.result;
          // try parsing as json
          try {
            const jsonData = JSON.parse(fileContent);
            // send to bkgd
            emit(signalName,
              { data: jsonData, filename: file.name })
              .then((response) => {
                log(`${response.total} nodes imported from: "${file.name}"`);
                $button.innerText = $buttonOrigText;
                alert(`${response.total} nodes imported from: "${file.name}"`);
              });
          } catch (error) {
            warn("Error parsing JSON:", error);
            $button.innerText = $buttonOrigText;
            alert(`The file is not valid JSON: "${file.name}"`);
          }
        };

        // read the file; it'll trigger reader.onload when it's ready
        log(`loading ${file.name} now ...`);
        reader.readAsText(file);
        $button.innerText = '... Loading ...';
      }
    }
    return onClicked;
  }

  let base;

  // handle tktsto imports
  base = 'tktsto-file';
  const importBackupButtonClicked = fileUploadHandler(
    base, 'bkgd_importBackupFile');
  document.getElementById(`${base}-button`).addEventListener("click",
    importBackupButtonClicked);

  // handle tabs-outliner imports
  base = 'tabs-outliner-file';
  const tabsOutlinerButtonClicked = fileUploadHandler(
    base, 'bkgd_importTabsOutliner');
  document.getElementById(`${base}-button`).addEventListener("click",
    tabsOutlinerButtonClicked);

}

// pre-populate form with saved user options,
// and store new values when the user hits "save"
document.addEventListener('DOMContentLoaded', () => {
  log('options.js loaded');
  initClientIdForm();
  initBackupsForm();
  initSessionRestoreForm();
});

