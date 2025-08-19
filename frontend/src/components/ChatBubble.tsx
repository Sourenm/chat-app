import { LinearProgress, Tooltip, Typography, IconButton } from '@mui/joy';
import { ClipboardCopyIcon, RotateCcwIcon, Trash2Icon } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

function displayFloatStringWithPrecision(floatString, precision) {
  if (floatString === null) return '';
  return parseFloat(floatString).toFixed(precision);
}

function parseThinkingToken(t) {
  if (!t) return '';
  if (typeof t === 'string') {
    const regex = /<think>([\s\S]*?)<\/think>/g;
    return t.replace(regex, (_, thinkingText) => {
      return `<div class="chatBubbleThinking">${thinkingText}</div>`;
    });
  }
  return t;
}

function sanitizeRagMarkdown(s) {
  if (!s) return s;
  // Escape heading markers at start of lines
  return s.replace(/^\s*#{1,6}\s/gm, (m) => '\\' + m.trim() + ' ');
}

export default function ChatBubble({
  t,
  chat,
  chatId,
  pos,
  isThinking = false,
  hide = false,
  deleteChat = () => {},
  regenerateLastMessage = () => {},
  isLastMessage = false,
}) {
  const tWithThinking = parseThinkingToken(t);
  const isRagAnswer = Array.isArray(chat?.sources) && chat.sources.length > 0;
  const safeContent = isRagAnswer ? sanitizeRagMarkdown(tWithThinking) : tWithThinking;

  const renderMarkdown = (content) => (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Headings + paragraphs keep Joy Typography
        h1: ({ children }) => (
          <Typography level="title-sm" sx={{ fontWeight: 700, my: 0.5 }}>
            {children}
          </Typography>
        ),
        h2: ({ children }) => (
          <Typography level="title-sm" sx={{ fontWeight: 700, my: 0.5 }}>
            {children}
          </Typography>
        ),
        h3: ({ children }) => (
          <Typography level="title-sm" sx={{ fontWeight: 700, my: 0.5 }}>
            {children}
          </Typography>
        ),
        p: ({ children }) => (
          <Typography
            level="body-sm"
            sx={{
              my: 0.5,
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
              lineHeight: 1.5,
            }}
          >
            {children}
          </Typography>
        ),

        // Links
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noreferrer">
            {children}
          </a>
        ),

        // Lists: proper indentation & spacing
        ul: ({ children }) => (
          <ul style={{ paddingLeft: '1.2em', margin: '6px 0' }}>{children}</ul>
        ),
        ol: ({ children }) => (
          <ol style={{ paddingLeft: '1.2em', margin: '6px 0' }}>{children}</ol>
        ),
        li: ({ children }) => (
          <li style={{ marginBottom: '4px', lineHeight: 1.6 }}>{children}</li>
        ),

        // Tables: borders + scroll for wide content
        table: ({ children }) => (
          <div style={{ overflowX: 'auto', margin: '8px 0' }}>
            <table
              style={{
                borderCollapse: 'collapse',
                width: '100%',
                minWidth: 420, // keep structure when narrow
              }}
            >
              {children}
            </table>
          </div>
        ),
        img: (props) => (
          <img {...props} style={{ maxWidth: '100%', height: 'auto' }} />
        ),        
        thead: ({ children }) => <thead style={{ background: 'var(--joy-palette-neutral-200)' }}>{children}</thead>,
        tr: ({ children }) => <tr style={{ borderBottom: '1px solid #ccc' }}>{children}</tr>,
        th: ({ children }) => (
          <th
            style={{
              border: '1px solid #ccc',
              padding: '6px 10px',
              textAlign: 'left',
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td
            style={{
              border: '1px solid #ccc',
              padding: '6px 10px',
              textAlign: 'left',
              verticalAlign: 'top',
            }}
          >
            {children}
          </td>
        ),

        // Code blocks: keep Prism, add horizontal scroll; inline code: subtle background
        code({ children, className, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          if (match) {
            return (
              <div style={{ overflowX: 'auto', margin: '6px 0' }}>
                <SyntaxHighlighter
                  {...props}
                  PreTag="div"
                  language={match[1]}
                  style={oneDark}
                >
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
              </div>
            );
          }
          return (
            <code
              {...props}
              className={className}
              style={{
                background: 'var(--joy-palette-neutral-200)',
                padding: '0.1em 0.35em',
                borderRadius: 6,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              }}
            >
              {children}
            </code>
          );
        },
      }}
    >
      {content}
    </Markdown>
  );

  if (hide) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '10px 18px 8px 22px',
        borderLeft: pos === 'bot' ? '2px solid var(--joy-palette-neutral-500)' : 'none',
      }}
      className="chatBubble"
    >
      <div
        style={{
          /* ⬇︎ make it a normal block container (or flex-column) */
          display: 'block',
          color: pos === 'bot' ? 'var(--joy-palette-text-primary)' : 'var(--joy-palette-text-tertiary)',
          textAlign: 'left',
          maxWidth: 820,
          width: '100%',
        }}
        className="chatBubbleContent"
      >
        <div style={{ width: '100%', minWidth: 0 }}>
          {!isThinking ? renderMarkdown(pos === 'bot' ? safeContent : t) : (
            <div>
              <p style={{ margin: 0, padding: 0, marginTop: 10, marginBottom: 10 }}>
                <span id="resultText" />
              </p>
              <LinearProgress variant="plain" color="neutral" sx={{ color: '#ddd', width: '60px' }} />
            </div>
          )}
        </div>
      </div>


      {Array.isArray(chat?.sources) && chat.sources.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {chat.sources.map((s, idx) => {
            const label = `${s.source || 'source'}${s.page ? ` p.${s.page}` : ''}`;
            const tooltip = `${label} — score ${s.score.toFixed(3)}\n\n${(s.snippet || '').slice(0, 300)}...`;
            return (
              <Tooltip key={idx} title={tooltip}>
                <span
                  style={{
                    fontSize: 12,
                    padding: '4px 8px',
                    background: 'var(--joy-palette-neutral-200)',
                    borderRadius: 12,
                    cursor: 'copy',
                  }}
                  onClick={() => navigator.clipboard.writeText(s.snippet || '')}
                >
                  [{label}]
                </span>
              </Tooltip>
            );
          })}
        </div>
      )}

      {!isThinking && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
          {chat?.numberOfTokens && (
            <Typography level="body-sm">
              tokens: {chat.numberOfTokens} -{' '}
              <Tooltip title="Tokens/sec" variant="solid">
                <span>tok/s:</span>
              </Tooltip>{' '}
              {displayFloatStringWithPrecision(chat.tokensPerSecond, 1)} -{' '}
              <Tooltip title="TTFT" variant="solid">
                <span>ttft:</span>
              </Tooltip>{' '}
              {displayFloatStringWithPrecision(chat.timeToFirstToken, 2)}ms
            </Typography>
          )}

          <IconButton
            size="sm"
            variant="plain"
            onClick={() => navigator.clipboard.writeText(t)}
          >
            <ClipboardCopyIcon size="18px" />
          </IconButton>

          <IconButton
            size="sm"
            variant="plain"
            onClick={() => deleteChat(chatId)}
          >
            <Trash2Icon size="18px" />
          </IconButton>

          {isLastMessage && pos === 'bot' && (
            <IconButton
              size="sm"
              variant="plain"
              onClick={() => regenerateLastMessage()}
            >
              <RotateCcwIcon size="18px" />
            </IconButton>
          )}
        </div>
      )}
    </div>
  );
}
