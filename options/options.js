// options/options.js: options page script
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: AGPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import { log, warn, debug, emit } from '/common/common.js';
import { ThemedPage } from '/themes/themes.js';
import { Config } from '/common/config.js';

log('options.js running');

class OptionsPage extends ThemedPage {

  constructor () {
    super(
      '/docs/docs',
      '/options/options'
    );
    this.$doc = document;
    this.cfgDefaults = {
      clientId: null,
      // backups
      humanFriendlyBackups: false,
      localBackupInterval: null,
      // theme
      theme: 'TK Night',
      expandedRowPrefix: false,
      alwaysShowNodeStats: true,
      wasLoadedNodeStats: true,
      showFavicons: true,
      hideTreeLines: false,
      hideCursorTreeLines: false,
      hideWindowTreeLines: true,
      fontFamily: '',
      indentMargin: '',
      indentMarginWindow: '',
      indentPadding: '',
      indentPaddingWindow: '',
      expandedBranchBottomPadding: '',
      leafToBranchSpacing: '',
      windowTopLevelNodeSpacing: '',
      detailsBoxHeight: '',
      detailsBoxHeightNotesOnly: '',
      userStyles: '',
      // TreeView behavior
      cursorFollowsActiveTab: true,
      activeTabExpandsItsParents: true,
      pinnedTabsOpenNewTabsPinnedToo: false,
      convertFromWindowWhenDroppedIntoWindow: true,
      hideTopButtonsDuringSearch: false,
      hideCollapsedTabs: false,
      loadExpandedBranchStyle: 'ask',
      loadCollapsedBranchStyle: 'ask',
      unloadExpandedBranchStyle: 'ask',
      unloadCollapsedBranchStyle: 'ask',
      deleteExpandedBranchStyle: 'ask',
    };
  }

  async init () {
    await super.init();

    this.initSessionRestoreForm();

    this.options = [
      new Option(this, {
        cfgKey: 'clientId',
        inputType: 'line',
        fromStr: this.saveClientId,
        debounceTime: 3000,
      }),

      // theme options
      new Option(this, {
        cfgKey: 'theme',
        inputType: 'select',
      }),
      new Option(this, {
        cfgKey: 'expandedRowPrefix',
        inputType: 'checkbox',
      }),
      new Option(this, {
        cfgKey: 'alwaysShowNodeStats',
        inputType: 'checkbox',
      }),
      new Option(this, {
        cfgKey: 'wasLoadedNodeStats',
        inputType: 'checkbox',
      }),
      new Option(this, {
        cfgKey: 'hideTreeLines',
        inputType: 'checkbox',
      }),
      new Option(this, {
        cfgKey: 'hideCursorTreeLines',
        inputType: 'checkbox',
      }),
      new Option(this, {
        cfgKey: 'hideWindowTreeLines',
        inputType: 'checkbox',
      }),
      new Option(this, {
        cfgKey: 'fontFamily',
        inputType: 'line',
        debounceTime: 2000,
      }),
      new Option(this, {
        cfgKey: 'indentMargin',
        inputType: 'line',
        debounceTime: 2000,
      }),
      new Option(this, {
        cfgKey: 'indentMarginWindow',
        inputType: 'line',
        debounceTime: 2000,
      }),
      new Option(this, {
        cfgKey: 'indentPadding',
        inputType: 'line',
        debounceTime: 2000,
      }),
      new Option(this, {
        cfgKey: 'indentPaddingWindow',
        inputType: 'line',
        debounceTime: 2000,
      }),
      new Option(this, {
        cfgKey: 'expandedBranchBottomPadding',
        inputType: 'line',
        debounceTime: 2000,
      }),
      new Option(this, {
        cfgKey: 'leafToBranchSpacing',
        inputType: 'line',
        debounceTime: 2000,
      }),
      new Option(this, {
        cfgKey: 'windowTopLevelNodeSpacing',
        inputType: 'line',
        debounceTime: 2000,
      }),
      new Option(this, {
        cfgKey: 'detailsBoxHeight',
        inputType: 'line',
        debounceTime: 2000,
      }),
      new Option(this, {
        cfgKey: 'detailsBoxHeightNotesOnly',
        inputType: 'line',
        debounceTime: 2000,
      }),
      new Option(this, {
        cfgKey: 'userStyles',
        inputType: 'text',
        debounceTime: 2000,
      }),

      // TreeView behavior
      new Option(this, {
        cfgKey: 'cursorFollowsActiveTab',
        inputType: 'checkbox',
      }),
      new Option(this, {
        cfgKey: 'activeTabExpandsItsParents',
        inputType: 'checkbox',
      }),
      new Option(this, {
        cfgKey: 'pinnedTabsOpenNewTabsPinnedToo',
        inputType: 'checkbox',
      }),
      new Option(this, {
        cfgKey: 'convertFromWindowWhenDroppedIntoWindow',
        inputType: 'checkbox',
      }),
      new Option(this, {
        cfgKey: 'hideTopButtonsDuringSearch',
        inputType: 'checkbox',
      }),
      new Option(this, {
        cfgKey: 'loadCollapsedBranchStyle',
        inputType: 'select',
      }),
      new Option(this, {
        cfgKey: 'loadExpandedBranchStyle',
        inputType: 'select',
      }),
      new Option(this, {
        cfgKey: 'unloadCollapsedBranchStyle',
        inputType: 'select',
      }),
      new Option(this, {
        cfgKey: 'unloadExpandedBranchStyle',
        inputType: 'select',
      }),
      new Option(this, {
        cfgKey: 'deleteExpandedBranchStyle',
        inputType: 'select',
      }),

      // backups
      new Option(this, {
        cfgKey: 'humanFriendlyBackups',
        inputType: 'checkbox',
      }),
      new Option(this, {
        cfgKey: 'localBackupInterval',
        elementId: 'localBackupHours',
        inputType: 'number',
        toStr: (x) => x / 60,
        fromStr: (x) => { return this.parseLocalBackupInterval(x); },
        debounceTime: 3000,
        }),
    ];

    if (isFirefox) {
      this.options.push(
        new Option(this, {
          cfgKey: 'hideCollapsedTabs',
          inputType: 'checkbox',
        })
      );
    } else {
      this.greyOut('hideCollapsedTabs');
    }

    // favicons come from Chromium's _favicon cache, so the option is
    // Chrome-only; grey it out elsewhere
    if (isChrome) {
      this.options.push(
        new Option(this, {
          cfgKey: 'showFavicons',
          inputType: 'checkbox',
        })
      );
    } else {
      this.greyOut('showFavicons');
    }

    for (const option of this.options) {
      option.init();
    }
  }

  saveClientId (value) {
    let clientId = value;
    if (! clientId) return;

    // FIXME: strip everything except letters and numbers from ID

    return clientId;
  }

  parseLocalBackupInterval (value) {
    // input: hours (string)
    // output: minutes (number) or undefined (if invalid)
    // range: 0 to 1000 hours (about 41 days)

    const hours = parseFloat(value);

    // validate the input
    if (isNaN(hours) || hours < 0 || hours > 1000) {
      warn('User entered invalid data into localBackupHours input');
      return;
    }

    return hours * 60;
  }

  initSessionRestoreForm () {
    const doc = this.$doc;
    // generate an onClicked handler
    function fileUploadHandler($id, signalName) {
      function onClicked () {
        log(`${$id}-button clicked`);
        const $button = doc.getElementById(`${$id}-button`);
        const fileInput = doc.getElementById(`${$id}-input`);
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
    doc.getElementById(`${base}-button`).addEventListener("click",
      importBackupButtonClicked);

    // handle tabs-outliner imports
    base = 'tabs-outliner-file';
    const tabsOutlinerButtonClicked = fileUploadHandler(
      base, 'bkgd_importTabsOutliner');
    doc.getElementById(`${base}-button`).addEventListener("click",
      tabsOutlinerButtonClicked);

  }

  greyOut (elementId) {
    const $elem = this.$doc.getElementById(elementId);
    if (! $elem) return warn(`No such page element: ${elementId}`);
    $elem.disabled = true;
    let $grey = $elem.parentElement;
    if (! $grey) $grey = $elem;
    $grey.classList.add('greyed-out');
  }

}

class Option {
  constructor (page, args) {
    this.page = page;
    this.cfg = page.cfg;
    this.cfgKey = args.cfgKey;
    if (undefined !== args.elementId) this.elementId = args.elementId;
    else this.elementId = this.cfgKey;
    this.inputType = args.inputType;
    this.toStr = args.toStr;  // convert to string for display
    this.fromStr = args.fromStr;  // process user-submitted values
    this.debounceTime = args.debounceTime;
    this.debounceTimer = null;
  }

  init () {
    const doc = this.page.$doc;
    const cfg = this.cfg;
    const $elem = doc.getElementById(this.elementId);
    if (! $elem) return error(`No such page element: ${this.elementId}`);
    this.$elem = $elem;

    debug(`${this.inputType}: ${this.cfgKey} = ${cfg[this.cfgKey]}`);

    // convert saved value to a string for display
    let valueStr = cfg[this.cfgKey];
    if (this.toStr) valueStr = this.toStr(valueStr);

    this.setValue(valueStr);

    // save changes when relevant event fires
    let eventName = 'input';
    if ('checkbox' === this.inputType) eventName = 'click';
    else if ('select' === this.inputType) eventName = 'change';

    $elem.addEventListener(eventName, (event) => {
      if (! this.debounceTime) {
        this.parseAndSave();
      } else {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        // visually mark it as unsaved until the timer expires
        this.$elem.classList.add('unsaved');
        this.debounceTimer = setTimeout(() => {
          this.parseAndSave();
        }, this.debounceTime);
      }
    });
  }

  getValue () {
    if (['line', 'text', 'number', 'select'].includes(this.inputType)) {
      return this.$elem.value;
    }
    else if ('checkbox' === this.inputType) {
      return this.$elem.checked;
    }
  }

  setValue (value) {
    if (['line', 'text', 'number', 'select'].includes(this.inputType)) {
      this.$elem.value = value;
    }
    else if ('checkbox' === this.inputType) {
      this.$elem.checked = value;
    }
  }

  parseAndSave () {
    const rawValue = this.getValue();
    let value = rawValue;
    if (this.fromStr) value = this.fromStr(value);
    if (undefined !== value) {
      this.cfg.set(this.cfgKey, value);

      // update widget with sanitized value
      let valueStr = value;
      if (this.toStr) valueStr = this.toStr(valueStr);
      if (valueStr !== rawValue) this.setValue(valueStr);

      // remove 'unsaved' status
      this.$elem.classList.remove('unsaved');
    }
  }
}

// pre-populate form with saved user options,
// and store new values when the user hits "save"
document.addEventListener('DOMContentLoaded', () => {
  const optionsPage = new OptionsPage();
  optionsPage.init();
  log('options.js loaded');
});

