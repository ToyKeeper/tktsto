# Makefile: a very basic, uh, Makefile ... pretty self-explanatory
# Copyright (C) 2025 Selene ToyKeeper
# SPDX-License-Identifier: AGPL-3.0-or-later

# undecided whether to auto-bump on each 'make' or if it should be manual
#all: bump firefox-zip chrome-dir
all: firefox-zip chrome-dir

help:
	@echo "Usage: make [target]"
	@echo "Make-able targets include:"
	@echo "  all (default)  Makes 'firefox-zip' and 'chrome-dir'"
	@echo "  help           Print usage info"
	@echo "  bump           Increment the build number"
	@echo "  todo           Show dev tasks waiting to be done"
	@echo "  chrome-dir     Make a 'Load Unpacked Extension' dir for Chrome"
	@echo "  chrome-zip     Make a .zip extension for Chrome"
	@echo "  firefox-zip    Make a 'Load Temporary Add-On' .zip for Firefox"
	@echo "  firefox-xpi    Make a signed .xpi extension for Firefox"
	@echo "                 (see readme.md for required setup)"

# increment the build number
bump:
	./bin/version-string.sh bump

# make a dir suitable for loading into Chrome via
# "Extensions" -> "Developer Mode" -> "Load Unpacked Extension"
chrome-dir: chrome-zip
	rm -rf dist/chromium
	mkdir -p dist
	mv build dist/chromium

# Does chrome even use these?
# Will at least be useful as an intermediate step for making a .crx later.
chrome-zip:
	./bin/make-zip.sh chromium

# make a zip file suitable for loading into
# about:debugging#/runtime/this-firefox -> Load Temporary Add-On
firefox-zip:
	./bin/make-zip.sh firefox

# make a .xpi file (signed Firefox extension) which can be loaded into
# any Firefox browser (requires uploading to Mozilla for verification
# and for crypto-signing the result)
firefox-xpi:
	./bin/firefox-xpi.sh

todo:
	grep -1 -n -E 'TODO|FIXME' *.js */*.js */*.html */*.css | less -S

