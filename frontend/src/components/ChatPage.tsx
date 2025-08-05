import { useEffect, useRef, useState } from 'react';
import {
  Sheet,
  Stack,
  Box,
  Modal,
  ModalDialog,
} from '@mui/joy';

import ChatBubble from './ChatBubble';
import ChatSubmit from './ChatSubmit';

export default function ChatPage({
  chats,
  setChats,
  isThinking,
  sendNewMessageToLLM,
  stopStreaming,
  tokenCount,
  text,
  debouncedText,
  supports,
  model,
  adapter,
}) {
  const [image, setImage] = useState(null);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null); // NEW

  const deleteChat = (key) => {
    setChats((c) => c.filter((chat) => chat.key !== key));
  };

  const clearHistory = () => {
    setChats([]);
  };

  const regenerateLastMessage = () => {
    const lastMessage = chats[chats.length - 2];
    setChats((c) => c.slice(0, -2));
    sendNewMessageToLLM(lastMessage.t, lastMessage.image, model, undefined, adapter);
  };

  // ✅ Scroll to bottom when chats or thinking change
  useEffect(() => {
    const container = scrollRef.current;
    if (container) {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    }
  }, [chats, isThinking]);

  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* ✅ Scrollable chat area with ref */}
      <Sheet
        ref={scrollRef}
        sx={{
          flex: 1,
          overflowY: 'auto',
          padding: 1,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Stack spacing={1}>
          {chats.map((chat, i) => (
            <div key={chat.key}>
              <ChatBubble
                t={chat.t}
                chat={chat}
                chatId={chat.key}
                pos={chat.user}
                deleteChat={deleteChat}
                regenerateLastMessage={regenerateLastMessage}
                isLastMessage={i === chats.length - 1}
              />
              {chat.image && (
                <Box
                  component="img"
                  src={chat.image}
                  onClick={() => {
                    setImage(chat.image);
                    setImageModalOpen(true);
                  }}
                  sx={{
                    maxWidth: '200px',
                    maxHeight: '200px',
                    width: 'auto',
                    height: 'auto',
                    marginTop: 1,
                    cursor: 'pointer',
                  }}
                  alt="uploaded"
                />
              )}
            </div>
          ))}
          <ChatBubble
            isThinking
            chatId="thinking"
            hide={!isThinking}
            t="Thinking..."
            pos="bot"
          />
        </Stack>
      </Sheet>

      {/* Chat input */}
      <ChatSubmit
        addMessage={sendNewMessageToLLM}
        stopStreaming={stopStreaming}
        spinner={isThinking}
        clearHistory={clearHistory}
        tokenCount={tokenCount}
        text={text}
        debouncedText={debouncedText}
        supports={supports}
        model={model}
        adapter={adapter}
      />


      {/* Image preview */}
      <Modal open={imageModalOpen} onClose={() => setImageModalOpen(false)}>
        <ModalDialog
          sx={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            maxWidth: '100vw',
            height: '100%',
            boxSizing: 'border-box',
            overflow: 'hidden',
            gap: 2,
          }}
        >
          <Box
            component="img"
            src={image}
            sx={{
              maxWidth: '100%',
              maxHeight: '100%',
              width: 'auto',
              height: 'auto',
            }}
            alt="uploaded large"
          />
        </ModalDialog>
      </Modal>
    </Sheet>
  );
}
