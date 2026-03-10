// themes/themes.js: code for loading and managing css themes
// Copyright (C) 2026 Selene ToyKeeper
// SPDX-License-Identifier: AGPL-3.0-or-later

"use strict";
import { api } from '/api.js';
import {
  log, debug, warn, error
} from '/common/common.js';
import { Config } from '/common/config.js';

export const themes = {
  'TK Night': ['tk', 'tk-night'],
  'TK Day': ['tk', 'tk-day']
};

export class ThemedPage {

  constructor (...pagePaths) {
    this.$doc = document;
    this.pagePaths = pagePaths;
    this.defaultTheme = 'TK Night';
    this.cfg = new Config();
    this.cfgDefaults = {
      theme: this.defaultTheme,
      expandedRowPrefix: false,
      alwaysShowNodeStats: true,
      hideTreeLines: false,
      hideCursorTreeLines: false,
      hideWindowTreeLines: true,
      fontFamily: '',
      indentMargin: '',
      indentPadding: '',
      indentPaddingWindow: '',
      detailsBoxHeight: '',
      detailsBoxHeightNotesOnly: '',
    };
  }

  async init () {
    await this.cfg.init(this.cfgDefaults);
    this.initElements();
    this.updateTheme();
    this.updateStyleOptions();
    this.updateUserStyles();

    // config watchers
    this.cfg.watch('theme', (key, newVal, oldVal) => {
      this.updateTheme();
    });
    for (const option of [
      'expandedRowPrefix',
      'alwaysShowNodeStats',
      'hideTreeLines',
      'hideCursorTreeLines',
      'hideWindowTreeLines',
      'fontFamily',
      'indentMargin',
      'indentPadding',
      'indentPaddingWindow',
      'detailsBoxHeight',
      'detailsBoxHeightNotesOnly',
    ]) {
      this.cfg.watch(option, (key, newVal, oldVal) => {
        this.updateStyleOptions();
      });
    }
  }

  initElements () {
    const doc = this.$doc;
    const head = doc.head;

    // mark body as "focused" so a scrollbar will appear
    doc.body.classList.add('focused');

    // load stylesheets
    const themeName = this.cfg.theme;
    const baseName = themes[themeName][0];
    const variantName = themes[themeName][1];

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
  }

  async updateTheme () {
    let themeName = this.cfg.theme;
    debug(`theme = ${themeName}`);
    if (! themes[themeName]) {
      warn(`unrecognized theme: ${themeName}`);
      themeName = this.defaultTheme;
    }

    const theme = themes[themeName];
    this.$themeBase.href = `/themes/${theme[0]}.css`;
    this.$themeVariant.href = `/themes/${theme[1]}.css`;
  }

  updateStyleOptions () {
    let styleText = '';
    // '+' marker drawn before expanded rows?
    if (this.cfg.expandedRowPrefix) {
      styleText = styleText
        + "\n.expanded.row::before {"
        + `\n  content: "+";`
        + '\n  margin-left: -2px;'
        + '\n}';
    }
    // show node stats before expanded rows?
    if (this.cfg.alwaysShowNodeStats) {
      styleText = styleText
        + "\n#tree-view .expanded .node-stats {"
        + '\n  display: unset;'
        + '\n}';
    }
    // hide tree lines outside of cursor node
    if (this.cfg.hideTreeLines) {
      styleText = styleText
        + "\n.nodes {"
        + '\n  border-left: 2px solid transparent;'
        + '\n}';
    }
    // hide tree lines inside of cursor node
    if (this.cfg.hideCursorTreeLines) {
      styleText = styleText
        + "\n.cursor.node .nodes {"
        + '\n  border-left-color: transparent;'
        + '\n}';
    }
    // hide tree lines for first children of window nodes
    if (this.cfg.hideWindowTreeLines) {
      styleText = styleText
        + "\n.window > .nodes, .cursor.window > .nodes {"
        + '\n  border-left-color: transparent;'
        + '\n}';
    }
    // CSS variables
    styleText += '\n:root {';
    for (const [opt, varName] of [
      ['fontFamily', '--font-family'],
      ['indentMargin', '--indent-margin'],
      ['indentPadding', '--indent-padding'],
      ['indentPaddingWindow', '--indent-padding-window'],
      ['detailsBoxHeight', '--details-box-height'],
      ['detailsBoxHeightNotesOnly', '--details-box-height-notes-only'],
    ]) {
      const val = this.cfg[opt];
      if (val) { styleText += `\n  ${varName}: ${val};`; }
    }
    styleText += '\n}';
    //debug(`ThemedPage.updateStyleOptions()`, data);
    // apply the changes
    //debug('styleOptions:', styleText);
    this.$styleOptions.textContent = styleText;
  }

  updateUserStyles () {
    // TODO: add support for user styles
    //   (a text area in the config options where user CSS can go)
  }

}

