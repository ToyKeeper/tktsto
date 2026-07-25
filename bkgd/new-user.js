// bkgd/new-user.js: new user tutorial factory
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: AGPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox, isZenBrowser } from '/api.js';
import { keyBindings } from '/view/treeview.js';
import { getMessage } from '/common/i18n.js';


export async function createNewUserTutorialNodes (tree, parentNode) {
  const root = tree.root;
  // build a list of keyBindings
  const keymapInfo = [
  ];
  for (const key of Object.keys(keyBindings)) {
    const value = keyBindings[key];
    if ('none' !== value)
      keymapInfo.push({ label: `${key} : ${value}` });
  }
  // define the help nodes
  const helpInfo = { label: getMessage('tutorial_welcome'), nodes: [
    { label: getMessage('tutorial_click_panel') },
    { label: getMessage('tutorial_arrow_keys') },
    { label: getMessage('tutorial_space_expand'), expanded: false, nodes: [
      { label: getMessage('tutorial_just_like_that') },
      { label: getMessage('tutorial_click_left_row') },
    ]},
    { label: getMessage('tutorial_longer_notes'),
      note: getMessage('tutorial_longer_notes_detail') },
    { label: getMessage('tutorial_key_bindings'), expanded: false,
      note: getMessage('tutorial_key_bindings_detail'),
      nodes: [ ...keymapInfo ]},
    { label: getMessage('tutorial_green_label'),
      note: getMessage('tutorial_green_label_detail')
    },
    { title: getMessage('tutorial_grey_text'), loaded: false,
      note: getMessage('tutorial_grey_text_detail'),
      url: '/docs/tutorial-grey-text.html' },
    { label: getMessage('tutorial_window'), type: 'window', loaded: false,
      note: getMessage('tutorial_window_detail'),
      expanded: true,
      nodes: [
        { title: getMessage('tutorial_pink_tabs'), loaded: false,
          wasLoaded: true, url: '/docs/wasloaded-tab.html' },
        { title: getMessage('tutorial_grey_text'), loaded: false,
          url: '/docs/tutorial-grey-text.html' },
        { label: getMessage('tutorial_nest_windows'),
          note: getMessage('tutorial_nest_windows_detail') },
      ]},
    { expanded: false,
      title: getMessage('tutorial_moving_nodes'),
      url: '/docs/moving-nodes.html',
      note: getMessage('tutorial_moving_nodes_detail') },
    { label: getMessage('tutorial_checkboxes'), expanded: false,
      title: getMessage('hint_clickOrType'),
      url: '/docs/checkboxes.html',
      nodes: [
        { label: getMessage('tutorial_groceries'), checkbox: '%', nodes: [
          { label: getMessage('tutorial_unsorted'), nodes: [
            { label: getMessage('tutorial_ice_cream'), checkbox: ' ' },
            { label: getMessage('tutorial_soup'), checkbox: ' ' },
            { label: getMessage('tutorial_popsicles'), checkbox: ' ' },
            { label: getMessage('tutorial_milk'), checkbox: ' ' },
            { label: getMessage('tutorial_crackers'), checkbox: ' ' },
          ]},
          { label: getMessage('tutorial_dry_canned'), checkbox: '%', nodes: [
            { label: getMessage('tutorial_cereal'), checkbox: ' ' },
          ]},
          { label: getMessage('tutorial_cold_aisle'), checkbox: '%', nodes: [
            { label: getMessage('tutorial_cheese'), checkbox: '!' },
          ]},
          { label: getMessage('tutorial_frozen'), checkbox: '%', nodes: [
            { label: getMessage('tutorial_pizzas'), checkbox: ' ' },
          ]},
        ]},
      ]},
    { label: getMessage('tutorial_check_options'),
      title: getMessage('btn_options'),
      url: '/options/options.html',
      note: getMessage('tutorial_options_detail') },
    { label: getMessage('tutorial_ready'),
      note: getMessage('tutorial_ready_detail') },
    { label: getMessage('tutorial_rest_doc'),
      note: getMessage('tutorial_rest_doc_detail') },
    { label: getMessage('tutorial_donate'),
      note: getMessage('tutorial_donate_detail'),
      title: getMessage('btn_donate'),
      url: 'https://toykeeper.net/tktsto/donate' },
    { label: getMessage('tutorial_discord'),
      note: getMessage('tutorial_discord_detail'),
      title: 'Discord : TKTSTO',
      url: 'https://toykeeper.net/tktsto/discord' },
    { label: getMessage('tutorial_github'),
      note: getMessage('tutorial_github_detail'),
      title: 'GitHub : TKTSTO',
      url: 'https://toykeeper.net/tktsto/' },
    { label: getMessage('tutorial_done'),
      note: getMessage('tutorial_done_detail') },
  ]};

  // Zen Browser "window sync" mode is insane, turn it off
  if (isZenBrowser) {
    helpInfo.nodes.splice(4, 0,
      {
        label: getMessage('tutorial_zen_browser'), expanded: false, nodes: [
          { label: getMessage('tutorial_zen_disable_sync'),
            note: getMessage('tutorial_zen_disable_sync_detail')
          },
          { label: 'Other helpful settings:' },
          { label: 'zen.urlbar.replace-newtab = false' },
          { label: 'zen.glance.enabled = false' },
          { label: "Don't use pinned tabs or essentials" },
          { label: "Don't use spaces" },
          { label: "Don't tear off tabs from Zen sidebar",
            note: "... because Zen's API is broken for this, in ways which are nearly impossible to work around, so it will break."
          },
          { label: "Enable compact mode" },
          { label: "Ctrl-S to hide the Zen sidebar" },
          { label: "Configure extension shortcuts",
            note: 'about:addons -> gear icon -> Manage Extension Shortcuts'
          },
        ]
      }
    );
  }

  async function addItem (parent, index, details) {
    const newNode = await parent.addChild(index, details,
      { reason: 'tutorial' });
    if (details.nodes) {
      let i = 0;
      for (const kid of details.nodes) {
        await addItem(newNode, i, kid);
        i ++;
      }
    }
  }

  let destParent = tree.root.nodes[0];
  let destIndex = 0;
  if (parentNode) destParent = parentNode;
  if (! destParent) destParent = tree.root;
  if ((destParent.nodes.length > 0) && destParent.nodes[0].isPinnedBranch()) {
    // don't move the "Pinned" branch if it exists
    destIndex = 1;
  }
  await addItem(destParent, destIndex, helpInfo);
}
