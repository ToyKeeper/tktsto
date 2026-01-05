#!/bin/sh
# make-manifest.sh: convert a manifest template into a valid manifest.json
# Copyright (C) 2025 Selene ToyKeeper
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Usage: bin/make-manifest.sh manifest.json build/manifest.json

INFILE="$1"
OUTFILE="$2"

REPO=$(git rev-parse --show-toplevel)
cd "$REPO"

# could template anything here, but not much is really needed
VERSION=$(bin/version-string.sh)
EXT_NAME="TK Tree Style Tab Outliner (dev build)"
# you MUST override the FF_EXT_ID in your .env file if you want to sign builds
FF_EXT_ID="tktsto-dev-build@toykeeper.net"

# allow .env to override defaults
if [ -f "$REPO/".env ]; then
  set -a
  . "$REPO"/.env
  set +a
fi

# convert manifest template into valid manifest.json
cat "$INFILE" | sed " \
  s/{VERSION}/$VERSION/
  s/{EXT_NAME}/$EXT_NAME/
  s/{FF_EXT_ID}/$FF_EXT_ID/
  " \
  > "$OUTFILE"

# make it obvious which version is being built
echo "Manifest: ${EXT_NAME} : ${VERSION}"

