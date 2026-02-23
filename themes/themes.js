// themes/themes.js: code for loading and managing css themes
// Copyright (C) 2026 Selene ToyKeeper
// SPDX-License-Identifier: AGPL-3.0-or-later

"use strict";
import { api } from '/api.js';
import {
  log, debug, warn, error
} from '/common/common.js';

export const themes = {
  'TK Night': ['tk', 'tk-night'],
  'TK Day': ['tk', 'tk-day']
};

export class ThemedPage {

  constructor (...pagePaths) {
    this.$doc = document;
    this.pagePaths = pagePaths;
    this.defaultThemeName = 'TK Night';
    this.themeName = this.defaultThemeName;
  }

  init () {
    this.initElements();
    this.updateTheme();
    this.updateStyleOptions();
    this.updateUserStyles();
    this.initStorageObserver();
  }

  initElements () {
    const doc = this.$doc;
    const head = doc.head;

    // mark body as "focused" so a scrollbar will appear
    doc.body.classList.add('focused');

    // load stylesheets
    const baseName = themes[this.themeName][0];
    const variantName = themes[this.themeName][1];

    // <link id="theme-base" rel="stylesheet" type="text/css" href="/themes/tk.css" />
    const $themeBase = document.createElement('link');
    $themeBase.rel = 'stylesheet'; $themeBase.type = 'text/css';
    $themeBase.id = 'theme-base';
    $themeBase.href = `/themes/${baseName}.css`;
    head.appendChild($themeBase);
    this.$themeBase = $themeBase;

    // <link id="theme-variant" rel="stylesheet" type="text/css" href="/themes/tk-night.css"/>
    const $themeVariant = document.createElement('link');
    $themeVariant.rel = 'stylesheet'; $themeVariant.type = 'text/css';
    $themeVariant.id = 'theme-variant';
    $themeVariant.href = `/themes/${variantName}.css`;
    head.appendChild($themeVariant);
    this.$themeVariant = $themeVariant;

    // <link rel="stylesheet" type="text/css" href="/dir/page.css"/>
    for (const pagePath of this.pagePaths) {
      const $pageCss = document.createElement('link');
      $pageCss.rel = 'stylesheet'; $pageCss.type = 'text/css';
      $pageCss.href = `${pagePath}.css`;
      head.appendChild($pageCss);
      //this.$pageCss = $pageCss;
    }

    // <style id="style-options" type="text/css"></style>
    const $styleOptions = document.createElement('style');
    $styleOptions.id = 'style-options';
    $styleOptions.type = 'text/css';
    head.appendChild($styleOptions);
    this.$styleOptions = $styleOptions;

    // <style id="user-styles" type="text/css"></style>
    const $userStyles = document.createElement('style');
    $userStyles.id = 'user-styles';
    $userStyles.type = 'text/css';
    head.appendChild($userStyles);
    this.$userStyles = $userStyles;

    this.updateTheme(this.$themeBase, this.$themeVariant);
  }

  async updateTheme ($base, $variant) {
    const data = await api.storage.local.get('theme');
    if (data.theme && themes[data.theme]) {
      this.themeName = data.theme;
      const theme = themes[data.theme];
      this.$themeBase.href = `/themes/${theme[0]}.css`;
      this.$themeVariant.href = `/themes/${theme[1]}.css`;
    }
  }

  async updateStyleOptions () {
    let styleText = '';
    let data;
    // '+' marker drawn before expanded rows?
    data = await api.storage.local.get({ 'expandedRowPrefix': true });
    let expandedRowPrefix = '';
    if (data.expandedRowPrefix) {
      styleText = styleText
        + "\n.expanded.row::before {"
        + `\n  content: "+";`
        + '\n  margin-left: -2px;'
        + '\n}';
    }
    //debug(`ThemedPage.updateStyleOptions()`, data);
    // apply the changes
    this.$styleOptions.textContent = styleText;
  }

  updateUserStyles () {
  }

  initStorageObserver () {
    api.storage.onChanged.addListener( this.storageObserver.bind(this) );
  }

  async storageObserver (changes) {
    debug(`ThemedPage.storageObserver()`, changes);
    if (changes.theme) {
      this.updateTheme();
    }
    if (changes.expandedRowPrefix) {
      this.updateStyleOptions();
    }
  }

}

