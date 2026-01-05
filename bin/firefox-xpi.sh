#!/bin/sh
# firefox-xpi.sh: convert a .zip to a signed .xpi for Firefox
# Copyright (C) 2025 Selene ToyKeeper
# SPDX-License-Identifier: AGPL-3.0-or-later
# requires Mozilla's 'web-ext' program and valid addons.mozilla.org auth info

set -e

REPO=$(git rev-parse --show-toplevel)
cd "$REPO"

# default channel is private / unlisted,
# but it can be overridden by .env
# value can be "listed" or "unlisted"
[ -z "$WEB_EXT_CHANNEL" ] && WEB_EXT_CHANNEL="unlisted"

# environment vars could already be set, but load a local copy if it exists
if [ -f ./.env ]; then
  set -a  # export all vars set here
  . ./.env
  set +a  # turn off auto-export
fi

# stop if required data is missing
if [ -z "$JWT_ISSUER" -o -z "$JWT_SECRET" ]; then
  echo "Abort: Couldn't find JWT_ISSUER or JWT_SECRET"
  exit 1
fi

# create the .zip we're going to sign, and prepare build/
make firefox-zip

# look for a usable 'web-ext' program
set +e
WEB_EXT=$(command -v web-ext)
NPX=$(command -v npx)  # fallback to npx maybe
set -e
[ -z "$WEB_EXT" -a -n "$NPX" ] && WEB_EXT="$NPX web-ext"
[ -z "$WEB_EXT" ] && echo 'Abort: No web-ext found.' && exit 1

# upload build/* to addons.mozilla.org for validation and signing,
# then download a .xpi to dist/
# (may take several minutes)
$WEB_EXT sign \
  --source-dir build \
  --artifacts-dir dist \
  --channel "$WEB_EXT_CHANNEL" \
  --api-key "$JWT_ISSUER" \
  --api-secret "$JWT_SECRET"

