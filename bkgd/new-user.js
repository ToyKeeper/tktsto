// bkgd/new-user.js: new user tutorial factory
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: AGPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox, isZenBrowser } from '/api.js';

import { keyBindings } from '/view/treeview.js';


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
  const helpInfo = { label: 'Welcome, new user!', nodes: [
    { label: 'Click in this panel to focus it' },
    { label: 'Then use arrow keys to move the cursor' },
    { label: '... and Space to expand branches', expanded: false, nodes: [
      { label: 'Just like that!' },
      { label: 'Or click the left end of a row' },
    ]},
    { label: 'Longer notes can be seen below',
      note: 'Right here.  Be sure to check this area any time you see an "attachment" icon on the cursor row.' },
    { label: "Here are the other key bindings", expanded: false,
      note: "Don't worry about the details yet, these are here for later reference.",
      nodes: [ ...keymapInfo ]},
    { label: 'Green text is a "label"',
      note: 'To edit it, hover the mouse over a row and click the "E" button in the "hover menu".  Or press the "E" key on the keyboard.\n\nTry editing thsis to fffix my typooooz.'
    },
    { title: 'Grey text is an unloaded tab', loaded: false,
      note: 'To open it, double click it or press Enter while the cursor is on it.\n\nThink of it like a "bookmark" which knows which window it goes in, and where it belongs in the tab bar.  It uses no RAM or CPU while it is unloaded.',
      url: '/docs/tutorial-grey-text.html' },
    { label: 'Tutorial Window', type: 'window', loaded: false,
      note: 'This is a saved window.  Double click it to open it!',
      expanded: true,
      nodes: [
        { title: 'Pink tabs auto-open when the saved window is restored', loaded: false,
          wasLoaded: true, url: '/docs/wasloaded-tab.html' },
        { title: 'Grey text is an unloaded tab', loaded: false,
          url: '/docs/tutorial-grey-text.html' },
        { label: 'You may have also noticed...',
          note: `... that you can nest "window" nodes.  This window node is inside of another, and it still works.  It allows you to group related windows together if you want... but you don't have to.` },
      ]},
    { expanded: false,
      title: 'Moving nodes is easy',
      url: '/docs/moving-nodes.html',
      note: 'Open this tab to find out how\n\nYou remember how to open an unloaded tab, right?\n\n... right??' },
    { label: 'Checkboxes', expanded: false,
      title: 'Double click me',
      url: '/docs/checkboxes.html',
      nodes: [
        { label: 'Groceries', checkbox: '%', nodes: [
          { label: 'Unsorted', nodes: [
            { label: 'Ice cream', checkbox: ' ' },
            { label: 'Soup', checkbox: ' ' },
            { label: 'Popsicles', checkbox: ' ' },
            { label: 'Milk', checkbox: ' ' },
            { label: 'Crackers', checkbox: ' ' },
          ]},
          { label: 'Dry / Canned', checkbox: '%', nodes: [
            { label: 'Cereal', checkbox: ' ' },
          ]},
          { label: 'Cold aisle', checkbox: '%', nodes: [
            { label: 'Cheese', checkbox: '!' },
          ]},
          { label: 'Frozen', checkbox: '%', nodes: [
            { label: 'Pizzas', checkbox: ' ' },
          ]},
        ]},
      ]},
    { label: "Be sure to check the",
      title: 'Options',
      url: '/options/options.html',
      note: 'to choose a theme, set your host name, and configure everything else to your liking.' },
    { label: "You're probably ready",
      note: 'to start organizing your REAL tabs and windows now.  As a first step, try giving a name to each of your windows.  Then maybe organize related tabs together, add some category labels, etc.  Tips and tricks are in the full documentation.' },
    { label: "The rest of the documentation...",
      note: '... is in the "Help" button at the bottom of the sidepanel.' },
    { label: `Also if you're REALLY cool, maybe try the "Donate" button`,
      note: `... if you like this free/open-source project and want to ensure it keeps getting updated.\n\n'cause, like, I need food and stuff.\n\nBut I understand if you don't donate; that's cool too.  Times are rough, and not all of us have spare cash.  But I gotta at least ask.\n\nPolitely.\n\nIn the hidden dark nethers of a tutorial you probably didn't even read.  If you got this far, you're already a hoopier frood than most.`,
      title: 'Donate',
      url: 'https://toykeeper.net/tktsto/donate' },
    { label: "Or join the Discord",
      note: 'Where tech-savvy folks chat about how to fight our corporate overlords, share useful tools for productivity, and generally just hang out to talk about whatever.',
      title: 'Discord : TKTSTO',
      url: 'https://toykeeper.net/tktsto/discord' },
    { label: "There's also GitHub",
      note: 'for github-y type stuff.  You know the drill.',
      title: 'GitHub : TKTSTO',
      url: 'https://toykeeper.net/tktsto/' },
    { label: "When you're done with this tutorial...",
      note: '... feel free to delete it.  First collapse it, then press the red "D" button in the hover menu, or type the letter "D".\n\nYou can generate the tutorial again by pressing "?" on the keyboard.\n\nNote: Deleting the branch will also close and delete any tabs or windows remaining inside the tutorial branch.  Move those first if you want to keep anything.' },
  ]};

  // Zen Browser "window sync" mode is insane, turn it off
  if (isZenBrowser) {
    helpInfo.nodes.splice(4, 0,
      {
        label: 'If you use Zen Browser...', expanded: false, nodes: [
          { label: '... you MUST disable Window Sync.',
            note: 'Open a tab to "about:config" and search for "window-sync" and set it as "false", then restart Zen.  Otherwise things will break every time you open a window.'
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
  if (parentNode) destParent = parentNode;
  if (! destParent) destParent = tree.root;
  await addItem(destParent, 0, helpInfo);
}

