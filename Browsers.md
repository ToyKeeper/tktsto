# Browser Support Status

What to expect in each type of browser.

- [Chrome](#chrome-chromium)
  - [Edge](#edge)
  - [Brave](#brave)
  - [Vivaldi](#vivaldi)
  - [Maxthon](#maxthon)
- [Firefox](#firefox)
  - [Floorp](#floorp)
  - [Zen Browser](#zen-browser)
- [Other known issues / not browser-specific](#general)
- [Unsupported browsers](#unsupported-browsers)

## Firefox

Tested: Firefox ESR 115 to 140, 149 (via Floorp)

Known issues:

- Can't open `file:` URLs or `about:` URLs or other extension URLs or some
  others, because the browser explicitly forbids extensions from opening URLs
  it deems as unsafe.  You can unload and save these tabs, but cannot load
  them again later from the Tree View.

- Can sometimes save unwanted windows in the tree, requiring manual deletion
  later.

- Doesn't remember window geometry unless you focus a different window and
  then return to the original window.  Because Firefox doesn't implement the
  `windows.onBoundsChanged` event, so it uses a kludge to detect these
  changes during `windows.onFocusChanged` instead.

- In FF 128 and older, the hoverMenu buttons are a weird size when zoomed.

- **Older versions of Firefox** generate warnings during install because the
  manifest file contains clauses for newer versions.  The manifest may also
  need some sections removed in Firefox 115 ESR.  The extension itself still
  works though, so I've chosen NOT to increase the minimum allowed version.

- Rendering is sometimes off by 1 pixel at some zoom settings.


## Chrome / Chromium

Tested: Chromium 134 to 146

Includes Ungoogled Chromium.

Known issues:

- Chromium-based browsers often do weird and inconsistent things when
  **tearing off a tab from the tab bar** to create a new window or move it to
  another window.  If you encounter issues, use TKTSTO to move tabs between
  windows instead of using the browser's native functions.  There are
  multiple ways to do this:
  - **Mark-n-paste**: "Mark" the tabs in TKTSTO in the window you want to
    move them *from*.  Focus the destination window.  Use TKTSTO's "paste"
    function to move tabs into this window.  "Unmark all" in TKTSTO.
  - Or put a TKTSTO tree view in **Session mode**, and move tabs around
    within that view, using either the mouse or keyboard.

- Internal extension pages cannot be opened in incognito windows.  That means
  the TKTSTO **"Options", "Help", and "Tab" pages don't work in incognito**
  mode.  I can't fix that, since it's a browser policy issue.  So it greys
  out those buttons in incognito windows in Chrome-based browsers.


## Edge

Tested: Edge 136 to 143

Mostly the same as [Chrome](#chrome-chromium).

Known issues:

- **Edge doesn't allow moving side panel to the left side.**
  Microsoft removed this feature.  I don't know why.

- In dark mode, Sidepanel title renders all-white.
  Seems to be a bug in Edge.


## Brave

Tested: Brave 1.78, 1.88 (Chromium 136, 146)

Behaves the same as [Chrome](#chrome-chromium).


## Vivaldi

Tested: Vivaldi 7.3, 7.7

Mostly like [Chrome](#chrome-chromium).

Known issues:

- Vivaldi doesn't seem to allow the sidepanel or extension pages to open in
  incognito windows, even when the extension has permission to run in
  incognito mode.  So the **sidepanel is completely broken in incognito**
  windows in Vivaldi, and there's nothing I can do to fix it.

- When **closing a window using the "X" button** in the corner of a window,
  and that window has pinned tabs, **Vivaldi moves the pinned tabs** to
  a different window instead of closing them along with the window.  Then
  when the window is re-opened later, it doesn't have its pinned tabs.
  **To avoid this, click [U]nload** on the window node in TKTSTO when you
  want to close a window.  Then it will correctly remember pinned tabs.

- The sidepanel does not actually unload when the sidepanel is collapsed.
  **Vivaldi keeps all sidepanels loaded at all times**, and does not seem
  to have a way to actually unload them.  To force it to reload a tree view,
  the user must **turn the entire extension off and on again**.

- Some Vivaldi-specific features are completely invisible to TKTSTO, so it
  may interact with them in strange ways:

  - **Stacked tabs** aren't managed by TKTSTO, so rearranging the tree will
    not change your stacked tabs.  If you unload and re-open stacked tabs,
    they will return as unstacked tabs.

  - **Split views** or **tiling** might behave oddly.


## Maxthon

Tested: Maxthon 7.3.1 (in WINE, in Linux)

Mostly like [Chrome](#chrome-chromium).

Known issues:

- Browser doesn't allow moving side panel to the left side.

- If Maxthon is configured to put new tabs to the right of all tabs, TKTSTO
  won't be able to build a tree of related tabs while you browse.  It is
  strongly recommended that you configure Maxthon to put new tabs to the
  right of the current tab instead.

- Immediately after installation, some extension functions might not work
  correctly.  I had to reboot the browser before I could open TKTSTO's
  options page, for example.

- Maxthon sometimes overrides the requested window size and position, so
  TKTSTO might not be able to put your saved windows back in the same screen
  position where you saved them.

- When closing a window which is NOT the last window, Maxthon may pop up
  a confirmation asking the user if they really want to exit Maxthon.  This
  is a bug in Maxthon, and it won't cause the entire browser to exit.


## Floorp

Tested: 12.12.0 (FF 149)

Behaves the same as [Firefox](#firefox), but with some nice extras.  Works
well.  Can turn off the native tab bar entirely.

- Haven't tried to support Workspaces yet.


## Zen Browser

Tested: 1.18.3b

Inherits most [Firefox](#firefox) issues, but has **way more bugs**, and most
**can't be fixed**.  Not recommended.

- To get TKTSTO working in Zen Browser, you **MUST turn off "Window Sync"**.
  Window Sync is fundamentally incompatible with TKTSTO and can probably
  never be supported.  Additionally, I found Window Sync was **buggy AF**
  even without any extensions installed.  Zen users reported frequent data
  loss when using Zen in Window Sync mode, like tabs being replaced by empty
  new tabs, and other more subtle forms of session corruption.  Without any
  extensions installed.

- **"Essentials" tabs don't work**, and are unlikely to ever work.

- **Never tear off tabs from the Zen sidebar**.  It will desync that tab from
  the tree, and may cause other issues.  It is strongly recommended to turn
  off Zen's sidebar and tab UI entirely, and instead open TKTSTO when you
  want to view or interact with your tab tree.

- Read the **Zen-specific parts of the tutorial**, to find out what settings
  to change and how to avoid landmines.

There is no API to detect or support Zen-specific features, and the developer
knows basically nothing about how the WebExtensions API works or what is
needed to allow extensions to support his browser.  In addition to not
implementing an API for his browser-specific features, he routinely also
breaks the APIs he inherited from Firefox... and it keeps getting more broken
with each new release.  So it is likely that Zen Browser support will become
less and less feasible over time.  It's really buggy, getting worse, and
I can't fix it.

https://old.reddit.com/r/zen_browser/comments/1qrgm7q/the_concept_behind_window_sync/


## General

Known issues which are not browser-specific:

- The browser's advanced tab functions are typically not compatible with
  TKTSTO, and may be impossible to support.  Especially browser-specific stuff,
  since derivatives almost never implement APIs for the features they add.
  TKTSTO is meant to completely replace those features, not work in tandem.
  This includes:
  - "tab groups" (support coming soon probably)
  - "stacked tabs"
  - AI-based tab features (it might work, technically, but it would totally
    wreck your tree)
  - split view (multiple pages open at once, side by side, in a single window)
    ... instead, I'd recommend just putting separate windows side by side.

- When a sidepanel and a full page view are open at the same time in the same
  window, or more than one full page view, "extension shortcut" keys can
  control both simultaneously, causing unwanted side effects.  Until this is
  fixed, avoid using extension shortcuts when more than one view exists in
  a single window.


## Unsupported browsers

- **Safari** doesn't have WebExtension support yet.  TKTSTO cannot support
  Safari until that is fixed.  But I am hopeful that this can happen someday.


