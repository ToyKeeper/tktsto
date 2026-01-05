#!/bin/sh
# version-string.sh: generate and/or bump the version string
# Copyright (C) 2025 Selene ToyKeeper
# SPDX-License-Identifier: AGPL-3.0-or-later
# Usage: version-string.sh [bump]
# Display current version string, and optionally bump (increment) it.
# Generates number from git tags+commits and build number sequence.

REPO=$(git rev-parse --show-toplevel)
VERSION_FILE="$REPO"/.version
BUILD_FILE="$REPO"/.build

main () {
  [ "bump" = "$1" ] && DO_BUMP=1

  # convert 'v1.2.3-4-g987abcd' into '1.2.3.4'
  # and 'v1.2-3-g987abcd' into '1.2.3'
  VERSION=$(git describe --tags --long --match='v*' \
    | sed -E '
      s/^v//;
      s/-g[0-9a-f]+$//;
      s/-([0-9]+)/.\1/;
      ' \
    )
  echo "$VERSION" > "$VERSION_FILE"

  BUILD_VERSION=''
  [ -f "$BUILD_FILE" ] && BUILD_VERSION=$(cat "$BUILD_FILE")

  # if git rev is higher than last build, reset build number
  # TODO: also detect when git base rev doesn't match
  #       (like if you "git co v0.5 ; make ; git co v0.2 ; make")
  compare_versions "$VERSION" "$BUILD_VERSION"
  if [ 1 = "$?" ]; then
    echo "$VERSION".0 > "$BUILD_FILE"
  fi

  [ 1 = "$DO_BUMP" ] && bump

  cat "$BUILD_FILE"
}

bump () {
  BUMPED=$(awk -F. '{ $4++; print $1"."$2"."$3"."$4 }' "$BUILD_FILE")
  echo "$BUMPED" | head -1 > "$BUILD_FILE"
}

compare_versions () {
  # returns: 0 if equal, 1 if $1 > $2, 2 if $1 < $2

  a=$1
  b=$2

  # loop until both strings are empty
  while [ -n "$a" ] || [ -n "$b" ]; do

    # take first numeric field
    x=${a%%.*}
    y=${b%%.*}

    # if empty, treat as zero
    [ -z "$x" ] && x=0
    [ -z "$y" ] && y=0

    # numeric compare
    if [ "$x" -gt "$y" ]; then
      return 1
    elif [ "$x" -lt "$y" ]; then
      return 2
    fi

    # drop the first field
    [ "$a" = "$x" ] || a=${a#*.}
    [ "$b" = "$y" ] || b=${b#*.}

    # stop if there are no more fields
    [ 0 = "$a" ] && [ 0 = "$b" ] && return 0

  done

  return 0
}

main "$@"

