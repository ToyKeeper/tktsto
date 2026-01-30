#!/bin/sh
# make-zip.sh: make the extension .zip file for browsers to load
# Copyright (C) 2025 Selene ToyKeeper
# SPDX-License-Identifier: AGPL-3.0-or-later

BROWSER=${1:-chromium}
PROGRAM="tktsto"
REPO=$(git rev-parse --show-toplevel)
cd "$REPO"

VERSION=$(./bin/version-string.sh)

# clean the build area
echo "rm -rf 'build/'"
rm -rf build
mkdir -p build

# copy root-level files
cp ChangeLog.md \
  LICENSE.* \
  PRIVACY.md \
  readme.md \
  *.js \
  build

# manifest is different for some browsers
MANIFEST='manifest.json'
[ 'firefox' = "$BROWSER" ] && MANIFEST='manifest-ff.json'
bin/make-manifest.sh "$MANIFEST" build/manifest.json

# copy subdirs
for d in bkgd common docs img options themes view ; do
  mkdir -p "build/$d"
  cp $(git ls-files "$d") "build/$d"
done

mkdir -p dist
ZIPFILE=dist/"$PROGRAM"-"$VERSION"-"$BROWSER".zip
rm -vf "$ZIPFILE"
cd build
zip -q -r "../$ZIPFILE" *

echo "created '$ZIPFILE'"

