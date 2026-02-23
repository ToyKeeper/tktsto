// docs/docs.js: code needed by documentation pages
// Copyright (C) 2025-2026 Selene ToyKeeper
// SPDX-License-Identifier: AGPL-3.0-or-later

"use strict";
console.log('docs.js loading...');
import { api, isChrome, isFirefox } from '/api.js';

import {
  emit, log, debug, warn, error
} from '/common/common.js';
import { ThemedPage } from '/themes/themes.js';
import { TreeView } from '/view/treeview.js';


class Docs extends ThemedPage {

  constructor () {
    super('/docs/docs');
    this.$doc = document;
  }

  init () {
    super.init();
    emit.disabled = true;  // never emit events
    this.renderAllTrees();
  }

  async renderAllTrees () {
    const blocks = document.querySelectorAll(
      'script.tree[type="application/json"]');

    for (const block of blocks) {
      let data;

      try {
        data = JSON.parse(block.textContent);
      } catch (err) {
        error("Invalid JSON in tree block:", err);
        return;
      }

      const $container = document.createElement("div");
      $container.className = "tree-view";
      $container.id = "tree-view";

      block.insertAdjacentElement("afterend", $container);

      await this.renderTree(data.opts, data.tree, $container);
    }
  }

  async renderTree (opts, tree, $container) {
    const dtv = new DocTreeView(opts);
    dtv.init($container);
    await dtv.fromObjects(tree);
    dtv.$renderWholeTree();
  }

}


export class DocTreeView extends TreeView {

  constructor (opts) {
    super({ isInert: true });
    // never emit events, and don't listen for events either
    emit.disabled = true;
  }

  init ($container) {
    super.init();
    this.createRootElement($container);
  }

  async fromObjects (root) {
    const _this = this;
    async function addItem (parent, index, details, first = false) {
      let newNode;
      if (first) {
        newNode = _this.root;
        //await newNode.setTabFields(details, { reason: 'docs' });
        for (const [key, value] of Object.entries(details)) {
          if ('nodes' !== key) newNode[key] = value;
        }
        //log(`docs.addItem(${newNode.label}):`, newNode);
      }
      else {
        newNode = await parent.addChild(index, details,
          { reason: 'docs' });
      }
      if (details.cursor) { newNode.addCursor(); }
      if (details.nodes) {
        let i = 0;
        for (const kid of details.nodes) {
          await addItem(newNode, i, kid);
          i ++;
        }
      }
    }

    await addItem(this.root, 0, root, true);
  }

  createRootElement ($container) {
    const doc = document;
    if ($container) this.$ = $container;
    this.$treeRoot = doc.createElement('ul');
    this.$treeRoot.className = 'nodes root-nodes';
    this.$.appendChild(this.$treeRoot);
  }

}


// init when page is ready
document.addEventListener('DOMContentLoaded', () => {
  const docs = new Docs();
  docs.init();
});

console.log('docs.js loaded');

