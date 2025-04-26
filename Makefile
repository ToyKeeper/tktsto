# Makefile: a very basic, uh, Makefile ... pretty self-explanatory
# Copyright (C) 2025 Selene ToyKeeper
# SPDX-License-Identifier: AGPL-3.0-or-later

all: firefox-zip chrome-zip

# make a zip file suitable for loading into
# about:debugging#/runtime/this-firefox -> Load Temporary Add-On
firefox-zip:
	./make-zip.sh firefox

chrome-zip:
	./make-zip.sh chromium

todo:
	grep -1 -n -E 'TODO|FIXME' *.js */*.js */*.html */*.css | less -S

