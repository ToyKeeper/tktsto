// common/dialog.js: Promise-based dialog box widgets
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: AGPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import { log, debug } from '/common/common.js';
import { buildEventName } from '/common/events.js';


class Dialog {

  // TODO: de-duplicate code, make a more generic dialog function

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
      $dialog.className = 'dialog';

      // optional title widget
      if (title) {
        const $title = doc.createElement('div');
        $title.id = 'dialogTitle';
        $title.innerText = title;
        $dialog.appendChild($title);
      }

      const $form = doc.createElement('form');

      // optional description widget
      if (description) {
        const $description = doc.createElement('div');
        $description.id = 'dialogDescription';
        $description.textContent = description;
        $form.appendChild($description);
      }

      // build the widget the user types into
      let $input;
      if (input) {
        $input = doc.createElement('input');
        $input.id = 'dialogInput';
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
          $label.id = 'dialogTextAreaLabel';
          $label.textContent = textAreaLabel;
          $form.appendChild($label);
        }

        $textArea = doc.createElement('textarea');
        $textArea.id = 'dialogTextArea';
        $textArea.value = textAreaValue;
        $form.appendChild($textArea);
      }

      // add the buttons
      if (Array.isArray(buttons) && (buttons.length > 0)) {
        const $buttons = doc.createElement('div');
        $buttons.id = 'dialogButtons';
        let first = true;
        for (const label of buttons) {
          const $btn = doc.createElement('button');
          $btn.innerText = label;
          //$btn.id = `dialogButton${label}`;  // FIXME: unsafe
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
              doc.activeElement.blur();  // remove "selected" element outline
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
        doc.activeElement.blur();  // remove "selected" element outline
        // return what the user entered
        resolve(result);
      }
      $form.addEventListener('submit', handleSubmit);
      $dialog.appendChild($form);

      // if the user pressed Escape to dismiss the dialog
      $dialog.addEventListener('close', () => {
        $dialog.remove();
        doc.activeElement.blur();  // remove "selected" element outline
        resolve(null);
      });

      // finally, show the actual dialog box
      doc.body.appendChild($dialog);
      $dialog.showModal();
    });

    return promise;
  }

  async checkboxDialog({
    doc = document,  // maybe unnecessary?
    title = '',
    description = '',
    value = '',
    classes,  // should be a Map()
    buttons = ['OK', 'Cancel']
  }={}) {
    this.oldValue = value;
    this.newValue = '';
    const promise = new Promise((resolve) => {
      function finish (value, event) {
        if (undefined !== event) {
          event.preventDefault();
          event.stopPropagation();
        }
        //$dialog.removeEventListener('keydown', this.keyHandler);
        // clean up
        $dialog.close();
        $dialog.remove();
        doc.activeElement.blur();  // remove "selected" element outline
        // return the user's inputs
        resolve(value);
      }

      const $dialog = doc.createElement('dialog');
      $dialog.id = 'checkboxDialog';
      $dialog.className = 'dialog';

      // optional title widget
      if (title) {
        const $title = doc.createElement('div');
        $title.id = 'dialogTitle';
        $title.innerText = title;
        $dialog.appendChild($title);
      }

      if (description) {
        const $description = doc.createElement('div');
        $description.id = 'dialogDescription';
        $description.innerText = description;
        $dialog.appendChild($description);
      }

      const $form = doc.createElement('form');

      function labelledCheckbox (val) {
        if (! val) {
          const $elem = doc.createElement('span');
          $elem.textContent = 'None';
          return $elem;
        }
        let cboxClass = classes.get(val);
        if (! cboxClass) cboxClass = 'other';

        const $div = doc.createElement('div');
        $div.className = 'checkboxPreview';

        const $ckbox = doc.createElement('div');
        $ckbox.classList.add('node-checkbox');
        $ckbox.classList.add(cboxClass);
        $ckbox.textContent = val;
        $div.appendChild($ckbox);

        const $span = doc.createElement('span');
        $span.textContent = cboxClass;
        $div.appendChild($span);

        $div.addEventListener('click', (ev) => {
          // return which button was pressed
          const result = { checkbox: val };
          // clean up
          $dialog.close();
          $dialog.remove();
          doc.activeElement.blur();  // remove "selected" element outline
          // return the user's inputs
          finish(result);
        });

        return $div;
      }

      // checkbox current value
      const $oldLabel = doc.createElement('span');
      $oldLabel.id = 'oldValue';
      $oldLabel.textContent = 'Old value:';
      $form.appendChild($oldLabel);

      const $nodeCkbox = labelledCheckbox(value);
      $form.appendChild($nodeCkbox);

      // new checkbox value
      const $newLabel = doc.createElement('span');
      $newLabel.id = 'newValue';
      //$newLabel.innerHTML = 'New value: <small>(click or type letter)</small>';
      $newLabel.append('New value: ');
      const $newLabelSmall = doc.createElement('small');
      $newLabelSmall.textContent = '(click or type letter)';
      $newLabel.append($newLabelSmall);
      $form.appendChild($newLabel);

      // checkbox classes available
      const $preview = doc.createElement('div');
      $preview.className = 'checkboxTable';
      for (const key of classes.keys()) {
        const $item = labelledCheckbox(key);
        $preview.appendChild($item);
      }

      $form.appendChild($preview);

      // add the buttons
      if (Array.isArray(buttons) && (buttons.length > 0)) {
        const $buttons = doc.createElement('div');
        $buttons.id = 'dialogButtons';
        let first = true;
        for (const label of buttons) {
          const $btn = doc.createElement('button');
          $btn.innerText = label;
          // first button is the 'submit' button
          // and emits its own special event when clicked
          if (first) $btn.type = 'submit';
          // handle clicks on all other buttons
          else {
            $btn.type = 'button';
            $btn.addEventListener('click', (ev) => {
              // return which button was pressed
              const result = { button: label, checkbox: oldValue };
              // return the user's inputs
              finish(result);
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
          button: buttons[0],  // pretend 1st/default button was clicked
          checkbox: oldValue
        };
        // clean up
        $form.removeEventListener('submit', handleSubmit);
        // return what the user entered
        finish(result);
      }
      $form.addEventListener('submit', handleSubmit);
      $dialog.appendChild($form);

      // if the user pressed Escape to dismiss the dialog
      $dialog.addEventListener('close', () => {
        finish(null);
      });

      // finally, show the actual dialog box
      doc.body.appendChild($dialog);
      $dialog.showModal();

      // needs a special keystroke handler for faster keyboard access
      $dialog.addEventListener('keydown',
        (event) => {
          // figure out what key was pressed
          const keyName = buildEventName(event);
          if (! keyName) return;
          const parts = keyName.split('+');
          let last = parts[parts.length-1];
          let first = parts[0];
          // special cases
          const map = { '': '+', 'Space': ' ' };
          if (map[last]) last = map[last];
          // handle some special keys
          if ('Escape' === last) return finish(null, event);
          if ('Enter' === last) {
            // TODO: test what happens if press Enter while Delete is focused
            if (this.newValue) finish({ checkbox: this.newValue }, event);
            else finish(null, event);
            return;
          }
          if (['Delete', 'Backspace'].includes(last)) {
            // delete / un-set the checkbox
            return finish({ checkbox: null }, event);
          }
          // manually entering a percent
          if ('1234567890'.includes(last)) {
            this.newValue = this.newValue + last;
            if (2 == this.newValue.length)
              finish({ checkbox: '%', checkboxPx: this.newValue / 100.0 }, event);
            return;
          }
          // invert case
          // so user can enter capitals with one key,
          // or lowercase with shift+key
          const lower = last.toLowerCase();
          const upper = last.toUpperCase();
          if ('Shift' === first) last = lower;
          else last = upper;
          // any single-character key simply becomes a new checkbox value
          if (1 === last.length) return finish({checkbox: last }, event);
          // ... and other keys are simply ignored
        }
      );

    });

    return promise;
  }

  async nodeEditDialog ({
    doc = document,  // maybe unnecessary?
    title = '',
    node = null,
    buttons = ['OK', 'Cancel']
  }={}) {
    const promise = new Promise((resolve) => {
      // skip no-op cases
      if (! node) return resolve(null);

      const $dialog = doc.createElement('dialog');
      $dialog.id = 'nodeEditDialog';
      $dialog.className = 'dialog';

      // optional title widget
      if (title) {
        const $title = doc.createElement('div');
        $title.id = 'dialogTitle';
        $title.innerText = title;
        $dialog.appendChild($title);
      }

      const $form = doc.createElement('form');

      // figure out the node type, and thus which fields to display
      const show = {
        label: true,
        note: true,
        isWindow: false,
        incognito: false,
        title: false,
        url: false,
        isBookmark: false,
      };
      if (node.isWindow()) {
        show.isWindow = true;
        show.incognito = true;
      } else if (node.url) {
        show.title = true;
        show.url = true;
        show.isBookmark = true;
      } else if (! node.isRoot()) {
        show.isWindow = true;
      }

      // label widget
      let $label;
      if (show.label) {
        const $labelLabel = doc.createElement('div');
        $labelLabel.id = 'dialogLabelLabel';
        $labelLabel.textContent = 'Label';
        $form.appendChild($labelLabel);

        $label = doc.createElement('input');
        $label.id = 'dialogLabelInput';
        $label.type = 'text';
        if (node.label) $label.value = node.label;
        else $label.value = '';
        $label.select();
        $form.appendChild($label);
      }

      // note widget
      let $note;
      if (show.note) {
        const $noteLabel = doc.createElement('div');
        $noteLabel.id = 'dialogNoteLabel';
        $noteLabel.textContent = 'Notes';
        $form.appendChild($noteLabel);

        $note = doc.createElement('textarea');
        $note.id = 'dialogNoteInput';
        if (node.note) $note.value = node.note;
        else $note.value = '';
        $form.appendChild($note);
      }

      // bookmark toggle
      let $isBookmark;
      if (show.isBookmark) {
        const $isBookmarkDiv = doc.createElement('div');
        $isBookmarkDiv.id = 'dialogisBookmarkDiv';
        const $isBookmarkLabel = doc.createElement('label');
        $isBookmarkLabel.id = 'dialogisBookmarkLabel';
        $isBookmarkDiv.appendChild($isBookmarkLabel);

        $isBookmark = doc.createElement('input');
        $isBookmark.type = "checkbox";
        $isBookmark.id = 'dialogisBookmarkInput';
        $isBookmark.checked = node.isBookmark();
        $isBookmarkLabel.appendChild($isBookmark);
        $isBookmarkLabel.appendChild(doc.createTextNode("Bookmark?"));
        $form.appendChild($isBookmarkDiv);

        if (node.isLoaded()) {
          // can't make it a bookmark while loaded
          $isBookmark.disabled = true;
          $isBookmarkDiv.classList.add('greyed-out');
        }
      }

      // title widget
      let $title;
      if (show.title) {
        const $titleLabel = doc.createElement('div');
        $titleLabel.id = 'dialogTitleLabel';
        $titleLabel.textContent = 'Page Title';
        $form.appendChild($titleLabel);

        $title = doc.createElement('input');
        $title.id = 'dialogTitleInput';
        $title.type = 'text';
        $title.value = node.title;
        if (node.isLoaded()) {
          $title.disabled = true;
          $title.classList.add('greyed-out');
          $titleLabel.classList.add('greyed-out');
        }
        $form.appendChild($title);
      }

      // URL widget
      let $url;
      if (show.url) {
        const $urlLabel = doc.createElement('div');
        $urlLabel.id = 'dialogURLLabel';
        $urlLabel.textContent = 'URL';
        $form.appendChild($urlLabel);

        $url = doc.createElement('input');
        $url.id = 'dialogURLInput';
        $url.type = 'text';
        $url.value = node.url;
        if (node.isLoaded()) {
          $url.disabled = true;
          $url.classList.add('greyed-out');
          $urlLabel.classList.add('greyed-out');
        }
        $form.appendChild($url);
      }

      // label vs window toggle checkbox
      let $isWindow;
      if (show.isWindow) {
        const $isWindowDiv = doc.createElement('div');
        $isWindowDiv.id = 'dialogisWindowDiv';
        const $isWindowLabel = doc.createElement('label');
        $isWindowLabel.id = 'dialogisWindowLabel';
        $isWindowDiv.appendChild($isWindowLabel);

        $isWindow = doc.createElement('input');
        $isWindow.type = "checkbox";
        $isWindow.id = 'dialogisWindowInput';
        $isWindow.checked = node.isWindow();
        $isWindowLabel.appendChild($isWindow);
        $isWindowLabel.appendChild(doc.createTextNode("Window?"));
        $form.appendChild($isWindowDiv);

        if (node.isWindow() && (! node.canBeConvertedFromWindow())) {
          // can't make it not-a-window
          // if there's no parent to move tabs to
          $isWindow.disabled = true;
          $isWindowDiv.classList.add('greyed-out');
        }
      }

      // incognito status widget
      let $incognito;
      if (show.incognito) {
        const $iDiv = doc.createElement('div');
        $iDiv.id = 'dialogIncognitoDiv';
        const $iLabel = doc.createElement('label');
        $iLabel.id = 'dialogIncognitoLabel';
        $iDiv.appendChild($iLabel);

        $incognito = doc.createElement('input');
        $incognito.type = "checkbox";
        $incognito.id = 'dialogIncognitoInput';
        $incognito.checked = !!node.incognito;
        $incognito.disabled = node.isLoaded();
        $iLabel.appendChild($incognito);
        $iLabel.appendChild(doc.createTextNode("Incognito?"));
        $form.appendChild($iDiv);
        // can't change incognito state of an open window
        if (node.isLoaded()) {
          $incognito.disabled = true;
          $iDiv.classList.add('greyed-out');
        }
      }

      function makeResult (button) {
        const result = { button: button };
        if ($label) result.label = $label.value;
        if ($note) result.note = $note.value;
        if ($title) result.title = $title.value;
        if ($url) result.url = $url.value;
        if ($isBookmark) result.bookmark = $isBookmark.checked;
        if ($isWindow) result.isWindow = $isWindow.checked;
        if ($incognito) result.incognito = $incognito.checked;
        return result;
      }

      // add the buttons
      if (Array.isArray(buttons) && (buttons.length > 0)) {
        const $buttons = doc.createElement('div');
        $buttons.id = 'dialogButtons';
        let first = true;
        for (const buttonLabel of buttons) {
          const $btn = doc.createElement('button');
          $btn.innerText = buttonLabel;
          // first button is the 'submit' button
          // and emits its own special event when clicked
          if (first) $btn.type = 'submit';
          // handle clicks on all other buttons
          else {
            $btn.type = 'button';
            $btn.addEventListener('click', (ev) => {
              // return which button was pressed
              const result = makeResult(buttonLabel);
              // clean up
              $dialog.close();
              $dialog.remove();
              doc.activeElement.blur();  // remove "selected" element outline
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
        // pretend 1st/default button was clicked
        const result = makeResult(buttons[0]);
        // clean up
        $form.removeEventListener('submit', handleSubmit);
        $dialog.close();
        $dialog.remove();
        doc.activeElement.blur();  // remove "selected" element outline
        // return what the user entered
        resolve(result);
      }
      $form.addEventListener('submit', handleSubmit);
      $dialog.appendChild($form);

      // if the user pressed Escape to dismiss the dialog
      $dialog.addEventListener('close', () => {
        $dialog.remove();
        doc.activeElement.blur();  // remove "selected" element outline
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

export async function checkboxDialog(...args) {
  const dia = new Dialog();
  return dia.checkboxDialog(...args);
}

export async function nodeEditDialog(...args) {
  const dia = new Dialog();
  return dia.nodeEditDialog(...args);
}

