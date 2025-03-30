// common/dialog.js: Promise-based dialog box widgets
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: GPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import { log } from '/common/common.js';


class Dialog {

  async inputDialog({
    doc = document,  // maybe unnecessary?
    title = '',
    description = '',
    input = true,
    value = '',
    buttons = ['OK', 'Cancel']
  }={}) {
    const promise = new Promise((resolve) => {
      const $dialog = doc.createElement('dialog');
      $dialog.id = 'inputDialog';

      // optional title widget
      if (title) {
        const $title = doc.createElement('div');
        $title.id = 'inputDialogTitle';
        $title.innerText = title;
        $dialog.appendChild($title);
      }

      // optional description widget
      if (description) {
        const $description = doc.createElement('div');
        $description.id = 'inputDialogDescription';
        $description.innerHTML = description;
        $dialog.appendChild($description);
      }

      // build the widget the user types into
      if (input) {
        const $form = doc.createElement('form');
        const $input = doc.createElement('input');
        $input.id = 'inputDialogInput';
        $input.type = 'text';
        $input.value = value;
        // user pressed Enter to submit the form
        const handleSubmit = (ev) => {
          ev.preventDefault();
          const result = {
            value: $input.value,
            button: buttons[0]  // pretend 1st/default button was clicked
          };
          // clean up
          $form.removeEventListener('submit', handleSubmit);
          $dialog.close();
          $dialog.remove();
          // return what the user entered
          resolve(result);
        }
        $form.addEventListener('submit', handleSubmit);
        // show these elements
        $form.appendChild($input);
        $dialog.appendChild($form);
      }

      // add the buttons
      if (Array.isArray(buttons) && (buttons.length > 0)) {
        const $buttons = doc.createElement('div');
        $buttons.id = 'inputDialogButtons';
        let first = true;
        for (const label of buttons) {
          const $btn = doc.createElement('button');
          $btn.innerText = label;
          //$btn.id = `inputDialogButton${label}`;  // unsafe, fixme
          // first button is the "submit" button
          if (first) $btn.type = 'submit';
          else $btn.type = 'button';
          // handle clicks
          $btn.addEventListener('click', (ev) => {
            const _dialog = ev.target.closest('dialog');
            const _form = _dialog.querySelector('form');
            const _input = _dialog.querySelector('input');
            // 1st button triggers the 'submit' event
            if (input && first) {
              log('first button pressed');
              _form.dispatchEvent(new Event('submit'));
              return;
            }
            // otherwise, return which button was pressed
            const result = {
              value: _input.value,  // TODO: get input value
              button: label
            };
            // clean up
            $dialog.close();
            $dialog.remove();
            // return the user's inputs
            resolve(result);
          });
          first = false;
          // show the button
          $buttons.appendChild($btn);
        }
        // show all buttons
        $dialog.appendChild($buttons);
      }

      // if the user pressed Escape to dismiss the dialog
      $dialog.addEventListener('close', () => {
        $dialog.remove();
        resolve(null);
      });

      // finally, show the actual dialog box
      doc.body.appendChild($dialog);
      $dialog.showModal();
    });

    return promise;
  }

}


export async function inputDialog(...args) {
  const dia = new Dialog();
  return dia.inputDialog(...args);
}

