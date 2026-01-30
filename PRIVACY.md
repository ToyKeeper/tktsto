# TKTSTO Privacy Policy

[Privacy policy](https://toykeeper.net/tktsto/privacy)
for the
[TKTSTO browser extension](https://toykeeper.net/tktsto)

Effective date: 2026-01-30


## Short version

Privacy is one of the core goals of TKTSTO.

TKTSTO accesses a lot of data about your web browsing, because it cannot
function without that data.  However, TKTSTO does not send that data anywhere
unless you tell it to.

TKTSTO is Open-Source software and encourages users to verify its privacy and
safety for themselves by reading the source code and commit logs.

As development continues, details may change.  Any expected future changes are
noted below as appropriate.


## Where your data is sent

Your data is saved locally in the browser's built-in database, so it can
remember notes and saved windows and such between sessions.

If you use the "backups" feature, your data is saved to your local hard drive,
in plain text files.  This may happen either manually or on a configurable
schedule.  You are responsible for keeping your backups secure.

If you use the "drag-n-drop into other program" feature, the data you dragged
will be sent to the program you dropped it into.  This may be a single node,
a branch, or the entire tree, depending on what you dragged.

TKTSTO does *not* send any data to big corporate cloud services, like the
services operated by Google, Microsoft, Mozilla, Brave, or other browser
vendors.  Additionally, the TKTSTO project does not accept patches to add
features which would send data to these services.

### Future

If you enable the "sync" feature, your data will be sent to and synchronized
with a server of your choice.  As of 2026-01-30, this feature does not exist
yet, but the plan is to add it so users can keep their browsers synchronized.
The sync server will be open-source and self-hostable, so you can keep your
data private on your own server.


## What data is accessed

TKTSTO has access to most of your browsing data:

- URL and title of every browser tab.  This includes "incognito" tabs if you
  grant the permission access to run in incognito mode.  The data includes
  timestamps, like creation time, modification time, and access time.

- Grouping and relative positioning of tabs and windows.  This is how you
  organize your data.

- Screen size and location of each browser window.  This allows saved windows
  to be restored to their original positions.

- The "downloads" API is used for saving local backups.  No local files are
  read using this feature; it is write-only.

- Any data you enter into the extension, such as labels and notes.

- Any data you import, like old session files or backups.

- If you grant access to the clipboard, TKTSTO can access your clipboard.
  This is used for adding notes via the clipboard.

### Future

- In future versions, TKTSTO may keep a record of recent changes in your
  session tree, similar to a commit log in git.  This would enable the "undo"
  feature to work, and would be necessary for synchronizing changes with your
  sync server.  The plan is to limit the amount of history retained, both for
  privacy reasons and to reduce load on the server.

- In future versions, TKTSTO may add the ability to back up and synchronize
  bookmarks and/or cookies.  But this does not exist yet, and if it gets
  added, the user will have the ability to enable or disable those features.

- In future versions, TKTSTO may also access and store favicons for the pages
  you visit, in order to display those icons in the tree view.

- In future versions, TKTSTO may add a feature to edit page titles for loaded
  tabs, in order to reformat them according to the user's preferences.  This
  might require additional browser permissions.


## Tips

To maximize your privacy, don't "sign into" your browser or use the browser's
built-in sync functions.  That would send your data to a corporate cloud.
Instead, set up your own personal server, on your own private network or VPN,
and sync to that.

Half the reason why TKTSTO has (or will have) its own server is so you can
keep your data out of the cloud, and ensure your data is only stored on
devices you own and control.  Signing into your browser defeats the point of
that.


## Changes to this Privacy Policy

As development continues, this policy may need revisions.  For example,
"future" features will gradually be implemented, and then the policy should be
updated accordingly.

Changes will be committed to the project's source code repository, with public
history, so you can see what the policy said at any date, and see reasons for
those changes in the commit messages.

