import { useState } from 'react';
import {
  Box,
  Button,
  FormControl,
  Textarea,
  CircularProgress,
  Tooltip,
  Typography,
  Stack,
  IconButton,
  Modal,
  ModalDialog,
  Input,
  FormHelperText,
  Dropdown,
  Menu,
  MenuButton,
  MenuItem,
  ListItemDecorator,
  DialogTitle,
  DialogContent,
  ModalClose,
} from '@mui/joy';

import {
  InfoIcon,
  SendIcon,
  StopCircle,
  XCircleIcon,
  PaperclipIcon,
  XIcon,
  UploadIcon,
  CheckIcon,
} from 'lucide-react';

function scrollChatToBottom() {
  document.getElementById('endofchat')?.scrollIntoView({ behavior: 'smooth' });
}

export default function ChatSubmit({
  addMessage,
  stopStreaming,
  spinner,
  clearHistory,
  tokenCount,
  text,
  debouncedText,
  supports,
  model,
}) {
  const [inputValue, setInputValue] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [imageLink, setImageLink] = useState<string | null>(null);
  const [imageURLInput, setImageURLInput] = useState('');
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [imageURLModalOpen, setImageURLModalOpen] = useState(false);

  const handleSend = () => {
    if (!inputValue.trim()) return;
    scrollChatToBottom();
    addMessage(inputValue.trim(), imageLink, model);
    setInputValue('');
    setImageLink(null);
    setTimeout(() => {
      document.getElementById('chat-input')?.focus();
    }, 100);
  };

  const SubmitGenerateButton = () => (
    <Stack direction="row" justifyContent="flex-end">
      {spinner && (
        <IconButton color="danger" onClick={stopStreaming}>
          <StopCircle />
        </IconButton>
      )}
      <Button
        color="neutral"
        endDecorator={
          spinner ? (
            <CircularProgress
              thickness={2}
              size="sm"
              color="neutral"
              sx={{ '--CircularProgress-size': '13px' }}
            />
          ) : (
            <SendIcon size="20px" />
          )
        }
        disabled={spinner || !inputValue.trim()}
        onClick={handleSend}
      >
        {spinner ? 'Generating' : 'Submit'}
      </Button>
    </Stack>
  );

  const AttachImageButton = () => (
    <Dropdown>
      <MenuButton variant="plain">
        <PaperclipIcon size="20px" />
      </MenuButton>
      <Menu>
        <MenuItem
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = async (e) => {
              const file = input.files?.[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                  setImageLink(reader.result as string);
                  setTimeout(() => {
                    document.getElementById('chat-input')?.focus();
                  }, 100);
                };
                reader.readAsDataURL(file);
              }
            };
            input.click();
          }}
        >
          <ListItemDecorator>
            <PaperclipIcon size="20px" />
          </ListItemDecorator>
          From your computer
        </MenuItem>
        <MenuItem
          onClick={() => {
            setImageURLModalOpen(true);
            setTimeout(() => {
              document.getElementById('image-url-input')?.focus();
            }, 100); // allow modal to open before focusing
          }}
        >
          <ListItemDecorator>
            <UploadIcon size="20px" />
          </ListItemDecorator>
          From a URL
        </MenuItem>
      </Menu>
    </Dropdown>
  );

  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
      {imageLink && (
        <Box
          sx={{
            position: 'relative',
            display: 'inline-block',
            maxWidth: '100px',
            maxHeight: '100px',
            marginBottom: 1,
          }}
        >
          <Box
            component="img"
            src={imageLink}
            sx={{ width: '100%', height: 'auto' }}
            onClick={() => setImageModalOpen(true)}
            alt="uploaded"
          />
          <IconButton
            size="sm"
            onClick={() => setImageLink(null)}
            sx={{
              position: 'absolute',
              top: 0,
              right: 0,
              backgroundColor: 'rgba(0,0,0,0.6)',
              color: 'white',
            }}
          >
            <XIcon size="18px" />
          </IconButton>
        </Box>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'row', gap: 1 }}>
        <FormControl sx={{ width: '100%' }}>
          <Textarea
            placeholder="Type a message here..."
            minRows={3}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            slotProps={{
              textarea: {
                id: 'chat-input',
              },
            }}
            endDecorator={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {model === 'mlx-community/Qwen2-VL-2B-Instruct-4bit' && <AttachImageButton />}
                <Typography level="body-xs">
                  {text !== debouncedText ? (
                    <CircularProgress size="sm" />
                  ) : (
                    tokenCount?.tokenCount || 0
                  )}{' '}
                  / {tokenCount?.contextLength || '∞'} tokens{' '}
                  <Tooltip title="Approximation only" followCursor>
                    <InfoIcon size="12px" />
                  </Tooltip>
                </Typography>
                <SubmitGenerateButton />
              </Box>
            }
          />
          <FormHelperText>
            <Button
              variant="plain"
              color="neutral"
              startDecorator={<XCircleIcon size="14px" />}
              onClick={clearHistory}
            >
              Clear Chat History
            </Button>
          </FormHelperText>
        </FormControl>
      </Box>

      {/* Image Modal */}
      <Modal open={imageModalOpen} onClose={() => setImageModalOpen(false)}>
        <ModalDialog>
          <Box component="img" src={imageLink} sx={{ maxWidth: '100%' }} />
        </ModalDialog>
      </Modal>

      {/* Image URL Modal */}
      <Modal open={imageURLModalOpen} onClose={() => setImageURLModalOpen(false)}>
        <ModalDialog>
          <DialogTitle>Submit Image via URL</DialogTitle>
          <ModalClose />
          <DialogContent>
            <Input
              id="image-url-input"
              placeholder="Paste image URL"
              value={imageURLInput}
              onChange={(e) => setImageURLInput(e.target.value)}
              endDecorator={
                imageURLInput && (
                  <IconButton
                    color="success"
                    onClick={async () => {
                      try {
                        const res = await fetch(imageURLInput);
                        const blob = await res.blob();
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          setImageLink(reader.result as string);
                          setImageURLModalOpen(false);
                          setImageURLInput('');
                          setTimeout(() => {
                            document.getElementById('chat-input')?.focus();
                          }, 100);
                        };
                        reader.readAsDataURL(blob);
                      } catch {
                        alert('Invalid image URL');
                      }
                    }}
                  >
                    <CheckIcon />
                  </IconButton>
                )
              }
            />
          </DialogContent>
        </ModalDialog>
      </Modal>
    </Box>
  );
}
