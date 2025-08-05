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
  FolderIcon,
  XIcon,
  UploadIcon,
  CheckIcon,
} from 'lucide-react';

import * as pdfjsLib from 'pdfjs-dist/build/pdf';
import workerURL from 'pdfjs-dist/build/pdf.worker.js?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerURL;




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
  adapter,
}) {
  const [inputValue, setInputValue] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [imageLink, setImageLink] = useState<string | null>(null);
  const [imageURLInput, setImageURLInput] = useState('');
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [imageURLModalOpen, setImageURLModalOpen] = useState(false);
  const [attachedFileText, setAttachedFileText] = useState<string | null>(null);
  const [attachedFileName, setAttachedFileName] = useState<string | null>(null);


  const handleSend = () => {
    if (!inputValue.trim()) return;
    scrollChatToBottom();

    let finalPrompt = inputValue.trim();
    if (attachedFileText?.trim()) {
      finalPrompt += `\n\n[HERE'S THE CONTENT OF THE ATTACHED FILE]\n${attachedFileText}`;
    }

    const visiblePrompt = inputValue.trim();
    let fullPrompt = visiblePrompt; // Use the visible prompt directl
    if (attachedFileText?.trim()) {
      fullPrompt += `\n\n[HERE'S THE CONTENT OF THE ATTACHED FILE]\n${attachedFileText}`;
    }

    addMessage(visiblePrompt, imageLink, model, fullPrompt, adapter);

    setAttachedFileText(null);
    setAttachedFileName(null);
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

  const AttachFileButton = () => (
    <Dropdown>
      <MenuButton variant="plain">
        <FolderIcon size="20px" />
      </MenuButton>
      <Menu>
        <MenuItem
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.csv,application/pdf';
            input.onchange = (e) => {
              const file = input.files?.[0];
              if (!file) return;

              const reader = new FileReader();
              if (file.name.endsWith('.csv')) {
                reader.onload = () => {
                  setAttachedFileText(reader.result as string);
                  setAttachedFileName(file.name);
                };
                reader.readAsText(file);
              } else if (file.name.endsWith('.pdf')) {
                reader.onload = async () => {
                  console.log("📥 File loaded:", file.name);

                  const result = reader.result;
                  console.log("🔍 reader.result:", result);

                  try {
                    if (!result) {
                      throw new Error("❌ reader.result is null or undefined");
                    }

                    if (!(result instanceof ArrayBuffer)) {
                      throw new Error(`❌ reader.result is not an ArrayBuffer, got: ${typeof result}`);
                    }

                    const uint8 = new Uint8Array(result);
                    console.log("📦 Uint8Array length:", uint8.length);

                    const loadingTask = pdfjsLib.getDocument({ data: uint8 });
                    console.log("📄 Starting PDF parsing...");

                    const pdf = await loadingTask.promise;
                    console.log("✅ PDF loaded successfully with", pdf.numPages, "pages");

                    let fullText = '';

                    for (let i = 1; i <= pdf.numPages; i++) {
                      const page = await pdf.getPage(i);
                      const content = await page.getTextContent();
                      const pageText = content.items.map((item: any) => item.str).join(' ');
                      console.log(`📄 Page ${i} content:`, pageText);
                      fullText += pageText + '\n';
                    }

                    setAttachedFileText(fullText);
                    setAttachedFileName(file.name);
                  } catch (err) {
                    console.error("❌ PDF parsing error:", err);
                    alert(`❌ Failed to parse PDF: ${err?.message || err}`);
                  }
                };

                reader.readAsArrayBuffer(file);  // ✅ This is correct


              }
            };
            input.click();
          }}
        >
          <ListItemDecorator>
            <PaperclipIcon size="20px" />
          </ListItemDecorator>
          Attach CSV or PDF
        </MenuItem>
      </Menu>
    </Dropdown>
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

      {attachedFileName && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            backgroundColor: '#f5f5f5',
            padding: '6px 10px',
            borderRadius: '8px',
            marginBottom: 1,
            maxWidth: '100%',
          }}
        >
          <Typography level="body-sm" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            📎 {attachedFileName}
          </Typography>
          <IconButton
            size="sm"
            variant="plain"
            onClick={() => {
              setAttachedFileText(null);
              setAttachedFileName(null);
            }}
          >
            <XIcon size="16px" />
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
                <AttachFileButton />
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
