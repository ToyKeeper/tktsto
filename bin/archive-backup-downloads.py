#!/usr/bin/env python3
# archive-backup-downloads.py: compress and organize TKTSTO auto-backups
# Copyright (C) 2025 Selene ToyKeeper
# SPDX-License-Identifier: AGPL-3.0-or-later

dry_run = False
colon = ':'  # set to '-' on Windows, because ':' isn't allowed
archive_dir = '.tktsto'  # save files to ~/{archive_dir}/YYYY/mm/dd/

import os
import re
import time
from pathlib import Path

# auto select a compression library
try:
    # python 3.14 added this
    from compression import zstd
    compress = zstd.compress
    zext = 'zst'
except:
    # use older zstd if user has it
    try:
        import zstd
        compress = zstd.compress
        zext = 'zst'
    # otherwise fall back to gzip
    except:
        import gzip
        compress = gzip.compress
        zext = 'gz'


# file paths / patterns
download_dir = Path.home() / 'Downloads'
infile_pattern = re.compile(
        r'^tktsto\.'
        r'(\d{4})-(\d{2})-(\d{2})_'
        r'(\d{2})-(\d{2})-(\d{2})\.(.+)\.json$')


def main(args):
    while True:
        check_downloads()
        time.sleep(5)


def check_downloads():
    """find, compress, and move matching files"""

    for src_path in download_dir.iterdir():
        found = infile_pattern.match(src_path.name)
        if not found:
            continue

        YYYY, mm, dd, HH, MM, SS, ID = found.groups()

        dest_dir = Path.home() / f'{archive_dir}/{YYYY}/{mm}/{dd}'
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest_path = dest_dir / f'{YYYY}-{mm}-{dd}_{HH}{colon}{MM}{colon}{SS}.{ID}.json.{zext}'

        compress_file(src_path, dest_path)
        if not dry_run:
            # delete original file after compression
            src_path.unlink()


def compress_file(src_path, dest_path):
    print(f'compress {src_path} -> {dest_path}')
    if dry_run:
        return

    with open(src_path, 'rb') as f_src, open(dest_path, 'wb') as f_dest:
        f_dest.write( compress(f_src.read(), 9) )


if __name__ == "__main__":
    import sys
    main(sys.argv[1:])

