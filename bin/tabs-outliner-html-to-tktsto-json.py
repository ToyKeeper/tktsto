#!/usr/bin/env python3
# tabs-outliner-html-to-tktsto-json.py: converts Tabs Outliner session
# "Save Page As..." HTML files to TKTSTO json files, for import into TKTSTO
# Copyright (C) 2025 Selene ToyKeeper
# SPDX-License-Identifier: AGPL-3.0-or-later

from bs4 import BeautifulSoup
from collections import OrderedDict
import json
import re
import time


verbose = False


def main(args):
    """tabs-outliner-html-to-tktsto-json.py
    Converts Tabs Outliner json exports to readable text
    Usage: script.py infile [outfile]
    """

    inpath = None
    outpath = None
    i = 0
    while i < len(args):
        a = args[i]
        if a in ('-h', '--help'):
            return help()
        else:
            if not inpath: inpath = a
            elif not outpath: outpath = a
            else:
                return help()
        i += 1

    if not inpath:
        return help()

    html = load_html(inpath)
    tree = html2tree(html)
    json = tree2json(tree)
    if outpath:
        with open(outpath, 'w') as fp:
            fp.write(json)
    else:
        print(json)


def help():
    print(main.__doc__.replace('\n    ', '\n'))

# convenience class
class Empty(OrderedDict):
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


def load_html(inpath):
    raw = ''
    with open(inpath, 'rb') as fp:
        raw = fp.read()
    if not raw: return

    # find a working parser, hopefully
    for parser in ('lxml', 'html5lib', 'html.parser'):
        try:
            html = BeautifulSoup(raw, parser)
            #print(f'Parser: {parser}')
            return html
        except:
            pass

    print('No HTML parser found.  Please install lxml, html5lib, or html.parser.')

    return None


def html2tree(html):
    """Convert Tabs Outliner HTML data into a nested tree of windows and tabs.
    """
    tree = Empty()
    tree.depth = 0

    nodeIds = {}
    tree.nodeIds = nodeIds

    def oneline(node):
        parts = []
        if node.loaded: parts.append('-')
        else: parts.append('*')
        if node.favIcon: parts.append('@')
        if node.label:
            if node.title: parts.append(f'{node.label} ~')
            else: parts.append(node.label)
        if node.title:
            if node.url: parts.append(f'[{node.title}]({node.url})')
            else: parts.append(node.title)
        if 'window' == node.type: parts.append('(Window)')
        text = ' '.join(parts)
        return text

    def parse_node(li, parent):
        # find the first child element
        if li.contents: first = li.contents[0]
        else: return None
        # happens when span.hoveringMenu_container exists
        if 'span' == first.name: first = li.contents[1]

        # new node object
        e = Empty()
        e.depth = parent.depth + 1
        # node ID
        #nodeId = li['id']
        #if (not nodeId) \
        #        or ('undefined' in nodeId) \
        #        or (nodeId in tree.nodeIds):
        #    nodeId = newID(tree.nodeIds)
        #e.id = nodeId
        e.id = newID(tree.nodeIds)  # always generate a new ID
        e.parent = parent.id
        # label attached to a tab
        span = first.find('span', attrs={'class': 'tab_comment'})
        if span:
            e.label = span.text
        # link / tab node
        if 'a' == first.name:
            a = li.a
            e.title = str(a.text)
            e.url = str(a['href'])
            # saved / loaded tab
            if 'savedtabNTC' in a['class']: e.loaded = False
            elif 'tabNTC' in a['class']: e.loaded = True
            # favicon
            img = a.img
            key = 'data-node-icon-for-html-export'
            if img:
                try:
                    e.favIcon = str(img[key])
                except KeyError:
                    pass
        # note / window / group node
        elif (li.div):
            e.label = str(li.div.text)
        # window nodes
        #print(li['class'])
        if 'NTASC-windowFrame' in li['class']:
            if 'sessionNTASC' not in li['class']:
                e.type = 'window'
        #indent = '  ' * (e.depth - 1)
        #print(f'{indent}{oneline(e)}')
        tree.nodeIds[e.id] = e
        return e

    def parse_children(node, elem):
        #print(elem.text)
        ul = elem.find('ul', recursive=False)
        if not ul: return
        for li in ul.find_all('li', recursive=False):
            child = parse_node(li, node)
            if child:
                child.parent = node.id
                if not node.nodes:
                    node.expanded = False
                    node.nodes = []
                node.nodes.append(child.id)
                parse_children(child, li)

    root_li = html.find('li', attrs={'id': 'currentSessionRoot'})
    if not root_li: return None

    root_node = parse_node(root_li, tree)
    # fix the IDs
    root_node.id = 'root'
    root_node.parent = 'root'
    tree.nodeIds['root'] = tree.nodeIds['1']
    del tree.nodeIds['1']
    #tree.nodes = [root_node]

    parse_children(root_node, root_li)

    return tree


def newID(ids):
    if not hasattr(newID, 'last'):
        newID.last = 0
    nid = newID.last + 1
    while str(nid) in ids:
        nid = nid + 1
    newID.last = nid
    return str(nid)


def tree2json(tree):
    """Convert a tree structure to raw json data for export.
    """
    d = OrderedDict()

    def render(node):
        obj = OrderedDict()
        # ensure child list is always printed last
        #node.move_to_end('nodes')
        #obj['id'] = node.id
        for key, value in node.items():
            if key not in ('depth',):
                obj[key] = value
        #if node.nodes:
        #    #if node.parent:
        #    #    obj['parent'] = node.parent.id
        #    #obj['nodes'] = []
        #    #for child in node.nodes:
        #    #    #obj['nodes'].append(child.id)
        #    #    obj['nodes'].append(child)
        #print(obj)
        return obj

    exportDate = int(time.time() * 1000)
    d['$schema'] = 'https://toykeeper.net/tktsto/session-backup-json-schema-v1'
    d['metadata'] = OrderedDict()
    d['metadata']['exportDate'] = exportDate
    d['nodes'] = OrderedDict()
    for nodeId, node in tree.nodeIds.items():
        d['nodes'][nodeId] = render(node)

    text = json.dumps(d, indent=2)
    return text


if __name__ == "__main__":
    import sys
    main(sys.argv[1:])

