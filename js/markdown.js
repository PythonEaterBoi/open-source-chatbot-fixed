(function (root) {
  'use strict';

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sanitizeUrl(rawUrl) {
    const trimmed = String(rawUrl || '').trim();
    if (!trimmed) return '#';
    if (/^(https?:|mailto:|#)/i.test(trimmed)) {
      return trimmed.replace(/"/g, '%22').replace(/'/g, '%27');
    }
    return '#';
  }

  // Single-pass raw-code tokenizer: escapes gaps and tokens individually so HTML entities are never corrupted
  const RAW_TOKEN_REGEX = new RegExp(
    [
      // 1: Comments (//..., /*...*/, <!--...-->)
      '(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/|<!--[\\s\\S]*?-->)',
      // 2: Strings ("...", '...', `...`)
      '("(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'|`(?:\\\\.|[^`\\\\])*`)',
      // 3: HTML/XML tags
      '(<\\/?[a-zA-Z][a-zA-Z0-9:-]*)',
      // 4: Decorators / directives
      '(@[a-zA-Z_][a-zA-Z0-9_]*)',
      // 5: Keywords
      '\\b(const|let|var|function|return|async|await|if|else|for|while|do|switch|case|break|continue|class|extends|new|try|catch|finally|throw|import|from|export|default|interface|type|enum|implements|public|private|protected|readonly|def|elif|except|raise|with|as|lambda|yield|pass|True|False|None|fn|pub|mut|impl|struct|match|use|mod|go|defer|chan|select|package|SELECT|FROM|WHERE|INSERT|INTO|UPDATE|DELETE|JOIN|LEFT|RIGHT|INNER|GROUP|BY|ORDER|LIMIT|CREATE|TABLE|null|undefined|true|false)\\b',
      // 6: Numbers
      '\\b(0x[0-9a-fA-F]+|\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?)\\b',
      // 7: Function calls
      '\\b([a-zA-Z_][a-zA-Z0-9_]*)(?=\\s*\\()'
    ].join('|'),
    'g'
  );

  const HASH_COMMENT_LANGS = new Set(['py', 'python', 'sh', 'bash', 'zsh', 'yaml', 'yml', 'toml', 'dockerfile', 'ruby', 'rb', 'r']);

  function highlightLineRaw(rawLine) {
    let out = '';
    let lastIdx = 0;
    RAW_TOKEN_REGEX.lastIndex = 0;
    let m;
    while ((m = RAW_TOKEN_REGEX.exec(rawLine)) !== null) {
      if (m.index > lastIdx) {
        out += escapeHtml(rawLine.slice(lastIdx, m.index));
      }
      const matchText = m[0];
      let cls = '';
      if (m[1]) cls = 'tok-comment';
      else if (m[2]) cls = 'tok-string';
      else if (m[3]) cls = 'tok-tag';
      else if (m[4]) cls = 'tok-attr';
      else if (m[5]) cls = 'tok-keyword';
      else if (m[6]) cls = 'tok-number';
      else if (m[7]) cls = 'tok-fn';

      if (cls) {
        out += '<span class="' + cls + '">' + escapeHtml(matchText) + '</span>';
      } else {
        out += escapeHtml(matchText);
      }
      lastIdx = m.index + matchText.length;
      if (matchText.length === 0) RAW_TOKEN_REGEX.lastIndex++;
    }
    if (lastIdx < rawLine.length) {
      out += escapeHtml(rawLine.slice(lastIdx));
    }
    return out;
  }

  function highlightCode(rawCode, lang) {
    const normalized = String(lang || '').toLowerCase().trim();
    if (normalized === 'text' || normalized === 'plaintext' || normalized === 'txt' || normalized === 'ascii') {
      return escapeHtml(rawCode);
    }

    const lines = String(rawCode == null ? '' : rawCode).split('\n');
    const useHashComments = HASH_COMMENT_LANGS.has(normalized);

    return lines
      .map(function (line) {
        if (useHashComments && /^\s*#/.test(line)) {
          return '<span class="tok-comment">' + escapeHtml(line) + '</span>';
        }
        return highlightLineRaw(line);
      })
      .join('\n');
  }

  function isPreviewableCode(lang, rawCode) {
    const l = String(lang || '').toLowerCase().trim();
    if (l === 'html' || l === 'htm' || l === 'svg') return true;
    if (!l && /^\s*(<!doctype html|<html|<svg)/i.test(rawCode || '')) return true;
    return false;
  }

  function encodePayload(str) {
    try {
      return encodeURIComponent(str);
    } catch (_) {
      return '';
    }
  }

  function renderInline(text) {
    if (!text) return '';
    const codePlaceholders = [];

    // 1. Extract inline code spans first so inner symbols aren't touched
    let working = String(text).replace(/`([^`\n]+)`/g, function (_, code) {
      const idx = codePlaceholders.length;
      codePlaceholders.push('<code class="md-inline-code">' + escapeHtml(code) + '</code>');
      return '\u0000CODE' + idx + '\u0000';
    });

    // 2. Escape remaining raw HTML
    working = escapeHtml(working);

    // 3. Links: [label](url)
    working = working.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, label, url) {
      const safeHref = sanitizeUrl(url);
      return '<a href="' + safeHref + '" target="_blank" rel="noopener noreferrer" class="md-link">' + label + '</a>';
    });

    // 4. Bold + Italic, Bold, Italic, Strikethrough
    working = working.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    working = working.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    working = working.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    working = working.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>');
    working = working.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    // 5. Restore inline code spans
    working = working.replace(/\u0000CODE(\d+)\u0000/g, function (_, idx) {
      return codePlaceholders[Number(idx)] || '';
    });

    return working;
  }

  function parseTableRow(line) {
    const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    return trimmed.split('|').map(function (cell) { return cell.trim(); });
  }

  function isTableSeparator(line) {
    const trimmed = line.trim();
    if (!trimmed.includes('|') && !trimmed.includes('-')) return false;
    const cells = parseTableRow(trimmed);
    if (!cells.length) return false;
    return cells.every(function (c) { return /^:?-{3,}:?$/.test(c); });
  }

  function renderCodeBlock(lang, code, isStreamingOpen) {
    const cleanLang = (lang || '').trim().split(/\s+/)[0] || 'text';
    const trimmedCode = String(code || '').replace(/\n$/, '');
    const highlighted = highlightCode(trimmedCode, cleanLang);
    const encoded = encodePayload(trimmedCode);
    const canPreview = isPreviewableCode(cleanLang, trimmedCode);

    const previewBtn = canPreview
      ? '<button type="button" class="code-action-btn code-preview-btn" data-preview-code="' +
        encoded +
        '" data-preview-lang="' +
        escapeHtml(cleanLang) +
        '" title="Open interactive preview">' +
        '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6"><polygon points="5,3 13,8 5,13" fill="currentColor" stroke="none"/></svg>' +
        '<span>Run Preview</span></button>'
      : '';

    const streamBadge = isStreamingOpen
      ? '<span class="code-streaming-pill">writing…</span>'
      : '';

    return (
      '<div class="md-code-card">' +
      '<div class="md-code-header">' +
      '<div class="md-code-lang-wrap">' +
      '<span class="md-code-lang">' + escapeHtml(cleanLang) + '</span>' +
      streamBadge +
      '</div>' +
      '<div class="md-code-actions">' +
      previewBtn +
      '<button type="button" class="code-action-btn code-copy-btn" data-copy-code="' +
      encoded +
      '" title="Copy code">' +
      '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="8.5" height="8.5" rx="1.6"/><path d="M11 5V3.6A1.6 1.6 0 0 0 9.4 2H3.6A1.6 1.6 0 0 0 2 3.6v5.8A1.6 1.6 0 0 0 3.6 11H5"/></svg>' +
      '<span>Copy</span></button>' +
      '</div>' +
      '</div>' +
      '<pre class="md-pre"><code class="language-' + escapeHtml(cleanLang) + '">' +
      highlighted +
      '</code></pre>' +
      '</div>'
    );
  }

  function renderBlocks(markdownText) {
    const lines = String(markdownText || '').replace(/\r\n/g, '\n').split('\n');
    const html = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // 1. Fenced code block (``` or ~~~)
      const fenceMatch = line.match(/^\s*(`{3,}|~{3,})([^\n]*)$/);
      if (fenceMatch) {
        const fence = fenceMatch[1];
        const lang = fenceMatch[2].trim();
        const codeLines = [];
        i++;
        let closed = false;
        const closeRe = new RegExp('^\\s*' + fence[0] + '{' + fence.length + ',}\\s*$');
        while (i < lines.length) {
          if (closeRe.test(lines[i])) {
            closed = true;
            i++;
            break;
          }
          codeLines.push(lines[i]);
          i++;
        }
        html.push(renderCodeBlock(lang, codeLines.join('\n'), !closed));
        continue;
      }

      // 2. Empty line
      if (/^\s*$/.test(line)) {
        i++;
        continue;
      }

      // 3. Horizontal rule
      if (/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line)) {
        html.push('<hr class="md-hr" />');
        i++;
        continue;
      }

      // 4. Heading (# .. ######)
      const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        html.push('<h' + level + ' class="md-h' + level + '">' + renderInline(headingMatch[2]) + '</h' + level + '>');
        i++;
        continue;
      }

      // 5. Table
      if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
        const headers = parseTableRow(line);
        const aligns = parseTableRow(lines[i + 1]).map(function (c) {
          if (c.startsWith(':') && c.endsWith(':')) return 'center';
          if (c.endsWith(':')) return 'right';
          return 'left';
        });
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].includes('|') && !/^\s*$/.test(lines[i])) {
          rows.push(parseTableRow(lines[i]));
          i++;
        }
        let tableHtml = '<div class="md-table-wrap"><table class="md-table"><thead><tr>';
        headers.forEach(function (h, idx) {
          tableHtml += '<th style="text-align:' + (aligns[idx] || 'left') + '">' + renderInline(h) + '</th>';
        });
        tableHtml += '</tr></thead><tbody>';
        rows.forEach(function (r) {
          tableHtml += '<tr>';
          headers.forEach(function (_, idx) {
            tableHtml += '<td style="text-align:' + (aligns[idx] || 'left') + '">' + renderInline(r[idx] || '') + '</td>';
          });
          tableHtml += '</tr>';
        });
        tableHtml += '</tbody></table></div>';
        html.push(tableHtml);
        continue;
      }

      // 6. Blockquote
      if (/^\s*>\s?/.test(line)) {
        const quoteLines = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
          quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
          i++;
        }
        html.push('<blockquote class="md-quote">' + renderBlocks(quoteLines.join('\n')) + '</blockquote>');
        continue;
      }

      // 7. Unordered / Task list
      if (/^\s*[-*+]\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
          const itemText = lines[i].replace(/^\s*[-*+]\s+/, '');
          const taskMatch = itemText.match(/^\[([ xX])\]\s+(.*)$/);
          if (taskMatch) {
            const checked = taskMatch[1].toLowerCase() === 'x';
            items.push(
              '<li class="md-task-item"><span class="md-checkbox' +
                (checked ? ' is-checked' : '') +
                '" aria-hidden="true">' +
                (checked ? '✓' : '') +
                '</span><span>' +
                renderInline(taskMatch[2]) +
                '</span></li>'
            );
          } else {
            items.push('<li>' + renderInline(itemText) + '</li>');
          }
          i++;
        }
        html.push('<ul class="md-ul">' + items.join('') + '</ul>');
        continue;
      }

      // 8. Ordered list
      if (/^\s*\d+\.\s+/.test(line)) {
        const startMatch = line.match(/^\s*(\d+)\.\s+/);
        const startNum = startMatch ? Number(startMatch[1]) : 1;
        const items = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
          items.push('<li>' + renderInline(lines[i].replace(/^\s*\d+\.\s+/, '')) + '</li>');
          i++;
        }
        html.push('<ol class="md-ol" start="' + startNum + '">' + items.join('') + '</ol>');
        continue;
      }

      // 9. Paragraph (merge consecutive plain lines with <br> where appropriate)
      const paraLines = [];
      while (
        i < lines.length &&
        !/^\s*$/.test(lines[i]) &&
        !/^\s*(`{3,}|~{3,})/.test(lines[i]) &&
        !/^(#{1,6})\s+/.test(lines[i]) &&
        !/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(lines[i]) &&
        !/^\s*>\s?/.test(lines[i]) &&
        !/^\s*[-*+]\s+/.test(lines[i]) &&
        !/^\s*\d+\.\s+/.test(lines[i]) &&
        !(lines[i].includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
      ) {
        paraLines.push(renderInline(lines[i]));
        i++;
      }
      if (paraLines.length) {
        html.push('<p class="md-p">' + paraLines.join('<br />') + '</p>');
      } else {
        i++;
      }
    }

    return html.join('\n');
  }

  function render(markdownText) {
    if (!markdownText) return '';
    return renderBlocks(markdownText);
  }

  const Markdown = {
    escapeHtml: escapeHtml,
    render: render,
    highlightCode: highlightCode,
    isPreviewableCode: isPreviewableCode
  };

  root.HaikuChat = root.HaikuChat || {};
  root.HaikuChat.Markdown = Markdown;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Markdown;
  }
})(typeof window !== 'undefined' ? window : globalThis);
