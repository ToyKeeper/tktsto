# TK Tree Style Tab Outliner

Windows, tabs, bookmarks, notes, and more... all mixed together in one place,
a highly structured living document that you and your browsers build together
to organize your online life.

It can also sync real-time-ish across all your browsers, to make sure you
always have what you need -- even if they're *different* browsers.  Close your
session in Chrome, then start up Firefox or Brave or whatever, and continue
that same session where you left off.  And you control your data -- nothing is
sent to corporate clouds, only to a server of your choice.  Self-hosting is
recommended for maximum privacy.

This extension makes many of the browser's built-in functions wholly or at
least partially obsolete -- bookmarks, session management, vertical tabs,
read-later, notes, stacked tabs, AI tab organizers, etc.  You could still use
those things, but why bother when you have something better?

[TOC]


## Screenshots

Just a few pics to give a general idea what this is all about.

Example usage, in dark and light themes:

![Dark theme](https://toykeeper.net/tktsto/gfx/tktsto-dark.1.png)
![Light theme](https://toykeeper.net/tktsto/gfx/tktsto-light.1.png)

Some of the dialog popups:

![Dialogs](https://toykeeper.net/tktsto/gfx/tktsto-themes.1.png)

Internal documentation / help pages:

![Docs (dark)](https://toykeeper.net/tktsto/gfx/tktsto-docs.1.png)
![Docs (light)](https://toykeeper.net/tktsto/gfx/tktsto-docs.2.png)


## Background / Inspiration

I used Tabs Outliner for a long time.  It was great.  But it was missing some
important things, and it has been increasingly buggy over time from poor
maintenance, and it's proprietary so I can't fix it.

I also tried to use Tree Style Tab in Firefox, but even with multiple add-ons
to enhance it, it just can't do what I wanted.  And I tried several others, but
none really hit the mark.

So I decided to replace Tabs Outliner with something brand new.

And while I'm at it, I can finally add all the stuff I wanted it to have.


## Improvements over Tabs Outliner

The biggest upgrades are pretty broad:

- It should be **free and open-source**.  That is the only way to build tech
  which stands the test of time.  No crippled "free" version to convince people
  to buy the real thing.  Donations are GREATLY appreciated though, since
  I need to buy groceries and pay rent in order to keep working on this.
- I want the tree **continuously backed up**.  If I lose a hard drive again,
  that should *not* make me lose my browser session, notes, etc.
- It should **back up to a server the user owns and controls**.  It should not
  depend on a rent-seeking, privacy-violating corporate cloud.
- I want **all my browsers to share the same tree**.  Having separate trees and
  sessions for each browser is a huge pain.
- I don't want to be locked into using Chrome.  It should **support more than
  one browser**.  Sync between Chromium, Firefox, Vivaldi, Edge, Brave, ...
  whatever.  Vendor lock-in sucks, especially with the major players all racing
  to fill their browser with AI to analyze everything you do online.
- I want to be able to **easily export the tree in standard formats** like
  json, markdown, and plain text.

It should also have lots of other features which are missing in Tabs Outliner:

- Sidebar mode (and "just this window" mode, while running as a sidebar)
- Even more compact layout than Tabs Outliner, to make it fit better in
  a narrow sidepanel
- Snapshots and revision history so you can undo mistakes, restore old sessions
  easily, see how things changed over time, etc.  And on that note...
- Undo
- Checklists / tasks
- Search
- Sort
- Longer notes when desired
- Configurable hotkeys, both while focused and while browsing
- Batch operations on marked items
- Ability to easily move sets of nodes between windows without a mouse or
  opening a "full tree" view (mark nodes in one window, switch to other window,
  then paste the marked nodes to move them)
- Open new blank tabs next to the current tab
- User's choice of several themes, and ability to add more
- Better handling of crashes and restarts... no huge trees full of old crashed
  windows to manually recover and de-dupe
- Better tools to find and remove duplicates, especially for users who are
  importing their old sessions
- Bigger drop zones so the user doesn't have to be so precise during
  drag-n-drop
- Better visual indication for where the open tabs are in a massive tree
- Proper Manifest V3 support so it doesn't need to be manually restarted all
  the time
- More generally, fixes a wide range of bugs which Tabs Outliner had


## Dependencies

Client dependencies: None.  Only your browser.  However, it does need to be
recent enough to support the sidepanel feature.

Client build dependencies:  Not much.  Get (or git) a copy of the source.  For
Chrome, that alone is sufficient.  For Firefox, you'll also need a command
line, the "make" program, and the "zip" program.

Javascript dependencies are their own circle of hell, so this is built using
just vanilla javascript with no outside dependencies at all.

Server dependencies: TBD.  Probably Python and FastAPI.


## Installation

Install from your browser's app store, ideally.  It boosts the numbers in the
app store and helps this extension gain more visibility.  It also allows easier
updates, in case you want updates when a new version is released.

These are the stores where TKTSTO is published.  Each link is a redirect to the
store's extension page:

- Firefox: https://toykeeper.net/tktsto/firefox
- Chrome: https://toykeeper.net/tktsto/chrome
- Edge: https://toykeeper.net/tktsto/edge

Please leave a review at the store so "the algorithm" will know to show the
extension to other people.

## Installing from source

If your browser store isn't added yet, or if you prefer to build the extension
yourself, here's how:

### Chrome

In Chromium-based browsers:

- Enable "developer mode" in the browser's extensions page.
- `git clone --tags https://github.com/ToyKeeper/tktsto.git`
- `cd tktsto`
- `make chrome-zip`
- `rm -rf active` if you already have an `active/` dir.
- `mv build active`
- Use "load unpacked extension" in the browser, to load the copy in the
  `active/` dir.

This process mostly just copies all the files into `active/`, but also inserts
required values into the `manifest.json` file.  Chrome can run extensions
in-place from source, but this repository's manifest needs a few values filled
in first, and that is done by `make`.

### Firefox

In Firefox, it's necessary to sign the extension because most 2025-and-later
versions won't run unsigned extensions even if you configure it to not require
signatures.  If you're lucky enough to be able to run unsigned extensions, then
just run `make` to generate a compatible .zip file, and load it from the
`dist/` dir.  Otherwise, try the following...

Create an account and API keys at https://addons.mozilla.org/developers/
(under "API Keys").

Create a `.env` file containing a few settings:

```sh
# get these from your account at addons.mozilla.org/developers
JWT_ISSUER='MYUSER'
JWT_SECRET='MYSECRET'

# set your own extension ID and name here
EXT_NAME="TK Tree Style Tab Outliner (My Name's personal build)"
FF_EXT_ID="your-email-address+tktsto@your-email-domain.com"
```

Run `make firefox-xpi`.

Install the `.xpi` file.

### Server

FUTURE: I also recommend installing [the backup/sync server](server/readme.md),
so you can automatically save snapshots of your session, sync your session
between multiple devices, convert the snapshots to other formats, and archive
old data that you don't need in the tree any more.


## Usage

The extension should show a tutorial thingy after being installed for the first
time.  You can also access the tutorial again later by pressing "?" in the tree
view while it has focus.  Or there's the "Help" button for full documentation.


## Initial setup / configuration

Basic setup:

- Click the "Options" button to get the config settings.
- Set a client name.
- Configure automatic backups.
- Choose a theme, and any other options you'd like.
- Go through the tutorial.  It should have been generated as a set of nodes in
  the tree when you installed the extension.

FUTURE: I strongly recommend installing and using the provided backup/sync
server, so you can automatically save snapshots of your session and sync
between browsers.  This is covered in [the server's readme
file](server/readme.md).

Then maybe go into the "Extension hotkeys" page of your browser to configure
global command hotkeys.

- Firefox: Go to `about:addons`, then click the gear icon, then "Manage
  Extension Shortcuts".
- Chrome: `chrome://extensions/shortcuts`
- Edge: `edge://extensions/shortcuts`
- Brave: `brave://extensions/shortcuts`
- Vivaldi: `vivaldi:extensions` then "Keyboard shortcuts".

The browser doesn't allow extensions to define more than 4 recommended global
hotkeys.  So you should set those up.  I recommend assigning keys which match
the key bindings for the sidepanel's normal usage, like when it has keyboard
focus...  but add "Alt" to each one so you can perform those same functions
without having to focus the sidepanel first.

For example, when the sidepanel is focused, some of the default hotkeys
include...

- `u`: unload the highlighted node
- `Enter`: load the highlighted node
- `Up` / `Down`: move the cursor
- `Shift+Up` / `Shift+Down`: move the node the cursor is on
- `Space`: expand/collapse the highlighted node

So in your extension hotkeys, I'd recommend assigning them like this:

- `Alt+u`: unload the current tab
- `Alt+Enter`: load the highlighted node
- `Alt+Up` / `Alt+Down`: move the cursor
- `Alt+Shift+Up` / `Alt+Shift+Down`: move the node the cursor is on
- `Alt+Space`: expand/collapse the highlighted node

Just take the regular key and add "Alt".  Do this for every function you think
you'll want to use during normal browsing without having to focus the sidepanel
first.


## Roadmap

There is much to do.  Work so far has mostly focused on the client (the browser
extension), so the server still remains to be built.  Here's a rough outline:

Client (browser extension):

- Basic functionality
    - [x] Display a tree view
    - [x] Sync internally between views and the service worker
    - [x] Open/close sidepanel
    - [x] Keyboard and mouse event handling
    - [x] Buttons, dialog boxes, and other widgets
    - [x] Persistent tree state / data storage
    - [ ] i18n / locales
- Tree node types / data
    - [x] Tabs / Bookmarks (pages can be loaded, unloaded, or "was loaded")
    - [x] Labels (short notes)
    - [x] Long notes
    - [x] Checkboxes
    - [x] Window nodes
    - [x] Basic metadata: node IDs, timestamps, tab state, etc
    - [x] favicons
- Tab / Window / browsing functions
    - [x] Handle browser events, like opening or closing tabs and windows
    - [x] Load / unload tabs
    - [x] Remember tab positions
    - [x] Open new tabs next to current
    - [x] Keep tree nodes synced with browser tabs
    - [x] Move tabs in tree to also move them in the browser's tab bar
    - [x] Move tabs in tab bar to edit tree order
    - [+] Tear off tab to make new window with entire branch inside
        - [x] Firefox
        - [x] Vivaldi
        - [ ] Brave (has some known issues which are tricky to fix)
    - [x] Save and load entire windows
    - [x] Remember window positions/sizes
    - [x] Open new windows when necessary, while moving loaded pages
    - [x] Handle the browser's built-in session management
    - [x] Incognito windows
- Tree editing via keyboard
    - [x] Cursor movement
    - [x] Move nodes with keystrokes
    - [x] Move nodes via browser commands (global hotkeys)
    - [x] Move nodes via mark-n-paste
    - [x] Add nodes
    - [x] Delete
    - [x] Expand / collapse
    - [x] Load / unload
    - [x] Switch to tab
    - [x] Edit notes
    - [x] Edit tasks
- Tree editing via mouse
    - [x] Move nodes via drag-n-drop
    - [x] Move nodes via mark-n-paste
    - [x] Hover menu for common operations...
        - [x] Unload
        - [x] Edit tasks
        - [x] Edit notes
        - [x] Mark
        - [x] Delete
    - [ ] Clickable note icons
    - [x] Clickable task buttons
    - [x] Add nodes (can drag text into the tree to make a new label)
    - [x] Expand / collapse
    - [x] Load / unload
    - [x] Switch to tab (double click a tab node)
    - [x] Open link in new tab (middle click a link node)
    - [x] Drag-n-drop text and links into tree
    - [x] Drag-n-drop to export nodes as markdown
    - [ ] Full context menu
- Browser support
    - [x] Firefox (and clones)
    - [x] Chrome (and clones)
    - [x] Edge
    - [ ] Safari (might work, untested)
    - [x] Brave
    - [x] Vivaldi
    - [x] Maxthon
    - [ ] Ladybird (when the browser is ready for extensions)
    - [ ] ... others?
    - [ ] Usage notes for each browser
- Backups
    - [x] Manual local backups
    - [x] Automatic local backups
    - [ ] Restore backups (fully replace tree)
    - [x] Import backups (add to tree)
    - [+] Import backups from other programs
        - [x] Tabs Outliner (json exports)
        - [ ] ... other similar tools?
        - [ ] Import from browser's built-in bookmarks
- Themes
    - [x] Theme selector
    - [x] Dark theme
    - [x] Light theme
    - [ ] Additional themes
    - [ ] User style overrides
    - [ ] Font style and tree spacing adjustment
- View modes / view functions
    - [x] Sidepanel mode
    - [x] Full page mode (open tree in a regular tab)
    - [x] Whole-session view scope
    - [x] Window-only view scope
    - [x] Remember view scope per window
    - [ ] Remember panel size per window
    - [ ] Remember details/notes/plain mode per window
    - [x] Zoom buttons (can also zoom using browser built-in controls)
    - [ ] Tab count on extension badge
    - [ ] Sort
    - [ ] Search
    - [ ] Find duplicate and similar nodes
- Options UI / configuration
    - [x] Basic minimum functionality
    - [ ] Styling
    - [ ] Organize config sections into tabs
    - [ ] User-configurable hotkeys
    - [x] User-configurable browser command keys
    - [ ] User-configurable task types
    - [ ] Configure which buttons are shown in the tree view
- Transactions / snapshots / server
    - [x] Unique ID generator for node and transaction IDs
    - [ ] Snapshots
    - [ ] Transactions
    - [ ] Undo
    - [ ] Sync to/from server
    - [ ] Sync conflict resolution
- Documentation
    - [x] New user tutorial
    - [ ] Built-in help pages
    - [ ] Styling

Server:

- [ ] Select a server framework (probably python + fastapi)
- [ ] Write the server and make it actually sync with clients
- [ ] Secure authentication
- [ ] Easy installation in Linux, Windows, and MacOS
- [ ] Appliance images for people with a spare raspberry pi or similar
- [ ] Hosted sync service for folks who don't want to self-host
- [ ] Export compressed snapshots on a schedule
- [ ] Save snapshots in git
- [ ] Extensionless mode, to provide partial functionality for browsers which
  can't run the extension, like phone browsers which don't allow extensions

Misc tools:

- [x] Convert TKTSTO json files to plain text / markdown (bin/json2md.py)
- [x] Convert Tabs Outliner html exports to TKTSTO json backup files
- [x] Compress local backup files and archive from "Downloads/" to somewhere
      better (Linux only so far)
- [ ] Super simple backup-only server


General project stuff:

- [x] Git repo
- [x] Chat / community server
- [x] GitHub project
- [ ] GitHub bug template
- [x] Code of conduct, DCO, etc
- [ ] Contributor agreement signed by each contributor (like, verify you
  actually wrote the code you're contributing, and agree to the code of
  conduct)
- [ ] Upload official builds to extension stores for each browser


## Tips / Best practices

**Name your windows!**

Put most of your per-window sidebars in **"Window" mode**, so it'll only show the
tabs and notes in that specific window.  **"Session" mode** is only needed
occasionally, for doing things like loading a saved window.

**Unload tabs** you don't immediately need.  They'll still be available later when
you have time for them.  Instead of keeping a tab open for weeks or months
until you have time to do it... add a quick note about why it was open, what
action it needs from you, then unload it.  Much easier than devoting space in
your head, your RAM, and your tab bar.

**Zoom the sidebar** to a comfortable size.  There are two ways to do this:

1. Click the "+" and "-" buttons in the sidebar header.  This affects only the
   sidepanel.

2. Change the browser's zoom setting for the entire extension.  This affects
   all pages and views in the extension:

   - Chrome: Click the "Options" button in the sidebar, then use Chrome's
     normal zoom functions in the options page.  It should zoom the sidebar
     too.  Try Ctrl+Mousewheel, or Ctrl with "=" or "-".

   - Firefox: Focus the sidebar by clicking in it, then use Ctrl+Mousewheel to
     zoom the sidebar.

When moving stuff between windows, use **mark and paste**.  Mark the items in
one window, then switch to a different window and paste the items.  I find this
much easier than trying to drag stuff around with a mouse.  Also note: Items
are pasted in the order you marked them, which might not be the same order they
were in the tree before pasting.

### Organization

Put the most important and most recent items near the top of whatever branch
they are in.  The farther down you go, the older and less important the items
should be.  This also keeps the most important tabs near the left edge of the
window.

Treat every item in your tree as a "todo list" item, even if it doesn't have
a checkbox.  Then when you are done with a task, done with a tab or a note or
an entire branch... move it so it's hidden inside of a heading like "Done" or
"Old".  This keeps your main view less cluttered so you can focus more easily.

Every once in a while, archive the contents of your "Old" or "Done" branches.
Drag the branch into a separate program to export it as markdown, then remove
from the tree.  Or take a snapshot or backup file, convert it to your favorite
format, and make a separate copy which only contains those old branches.  Then
remove them from your active tree.  This helps keep your session quick and
responsive, instead of gradually getting slower as you accumulate more and more
old junk.

Specifically, I'd recommend moving your old nodes in a manner which organizes
them by date, and then maybe once a year, archive anything which is more than
a year old.  Try a structure like this...

- Done / Old / Cancelled
  - 2025 (or whatever the current year is)
    - (this is where you put nodes and branches as you finish them)
  - 2024
    - (this holds last year's nodes, for easy reference)
  - 2023 (empty, only one node)
    - (archived to ~/tabs/2023/archived.md)
  - 2022 (empty, only one node)
    - (archived to ~/tabs/2022/archived.md)

For task / checkbox nodes, I recommend a few generic task states:

- `[ ]`: todo / incomplete (space or underscore or dash)
- `[+]`: partially done / half complete (counts as `50%`)
- `[X]`: done / completed  (or `[*]` works too)
- `[F]`: failed
- `[S]`: skipped
- `[!]`: important
- `[?]`: unknown / unsure
- `[%]`: displays completion percent of child nodes

But you're free to assign task states however you like, for whatever your
workflow requires.  You can use any type-able letter, number, or punctuation as
a task state... and assign your own meaning to it.

### How to implement a personal kanban for tabs in your sidebar

For detailed statuses and complex workflows, I recommend putting nodes inside
of a heading which indicates the type of action needed, and then letting nodes
flow through the process you created.  For example:

- Work
  - Messages
    - Unread
    - To reply
    - Waiting for reply
    - Funny stuff Dave said
    - Done
  - Bugs
    - New
    - Needs triage
    - Waiting on more info
    - Needs testing
    - Worked on this week, re-evaluate next week
    - Ping if not updated by end of month
    - Fixed but needs regression tests added
    - Done
  - Meetings
    - Upcoming
    - Recurring
    - Done

Then when you reply to a "To reply" message, move it to "Waiting for reply" or
"Done".  It doesn't really need a checkbox... it just needs to move from one
list to another when the status changes.

### Daily todo list / log / calendar

Here's a neat way to track your tasks and progress and stuff on a daily basis.
Create a node called 'Daily', then inside that, add more headings for year,
month, day, and tasks and details for each day.

- Daily
  - 2025
    - 04
      - 04
        - `[F]` 404 brain not found, stayed up too late and barely slept
      - 03
        - `[ ]` pay bills
        - `[+]` myproject: add feature X
        - `[X]` laundry
        - `[X]` exercise
        - `[X]` 19:00 game night w/ friends
      - 02
        - `[X]` shower
        - `[X]` groceries
        - `[X]` myproject: add feature Z
        - `[ ]` myproject: add feature X
        - `[F]` Dave called, and I spent the day dealing with his problems
        - `[ ]` exercise
        - `[ ]` pay bills
      - 01
        - `[X]` April Fools Day, take a day off
        - `[X]` get a pizza and hide from the world
        - `[X]` anime

### Keeping Windows Open / More Reliable Crash Recovery

I've started keeping an identifier tab in each window, for two reasons:

- I often wanted to keep a window open even when there were no meaningful
  tabs in it, so I could browse the session tree and load saved tabs.  So
  I started adding a lightweight junk page at the top of each window, and
  giving it a label of "Keep Window Open".

- If you have the same pages open in more than one window, it can be hard for
  TKTSTO to tell which one is which, and match them to the correct window
  nodes in the session tree.  Although I've only had it happen when testing
  crazy configurations I doubt anyone would use, it can occasionally guess
  wrong and attach the browser window to the wrong window node in the tree.
  So it's helpful to keep a unique page in each window to help it figure out
  which window is which.

Because of this, I got into the habit of adding a unique page to each window.
It only needs to be unique enough to ensure none of *your* other windows will
ever have that page open.  Ideally something lightweight and fast with no
scripts or media, so it won't use much memory or CPU.  Then I pin that page
and ignore it.

What I use for this is a tiny "marker page" I created on my server:

- http://toykeeper.net/tktsto/title?t=Whatever

One of these (with a unique title) goes into each window, pinned and
collapsed and forgotten.

But you can use whatever.  Can even be discarded or hidden, since it doesn't
need to be *fully* loaded, and you're not meant to ever *look* at it.  The
sole purpose is to put some sort of persistent identifier on each window.
And sometimes to keep the window open when it has no other tabs loaded.

I initially wanted to make an internal page in TKTSTO for this purpose, but
then I realized it wouldn't work.  Extension pages get closed when the
extension is reloaded, so the marker page wouldn't stay open reliably... and
that defeats the whole purpose of it.  So it has to be an external page.

Thus, I created a very minimal page on my site to use for this.

You're welcome to use mine if you want, but it's not private.  It'll log
a page load on my server every time you open it.  Granted, I almost never
look at my web server logs, and the old logs get deleted after a couple
weeks, but still.  It's the principle of the thing.


## FAQ

**What is Tiki Tiestio?**  It's just a cute way to say "TKTSTO".

**Where are my bookmarks?**  This extension does not touch your browser's
built-in bookmarks.  It is completely separate, and makes the legacy bookmark
system mostly pointless.


## Links

The main project links are redirect URLs -- to make the links easier to
remember, to reduce reliance on corporate cloud services, and to reduce
disruption in case the links ever need to change.  For example, if code hosting
ever moves from GitHub to another site, the links below should still point at
the current project hosting site:

- Code / Development: https://toykeeper.net/tktsto
- Releases: https://toykeeper.net/tktsto/releases
- Change Log: https://toykeeper.net/tktsto/changelog
- Documentation: https://toykeeper.net/tktsto/docs
- Chat / Discord Invite: https://toykeeper.net/tktsto/chat
- Donate / Patreon: https://toykeeper.net/tktsto/donate

Installing the extension from source or from web extension stores:

- From source: https://toykeeper.net/tktsto/releases
- Chrome: https://toykeeper.net/tktsto/chrome
- Firefox: https://toykeeper.net/tktsto/firefox
- Edge: https://toykeeper.net/tktsto/edge
- Safari (TBD): https://toykeeper.net/tktsto/safari


