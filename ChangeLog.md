# ChangeLog

What changed, and when?  You know the drill.

## 0.1.55.0 (2026-02-02)

Changes:

- Added partial support for Zen Browser.  Requires special configuration and
  workflow adjustments, because some of Zen's features are incompatible in
  ways which are difficult or impossible to fix.  Read the Zen-specific parts
  of the tutorial nodes for details (press `?` in a tree view to generate
  a tutorial).
- Added optional command hotkeys for prev/next tab, for browsers which lack
  that hotkey or which refuse to keep their native tab bar in the same order
  as the tree.

Browsers known to work, or mostly work:

- Firefox ESR 115 .. 140
- Chromium (and Ungoogled Chromium) 134 .. 143
- Edge 136 .. 143
- Brave 1.78
- Vivaldi 7.3, 7.7
- Maxthon 7.3.1
- Zen Browser 1.18.3b

## 0.1.52.0 (2026-01-30)

Bug fixes:

- Fixed an issue which broke Firefox: Tree wouldn't load, because an async
  message handler returned a non-null status.  Fixed by changing one word.

## 0.1.51.0 (2026-01-30)

Changes:

- Added zoom for the tree view with "+" and "-" buttons
- Added "i" key to toggle notes/details/plain info view mode
- Added ability to convert between text nodes and window nodes, so you can
  promote a branch to a window or turn a window into a branch.  This makes it
  easier to keep windows smaller and more topic-focused, since any branch
  which gets too large can be turned into its own window.
- Added ability to change incognito status of unloaded windows
- Added ability to edit page title and URL for unloaded tabs
- Added ability to edit notes and window status while adding a node
- Added short error messages in the status bar when a user action is rejected,
  like trying to move an incognito tab to a non-incognito window.

Bug fixes:

- Fixed errors when trying to move a tab between a regular window and an
  incognito window.  The browser doesn't allow that, so now TKTSTO prevents
  it instead of failing.
- Fixed problems when moving loaded tabs entirely out of a window and into the
  void.  Loaded tabs *must* be inside a window, so now it doesn't allow moving
  them into the void.
- Fixed issue where pressing "d" too fast to delete nodes could cause
  incomplete deletion, and partially-deleted nodes would then be recovered in
  "lost+found" on the next fsck
- Moved "lost+found" to the top of the tree instead of the bottom, to make it
  more noticeable when data has been recovered.
- Added more safety checks in general, for data storage access, to make sure
  events get handled in the correct order and only one at a time
- Fixed issue where maximized/minimized window state could be ignored
  sometimes when loading a saved window.

Misc:

- Added a privacy policy.  It's required by some web extension stores.

Browsers known to work, or mostly work:

- Firefox ESR 115 .. 140
- Chromium (and Ungoogled Chromium) 134 .. 143
- Edge 136 .. 143
- Brave 1.78
- Vivaldi 7.3, 7.7
- Maxthon 7.3.1

## 0.1.39.0 (2026-01-21)

Changes:

- Added feature: Tree view cursor follows active tab.  So it automatically
  follows what you're doing in the browser, and shows the part of the tree
  near the current page.
- Added support for incognito windows.
- Added support for fullscreen, maximized, and minimized windows... and
  improved support for remember window geometry.
- Improved backups: Now saves a backup at boot time if it's overdue.
- Made it possible to mark windows.
- Added Shift+PgDn in tree view, and fixed Shift+PgUp.  Moves current node
  up/down without increasing depth.
- Changed Firefox default hotkey to `F1`, and added default suggested hotkeys
  for many other actions.

Bug fixes:

- Fixed "click extension icon does nothing" in Firefox.
- Fixed major issue in Vivaldi 7.7 where sidepanel "tabs" got mixed into the
  tree and caused tree corruption.  Other browsers and older versions of
  Vivaldi are unaffected.
- Fixed "delete" doing nothing on open window nodes... now it unloads instead.
- Fixed "load" doing nothing on saved windows with no "wasLoaded" tabs.
  Now loads the first tab (and thus the window), leaving the user to load
  other saved tabs if they want more.
- Fixed bug: Deleting bottom-most node in "Window" mode made cursor disappear.
- Fixed some cases where cursor could fall out of scope in Window mode.

Browsers known to work, or mostly work:

- Firefox ESR 115 .. 140
- Chromium (and Ungoogled Chromium) 134 .. 143
- Edge 136 .. 143
- Brave 1.78
- Vivaldi 7.3, 7.7
- Maxthon 7.3.1

## 0.1.24.0 (2026-01-17)

Changes:

- Made this window's title row stand out more.
- Implemented `Shift+P` for pasteMarkedBefore.  Press `p` to paste below
  cursor, or `Shift+P` to paste above cursor.
- Added a scroll margin around the tree view cursor.
- Added smooth scrolling to the tree view.
- Added window ID in node details area.
- "Window" mode in the tree view no longer shows contents of sub-windows.  They
  appear as a single row instead, as if collapsed.  That way, you can have
  a bunch of expanded sub-windows without using a ton of space in the parent's
  tree view.

Bug fixes:

- Fixed multiple cases of tabs opening at far right edge when they should be
  placed elsewhere.
- Fixed missing cursor after opening a new tree view, when active tab node was
  hidden in a collapsed branch.
- Fixed incorrect tab "wasLoaded" state which sometimes happened when closing
  and saving a window.
- Fixed failure to mark active tab node as active in Firefox, when loading
  a saved window.
- Fixed orphaned ("lost+found") nodes in Brave when closing boring windows.
- Fixed attempt to delete window nodes twice in Chromium while closing a boring
  window.
- Fixed Firefox not deleting boring windows when closed.
- Reduced some unimportant "errors" to warnings, logs, or just silence.
- Fixed missing cursor when pressing `Right Arrow` on a collapsed node which
  hasn't previously been expanded in this tree view.
- Fixed a bunch of cases where the tree view cursor could get lost, like when
  mark+pasting nodes between windows, or into collapsed branches, or when
  changing view modes.
- Fixed a bunch of issues with "Window" mode in tree view...
  - Collapsing the session root node would break all tree views in "Window"
    mode.  More generally, collapsing the window's parents doesn't break the
    tree view any more.
  - In "Window" mode, `cursorRight` action no longer descends into sub-windows.
  - Fixed rare case of render failure when expanding a collapsed node.
  - Fixed issue where a sub-window's active tab could sometimes be returned
    when looking for parent window's active tab.

Browsers known to work, or mostly work:

- Firefox ESR 115 .. 140
- Chromium (and Ungoogled Chromium) 134 .. 143
- Edge 136 .. 143
- Vivaldi 7.3
- Brave 1.78
- Maxthon 7.3.1


## 0.1.10.0 (2026-01-14)

Changes:

- Made new windows use "Window" view mode by default instead of "Session" view
  mode, since this is the typical and recommended way to use this extension.
  Only the first window gets "Session" mode by default.
- Made "marked count" widget work as a button to paste marked nodes.
- Improved fsck to handle detached nodes better.  If a node gets detached but
  not fully deleted, it'll show up under `lost+found/` next time the service
  worker restarts.  Most "lost+found" items can be safely deleted, but it saves
  them just in case, so you can decide.
- Switched to a new version numbering scheme: `$Major.$Minor.$Commit.$Build`.
  Production versions should generally end with `.0`.
- Added signed Firefox `.xpi` packages.
- Fixed some issues with closed tabs staying in the tree sometimes instead of
  getting fully deleted.
- Fixed bug: Deleting a parent tab could put its open child tabs in reverse
  order.
- Fixed failure to detect parent tabs in Maxthon browser.
- Fixed tabs being in the wrong order in Maxthon browser.
- Fixed `onTabReplaced` event handling, in browsers which use that.  Usually it
  happens when a tab has been partially unloaded by the browser or an extension
  to reduce resource use.
- Fixed warnings when unloading tabs.
- Fixed some rare bugs I only ever saw once while testing broken code which was
  never committed.  Should help in case those issues ever somehow happened in
  a real version, but it's unlikely they would ever happen.

Extras:

- Added `bin/archive-backup-downloads.py` to move backups out of your
  "Downloads/" dir and compress them.
- Added `bin/json2md.py` to convert json backup files to markdown.

Extras require cloning the git branch.  Use this to get a copy:

`git clone https://github.com/ToyKeeper/tktsto.git`

Browsers known to work, or mostly work:

- Firefox ESR 115 .. 140
- Chromium (and Ungoogled Chromium) 134 .. 143
- Edge 136 .. 143
- Vivaldi 7.3
- Brave 1.78
- Maxthon 7.3.1


## 0.0.1.0 (2025-05-19)

First public release.

This is alpha software.  To be safe, enable automatic backups!

The client (browser extension) mostly works, but the server hasn't even started
development yet.

Supported/tested browsers include:

- Firefox ESR 115
- Firefox ESR 128
- Chromium 134
- Edge 136
- Vivaldi 7.3
- Brave 1.78
- Ungoogled Chromium 135

Known issues:

- A bunch of functions and features are not implemented yet.

- Pinned tabs are not supported.

- Tab groups are not supported.

- Incognito windows are not yet tested.  It may work, but when you bring back
  a saved incognito window, it might not be incognito any more.

- Chromium-based browsers (except Vivaldi) do some weird stuff when tearing off
  a tab or branch to create a new window.  This may *sometimes* separate
  a parent tab from its children and move the children to the left edge of
  their tab bar.  As a workaround, open a new window manually with `Ctrl+N` and
  then use the tree view to move tabs to it.

- Vivaldi's stacked tabs are incompatible with this extension.  This might not
  be solve-able.  Vivaldi Workspaces are not tested at all, and may cause
  problems.

- When a sidepanel and a full page view are open at the same time in the same
  window, or more than one full page view, "extension shortcut" keys can
  control both simultaneously, causing unwanted side effects.  Until this is
  fixed, avoid using extension shortcuts when more than one view exists in
  a single window.

- Firefox doesn't allow extensions to access `file:` URLs or most of the
  `about:` URLs or any extension URLS outside of their own.  I can't fix this,
  but TKTSTO does at least try to avoid opening those.  However, if you manage
  to make it try to load an unloaded forbidden URL, the *next* tab opened may
  take the place of the node you tried to load.

- Firefox 115 generates some warnings about the manifest because the manifest
  is written for newer versions.

- Edge has no way to move the sidepanel to the left side.  It did in the past,
  but Microsoft removed it.

