// docs/docs.js: code needed by documentation pages
// Copyright (C) 2025-2026 Selene ToyKeeper
// SPDX-License-Identifier: AGPL-3.0-or-later

"use strict";
console.log('docs.js loading...');
import { api, isChrome, isFirefox } from '/api.js';

import {
  log, debug, warn, error,
  emit,
  updateTheme
} from '/common/common.js';
import { TreeView } from '/view/treeview.js';


class Docs {

  constructor () {
    this.$doc = document;
  }

  init () {
    emit.disabled = true;  // never emit events
    this.initElements();
    this.renderAllTrees();
  }

  initElements () {
    const doc = this.$doc;
    const head = doc.head;

    // mark body as "focused" so a scrollbar will appear
    doc.body.classList.add('focused');

    // load stylesheets
    const themeBase = document.createElement('link');
    themeBase.rel = 'stylesheet'; themeBase.type = 'text/css';
    themeBase.id = 'theme-base'; themeBase.href = '/themes/tk.css';
    head.appendChild(themeBase);
    this.$themeBase = themeBase;

    const themeVariant = document.createElement('link');
    themeVariant.rel = 'stylesheet'; themeVariant.type = 'text/css';
    themeVariant.id = 'theme-variant'; themeVariant.href = '/themes/tk-night.css';
    head.appendChild(themeVariant);
    this.$themeVariant = themeVariant;

    const docsCss = document.createElement('link');
    docsCss.rel = 'stylesheet'; docsCss.type = 'text/css';
    docsCss.href = './docs.css';
    head.appendChild(docsCss);
    this.$docsCss = docsCss;

    const styleOptions = document.createElement('link');
    styleOptions.rel = 'stylesheet'; styleOptions.type = 'text/css';
    styleOptions.id = 'style-options';
    head.appendChild(styleOptions);
    this.$styleOptions = styleOptions;

    const userStyles = document.createElement('link');
    userStyles.rel = 'stylesheet'; userStyles.type = 'text/css';
    userStyles.id = 'user-styles';
    head.appendChild(userStyles);
    this.$userStyles = userStyles;

    updateTheme(this.$themeBase, this.$themeVariant);
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
    dtv.createRootElement($container);
    await dtv.fromObjects(tree);
    dtv.$renderWholeTree();
  }

}


export class DocTreeView extends TreeView {

  constructor (opts) {
    super(TreeView);
    // never emit events, and don't listen for events either
    emit.disabled = true;
    this.isInert = true;
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

