// view/view.js: outline view script
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: AGPL-3.0-or-later

import { api, isChrome, isFirefox } from '/api.js';

import { log } from '/common/common.js';
import { TreeView } from './treeview.js';

log('/view/view.js running');


function init() {
  const tree = new TreeView();
  tree.init();
  return tree;
}


// init when page is ready
document.addEventListener('DOMContentLoaded', () => {
  const tree = init();
  const searchInput = document.getElementById('search-input');
  
  // Handle input changes (typing in the search box)
  searchInput.addEventListener('input', (event) => {
    tree.handleSearch(event.target.value);
  });
  
  // Handle key events in the search input
  searchInput.addEventListener('keyup', (event) => {
    // Clear search when Escape is pressed
    if (event.key === 'Escape') {
      searchInput.value = '';
      tree.handleSearch('');
      searchInput.blur(); // Remove focus from search input
    }
  });
  
  // Focus the search input when Ctrl+F or / is pressed
  document.addEventListener('keydown', (event) => {
    // Don't trigger if user is already typing in an input
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
      return;
    }
    
    // Ctrl+F or / to focus search
    if ((event.ctrlKey && event.key === 'f') || event.key === '/') {
      event.preventDefault();
      searchInput.focus();
      searchInput.select(); // Select any existing text
    }
  });
});

