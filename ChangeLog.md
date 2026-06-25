# ChangeLog

What changed, and when?  You know the drill.


## Unreleased

Changes:

- Favicons!  On Chromium browsers, the tree now shows each page's favicon.
  Icons come from the browser's own favicon cache (the `_favicon` API), served
  from the extension's own origin, rather than loading each site's favicon URL
  directly -- the latter is blocked for some sites by their
  `Cross-Origin-Resource-Policy` header (e.g. claude.ai).  Favicons update
  when a page changes its icon, and can be turned off in the options page.
  (Firefox is not supported yet.)


## 0.1.181.0 (2026-04-06)

Google Chrome (and no other Chrome-based browsers, as far as I can tell)
recently started pretending to be Firefox, by defining "browser" as
a top-level object in its API.  This makes extensions break when they use the
most common method of detecting the browser type, a method which was simple
and reliable for the past decade but suddenly no longer works.  This update
fixes that.

Changes:

- Dragging a window into another window in the TreeView can optionally
  convert that window to a heading, and move all tabs into the destination
  window.  This only affects loaded windows.

Bug fixes:

- Fixed browser detection in Google Chrome.  Many things broke when Google
  Chrome added "browser" as a synonym for "chrome" in its API, but now we use
  a different method to detect Firefox vs Chrome, which should fix all the
  things caused by the failed detection.

- Fixed tabs getting unpinned when closing a window in Chrome-based browsers.
  The browser sends an "unpin" event right before closing the window, and
  TKTSTO was respecting that event... even when it shouldn't.  So now it
  waits a moment and ignores the "unpin" if the window or tab got closed.


## 0.1.177.0 (2026-03-31)

Mostly bugfixes and small usability improvements this time.

Changes:

- Made tree drag-n-drop handle **root-level drops** in a **more intuitive**
  way, so you can drop at root level and things land where it looks like they
  should.

- Added user stylesheet example for how to **style the drop indicators**.

- Made it possible to **drag** a "heading with loaded tabs" outside of
  a window.  This now causes the **heading to become a window**.

- Made **internal extension pages re-open after browser restart** or
  extension restart.  No more need to manually re-open the TreeView after
  browser restart when using "Tabs Outliner mode".

- Made **Options / Help pages open in other window** when using "Tabs
  Outliner mode", instead of opening as a tab in the narrow TreeView window.

- Made TreeView update a bit faster when changing tabs, and handle "user
  holding the change-tab key down" better.

- Improved some formatting in Options / Help pages.

- Added **Floorp** as a supported browser.  Works the same as Firefox.

Bug fixes:

- **Fixed dragging tabs** around the native tab bar in Chrome:  Could only
  move one space, and got errors about "Tabs cannot be edited right now".

- Fixed issue when moving a collapsed parent downward via keyboard while
  expanded via an override.  It got mixed signals about its expanded state
  and tried to become its own child.

- Fixed Firefox occasionally creating a new node, on slow computers, when
  trying to load a saved tab.

- Fixed some errors about "No window with id: foo".

- Fixed bogus warning about loadSavedNode failing when it didn't.

- Fixed TreeView trying to run boot-up code in the wrong order in Vivaldi.

- Fixed case where a new tab could potentially unpin pinned tabs.


## 0.1.156.0 (2026-03-23)

Changes:

- Added **search** functions.  Like Vim, press `/` or `*` to start a search,
  `Enter` to lock it in, and `n` or `Shift+N` to go through matches.  Then
  `Escape` to cancel it, or again to collapse all temporarily-expanded
  branches.

- Added an option for "hide top buttons during search".  Also added a doc
  page for search.

- Improved **Tabs Outliner mode** (session mode in a standalone window).
  The session-mode cursor now follows the active tab in *other* windows.
  Window nodes change their "active" status and styling when focused.
  Browser global hotkeys now work in this mode too -- if there is only one
  TreeView and it's in Session mode, hotkeys get sent there regardless of
  which window actually has focus.

Bug fixes:

- Fixed case where boring tabs would be kept when closed, if they had
  previously been unloaded and reloaded.

- Fixed drag-n-drop breaking cursor scrolling... again.

- Reduced time window where a tab could be attached to the wrong node after
  failing to load a saved tab.  Was 3 seconds, now 1 second.

- Fixed failure to render child nodes after moving an invisible branch to
  a visible location.


## 0.1.145.0 (2026-03-15)

Changes:

- Added **options for vertical spacing** of the tree view, for people who
  want it to be less dense.

- Added a count of **wasLoaded** tabs in the **node stats** widget.

- Made **batch load** work on loaded **window nodes**, so you can load the
  rest of the unloaded tabs all at once if you want.

- `Ctrl+Enter` now saves in the Edit Node dialog.

- Made it easier to tell what items in the Options page do.

Bug fixes:

- Fixed global "load node" hotkey not working on bookmarks with kids.

- Fixed issue where keyboard scrolling could break after a drag-n-drop.

- Fixed manual expand/collapse taking a few tries when auto-expanded.

- Fixed stale "active" tab state at boot, in a specific corner case.


## 0.1.135.0 (2026-03-12)

Changes:

- Added **appearance options**: font, indentation, window tree lines, details
  box size, user styles (full CSS editing).

- Added feature to **expand branches when the cursor follows active tab**.
  That means you can keep your headings collapsed, and they'll open/close on
  their own as you change tabs.

- Firefox: Turned off "hide collapsed tabs" by default, since it'll likely
  confuse new users and it interacts badly with the new auto-expand
  auto-collapse branch feature.

- Reorganized the Options page a bit.

- Reduced indentation of top-level items within a window.

Bug fixes:

- **Fixed** a bunch of cases where **drag-n-drop** didn't work.

- **Fsck now deletes boring empty window nodes**, so if those have been
  accumulating in your session, they should clean themselves up now.

- Fixed issue where **saved windows wouldn't load** because they were
  **partially offscreen**.

- Fixed some cases where tab data didn't update while attaching windows at
  boot time.

- Fixed wrong color of note icon in window nodes in TK Day theme.

## 0.1.124.0 (2026-03-09)

Update your preferences in **Options** after updating to this release.
New stuff was added, and some defaults were changed.  Recommended settings:

- [ ] Draw a + before expanded branches?
- [ ] Show node stats before expanded branches?
- [X] Hide tree lines (dim, outside cursor branch)?
- [ ] Hide cursor branch tree lines?
- [X] Tree view cursor follows active (focused) tab?
- When (un)loading/deleting: Ask
- [ ] When a pinned tab is active and a new tab is opened, pin the new tab too?
- Automatic backups every 1 to 24 hours

Changes:

- New feature: **hide collapsed tabs** (Firefox only, since Chrome can't
  hide tabs).  Collapsing a branch hides the tabs in that branch.

- Added ability to **load or unload entire branches**, similar to saving and
  restoring a window, but for the tabs inside of a branch.

- Added options for **what to do when unloading a branch with loaded tabs**.
  Unload one, unload all, or ask.  Default is "ask".

- Added an option for **what to do when deleting an expanded parent node**.
  Delete one (old behavior), delete all, or ask.  Default is "ask".

- Added an option for **whether pinned tabs should open new tabs pinned too**,
  or if new tabs should be moved outside the "Pinned" area.

- Added options to **hide tree lines** on regular and cursor branches, for
  those who prefer going without indent lines.

- Added an option to **show node stats on expanded branches**.  Unsure if it
  should be default, or if the old "show + before expanded branches" should
  remain as default.  I don't like having either one enabled, but it's good
  for teaching new users they can click there to collapse the branch.

- Added **divider rows** by adding a node with a label of `-` or `=`.
  Blank rows can serve a similar purpose, setting a label to ` ` (Space).

- Made **unsaved config options glow** until they're auto-saved, to let user
  know when it happened.

- **Documentation** updates:  Reorganized the index page.  Added a page
  documenting **node types**.  Made drag-n-drop docs clearer visually.
  Re-worded some things.  Improved some aesthetics a little.

Internal:

- New config manager system, so I can finally add **user config options**
  without a lot of development overhead and complications.

Bug fixes:

- **CapsLock no longer breaks key bindings.**  Oops.  I don't even have
  a CapsLock key, so I never tried that before.

- Made "cursor follows active tab" work for new tabs too.

- Fixed regression: Two tabs could be marked as active in one window, if the
  user moved a branch with an active tab from another window.

- The tutorial no longer puts itself before the pinned tabs.  Before,
  generating a tutorial would unpin all the pinned tabs.

- The "add node" function no longer allows inserting between a window node
  and its "Pinned" branch, if it has any loaded tabs.  Because that would
  unpin everything.

- Being pinned is no longer enough to make a "new tab" page count as "not
  boring".  So closing a pinned "new tab" page with no metadata now deletes
  it, instead of keeping it.

- Fixed color of bookmark and other icons on cursor row in TK Day theme.


## 0.1.97.1 (2026-03-02)

- Made markdown renderer even safer, to address a warning from Firefox's lint
  checker.  It wasn't unsafe regardless, since it only allows files shipped
  with the extension, and they don't contain anything sketchy... but I added
  an extra layer of safety regardless, replacing all '<' and '>' and '&'
  input characters with safer versions like '&lt;', '&gt;', and '&amp;'.
  Hopefully this will satisfy any security reviews.


## 0.1.96.0 (2026-03-02)

Changes:

- New node type: **Bookmarks**.  Press `Alt+B` to bookmark the current page,
  (or `Alt+K` in Firefox, since it doesn't allow Alt+B)
  or use `editNode` to convert a saved tab into a bookmark.  Bookmarks are
  saved tabs which **spawn a clone of themselves when opened**, so the
  original will not be changed when you navigate to another page.  Note,
  these are *not* the browser's native bookmarks.  Those are not supported
  yet.  See the "Help -> Bookmarks" page for more details.

- Added more **documentation pages**, including a new **markdown renderer**
  for pages like **readme.md**, **ChangeLog.md**, and **Browsers.md**.
  Also added other project links, and updated several help pages.

- More detailed browser console logs for debugging and error reporting.

Bug fixes:

- **Pinned tabs won't get deleted when closed** now, even if they are
  otherwise "boring".  Before, a pinned tab with no metadata would be
  considered "boring" and get deleted when closed with `Ctrl+W`.

- Fixed **automatic backups getting stuck after one failure**, like if the
  user has "ask me where to save" enabled and they hit Escape to cancel it,
  the automatic backups would just stop.

- Fixed **loaded tabs turning grey instead of pink after a crash** with
  automatic recovery disabled, for easier manual recovery.

- Fixed several issues relating to **stale tabIds and windowIDs**,
  particularly after a browser crash, and made stale data **self-healing**.

- Fixed Firefox attaching new windows to old saved window nodes sometimes,
  after a crash.

- Improved handling of **unrecognized tabs**, which can happen if a tab
  creation event got missed, or if a buggy browser (Zen) doesn't bother to
  send an event.

- **Greyed out forbidden page buttons** in Chrome.  It doesn't allow the
  "Options", "Help", or "Tab" pages in incognito mode.  They still work, sort
  of, but they open in the wrong window.

- Reduced side effects of a failed attempt to load a saved tab.

- Fixed a warning when checking cursor visibility after deleting the branch
  it's in.


## 0.1.80.0 (2026-02-25)

Changes:

- Added support for **pinned tabs**.  It uses a special magic branch called
  "Pinned" at the top of each window, and moving nodes into or out of that
  branch will pin or unpin them.

- Made **Shift+Up/Shift+Down node moves** a bit more intuitive when moving to
  or from the end of an expanded branch.  It no longer skips past the next
  node, and instead will **indent / dedent to match the next node** first.

- Completely overhauled the **documentation pages**, including both the
  appearance and the content.  Now uses the user's configured theme, and has
  more information -- particularly TreeView widgets as a visual guide for how
  to do things.

- Made the user's **theme** apply to the **Options page** too.

- Made the **"Help" button** show a **list of help pages**, and info about
  how to invoke a tutorial.

- Added a help page for **pinned tabs**.

- Added a help page for people **migrating from Tabs Outliner**.

- Moved theme-handling code to a central location, to make it easier and more
  consistent to make themed pages.

- Finally added some demo screenshots to the main readme.

Bug fixes:

- Fixed cursor going to the wrong place after clicking the viewScope button.

- Removed unused permissions in Chrome, so the extension can be published in
  the Chrome store.  Will have to re-add those later if I ever add the
  features the permissions were meant to enable.


## 0.1.69.0 (2026-02-19)

Changes:

- Added a **new task type**: **"ratio" or "/"**, shows "$done / $total"
  like `3/7`

- Made **nested windows more intuitive** when using "window" view scope mode
  (can be expanded and collapsed within the parent now)

- Multiple improvements to **scrolling**

- Multiple improvements to **drag-n-drop**

- Made it easy to scroll during a drag-n-drop

Bug fixes:

- Double click near top/bottom of view **no longer scrolls before 2nd click**

- Fixed keyboard **scrolling** sometimes scrolling the wrong direction when
  **computer was really busy**

- Fixed scrolling to slightly wrong place when zoomed

- Fixed **drag-n-drop between tktsto sidepanels**

- Fixed some cases where the wrong node could get dragged

- Fixed cursor jumping to focused tab when node dropped into a collapsed
  branch

- Fixed cursor jumping to focused tab when pasted into a collapsed branch

- Hover menu no longer gets in the way during a drag-n-drop

- Hover menu no longer gets in the way during keyboard scroll

- Fixed button label text getting highlighted when it shouldn't

- Improved detection of Zen Browser (but requires new Zen)

Browsers known to work, or mostly work:

- Firefox ESR 115 .. 140
- Chromium (and Ungoogled Chromium) 134 .. 143
- Edge 136 .. 143
- Brave 1.78
- Vivaldi 7.3, 7.7
- Maxthon 7.3.1
- Zen Browser 1.18.3b


## 0.1.55.0 (2026-02-02)

Changes:

- Added **partial support for Zen Browser**.  Requires special configuration
  and workflow adjustments, because some of Zen's features are incompatible
  in ways which are difficult or impossible to fix.  Read the Zen-specific
  parts of the tutorial nodes for details (press `?` in a tree view to
  generate a tutorial).

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

- Added **zoom** for the tree view with **"+" and "-" buttons**

- Added `i` key to **toggle notes/details/plain** info view mode

- Added ability to **convert between text nodes and window nodes**, so you
  can promote a branch to a window or turn a window into a branch.  This
  makes it easier to keep windows smaller and more topic-focused, since any
  branch which gets too large can be turned into its own window.

- Added ability to **change incognito status** of unloaded windows

- Added ability to **edit page title and URL** for unloaded tabs

- Added ability to **edit** notes and window status **while adding** a node

- Added short error messages in the status bar when a user action is
  rejected, like trying to move an incognito tab to a non-incognito window.

Bug fixes:

- Fixed errors when trying to **move a tab** between a **regular window** and
  an **incognito window**.  The browser doesn't allow that, so now TKTSTO
  prevents it instead of failing.

- Fixed problems when moving loaded tabs entirely out of a window and into
  the void.  **Loaded tabs must be inside a window**, so now it doesn't
  allow moving them into the void.

- Fixed issue where **pressing "d" too fast** to delete nodes could cause
  incomplete deletion, and partially-deleted nodes would then be recovered in
  `lost+found` on the next fsck

- Moved `lost+found` to the **top of the tree** instead of the bottom, to
  make it more noticeable when data has been recovered.

- Added more safety checks in general, for data storage access, to make sure
  events get handled in the correct order and only one at a time

- Fixed issue where maximized/minimized window state could be ignored
  sometimes when loading a saved window.

Misc:

- Added a **privacy policy**.  It's required by some web extension stores.

Browsers known to work, or mostly work:

- Firefox ESR 115 .. 140
- Chromium (and Ungoogled Chromium) 134 .. 143
- Edge 136 .. 143
- Brave 1.78
- Vivaldi 7.3, 7.7
- Maxthon 7.3.1


## 0.1.39.0 (2026-01-21)

Changes:

- Added feature: Tree view **cursor follows active tab**.  So it
  automatically follows what you're doing in the browser, and shows the part
  of the tree near the current page.

- Added support for **incognito windows**.

- Added support for **fullscreen, maximized, and minimized windows**... and
  improved support for remembering **window geometry**.

- Improved backups: Now **saves a backup at boot time if it's overdue**.

- Made it possible to **mark windows**.

- **Added Shift+PgDn** in tree view, and **fixed Shift+PgUp**.  Moves current
  node up/down without increasing depth.

- Changed **Firefox default hotkey** to `F1`, and added default suggested
  hotkeys for many other actions.

Bug fixes:

- Fixed "**click extension icon does nothing**" in Firefox.

- **Fixed** major issue in **Vivaldi 7.7** where sidepanel "tabs" got mixed
  into the tree and caused tree corruption.  Other browsers and older
  versions of Vivaldi are unaffected.

- Fixed `delete` doing nothing on **open window** nodes... now it **unloads**
  instead.

- Fixed `load` doing nothing on saved windows with **no "wasLoaded"** tabs.
  Now **loads the first tab** (and thus the window), leaving the user to load
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

- Implemented `Shift+P` for `pasteMarkedBefore`.  Press `p` to paste below
  cursor, or `Shift+P` to paste above cursor.

- Added a **scroll margin** around the tree view cursor.

- Added **smooth scrolling** to the tree view.

- Added window ID in node details area.

- **"Window" mode** in the tree view no longer shows contents of
  **sub-windows**.  They appear as a single row instead, as if **collapsed**.
  That way, you can have a bunch of expanded sub-windows without using a ton
  of space in the parent's tree view.

Bug fixes:

- Fixed multiple cases of **tabs opening at far right edge** when they should
  be placed elsewhere.

- Fixed **missing cursor** after opening a new tree view, when active tab
  node was hidden in a collapsed branch.

- Fixed incorrect tab "wasLoaded" state which sometimes happened when closing
  and saving a window.

- Fixed failure to mark active tab node as active in Firefox, when loading
  a saved window.

- Fixed **orphaned ("lost+found") nodes** in Brave when closing boring
  windows.

- Fixed attempt to delete window nodes twice in Chromium while closing
  a boring window.

- Fixed **Firefox not deleting boring windows** when closed.

- Reduced some unimportant "errors" to warnings, logs, or just silence.

- Fixed **missing cursor** when pressing `Right Arrow` on a collapsed node
  which hasn't previously been expanded in this tree view.

- Fixed a bunch of cases where the **tree view cursor could get lost**, like
  when mark+pasting nodes between windows, or into collapsed branches, or
  when changing view modes.

- Fixed a bunch of issues with **"Window" mode** in tree view...
  - Collapsing the session root node would break all tree views in "Window"
    mode.  More generally, collapsing the window's parents doesn't break the
    tree view any more.
  - In "Window" mode, `cursorRight` action no longer descends into
    sub-windows.
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

- Made new windows use **"Window" view mode by default** instead of "Session"
  view mode, since this is the typical and recommended way to use this
  extension.  Only the **first window gets "Session" mode** by default.

- Made `marked count` widget work as a button to **paste marked** nodes.

- Improved fsck to handle **detached nodes** better.  If a node gets detached
  but not fully deleted, it'll show up under `lost+found/` next time the
  service worker restarts.  Most "lost+found" items can be safely deleted,
  but it **saves them just in case, so you can decide**.

- Switched to a new version numbering scheme: `$Major.$Minor.$Commit.$Build`.
  Production versions should generally end with `.0`.

- Added signed Firefox `.xpi` packages.

- Fixed some issues with closed tabs staying in the tree sometimes instead of
  getting fully deleted.

- Fixed bug: Deleting a parent tab could put its open child tabs in
  **reverse order**.

- Fixed failure to detect parent tabs in **Maxthon** browser.

- Fixed tabs being in the wrong order in **Maxthon** browser.

- Fixed `onTabReplaced` event handling, in browsers which use that.  Usually
  it happens when a tab has been partially unloaded by the browser or an
  extension to reduce resource use.

- Fixed warnings when unloading tabs.

- Fixed some rare bugs I only ever saw once while testing broken code which
  was never committed.  Should help in case those issues ever somehow
  happened in a real version, but it's unlikely they would ever happen.

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

**First public release.**

This is **alpha** software.  To be safe, **enable automatic backups!**

The client (browser extension) mostly works, but the server hasn't even
started development yet.

Supported/tested browsers include:

- Firefox ESR 115
- Firefox ESR 128
- Chromium 134
- Edge 136
- Vivaldi 7.3
- Brave 1.78
- Ungoogled Chromium 135

Known issues:

- A bunch of functions and features are **not implemented yet**.

- Pinned tabs are not supported.

- Tab groups are not supported.

- Incognito windows are not yet tested.  It may work, but when you bring back
  a saved incognito window, it might not be incognito any more.

- Chromium-based browsers (except Vivaldi) do some weird stuff when tearing
  off a tab or branch to create a new window.  This may *sometimes* separate
  a parent tab from its children and move the children to the left edge of
  their tab bar.  As a workaround, open a new window manually with `Ctrl+N`
  and then use the tree view to move tabs to it.

- Vivaldi's stacked tabs are incompatible with this extension.  This might
  not be solve-able.  Vivaldi Workspaces are not tested at all, and may cause
  problems.

- When a sidepanel and a full page view are open at the same time in the same
  window, or more than one full page view, "extension shortcut" keys can
  control both simultaneously, causing unwanted side effects.  Until this is
  fixed, avoid using extension shortcuts when more than one view exists in
  a single window.

- Firefox doesn't allow extensions to access `file:` URLs or most of the
  `about:` URLs or any extension URLS outside of their own.  I can't fix
  this, but TKTSTO does at least try to avoid opening those.  However, if you
  manage to make it try to load an unloaded forbidden URL, the *next* tab
  opened may take the place of the node you tried to load.

- Firefox 115 generates some warnings about the manifest because the manifest
  is written for newer versions.

- Edge has no way to move the sidepanel to the left side.  It did in the past,
  but Microsoft removed it.

