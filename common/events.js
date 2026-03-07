// common/events.js: event helper functions
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: AGPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';
//import { debug } from '/common/common.js';


export function buildEventName (event, eventType) {
  const shift = (event.shiftKey && (event.key != 'Shift'  )) ? 'Shift+' : '';
  const ctrl  = (event.ctrlKey  && (event.key != 'Control')) ? 'Ctrl+'  : '';
  const alt   = (event.altKey   && (event.key != 'Alt'    )) ? 'Alt+'   : '';
  const meta  = (event.metaKey  && (event.key != 'Meta'   )) ? 'Meta+'  : '';

  //debug(`event`, event);

  let eventName;

  if ('keydown' === event.type) {
    let eventKey = event.key;
    if (eventKey === ' ') eventKey = 'Space';
    eventName = eventKey;
    // override CapsLock
    if (1 === eventName.length) eventName = eventName.toUpperCase();
  }
  else if (['mousedown', 'mouseup',
    'click', 'dblclick'].includes(event.type))
  {
    const buttonNames = ['Left', 'Middle', 'Right'];
    const clickNames = { mousedown: 'Press', mouseup: 'Release',
      click: 'Click', dblclick: 'DblClick' };
    const buttonName = buttonNames[event.button];
    const clickName = clickNames[event.type];
    if (buttonName) {
      eventName = `Mouse${clickName}${buttonName}`;
    }
  }
  else if (['DragStart', 'Drag', 'Drop', 'DragEnd', 'DragLeave',
    'DragOver'].includes(eventType))
  {
    eventName = `Mouse${eventType}`;
  }
  else if ('mouseover' === event.type) {
    eventName = 'MouseOver';
  }

  const fullEventName = `${shift}${ctrl}${alt}${meta}${eventName}`;
  event.processedName = fullEventName;
  return fullEventName;
}

