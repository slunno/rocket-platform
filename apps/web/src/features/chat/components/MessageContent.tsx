import { useMemo, type ReactNode } from 'react';

export type MessageMentionOption = {
  username: string;
  displayName: string;
  type: 'USER' | 'CHANNEL';
};

const inlineTokenPattern =
  /\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*|https?:\/\/[^\s<>]+|@[a-z\d](?:[a-z\d._-]*[a-z\d])?/gi;
const trailingUrlPunctuation = /[),.!?;:]+$/;

function safeHttpUrl(value: string) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

function renderInline(text: string, mentions: Map<string, string>) {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  inlineTokenPattern.lastIndex = 0;

  while ((match = inlineTokenPattern.exec(text))) {
    const token = match[0];
    const start = match.index;
    if (start > cursor) nodes.push(text.slice(cursor, start));
    const previous = text[start - 1];
    if (token.startsWith('@') && previous && !/\s/.test(previous)) {
      nodes.push(token);
      cursor = start + token.length;
      continue;
    }

    if (token.startsWith('**')) {
      nodes.push(<strong key={start}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      nodes.push(<code key={start}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('*')) {
      nodes.push(<em key={start}>{token.slice(1, -1)}</em>);
    } else if (/^https?:\/\//i.test(token)) {
      const punctuation = token.match(trailingUrlPunctuation)?.[0] ?? '';
      const linkText = punctuation ? token.slice(0, -punctuation.length) : token;
      const url = safeHttpUrl(linkText);
      if (url) {
        nodes.push(
          <a key={start} href={url.href} target="_blank" rel="noopener noreferrer">
            {linkText}
          </a>,
        );
        if (punctuation) nodes.push(punctuation);
      } else {
        nodes.push(token);
      }
    } else {
      const username = token.slice(1).toLowerCase();
      const label = mentions.get(username);
      nodes.push(
        label ? (
          <span className="message-mention" key={start}>
            @{label}
          </span>
        ) : (
          token
        ),
      );
    }
    cursor = start + token.length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function safePreview(text: string) {
  const match = text.match(/https?:\/\/[^\s<>]+/i)?.[0];
  if (!match) return null;
  const value = match.replace(trailingUrlPunctuation, '');
  const url = safeHttpUrl(value);
  return url ? { url, label: `${url.hostname}${url.pathname === '/' ? '' : url.pathname}` } : null;
}

export function MessageContent({
  text,
  mentionOptions = [],
}: {
  text: string;
  mentionOptions?: MessageMentionOption[];
}) {
  const mentions = useMemo(
    () =>
      new Map(
        mentionOptions.map(({ username, displayName, type }) => [
          username.toLowerCase(),
          type === 'CHANNEL' ? 'canal' : displayName,
        ]),
      ),
    [mentionOptions],
  );
  const preview = safePreview(text);
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];

  for (let index = 0; index < lines.length;) {
    if (lines[index]?.startsWith('- ')) {
      const listItems: ReactNode[] = [];
      while (lines[index]?.startsWith('- ')) {
        listItems.push(<li key={index}>{renderInline(lines[index]!.slice(2), mentions)}</li>);
        index += 1;
      }
      blocks.push(<ul key={`list-${index}`}>{listItems}</ul>);
    } else {
      const paragraphLines: ReactNode[] = [];
      while (index < lines.length && !lines[index]?.startsWith('- ')) {
        if (paragraphLines.length) paragraphLines.push(<br key={`br-${index}`} />);
        paragraphLines.push(...renderInline(lines[index] ?? '', mentions));
        index += 1;
      }
      blocks.push(<p key={`paragraph-${index}`}>{paragraphLines}</p>);
    }
  }

  return (
    <div className="message-content">
      {blocks}
      {preview && (
        <a
          className="message-link-preview"
          href={preview.url.href}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span>Prévia do link</span>
          <strong>{preview.label}</strong>
          <small>Abrir em uma nova guia</small>
        </a>
      )}
    </div>
  );
}
