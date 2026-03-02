// docs/markdown.js: extra janky very minimal markdown-to-html converter
// Copyright (C) 2026 Selene ToyKeeper
// SPDX-License-Identifier: AGPL-3.0-or-later
// This is NOT a universal markdown parser.  It only needs to work well enough
// to display a few of the markdown files included with TKTSTO.

(async function () {
  // render 'markdown.js?page=foo.md' as HTML, in the '#content' element
  const params = new URLSearchParams(location.search);
  const page = params.get('page');
  const container = document.getElementById('content');

  // don't allow missing or external pages
  if (! page) {
    container.textContent = 'No page specified.';
    return;
  }
  // only allow "/dir/file.md",
  // to ensure no external or non-markdown files are used
  if ((! page.startsWith('/')) || (! page.endsWith('.md'))) {
    container.textContent = 'Invalid page.';
    return;
  }

  const text = await fetch(page).then(r => r.text());
  container.innerHTML = renderMarkdown(text);
  document.title = `TKTSTO ${page}`;
})();


function renderMarkdown(md) {
  const lines = md.split(/\r?\n/);
  const html = [];
  const TOC = [];
  let inPre = false;
  let inCodeBlock = false;

  function popBlanks() {
    while (['', '\n'].includes(html[html.length - 1])) {
      html.pop();
    }
  }

  function openPre () {
    if (inPre) return;
    popBlanks();
    html.push('<div class="pre">');
    inPre = true;
  }

  function closePre () {
    if (! inPre) return;
    popBlanks();
    html.push('</div>');
    inPre = false;
  }

  function toggleCodeBlock () {
    popBlanks();
    if (inCodeBlock) html.push('</pre>');
    else html.push('<pre>');
    inCodeBlock = ! inCodeBlock;
  }

  function headerToHref (text) {
    return text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")  // remove punctuation
      .trim()
      .replace(/\s+/g, "-");  // collapse spaces -> dash
  }

  function makeTOC () {
    const index = html.indexOf('[TOC]');
    if (index !== -1) {
      const rendered = ['Contents:\n'];
      for (const [depth, href, title] of TOC) {
        const indent = '  '.repeat(depth - 1);
        rendered.push(`${indent}- <a href="#${href}">${title}</a>\n`);
      }
      html.splice(index, 1, ...rendered);
    }
  }

  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/;
  const urlRegex = /(https?:\/\/[\/a-zA-Z0-9.:+()#\?&_-]+)/;
  // [Foo Bar](#anchor-text)
  const tocRegex = /\[([^\]]+)\]\(#([^\)]+)\)/;

  let blank = false;
  let wasBlank = false;
  let prevLine = '';
  for (let line of lines) {
    const trimmed = line.trim();
    if (html.length) {
      prevLine = html[html.length - 1];
    }
    // collapse extra blank lines
    if ('' === trimmed) {
      wasBlank = true;
      if (blank) continue;
      blank = true;
      if (prevLine.startsWith('<')) continue;
    } else { blank = false; }

    // safety sanitization
    line = line.replace(/[&<>]/g, (m) =>
      { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]; } );

    // code blocks
    if (line.startsWith('```')) {
      toggleCodeBlock();
      continue;
    }
    // everything else
    if (! inCodeBlock) {
      // # / ## / ### -> h1 / h2 / h3
      if (/^#+\s+/.test(line)) {
        closePre();
        const headings = { '#': 'h1', '##': 'h2', '###': 'h3',
          '####': 'h4', '#####': 'h5', '######': 'h6' };
        const depth = trimmed.replace(/\s.*/, '');
        const h = headings[depth];
        const title = trimmed.replace(/^#+\s+/, '');
        const href = headerToHref(title);
        TOC.push([depth.length, href, title]);
        html.push(`<a id="${href}"></a>`);
        html.push(`<${h}>${title}</${h}>`);
        openPre();
        continue;
      }
      // "Line ending in a colon:" -> heading 4
      else if (wasBlank && (/^\S.*:$/.test(line))) {
        closePre();
        html.push('<h4>' + inlineMarkdown(trimmed) + '</h4>');
        openPre();
        continue;
      }
      // ![Title](https://example.com/image.png)
      else if (line.startsWith('!')) {
        line = line.replace(imageRegex, (match, alt, url) => {
          //return `<img src="${url}" alt="${alt}" />`;
          return `Image: <a href="${url}" alt="${alt}">${alt} (${url})</a>`;
        });
      }
      // make URLs clickable
      else if (urlRegex.test(line)) {
        line = line.replace(urlRegex, (match, url) => {
          return `<a href="${url}">${url}</a>`;
        });
      }
      // internal links / anchors
      else if (tocRegex.test(line)) {
        line = line.replace(tocRegex, (match, title, anchor) => {
          return `<a href="#${anchor}">${title}</a>`;
        });
      }
    }

    wasBlank = blank;

    // other text passes as-is
    html.push(inlineMarkdown(line));
    html.push('\n');
  }

  if (inCodeBlock) toggleCodeBlock();
  closePre();
  makeTOC();
  return html.join('');
}


function inlineMarkdown(text) {
  // `foo` -> <code>foo</code>
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');  // `
  // **foo** -> <b>foo</b>
  text = text.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  // *foo* -> <i>foo</i>
  text = text.replace(/\*([^*]+)\*/g, '<i>$1</i>');
  return text;
}

