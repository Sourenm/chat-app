import { LinearProgress, Tooltip, Typography, IconButton } from '@mui/joy';
import { ClipboardCopyIcon, RotateCcwIcon, Trash2Icon } from 'lucide-react';
import Markdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
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

  const renderMarkdown = (content) => (
    <Markdown
      rehypePlugins={[rehypeRaw]}
      components={{
        code({ children, className, ...props }) {
          const match = /language-(\\w+)/.exec(className || '');
          return match ? (
            <SyntaxHighlighter
              {...props}
              PreTag="div"
              language={match[1]}
              style={oneDark}
            >
              {String(children).replace(/\\n$/, '')}
            </SyntaxHighlighter>
          ) : (
            <code {...props} className={className}>
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
          display: 'flex',
          color: pos === 'bot' ? 'var(--joy-palette-text-primary)' : 'var(--joy-palette-text-tertiary)',
          textAlign: 'left',
        }}
        className="chatBubbleContent"
      >
        {!isThinking ? renderMarkdown(pos === 'bot' ? tWithThinking : t) : (
          <div>
            <p style={{ margin: 0, padding: 0, marginTop: 10, marginBottom: 10 }}>
              <span id="resultText" />
            </p>
            <LinearProgress variant="plain" color="neutral" sx={{ color: '#ddd', width: '60px' }} />
          </div>
        )}
      </div>

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
