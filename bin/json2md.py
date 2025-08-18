#!/usr/bin/env python3
# json2md.py: converts TKTSTO session files to markdown
# Copyright (C) 2025 Selene ToyKeeper
# SPDX-License-Identifier: GPL-3.0-or-later

import gzip
import json
import re
import time

# zstd support has changed over the years
try:
    # python 3.14 added this
    from compression import zstd
except:
    # use older zstd if user has it
    try:
        import zstd
    except:
        zstd = None


# string to use for each indentation level in the output file
indentText = '    '


def main(args):
    """json2md.py - Converts TKTSTO json exports to readable text
    Usage: json2md.py file1.json [file2.json.zst file3.json.gz ...]
    Prints markdown to stdout.
    """

    inpaths = []
    i = 0
    while i < len(args):
        a = args[i]
        # TODO: implement command line options
        if a in ('-h', '--help'):
            print(main.__doc__)
            return
        #elif a in ('--html'):
        #    pass
        #elif a in ('--orgmode'):
        #    pass
        #elif a in ('-t', '--text'):
        #    pass
        #elif a in ('-o', '--out'):
        #    pass
        #elif a.startswith('-'):
        #    pass
        else:
            inpaths.append(a)
        i += 1

    for inpath in inpaths:
        if len(inpaths) > 1:
            print(f'===== {inpath} =====')
        jsn = load_json(inpath)
        tree = json2tree(jsn)
        lines = tree2lines(tree)
        print_lines(lines)


# convenience class
class Empty(dict):
    def __init__(self, *args, **kwargs):
        # copy a dict
        if (1 == len(args)) and isinstance(args[0], dict):
            for k,v in args[0].items():
                setattr(self, k, v)
        # copy an expanded dict
        for k,v in kwargs.items():
            setattr(self, k, v)

    def __getattr__(self, item):
        try:
            return self.__getitem__(item)
        except KeyError:
            return None

    def __setattr__(self, item, value):
        self.__setitem__(item, value)
        if value is None:
            del self[item]


def load_json(inpath):
    raw = ''
    with open(inpath, 'rb') as fp:
        raw = fp.read()
        if inpath.endswith('.gz'):
            raw = gzip.decompress(raw)
        elif inpath.endswith('.zst') or inpath.endswith('.zstd'):
            raw = zstd.decompress(raw)
    if not raw: return

    jsn = json.loads(raw)
    return jsn


def json2tree(jsn):
    """Convert Tabs Outliner json data into a nested tree of windows and nodes.
    """
    tree = Empty()

    nodes = {}
    tree.nodes = nodes

    windows = []
    tree.windows = windows

    assert(jsn["$schema"] == "https://toykeeper.net/tktsto/session-backup-json-schema-v1")

    tree.clientId = jsn['metadata']['clientId']
    tree.exportDate = jsn['metadata']['exportDate'] / 1000.0
    tree.sessionStartDate = jsn['metadata']['sessionStartDate'] / 1000.0

    for nodeId in jsn['nodes']:
        node = Empty(jsn['nodes'][nodeId])
        nodes[nodeId] = node
        if 'window' == node.type:
            node.tabs = []
            windows.append(node)
        if node.loaded:
            if 'window' != node.type:
                parentWindow = node_getParentWindow(node, nodes)
                if parentWindow:
                    parentWindow.tabs.append(node)

    #for nodeId, node in nodes.items():
    #    node.depth = node_calcDepth(node, nodes)
    #    print(node_toFullLine(node, nodes, indent=True))

    #print(tree)
    return tree


def node_toFullLine(node, nodes, indent=False):
    # return a longer 1-line summary of the node
    # mostly translated from node.js:Node.toFullLine()

    line = ''

    # bullet point
    if 'root' == node.id: line = '## '
    elif node.loaded: line = '- '
    elif node_hasLoadedTabs(node, nodes): line = '+ '
    else: line = '* '

    # add a <h3> for each root-level node?
    #if (node.id != 'root') and (node.depth is not None) and (node.depth < 1):
    #    line = '### ' + line

    # checkbox
    if node.checkbox:
        if '%' == node.checkbox:
            if node.checkboxPx is None: px = 0.0
            else: px = node.checkboxPx * 100.0
            px = '%.0f' % px
            line = f'{line}[{px}%] '
        else: line = f'{line}[{node.checkbox}] '

    # main text
    if node.title: urlTitle = node.title
    else: urlTitle = node.url
    if node.label:
        if urlTitle: line = f'{line}{node.label} ~ [{urlTitle}]({node.url})'
        else: line = f'{line}{node.label}'
    elif node.title: line = f'{line}[{node.title}]({node.url})'
    elif node.url: line = f'{line}[{node.url}]({node.url})'
    #elif 'window' == node.type: line = f'{line} (Window)'
    elif 'root' == node.id:
        line = f'{line}Session'
        # add session stats "(4 / 13 windows, 21 / 1378 nodes)"
        if node.numNodes:
            line = '%s (%s / %s windows, %s / %s nodes)' % (
                    line,
                    node.numOpenWindows, node.numWindows,
                    node.numTabs, node.numNodes,
                    )

    # windows
    if 'window' == node.type:
        numTabs = len(node.tabs)
        if node.loaded: line = f'{line} (Window, {numTabs} tabs)'
        else: line = f'{line} (Closed Window)'
        # FIXME: add window geometry "[WIDxHGT+LEFT+TOP]"
        if node.geometry: line = f'{line} [{node.geometry}]'
        else: line = f'{line} [?x?+?+?]'

    # if all else fails
    # FIXME: should check if a title has been generated, not length
    if (len(line) < 3): line = f'{line}node {node.id}'

    if indent: line = (indentText * node.depth) + line

    return line;


def node_calcDepth(node, nodes):
    depth = 0
    parentId = node.parent
    if 'root' == parentId:
        return 0
    return 1 + node_calcDepth(nodes[parentId], nodes)


def node_hasLoadedTabs(node, nodes):
    if node.loaded: return True
    if not node.nodes: return False

    for childId in node.nodes:
        child = nodes[childId]
        if child.loaded:
            return True

    for childId in node.nodes:
        child = nodes[childId]
        if child.nodes:
            if node_hasLoadedTabs(child, nodes):
                return True

    return False


def node_getParentWindow(node, nodes):
    if 'root' == node.parent:
        return None

    parent = nodes[node.parent]
    if 'window' == parent.type:
        return parent

    return node_getParentWindow(parent, nodes)


def tree2lines(tree):
    """Convert a tree structure to a list of text lines for printing.
    """
    lines = []

    # precalculate a few things
    nodes = tree.nodes
    openTabs = [n for (nId, n) in nodes.items() if n.loaded and n.url]
    windows = tree.windows
    openWindows = [w for w in windows if w.loaded]

    # start at the root node
    root = nodes['root']
    root.numNodes = len(nodes)
    root.numTabs = len(openTabs)
    root.numWindows = len(windows)
    root.numOpenWindows = len(openWindows)

    # session summary header
    lines.append(f'# Session: %s / %s windows, %s / %s nodes' % (
       len(openWindows), len(windows),
       len(openTabs), len(nodes),
       ))
    exportDate = fmt_date(tree.exportDate)
    sessionStartDate = fmt_date(tree.sessionStartDate)
    lines.append(f'{indentText}- Date Exported: {exportDate}')
    lines.append(f'{indentText}- Date Started:  {sessionStartDate}')
    lines.append('')

    # window list + tab list
    lines.append(f'## Windows: {len(openWindows)} / {len(windows)}')
    for window in openWindows:
        l = node_toFullLine(window, nodes)
        lines.append(indentText + l)
        for tab in window.tabs:
            l = node_toFullLine(tab, nodes)
            lines.append((indentText * 2) + l)
    lines.append('')

    # render the tree of nodes
    def append_node_lines(node):
        node.depth = node_calcDepth(node, nodes)
        if (node.depth < 1) and ('root' != node.id):
            lines.append('')
        lines.append(node_toFullLine(node, nodes, indent=True))
        if node.note:
            for l in node.note.split('\n'):
                # markdown needs a '  ' at the end of each line
                # to prevent word wrap
                lines.append(indentText * (node.depth + 1) + '> ' + l + '  ');
            # omit continuation marker from last line of note
            lines[-1] = lines[-1].rstrip()
        if node.nodes:
            for childId in node.nodes:
                child = nodes[childId]
                append_node_lines(child)

    append_node_lines(root)

    # omit the URL if it contains any of these
    #hide_pats = (
    #        # the user's local homepage file
    #        r'/home/.*/.mozilla/homepage.html',
    #        # Tree Style Tab's "Group Tab" page
    #        r'moz-extension://.*/resources/group-tab.html',
    #        # Tabs Outliner main view
    #        r'[a-z]+-extension://.*/activesessionview.html',
    #        # Tabs Outliner options
    #        r'[a-z]+-extension://.*/options.html',
    #        # Tabs Outliner main view
    #        r'chrome://newtab',
    #        )

    #def fmt_geometry(geometry):
    #    text = ''
    #    if geometry:
    #        text = ' [%ix%i+%i+%i]' % geometry
    #    return text

    return lines


def fmt_date(seconds):
    return time.strftime('%Y-%m-%d %H:%M:%S %z', time.localtime(seconds))


def print_lines(lines):
    for line in lines:
        print(line)


if __name__ == "__main__":
    import sys
    main(sys.argv[1:])

