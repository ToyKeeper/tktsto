// view/view.js: outline view script
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: GPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import { log } from '/common/common.js';
import { TreeView } from './treeview.js';

log('/view/view.js running');


/*
document.addEventListener('DOMContentLoaded', () => {
  const treediv = document.getElementById('tree-view');
  const list = document.getElementById('nestedList');
  let currentItem = list.firstChild; // Starting point

  // Helper functions
  const createListItem = (text = 'New Item') => {
    const li = document.createElement('li');
    li.textContent = text;
    return li;
  };

  const highlightItem = (item) => {
    document.querySelectorAll('li').forEach(li => li.style.backgroundColor = '');
    if (item) {
      item.style.backgroundColor = '#d3d3d3'; // Highlight color
    }
  };

  highlightItem(currentItem);

  document.addEventListener('keydown', (event) => {
    switch (event.key) {
      case 'ArrowUp':
        if (currentItem.previousElementSibling) {
          currentItem = currentItem.previousElementSibling;
          highlightItem(currentItem);
        }
        break;
      case 'ArrowDown':
        if (currentItem.nextElementSibling) {
          currentItem = currentItem.nextElementSibling;
          highlightItem(currentItem);
        }
        break;
      case ' ':
        if (currentItem.children.length > 0) {
          currentItem.innerHTML = currentItem.innerHTML.includes('<ul>') ? currentItem.textContent : `${currentItem.textContent}<ul></ul>`;
        } else {
          const childList = document.createElement('ul');
          currentItem.appendChild(childList);
        }
        break;
      case 'a':
        if (currentItem.parentNode) {
          const newSibling = createListItem();
          currentItem.parentNode.insertBefore(newSibling, currentItem.nextSibling);
        }
        break;
      case 'c':
        const childList = currentItem.querySelector('ul') || document.createElement('ul');
        if (!currentItem.contains(childList)) {
          currentItem.appendChild(childList);
        }
        childList.appendChild(createListItem());
        break;
      case 'd':
        if (currentItem.parentNode) {
          const parent = currentItem.parentNode;
          currentItem.remove();
          currentItem = parent.firstChild || null;
          highlightItem(currentItem);
        }
        break;
      case 'Enter':
        const newText = prompt('Edit item text:', currentItem.textContent);
        if (newText !== null) {
          currentItem.textContent = newText;
        }
        break;
    }
  });
});
*/


function init() {
  initButtonBars();

  let tree = new TreeView();
  tree.init();
}


function initButtonBars () {
  // when options-btn clicked, open the options page
  document.querySelector('#options-btn')
    .addEventListener('click', function() {
      if (api.runtime.openOptionsPage) {
        api.runtime.openOptionsPage();
      } else {
        window.open(api.runtime.getURL('/options/options.html'));
      }
    });
}


// init when page is ready
document.addEventListener('DOMContentLoaded', () => {
  init();
});

