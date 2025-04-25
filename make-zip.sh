#!/bin/sh
# make the extension .zip file for browsers to load

BROWSER=${1:-chromium}
PROGRAM="tktsto"
VERSION=$(grep '"version"' manifest.json | sed -rn 's/.*: "(.*)".*/\1/p')

# clean the build area
mkdir -p build
rm -rf build/*

# copy root-level files
cp -v \
  LICENSE \
  Makefile \
  *.js \
  *.md \
  *.html \
  build

# manifest differs per browser
if [ 'firefox' = "$BROWSER" ]; then
  cp -v manifest-ff.json build/manifest.json
else
  cp -v manifest.json build/manifest.json
fi

# copy subdirs
SUBDIRS="bkgd common docs img options themes view"
for d in $SUBDIRS ; do
  mkdir -p "build/$d"
  cp \
    "$d"/*.js \
    "$d"/*.html \
    "$d"/*.css \
    "$d"/*.md \
    "$d"/*.png \
    "build/$d"
done

mkdir -p dist
cd build
ZIPFILE=../dist/"$PROGRAM"-"$VERSION"-"$BROWSER".zip
rm -f "$ZIPFILE"
zip -r "$ZIPFILE" *

