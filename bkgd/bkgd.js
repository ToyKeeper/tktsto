// bkgd/bkgd.js: main background script
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: GPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

console.log('/bkgd/bkgd.js running');

import * as sidepanel from './sidepanel.js';

sidepanel.init();

