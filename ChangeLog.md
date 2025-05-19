# ChangeLog

What changed, and when?  You know the drill.

# Next

# 0.0.1.0 (2025-05-19)

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

