import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Bot,
  X,
  Send,
  Sparkles,
  Trash2,
  RefreshCw,
  Key,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Columns2,
  AlertTriangle,
  Copy,
  Check,
} from 'lucide-react';
import { ExtractedRecord, ParseSummary } from '../types';
import { haptic } from '../utils/haptics';

interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: string;
  modelUsed?: string;
}

interface AIChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
  data: ExtractedRecord[] | null;
  summary: ParseSummary | null;
  currentFileName: string | null;
}

type ChatSizeMode = 'mini' | 'compact' | 'wide' | 'fullscreen';

/**
 * Minimalist typing animation loop indicator for "Private API Key"
 * Compact, non-intrusive, and seamlessly animated.
 */
const TypingPrivateApiKey: React.FC = () => {
  const fullText = 'Private API Key';
  const [displayedText, setDisplayedText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (!isDeleting && displayedText === fullText) {
      // Pause at full text for 3.2 seconds so user can read comfortably
      timer = setTimeout(() => setIsDeleting(true), 3200);
    } else if (isDeleting && displayedText === '') {
      // Short pause before typing again
      timer = setTimeout(() => setIsDeleting(false), 500);
    } else {
      const speed = isDeleting ? 40 : 80;
      timer = setTimeout(() => {
        setDisplayedText((prev) =>
          isDeleting
            ? fullText.substring(0, prev.length - 1)
            : fullText.substring(0, prev.length + 1)
        );
      }, speed);
    }

    return () => clearTimeout(timer);
  }, [displayedText, isDeleting]);

  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-[9px] font-mono font-medium text-emerald-700 tracking-tight shrink-0 select-none shadow-2xs"
      title="Private API Key Anda sedang aktif (kuota terisolasi milik pribadi)"
    >
      <span className="w-1 h-1 rounded-full bg-emerald-500 animate-ping shrink-0" />
      <span className="whitespace-nowrap">{displayedText}</span>
      <span className="w-[1px] h-2 bg-emerald-600 animate-pulse shrink-0" />
    </span>
  );
};

export const AIChatDrawer: React.FC<AIChatDrawerProps> = ({
  isOpen,
  onClose,
  onOpen,
  data,
  summary,
  currentFileName,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'model',
      content:
        'Hey Yo! Saya **BlackEYE AI Assistant** *(develop by Kelvin)*. Saya siap bantu baca dan analisis data hasil konversi ERP Anda secara langsung.\n\nSilakan tanyakan rekap status CO, detail ukuran tiap artikel, sisa OS, stok ready, atau apapun terserah dah.\n\nJangan spam chat / banyak tanya yang ga penting :\nini makan token request per day. Kalo limit, gue ga bisa jawab pertanyaan lu yang penting nantinya.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastFailedQuery, setLastFailedQuery] = useState<string | null>(null);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [sizeMode, setSizeMode] = useState<ChatSizeMode>('compact');
  const [customApiKey, setCustomApiKey] = useState<string>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('blackeye_gemini_key') || '' : '';
  });
  const [savedKeySuccess, setSavedKeySuccess] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  // Quick prompt carousel ref & dragging states
  const quickPromptsRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeftState, setScrollLeftState] = useState(0);
  const hasDraggedRef = useRef(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isLoading]);

  // Focus input when drawer opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
    }
  }, [isOpen]);

  // Close drawer on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Check scrollability of quick prompt carousel
  const updateScrollButtons = () => {
    if (quickPromptsRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = quickPromptsRef.current;
      setCanScrollLeft(scrollLeft > 4);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 4);
    }
  };

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(updateScrollButtons, 150);
      window.addEventListener('resize', updateScrollButtons);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', updateScrollButtons);
      };
    }
  }, [isOpen, sizeMode]);

  const handleScrollCarousel = (direction: 'left' | 'right') => {
    if (quickPromptsRef.current) {
      haptic.light();
      const distance = direction === 'left' ? -240 : 240;
      quickPromptsRef.current.scrollBy({ left: distance, behavior: 'smooth' });
      setTimeout(updateScrollButtons, 260);
    }
  };

  const handleWheelCarousel = (e: React.WheelEvent) => {
    if (quickPromptsRef.current) {
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta !== 0) {
        quickPromptsRef.current.scrollLeft += delta;
        updateScrollButtons();
      }
    }
  };

  // Drag-to-scroll handlers
  const handleMouseDownCarousel = (e: React.MouseEvent) => {
    if (!quickPromptsRef.current) return;
    setIsDragging(true);
    hasDraggedRef.current = false;
    setStartX(e.pageX - quickPromptsRef.current.offsetLeft);
    setScrollLeftState(quickPromptsRef.current.scrollLeft);
  };

  const handleMouseMoveCarousel = (e: React.MouseEvent) => {
    if (!isDragging || !quickPromptsRef.current) return;
    const x = e.pageX - quickPromptsRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;
    if (Math.abs(walk) > 4) {
      hasDraggedRef.current = true;
    }
    quickPromptsRef.current.scrollLeft = scrollLeftState - walk;
    updateScrollButtons();
  };

  const handleMouseUpOrLeaveCarousel = () => {
    setIsDragging(false);
  };

  // If user converts a new file, add an automatic context switch notification in chat
  useEffect(() => {
    if (data && data.length > 0 && currentFileName) {
      setMessages((prev) => {
        const hasWelcome = prev.some((m) => m.id === 'welcome-data-loaded');
        if (!hasWelcome) {
          return [
            ...prev,
            {
              id: 'welcome-data-loaded',
              role: 'model',
              content: `📊 File **${currentFileName}** terdeteksi dengan **${data.length} PO**.\nData siap dianalisis! Anda bisa menanyakan rekap atau klik salah satu saran cepat di bawah.`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ];
        }
        return prev;
      });
    }
  }, [currentFileName, data]);

  const handleClearHistory = () => {
    haptic.medium();
    setMessages([
      {
        id: 'welcome-reset',
        role: 'model',
        content: 'Riwayat percakapan telah dibersihkan. Silakan ajukan pertanyaan baru.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setErrorMessage(null);
    setLastFailedQuery(null);
  };

  const handleSaveCustomKey = (keyVal: string) => {
    const trimmed = keyVal.trim();
    if (typeof window !== 'undefined') {
      if (trimmed) {
        localStorage.setItem('blackeye_gemini_key', trimmed);
        setCustomApiKey(trimmed);
      } else {
        localStorage.removeItem('blackeye_gemini_key');
        setCustomApiKey('');
      }
      setSavedKeySuccess(true);
      haptic.success();
      setTimeout(() => {
        setSavedKeySuccess(false);
        setShowKeyModal(false);
      }, 1200);
    }
  };

  const handleCopyMessage = (msgId: string, text: string) => {
    haptic.light();
    navigator.clipboard.writeText(text);
    setCopiedMessageId(msgId);
    setTimeout(() => {
      setCopiedMessageId(null);
    }, 2000);
  };

  const handleSendMessage = async (queryText?: string) => {
    const query = (queryText || input).trim();
    if (!query || isLoading) return;

    haptic.medium();
    setInput('');
    setErrorMessage(null);

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const modelMsgId = `model-${Date.now()}`;
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const apiHistory = messages
        .filter((m) => m.id !== 'welcome' && m.id !== 'welcome-reset' && m.id !== 'welcome-data-loaded')
        .slice(-8)
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (customApiKey) {
        headers['x-gemini-api-key'] = customApiKey;
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: query,
          history: apiHistory,
          dataContext: data && data.length > 0 ? { records: data, summary } : null,
          currentFileName: currentFileName || null,
          stream: true, // Enable SSE streaming for fastest TTFT (~200ms)
        }),
      });

      if (!response.ok) {
        let errJson: any = null;
        let rawText = '';
        try {
          rawText = await response.text();
          errJson = JSON.parse(rawText);
        } catch {
          // not json
        }
        if (errJson?.error === 'GEMINI_API_KEY_NOT_CONFIGURED') {
          throw new Error(
            'GEMINI_API_KEY belum dikonfigurasi di Environment Variables. Silakan pasang di Vercel Dashboard (Project Settings > Environment Variables) atau gunakan tombol "Pasang API Key Pribadi" di bawah.'
          );
        }
        if (errJson?.message) {
          throw new Error(errJson.message);
        }
        if (response.status === 500) {
          throw new Error(
            'Server backend mengalami kendala (HTTP 500). Jika Anda membuka versi hosting di Vercel, pastikan GEMINI_API_KEY telah diatur di Vercel Project Settings > Environment Variables, atau masukkan API Key pribadi via tombol di bawah.'
          );
        }
        throw new Error(rawText || `Server error (${response.status})`);
      }

      // Check if response is Server-Sent Events stream
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/event-stream') && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let accumulatedReply = '';
        let detectedModel: string | undefined = undefined;
        let hasInitializedBubble = false;

        const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const block of lines) {
            if (!block.trim()) continue;

            let eventType = 'message';
            let dataStr = '';

            const rawLines = block.split('\n');
            for (const line of rawLines) {
              if (line.startsWith('event:')) {
                eventType = line.replace('event:', '').trim();
              } else if (line.startsWith('data:')) {
                dataStr = line.replace('data:', '').trim();
              }
            }

            if (!dataStr) continue;

            if (eventType === 'meta') {
              try {
                const meta = JSON.parse(dataStr);
                if (meta.modelUsed) detectedModel = meta.modelUsed;
              } catch {
                // ignore
              }
            } else if (eventType === 'error') {
              try {
                const errObj = JSON.parse(dataStr);
                throw new Error(errObj.message || 'Error from AI stream');
              } catch (parseErr: any) {
                throw new Error(parseErr.message || 'Stream error');
              }
            } else if (eventType === 'done') {
              // stream complete
              break;
            } else {
              // Standard data event: contains text chunk
              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.text) {
                  accumulatedReply += parsed.text;

                  if (!hasInitializedBubble) {
                    hasInitializedBubble = true;
                    // Stop spinner immediately as first word arrives
                    setIsLoading(false);
                    setMessages((prev) => [
                      ...prev,
                      {
                        id: modelMsgId,
                        role: 'model',
                        content: accumulatedReply,
                        timestamp: timeString,
                        modelUsed: detectedModel,
                      },
                    ]);
                  } else {
                    // Update content progressively in real-time
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === modelMsgId
                          ? { ...msg, content: accumulatedReply, modelUsed: detectedModel || msg.modelUsed }
                          : msg
                      )
                    );
                  }

                  if (messagesEndRef.current) {
                    messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
                  }
                }
              } catch {
                // not json text chunk, ignore
              }
            }
          }
        }

        if (!hasInitializedBubble && accumulatedReply) {
          setIsLoading(false);
          setMessages((prev) => [
            ...prev,
            {
              id: modelMsgId,
              role: 'model',
              content: accumulatedReply,
              timestamp: timeString,
              modelUsed: detectedModel,
            },
          ]);
        }

        setLastFailedQuery(null);
        haptic.success();
      } else {
        // Fallback for standard JSON response
        const result = await response.json();
        const modelMessage: Message = {
          id: modelMsgId,
          role: 'model',
          content: result.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          modelUsed: result.modelUsed,
        };

        setMessages((prev) => [...prev, modelMessage]);
        setLastFailedQuery(null);
        haptic.success();
      }

      setTimeout(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }, 50);
    } catch (err: any) {
      console.error('Chat error:', err);
      haptic.error();
      setLastFailedQuery(query);

      let msg = err?.message || 'Terjadi gangguan saat menghubungi AI.';
      if (typeof msg === 'string') {
        if (msg.includes('503') || msg.includes('high demand') || msg.includes('UNAVAILABLE')) {
          msg = 'Server Google Gemini sedang mengalami antrean trafik padat (503). Sistem telah mencoba auto-fallback ke model lain. Silakan tekan tombol "Coba Lagi" di bawah.';
        } else if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('kuota')) {
          msg = 'Batas kuota gratis Google Gemini atau frekuensi pengiriman tercapai (429). Silakan tunggu 30 detik lalu tekan "Coba Lagi", atau pasang Gemini API Key pribadi via ikon kunci (🔑) di atas.';
        }
      }
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const quickPrompts = [
    'Analisis Aging PO (< 7h, 8-14h, > 14h)',
    'Daftar ukuran semua artikel',
    'Rekap PO dengan status OPEN',
    'Cek artikel yang memiliki Stok Ready gudang',
    'Berapa total Sisa OS (kg & pcs)?',
    'Bandingkan artikel SH- vs ST- vs BX- vs DC-',
    'Tampilkan tabel rincian lengkap per PO',
    'Daftar PO yang ada pengiriman parsial (P26)',
  ];

  // Dynamic classes for drawer size modes
  const getContainerSizeClasses = () => {
    switch (sizeMode) {
      case 'fullscreen':
        return 'fixed inset-0 sm:inset-5 z-50 w-full sm:w-[calc(100vw-40px)] h-full sm:h-[calc(100vh-40px)] max-w-full rounded-none sm:rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,19,0.18)] border border-white/80';
      case 'wide':
        return 'fixed bottom-0 right-0 sm:bottom-5 sm:right-5 z-50 w-full sm:w-[860px] md:w-[940px] h-[92vh] sm:h-[740px] max-h-[96vh] rounded-t-3xl sm:rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,19,0.18)] border border-white/80';
      case 'mini':
        return 'fixed bottom-0 right-0 sm:bottom-5 sm:right-5 z-50 w-full sm:w-[420px] h-[60vh] sm:h-[490px] max-h-[85vh] rounded-t-3xl sm:rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,19,0.18)] border border-white/80';
      case 'compact':
      default:
        return 'fixed bottom-0 right-0 sm:bottom-5 sm:right-5 z-50 w-full sm:w-[520px] h-[88vh] sm:h-[660px] max-h-[94vh] rounded-t-3xl sm:rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,19,0.18)] border border-white/80';
    }
  };

  return (
    <>
      {/* Floating Trigger Button when closed */}
      {!isOpen && (
        <button
          type="button"
          id="btn-open-ai-chat-floating"
          onClick={() => {
            haptic.medium();
            onOpen();
          }}
          className="fixed bottom-4 right-4 sm:bottom-5 sm:right-5 z-40 rounded-full group cursor-pointer transition-all duration-300 hover:scale-[1.04] active:scale-[0.97] select-none shadow-[0_16px_36px_-6px_rgba(0,0,19,0.14),0_4px_12px_-2px_rgba(25,113,156,0.10)]"
          title="Buka AI Chatbot Asisten"
        >
          {/* 1. Authentic Apple Liquid Glass Body (Original 52% opacity & blur for true translucency) */}
          <div className="relative z-10 apple-liquid-glass-badge p-2 sm:px-3.5 sm:py-2 flex items-center gap-2.5 sm:gap-3 rounded-full">
            {/* 3D Specular curved glass sheen overlay */}
            <div
              className="absolute inset-x-0 top-0 h-[48%] rounded-t-full pointer-events-none bg-gradient-to-b from-white/70 via-white/20 to-transparent"
              aria-hidden="true"
            />

            {/* Bot Icon with Liquid Sphere styling */}
            <div className="relative w-8 h-8 rounded-full bg-gradient-to-b from-[#1F83B4] to-[#19719C] flex items-center justify-center text-white shadow-md shadow-[#19719C]/30 border border-white/40 shrink-0">
              <Bot className="w-4 h-4 group-hover:rotate-12 transition-transform duration-300" />
              {data && data.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full ring-2 ring-white animate-pulse" />
              )}
            </div>

            {/* Text Label & Status - Hidden on small mobile to avoid blocking table rows, fully visible on sm: desktop */}
            <div className="hidden sm:block text-left font-sans select-none">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-[#000013] tracking-tight drop-shadow-[0_1px_1px_rgba(255,255,255,0.8)]">
                  AI Assistant
                </span>
                <Sparkles className="w-3.5 h-3.5 text-[#19719C]" />
              </div>
              <span className="text-[10px] text-[#19719C] font-semibold block leading-tight">
                {data && data.length > 0 ? `${data.length} PO Terdeteksi` : 'Tanya Data ERP'}
              </span>
            </div>
          </div>

          {/* 2. Clockwise Moving Bright Light Blue Beam (Strictly masked to the 2px perimeter stroke) */}
          <div className="liquid-glass-beam-ring" aria-hidden="true">
            <div
              className="absolute left-1/2 top-1/2 w-[340px] h-[340px] pointer-events-none animate-border-beam-clockwise"
              style={{
                background:
                  'conic-gradient(from 0deg, transparent 0deg, transparent 265deg, rgba(25,113,156,0.3) 285deg, #19719C 305deg, #0284C7 325deg, #38BDF8 345deg, #BAE6FD 356deg, #FFFFFF 360deg)',
              }}
            />
          </div>

          {/* 3. Subtle ambient light blue glow halo on the outer edge, also masked from the center */}
          <div className="liquid-glass-beam-halo" aria-hidden="true">
            <div
              className="absolute left-1/2 top-1/2 w-[340px] h-[340px] pointer-events-none animate-border-beam-clockwise"
              style={{
                background:
                  'conic-gradient(from 0deg, transparent 0deg, transparent 280deg, #19719C 310deg, #0EA5E9 335deg, #38BDF8 350deg, #FFFFFF 360deg)',
              }}
            />
          </div>
        </button>
      )}

      {/* Floating Chat Drawer Container */}
      {isOpen && (
        <div
          id="ai-chat-drawer-container"
          className={`${getContainerSizeClasses()} bg-white/70 backdrop-blur-2xl flex flex-col overflow-hidden font-sans transition-all duration-200 ease-out shadow-[0_20px_60px_-15px_rgba(0,0,19,0.14),0_0_0_1px_rgba(255,255,255,0.7)]`}
        >
          {/* Minimalist Frosted Glass Header */}
          <div className="px-3.5 sm:px-4 py-3 bg-white/75 backdrop-blur-2xl border-b border-white/80 flex items-center justify-between gap-2 shrink-0 select-none text-[#000013]">
            {/* Left: Brand Identity */}
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-b from-[#1F83B4] to-[#19719C] text-white flex items-center justify-center shrink-0 shadow-sm shadow-[#19719C]/25 border border-white/30">
                <Bot className="w-4 h-4" />
              </div>
              <div className="min-w-0 truncate">
                <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
                  <h3 className="text-xs sm:text-sm font-bold tracking-tight text-[#000013] truncate">
                    BlackEYE AI
                  </h3>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  {customApiKey && <TypingPrivateApiKey />}
                </div>
                <div className="text-[10px] text-[#5C5C68] truncate">
                  Asisten ERP SYMIX & Logistik
                </div>
              </div>
            </div>

            {/* Right: Controls & Actions (Always anchored with shrink-0) */}
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              {/* Size Mode Switcher */}
              <div className="flex items-center glass-segmented p-0.5">
                <button
                  type="button"
                  id="btn-size-mini"
                  onClick={() => {
                    haptic.light();
                    setSizeMode('mini');
                  }}
                  className={`px-2 py-0.5 text-[10px] transition-all cursor-pointer ${
                    sizeMode === 'mini'
                      ? 'glass-segmented-active font-bold'
                      : 'text-[#5C5C68] hover:text-[#000013] rounded-full font-medium'
                  }`}
                  title="Ukuran Mini"
                >
                  Mini
                </button>
                <button
                  type="button"
                  id="btn-size-compact"
                  onClick={() => {
                    haptic.light();
                    setSizeMode('compact');
                  }}
                  className={`px-2 py-0.5 text-[10px] transition-all cursor-pointer ${
                    sizeMode === 'compact'
                      ? 'glass-segmented-active font-bold'
                      : 'text-[#5C5C68] hover:text-[#000013] rounded-full font-medium'
                  }`}
                  title="Ukuran Normal"
                >
                  Normal
                </button>
                <button
                  type="button"
                  id="btn-size-wide"
                  onClick={() => {
                    haptic.light();
                    setSizeMode('wide');
                  }}
                  className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-[10px] transition-all cursor-pointer ${
                    sizeMode === 'wide'
                      ? 'glass-segmented-active font-bold'
                      : 'text-[#5C5C68] hover:text-[#000013] rounded-full font-medium'
                  }`}
                  title="Ukuran Lebar"
                >
                  <Columns2 className="w-3 h-3" />
                  <span>Lebar</span>
                </button>
                <button
                  type="button"
                  id="btn-size-fullscreen"
                  onClick={() => {
                    haptic.light();
                    setSizeMode(sizeMode === 'fullscreen' ? 'compact' : 'fullscreen');
                  }}
                  className={`p-1 transition-all cursor-pointer ${
                    sizeMode === 'fullscreen'
                      ? 'glass-segmented-active'
                      : 'text-[#5C5C68] hover:text-[#000013] rounded-full'
                  }`}
                  title={sizeMode === 'fullscreen' ? 'Perkecil' : 'Layar Penuh'}
                >
                  {sizeMode === 'fullscreen' ? (
                    <Minimize2 className="w-3.5 h-3.5" />
                  ) : (
                    <Maximize2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              {/* Clear History */}
              <button
                type="button"
                id="btn-ai-chat-clear"
                onClick={handleClearHistory}
                className="w-7 h-7 rounded-full bg-white/70 hover:bg-white border border-white/85 flex items-center justify-center text-[#5C5C68] hover:text-red-600 transition-colors cursor-pointer shadow-2xs"
                title="Bersihkan riwayat chat"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>

              {/* API Key Modal Toggle */}
              <button
                type="button"
                id="btn-ai-chat-key"
                onClick={() => setShowKeyModal(!showKeyModal)}
                className={`w-7 h-7 rounded-full border flex items-center justify-center transition-colors cursor-pointer shadow-2xs ${
                  customApiKey
                    ? 'text-[#19719C] bg-[#83B3CA]/20 border-[#19719C]/40'
                    : 'text-[#5C5C68] bg-white/70 hover:bg-white hover:text-[#000013] border-white/85'
                }`}
                title="Pengaturan API Key"
              >
                <Key className="w-3.5 h-3.5" />
              </button>

              {/* Close Button X - Guaranteed ALWAYS visible & never clipped */}
              <button
                type="button"
                id="btn-ai-chat-close"
                onClick={() => {
                  haptic.light();
                  onClose();
                }}
                className="w-7 h-7 rounded-full bg-white/80 hover:bg-white border border-white/90 flex items-center justify-center text-[#5C5C68] hover:text-[#000013] hover:rotate-90 transition-all cursor-pointer shadow-2xs ml-0.5 shrink-0"
                title="Tutup Chat"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Context Status Banner */}
          <div className="px-3.5 sm:px-4 py-2 bg-white/45 backdrop-blur-md border-b border-white/60 flex items-center justify-between text-xs shrink-0">
            <div className="flex items-center gap-2 truncate">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  data && data.length > 0 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-pulse' : 'bg-amber-400'
                }`}
              />
              <span className="truncate text-[#000013] font-medium text-[11px]">
                {data && data.length > 0
                  ? `Konteks: ${currentFileName || 'Excel Terkonversi'} (${data.length} PO Terdeteksi)`
                  : 'Belum ada data. Silakan upload file Excel.'}
              </span>
            </div>

            {data && data.length > 0 && (
              <span className="text-[10px] text-[#19719C] font-semibold bg-[#83B3CA]/15 px-2.5 py-0.5 border border-[#83B3CA]/30 rounded-full shrink-0 ml-2 shadow-2xs">
                Data Aktif
              </span>
            )}
          </div>

          {/* Custom API Key Overlay Settings */}
          {showKeyModal && (
            <div className="p-4 mx-3 my-2 rounded-2xl glass-panel-warm border border-[#83B3CA]/40 animate-fade-in shrink-0 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold uppercase text-[#000013] flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-[#19719C]" />
                  Kustom Gemini API Key (Opsional)
                </span>
                <button
                  type="button"
                  onClick={() => setShowKeyModal(false)}
                  className="w-6 h-6 rounded-full bg-white/70 hover:bg-white border border-white/80 flex items-center justify-center text-[#5C5C68] hover:text-[#000013] cursor-pointer shadow-2xs"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <p className="text-[11px] text-[#5C5C68] mb-2.5 leading-relaxed">
                Di Vercel, API Key cukup dipasang di <strong>Vercel Settings &gt; Environment Variables</strong>. Namun jika ingin menguji langsung di browser ini, Anda bisa memasukkannya di bawah:
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  id="input-custom-api-key"
                  value={customApiKey}
                  onChange={(e) => setCustomApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="flex-1 px-3 py-1.5 bg-white/80 border border-white/90 rounded-xl text-xs font-mono shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#19719C]/30 text-[#000013]"
                />
                <button
                  type="button"
                  id="btn-save-custom-api-key"
                  onClick={() => handleSaveCustomKey(customApiKey)}
                  className="liquid-glass-primary px-3.5 py-1.5 text-xs font-semibold cursor-pointer shrink-0"
                >
                  {savedKeySuccess ? 'Tersimpan!' : 'Simpan'}
                </button>
                {customApiKey && (
                  <button
                    type="button"
                    id="btn-reset-custom-api-key"
                    onClick={() => {
                      setCustomApiKey('');
                      handleSaveCustomKey('');
                    }}
                    className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200/80 rounded-xl text-xs font-semibold cursor-pointer shrink-0 transition-colors"
                    title="Hapus API Key kustom dan kembali ke default"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-5 bg-gradient-to-b from-[#F5F6F7]/50 via-[#E7EAED]/30 to-[#F2F4F6]/50 backdrop-blur-lg">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start w-full'}`}
                >
                  {isUser ? (
                    /* User Bubble Chat (preserved as requested) */
                    <div className="max-w-[85%] bg-gradient-to-b from-[#1F83B4] to-[#19719C] text-white rounded-2xl rounded-tr-xs p-3.5 shadow-md shadow-[#19719C]/20 border border-white/30 text-xs leading-relaxed">
                      <div className="markdown-content font-sans text-xs break-words text-white">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            code: ({ className, children, ...props }: any) => {
                              const match = /language-(\w+)/.exec(className || '');
                              const isBlock = match || (typeof children === 'string' && children.includes('\n'));
                              if (!isBlock) {
                                return (
                                  <code
                                    className="bg-white/25 border border-white/35 text-white px-1.5 py-0.5 rounded-md font-mono text-[11px] font-semibold"
                                    {...props}
                                  >
                                    {children}
                                  </code>
                                );
                              }
                              return (
                                <pre className="my-2 p-2.5 rounded-lg bg-zinc-900/90 text-emerald-300 font-mono text-xs overflow-x-auto">
                                  <code {...props}>{children}</code>
                                </pre>
                              );
                            },
                            p: ({ ...props }) => (
                              <p className="mb-2 last:mb-0 leading-relaxed font-sans text-white" {...props} />
                            ),
                            ul: ({ ...props }) => (
                              <ul className="list-disc pl-5 mb-2 space-y-1 font-sans text-white" {...props} />
                            ),
                            ol: ({ ...props }) => (
                              <ol className="list-decimal pl-5 mb-2 space-y-1 font-sans text-white" {...props} />
                            ),
                            li: ({ ...props }) => <li className="leading-relaxed" {...props} />,
                            strong: ({ ...props }) => <strong className="font-bold text-white" {...props} />,
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                      <div className="text-[9px] font-mono mt-1.5 text-right text-white/80">
                        {msg.timestamp}
                      </div>
                    </div>
                  ) : (
                    /* AI Assistant Response: Minimalist layout without bubble chat, maximum width */
                    <div className="w-full text-xs leading-relaxed py-1">
                      {/* Minimalist Assistant Header */}
                      <div className="flex items-center justify-between gap-2 mb-2.5 pb-1.5 border-b border-zinc-200/60 text-[11px] font-semibold text-[#19719C]">
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-md bg-[#83B3CA]/20 text-[#19719C] flex items-center justify-center">
                            <Bot className="w-3.5 h-3.5" />
                          </div>
                          <span className="tracking-wider uppercase text-[11px] font-semibold">
                            BlackEYE Assistant
                          </span>
                          {msg.modelUsed && (
                            <span className="text-[10px] font-mono font-normal px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 lowercase tracking-normal">
                              {msg.modelUsed.replace('models/', '')}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleCopyMessage(msg.id, msg.content)}
                            className="liquid-glass-clear px-2 py-0.5 text-[10px] cursor-pointer flex items-center gap-1 hover:text-[#19719C] transition-colors"
                            title="Salin jawaban"
                          >
                            {copiedMessageId === msg.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600" />
                                <span className="text-emerald-700">Tersalin</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3 text-[#5C5C68]" />
                                <span>Salin</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Markdown Content - Spans full width with zero side bubble restriction */}
                      <div className="markdown-content font-sans text-xs break-words overflow-x-auto text-[#000013]">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            table: ({ ...props }) => (
                              <div className="my-3 overflow-x-auto rounded-xl border border-zinc-200/80 shadow-2xs bg-white/90 backdrop-blur-md max-w-full">
                                <table
                                  className="w-full text-left border-collapse font-mono text-[11px] tabular-nums"
                                  {...props}
                                />
                              </div>
                            ),
                            thead: ({ ...props }) => (
                              <thead className="bg-[#19719C] text-white border-b border-[#145d82]" {...props} />
                            ),
                            th: ({ ...props }) => (
                              <th
                                className="px-3 py-2 font-semibold uppercase tracking-wider text-[10px] whitespace-nowrap text-white"
                                {...props}
                              />
                            ),
                            tbody: ({ ...props }) => (
                              <tbody className="divide-y divide-zinc-200/50 bg-white/70" {...props} />
                            ),
                            tr: ({ ...props }) => (
                              <tr
                                className="hover:bg-[#83B3CA]/10 transition-colors even:bg-white/40"
                                {...props}
                              />
                            ),
                            td: ({ ...props }) => (
                              <td
                                className="px-3 py-1.5 whitespace-nowrap font-mono text-[11px] text-[#000013]"
                                {...props}
                              />
                            ),
                            code: ({ className, children, ...props }: any) => {
                              const match = /language-(\w+)/.exec(className || '');
                              const isBlock = match || (typeof children === 'string' && children.includes('\n'));
                              if (!isBlock) {
                                return (
                                  <code
                                    className="bg-[#83B3CA]/15 border border-[#83B3CA]/30 text-[#19719C] px-1.5 py-0.5 rounded-md font-mono text-[11px] font-semibold"
                                    {...props}
                                  >
                                    {children}
                                  </code>
                                );
                              }
                              return (
                                <pre className="my-2.5 p-3 rounded-xl bg-zinc-900/95 text-emerald-400 font-mono text-xs border border-white/10 shadow-inner overflow-x-auto">
                                  <code {...props}>{children}</code>
                                </pre>
                              );
                            },
                            p: ({ ...props }) => (
                              <p className="mb-2 last:mb-0 leading-relaxed font-sans text-[#000013]" {...props} />
                            ),
                            ul: ({ ...props }) => (
                              <ul className="list-disc pl-5 mb-2 space-y-1 font-sans text-[#000013]" {...props} />
                            ),
                            ol: ({ ...props }) => (
                              <ol className="list-decimal pl-5 mb-2 space-y-1 font-sans text-[#000013]" {...props} />
                            ),
                            li: ({ ...props }) => <li className="leading-relaxed" {...props} />,
                            strong: ({ ...props }) => (
                              <strong className="font-bold text-[#000013]" {...props} />
                            ),
                            h1: ({ ...props }) => (
                              <h1
                                className="text-sm font-bold uppercase mt-2.5 mb-1 pb-1 border-b border-zinc-200/60 text-[#000013]"
                                {...props}
                              />
                            ),
                            h2: ({ ...props }) => (
                              <h2 className="text-xs font-bold uppercase mt-2 mb-1 text-[#000013]" {...props} />
                            ),
                            h3: ({ ...props }) => (
                              <h3 className="text-xs font-semibold uppercase mt-1.5 mb-1 text-[#000013]" {...props} />
                            ),
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      </div>

                      <div className="text-[10px] font-mono mt-2 text-right text-[#5C5C68]">
                        {msg.timestamp}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Animated Typing Indicator with requested text: "Sedang mengetik, tunggu yaa..." */}
            {isLoading && (
              <div className="inline-flex items-center gap-2.5 py-2 px-3.5 rounded-full bg-white/80 backdrop-blur-xl border border-white/90 text-xs text-[#5C5C68] animate-fade-in shadow-2xs">
                {/* Animated 3 Bouncing Dots with Apple liquid blue accents */}
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#19719C] animate-bounce [animation-delay:-0.32s]" />
                  <span className="w-2 h-2 rounded-full bg-[#83B3CA] animate-bounce [animation-delay:-0.16s]" />
                  <span className="w-2 h-2 rounded-full bg-[#19719C]/50 animate-bounce" />
                </div>
                <span className="text-xs font-medium text-[#000013]">
                  Sedang mengetik, tunggu yaa...
                </span>
              </div>
            )}

            {/* Error Message Box with Retry Action */}
            {errorMessage && (
              <div className="p-3.5 rounded-2xl bg-white/85 backdrop-blur-md border border-red-300 text-xs text-red-950 shadow-sm">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <strong className="block mb-1 text-red-900 font-semibold">Perhatian:</strong>
                    <div className="leading-relaxed mb-2.5 text-red-900/90">{errorMessage}</div>
                    <div className="flex flex-wrap items-center gap-2">
                      {lastFailedQuery && (
                        <button
                          type="button"
                          onClick={() => handleSendMessage(lastFailedQuery)}
                          disabled={isLoading}
                          className="liquid-glass-clear inline-flex items-center gap-1.5 px-3 py-1 text-xs text-red-900 font-medium cursor-pointer"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Coba Lagi Pertanyaan</span>
                        </button>
                      )}
                      {!showKeyModal && (
                        <button
                          type="button"
                          onClick={() => setShowKeyModal(true)}
                          className="px-3 py-1 rounded-full bg-white/90 hover:bg-white border border-red-200 text-xs text-red-900 font-medium inline-flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                        >
                          <Key className="w-3 h-3 text-[#19719C]" />
                          <span>Pasang API Key Pribadi</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts Carousel with Left/Right Arrows, Wheel & Touch Pan */}
          <div className="relative bg-white/60 backdrop-blur-xl border-t border-white/70 px-2 py-2 flex items-center gap-1.5 shrink-0">
            {/* Left Scroll Button */}
            <button
              type="button"
              onClick={() => handleScrollCarousel('left')}
              disabled={!canScrollLeft}
              className={`liquid-glass-clear p-1.5 min-w-[28px] min-h-[28px] flex items-center justify-center shrink-0 ${
                canScrollLeft ? 'opacity-100 cursor-pointer' : 'opacity-25 cursor-not-allowed'
              }`}
              title="Geser opsi pertanyaan ke kiri"
              aria-label="Geser pertanyaan ke kiri"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            {/* Scrollable Container with Grab & Drag & Wheel & Touch */}
            <div
              ref={quickPromptsRef}
              onScroll={updateScrollButtons}
              onWheel={handleWheelCarousel}
              onMouseDown={handleMouseDownCarousel}
              onMouseMove={handleMouseMoveCarousel}
              onMouseUp={handleMouseUpOrLeaveCarousel}
              onMouseLeave={handleMouseUpOrLeaveCarousel}
              className={`flex-1 flex gap-2 overflow-x-auto px-1 py-0.5 select-none touch-pan-x ${
                isDragging ? 'cursor-grabbing' : 'cursor-grab scroll-smooth'
              }`}
              style={{ scrollbarWidth: 'thin' }}
            >
              {quickPrompts.map((prompt, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    if (hasDraggedRef.current) return;
                    handleSendMessage(prompt);
                  }}
                  disabled={isLoading}
                  className="liquid-glass-clear whitespace-nowrap px-3.5 py-1.5 text-[11px] font-medium text-[#000013] hover:text-[#19719C] hover:border-[#19719C]/40 shrink-0 disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {prompt}
                </button>
              ))}
            </div>

            {/* Right Scroll Button */}
            <button
              type="button"
              onClick={() => handleScrollCarousel('right')}
              disabled={!canScrollRight}
              className={`liquid-glass-clear p-1.5 min-w-[28px] min-h-[28px] flex items-center justify-center shrink-0 ${
                canScrollRight ? 'opacity-100 cursor-pointer' : 'opacity-25 cursor-not-allowed'
              }`}
              title="Geser opsi pertanyaan ke kanan"
              aria-label="Geser pertanyaan ke kanan"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Input Box Footer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3 bg-white/70 backdrop-blur-xl border-t border-white/80 flex items-center gap-2 shrink-0"
          >
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                id="input-ai-chat-query"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Tanyakan apa saja tentang data tabel ERP..."
                disabled={isLoading}
                className="w-full px-4 py-2.5 bg-white/80 backdrop-blur-md border border-white/90 rounded-full text-xs font-mono text-[#000013] placeholder-[#5C5C68]/60 focus:outline-none focus:ring-2 focus:ring-[#19719C]/30 focus:border-[#19719C] focus:bg-white shadow-2xs transition-all"
              />
            </div>
            <button
              type="submit"
              id="btn-ai-chat-send"
              disabled={isLoading || !input.trim()}
              className="liquid-glass-primary px-4 sm:px-5 py-2.5 text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Kirim</span>
            </button>
          </form>
        </div>
      )}
    </>
  );
};
