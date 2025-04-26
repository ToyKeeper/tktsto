// common/dialog.js: Promise-based dialog box widgets
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: AGPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import { log, debug } from '/common/common.js';


class Dialog {

  async inputDialog({
    doc = document,  // maybe unnecessary?
    title = '',
    description = '',
    input = true,
    value = '',
    textArea = false,
    textAreaLabel = '',
    textAreaValue = '',
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

      const $form = doc.createElement('form');

      // optional description widget
      if (description) {
        const $description = doc.createElement('div');
        $description.id = 'inputDialogDescription';
        $description.innerHTML = description;
        $form.appendChild($description);
      }

      // build the widget the user types into
      let $input;
      if (input) {
        $input = doc.createElement('input');
        $input.id = 'inputDialogInput';
        $input.type = 'text';
        $input.value = value;
        $input.select();
        // show these elements
        $form.appendChild($input);
      }

      // build the long text entry widget
      let $textArea;
      if (textArea) {
        // optional label
        if (textAreaLabel) {
          const $label = doc.createElement('div');
          $label.id = 'inputDialogTextAreaLabel';
          $label.innerHTML = textAreaLabel;
          $form.appendChild($label);
        }

        $textArea = doc.createElement('textarea');
        $textArea.id = 'inputDialogTextArea';
        $textArea.value = textAreaValue;
        $form.appendChild($textArea);
      }

      // add the buttons
      if (Array.isArray(buttons) && (buttons.length > 0)) {
        const $buttons = doc.createElement('div');
        $buttons.id = 'inputDialogButtons';
        let first = true;
        for (const label of buttons) {
          const $btn = doc.createElement('button');
          $btn.innerText = label;
          //$btn.id = `inputDialogButton${label}`;  // FIXME: unsafe
          // first button is the 'submit' button
          // and emits its own special event when clicked
          if (first) $btn.type = 'submit';
          // handle clicks on all other buttons
          else {
            $btn.type = 'button';
            $btn.addEventListener('click', (ev) => {
              // return which button was pressed
              const result = { button: label };
              if (input) result.value = $input.value;
              if (textArea) result.textAreaValue = $textArea.value;
              // clean up
              $dialog.close();
              $dialog.remove();
              // return the user's inputs
              resolve(result);
            });
          }
          first = false;
          // show the button
          $buttons.appendChild($btn);
        }
        // show all buttons
        $form.appendChild($buttons);
      }

      // user pressed Enter to submit the form
      const handleSubmit = (ev) => {
        ev.preventDefault();
        const result = {
          button: buttons[0]  // pretend 1st/default button was clicked
        };
        if (input) result.value = $input.value;
        if (textArea) result.textAreaValue = $textArea.value;
        // clean up
        $form.removeEventListener('submit', handleSubmit);
        $dialog.close();
        $dialog.remove();
        // return what the user entered
        resolve(result);
      }
      $form.addEventListener('submit', handleSubmit);
      $dialog.appendChild($form);

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

