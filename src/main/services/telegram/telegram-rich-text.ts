import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import type { Root, RootContent } from 'mdast';

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);

export const escapeTelegramHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const safeUrl = (value: string): string | undefined => {
  try {
    const url = new URL(value);
    if (['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol))
      return url.href;
  } catch {
    /* Invalid links are displayed as text. */
  }
  return undefined;
};

/** Render a parsed Markdown tree using only Telegram's supported tags. Raw HTML is text. */
export function formatTelegramRichText(
  value: string,
  rich = false,
): {
  text: string;
  fallbackText: string;
  parseMode?: 'HTML';
  rich: boolean;
} {
  const tree = parser.parse(value) as Root;
  const definitions = new Map(
    tree.children
      .filter((node) => node.type === 'definition')
      .map((node) => [node.identifier, node]),
  );
  const source = (node: RootContent): string =>
    value.slice(node.position?.start.offset, node.position?.end.offset);
  const render = (node: RootContent | Root): string => {
    const children =
      'children' in node
        ? node.children.map((child) => render(child as RootContent)).join('')
        : '';
    switch (node.type) {
      case 'root':
        return node.children.map(render).filter(Boolean).join('\n\n');
      case 'text':
      case 'html':
        return escapeTelegramHtml(node.value);
      case 'paragraph':
        return rich ? `<p>${children}</p>` : children;
      case 'strong':
        return `<b>${children}</b>`;
      case 'emphasis':
        return `<i>${children}</i>`;
      case 'delete':
        return `<s>${children}</s>`;
      case 'inlineCode':
        return `<code>${escapeTelegramHtml(node.value)}</code>`;
      case 'code': {
        const language = node.lang?.match(/^[a-zA-Z0-9_-]+$/)
          ? ` class="language-${node.lang}"`
          : '';
        return `<pre><code${language}>${escapeTelegramHtml(node.value)}</code></pre>`;
      }
      case 'heading':
        return rich
          ? `<h${node.depth}>${children}</h${node.depth}>`
          : `<b>${children}</b>`;
      case 'blockquote': {
        // Telegram classic quotes cannot nest blockquotes.
        const body = children.replace(/<\/?blockquote(?: expandable)?>/g, '');
        return `<blockquote>${body}</blockquote>`;
      }
      case 'break':
        return rich ? '<br>' : '\n';
      case 'thematicBreak':
        return rich ? '<hr>' : '────────';
      case 'link':
      case 'linkReference': {
        const url = safeUrl(
          node.type === 'link'
            ? node.url
            : (definitions.get(node.identifier)?.url ?? ''),
        );
        return url
          ? `<a href="${escapeTelegramHtml(url)}">${children}</a>`
          : children;
      }
      case 'image':
      case 'imageReference':
        return escapeTelegramHtml(node.alt ?? '');
      case 'list': {
        const items = node.children.map((child, index) => {
          const content = render(child);
          const checked =
            child.checked == null
              ? ''
              : rich
                ? `<input type="checkbox"${child.checked ? ' checked' : ''}>`
                : child.checked
                  ? '[x] '
                  : '[ ] ';
          return rich
            ? `<li>${checked}${content}</li>`
            : `${node.ordered ? `${(node.start ?? 1) + index}.` : '-'} ${checked}${content}`;
        });
        if (!rich) return items.join('\n');
        return node.ordered
          ? `<ol start="${node.start ?? 1}">${items.join('')}</ol>`
          : `<ul>${items.join('')}</ul>`;
      }
      case 'listItem':
        return node.children.map(render).join(rich ? '' : '\n');
      case 'table': {
        if (!rich) return `<pre>${escapeTelegramHtml(source(node))}</pre>`;
        return `<table compact>${node.children.map((row, index) => `<tr>${row.children.map((cell) => `<${index === 0 ? 'th' : 'td'}>${render(cell)}</${index === 0 ? 'th' : 'td'}>`).join('')}</tr>`).join('')}</table>`;
      }
      case 'tableCell':
      case 'tableRow':
        return children;
      case 'math':
      case 'inlineMath':
        return rich
          ? `<${node.type === 'math' ? 'tg-math-block' : 'tg-math'}>${escapeTelegramHtml(node.value)}</${node.type === 'math' ? 'tg-math-block' : 'tg-math'}>`
          : escapeTelegramHtml(node.value);
      case 'definition':
        return '';
      default:
        return children || escapeTelegramHtml(source(node as RootContent));
    }
  };
  const html = render(tree).trim();
  const fallbackText = html
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
  const hasFormatting = /<\/?[a-z][^>]*>/i.test(html);
  return {
    text: hasFormatting || rich ? html : fallbackText,
    fallbackText,
    ...(hasFormatting ? { parseMode: 'HTML' as const } : {}),
    rich,
  };
}

export function prefersTelegramRichMessage(value: string): boolean {
  if (value.length > 3500) return true;
  return parser
    .parse(value)
    .children.some((node) => ['heading', 'table', 'math'].includes(node.type));
}

/** Split source, never serialized HTML; every piece is parsed into balanced tags separately. */
export function splitTelegramText(value: string, limit: number): string[] {
  const chunks: string[] = [];
  let rest = value;
  while (rest.length > limit) {
    let end = rest.lastIndexOf('\n', limit);
    if (end < limit / 2) end = limit;
    if (/^[\uDC00-\uDFFF]$/.test(rest[end])) end -= 1;
    chunks.push(rest.slice(0, end));
    rest = rest.slice(end);
  }
  if (rest.trim()) chunks.push(rest);
  return chunks;
}
