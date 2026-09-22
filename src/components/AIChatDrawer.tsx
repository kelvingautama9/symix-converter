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
        'Halo! Saya **BlackEYE AI Assistant**. Saya dapat membaca dan menganalisis data hasil konversi Excel Anda secara langsung.\n\nAnda dapat menanyakan rekap status CO, detail ukuran tiap artikel, sisa tonase OS, ketersediaan stok ready gudang, atau perbandingan artikel packaging (`SH-`, `ST-`, `BX-`, `DC-`).',
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
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        if (result.error === 'GEMINI_API_KEY_NOT_CONFIGURED') {
          throw new Error(
            'GEMINI_API_KEY belum dikonfigurasi di Vercel Environment Variables. Silakan pasang di Vercel Dashboard, atau klik ikon kunci di atas untuk memasukkan API Key secara langsung.'
          );
        }
        throw new Error(result.message || 'Gagal menerima tanggapan dari AI.');
      }

      const modelMessage: Message = {
        id: `model-${Date.now()}`,
        role: 'model',
        content: result.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, modelMessage]);
      setLastFailedQuery(null);
      haptic.success();
    } catch (err: any) {
      console.error('Chat error:', err);
      haptic.error();
      setLastFailedQuery(query);

      let msg = err?.message || 'Terjadi gangguan saat menghubungi AI.';
      if (typeof msg === 'string') {
        if (msg.includes('503') || msg.includes('high demand') || msg.includes('UNAVAILABLE')) {
          msg = 'Server Google Gemini sedang mengalami antrean trafik padat (503). Silakan tekan tombol "Coba Lagi" di bawah.';
        } else if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
          msg = 'Batas kuota harian atau frekuensi request tercapai. Silakan tunggu sebentar lalu coba lagi.';
        }
      }
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const quickPrompts = [
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
        return 'fixed inset-0 sm:inset-3 z-50 w-full sm:w-[calc(100vw-24px)] h-full sm:h-[calc(100vh-24px)] max-w-full sm:border-2 border-[#141414] shadow-2xl';
      case 'wide':
        return 'fixed bottom-0 right-0 sm:bottom-4 sm:right-4 z-50 w-full sm:w-[860px] md:w-[960px] h-[94vh] sm:h-[780px] max-h-[96vh] sm:border-2 border-[#141414] sm:shadow-[8px_8px_0px_#141414]';
      case 'mini':
        return 'fixed bottom-0 right-0 sm:bottom-4 sm:right-4 z-50 w-full sm:w-[390px] h-[55vh] sm:h-[460px] max-h-[85vh] sm:border-2 border-[#141414] sm:shadow-[4px_4px_0px_#141414]';
      case 'compact':
      default:
        return 'fixed bottom-0 right-0 sm:bottom-5 sm:right-5 z-50 w-full sm:w-[500px] h-[90vh] sm:h-[650px] max-h-[95vh] sm:border-2 border-[#141414] sm:shadow-[6px_6px_0px_#141414]';
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
          className="fixed bottom-5 right-5 z-40 bg-[#141414] hover:bg-[#252525] text-white px-4 py-3 border-2 border-[#141414] shadow-[4px_4px_0px_#141414] flex items-center gap-2.5 transition-all transform active:translate-x-[2px] active:translate-y-[2px] cursor-pointer group"
          title="Buka AI Chatbot Asisten"
        >
          <div className="relative">
            <Bot className="w-5 h-5 text-emerald-400 group-hover:rotate-12 transition-transform" />
            {data && data.length > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full animate-ping" />
            )}
          </div>
          <div className="text-left font-mono">
            <span className="text-xs font-black tracking-wider block">AI CHATBOT</span>
            <span className="text-[10px] text-emerald-400 font-bold block -mt-0.5">
              {data && data.length > 0 ? `${data.length} PO Terbaca` : 'Tanya Data'}
            </span>
          </div>
          <Sparkles className="w-3.5 h-3.5 text-amber-400 ml-0.5" />
        </button>
      )}

      {/* Floating Chat Drawer Container */}
      {isOpen && (
        <div
          id="ai-chat-drawer-container"
          className={`${getContainerSizeClasses()} bg-[#F5F5F3] flex flex-col overflow-hidden font-sans transition-all duration-200 ease-out`}
        >
          {/* Header */}
          <div className="p-3 bg-[#141414] text-white border-b-2 border-[#141414] flex items-center justify-between shrink-0 select-none">
            <div className="flex items-center gap-2 sm:gap-2.5">
              <div className="w-7 h-7 sm:w-8 sm:h-8 bg-emerald-500/20 border border-emerald-400 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
              </div>
              <div className="truncate">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-black font-mono tracking-wider text-white truncate">
                    BLACKEYE AI
                  </h3>
                  <span className="px-1.5 py-0.5 bg-emerald-950 text-emerald-300 border border-emerald-500/60 text-[9px] font-mono font-bold uppercase hidden sm:inline">
                    Gemini 3.8 Flash
                  </span>
                </div>
                <div className="text-[10px] font-mono text-white/60 truncate">
                  Analisis Data Hasil Convert ERP
                </div>
              </div>
            </div>

            {/* Header Controls: Size Switchers & Actions */}
            <div className="flex items-center gap-1 shrink-0">
              {/* Size Mode Switcher Buttons */}
              <div className="hidden sm:flex items-center bg-white/10 border border-white/20 p-0.5 mr-1">
                <button
                  type="button"
                  id="btn-size-mini"
                  onClick={() => {
                    haptic.light();
                    setSizeMode('mini');
                  }}
                  className={`px-1.5 py-1 text-[10px] font-mono font-bold uppercase transition-colors ${
                    sizeMode === 'mini'
                      ? 'bg-white text-[#141414] shadow-sm'
                      : 'text-white/70 hover:text-white'
                  }`}
                  title="Perkecil Ukuran (Mini 390px)"
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
                  className={`px-2 py-1 text-[10px] font-mono font-bold uppercase transition-colors ${
                    sizeMode === 'compact'
                      ? 'bg-white text-[#141414] shadow-sm'
                      : 'text-white/70 hover:text-white'
                  }`}
                  title="Ukuran Standar"
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
                  className={`px-2 py-1 text-[10px] font-mono font-bold uppercase flex items-center gap-1 transition-colors ${
                    sizeMode === 'wide'
                      ? 'bg-white text-[#141414] shadow-sm'
                      : 'text-white/70 hover:text-white'
                  }`}
                  title="Tampilan Melebar (Cocok untuk Tabel)"
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
                  className={`p-1 transition-colors ${
                    sizeMode === 'fullscreen'
                      ? 'bg-white text-[#141414]'
                      : 'text-white/70 hover:text-white'
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

              {/* Mobile Quick Size Buttons */}
              <div className="sm:hidden flex items-center bg-white/10 border border-white/20 p-0.5 mr-0.5">
                <button
                  type="button"
                  onClick={() => {
                    haptic.light();
                    setSizeMode(sizeMode === 'mini' ? 'compact' : 'mini');
                  }}
                  className={`px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase ${
                    sizeMode === 'mini' ? 'bg-white text-[#141414]' : 'text-white/80'
                  }`}
                  title="Toggle Ukuran Mini"
                >
                  {sizeMode === 'mini' ? 'Norm' : 'Mini'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    haptic.light();
                    setSizeMode(sizeMode === 'fullscreen' ? 'compact' : 'fullscreen');
                  }}
                  className={`p-1 ${sizeMode === 'fullscreen' ? 'bg-white text-[#141414]' : 'text-white/80'}`}
                  title="Layar Penuh"
                >
                  {sizeMode === 'fullscreen' ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
              </div>

              <button
                type="button"
                id="btn-ai-chat-clear"
                onClick={handleClearHistory}
                className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                title="Bersihkan riwayat chat"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <button
                type="button"
                id="btn-ai-chat-key"
                onClick={() => setShowKeyModal(!showKeyModal)}
                className={`p-1.5 transition-colors ${
                  customApiKey ? 'text-emerald-400 bg-emerald-950/40' : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
                title="Pengaturan API Key"
              >
                <Key className="w-4 h-4" />
              </button>

              <button
                type="button"
                id="btn-ai-chat-close"
                onClick={() => {
                  haptic.light();
                  onClose();
                }}
                className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 transition-colors ml-0.5"
                title="Tutup Chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Context Status Banner */}
          <div className="px-3.5 py-1.5 bg-white border-b border-[#141414]/20 flex items-center justify-between text-xs font-mono shrink-0">
            <div className="flex items-center gap-2 truncate">
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  data && data.length > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'
                }`}
              />
              <span className="truncate text-[#141414] font-bold text-[11px]">
                {data && data.length > 0
                  ? `Konteks: ${currentFileName || 'Excel Terkonversi'} (${data.length} PO Terdeteksi)`
                  : 'Belum ada data. Silakan upload file Excel.'}
              </span>
            </div>

            {data && data.length > 0 && (
              <span className="text-[10px] text-emerald-800 font-bold bg-emerald-100 px-1.5 py-0.5 border border-emerald-300 shrink-0 ml-2">
                Data Aktif
              </span>
            )}
          </div>

          {/* Custom API Key Overlay Settings */}
          {showKeyModal && (
            <div className="p-3 bg-amber-50 border-b-2 border-[#141414] animate-fade-in shrink-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-black font-mono uppercase text-[#141414] flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-amber-700" />
                  Kustom Gemini API Key (Opsional)
                </span>
                <button
                  type="button"
                  onClick={() => setShowKeyModal(false)}
                  className="text-[#141414]/60 hover:text-[#141414]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[11px] text-[#141414]/80 mb-2 leading-relaxed">
                Di Vercel, API Key cukup dipasang di <strong>Vercel Settings &gt; Environment Variables</strong>. Namun jika ingin menguji langsung di browser ini, Anda bisa memasukkannya di bawah:
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  id="input-custom-api-key"
                  value={customApiKey}
                  onChange={(e) => setCustomApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="flex-1 px-2.5 py-1.5 bg-white border border-[#141414] text-xs font-mono focus:outline-none focus:ring-1 focus:ring-[#141414]"
                />
                <button
                  type="button"
                  id="btn-save-custom-api-key"
                  onClick={() => handleSaveCustomKey(customApiKey)}
                  className="px-3 py-1.5 bg-[#141414] text-white font-bold text-xs hover:bg-[#303030] transition-colors cursor-pointer shrink-0"
                >
                  {savedKeySuccess ? 'Tersimpan!' : 'Simpan'}
                </button>
              </div>
            </div>
          )}

          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3.5 bg-[#F5F5F3]">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start w-full'}`}
                >
                  <div
                    className={`${
                      isUser
                        ? 'max-w-[85%] bg-[#141414] text-white border border-[#141414] shadow-[2px_2px_0px_#141414]'
                        : 'w-full max-w-full bg-white text-[#141414] border-2 border-[#141414] shadow-[3px_3px_0px_#141414]'
                    } p-3 sm:p-3.5 text-xs leading-relaxed`}
                  >
                    {!isUser && (
                      <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-[#141414]/10 text-[10px] font-mono font-bold text-emerald-800">
                        <div className="flex items-center gap-1.5">
                          <Bot className="w-3.5 h-3.5 text-emerald-600" />
                          <span>BLACKEYE ASSISTANT</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyMessage(msg.id, msg.content)}
                          className="flex items-center gap-1 px-1.5 py-0.5 text-gray-500 hover:text-black hover:bg-gray-100 rounded text-[10px] transition-colors"
                          title="Salin jawaban"
                        >
                          {copiedMessageId === msg.id ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span className="text-emerald-700">Tersalin</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Salin</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {/* Markdown Content with full GFM Table Support */}
                    <div className="markdown-content font-sans text-xs break-words overflow-x-auto">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          table: ({ ...props }) => (
                            <div className="my-3 overflow-x-auto border-2 border-[#141414] shadow-[2px_2px_0px_#141414] bg-white max-w-full">
                              <table
                                className="w-full text-left border-collapse font-mono text-[11px] tabular-nums"
                                {...props}
                              />
                            </div>
                          ),
                          thead: ({ ...props }) => (
                            <thead className="bg-[#141414] text-white border-b-2 border-[#141414]" {...props} />
                          ),
                          th: ({ ...props }) => (
                            <th
                              className="border-r border-[#333333] px-3 py-2 font-bold uppercase tracking-wider text-[10px] whitespace-nowrap bg-[#141414] text-white"
                              {...props}
                            />
                          ),
                          tbody: ({ ...props }) => (
                            <tbody className="divide-y divide-[#141414]/20 bg-white" {...props} />
                          ),
                          tr: ({ ...props }) => (
                            <tr
                              className="hover:bg-[#FFF9E6] transition-colors even:bg-[#F9F9F8]"
                              {...props}
                            />
                          ),
                          td: ({ ...props }) => (
                            <td
                              className="border-r border-[#141414]/20 px-3 py-1.5 whitespace-nowrap font-mono text-[11px] text-[#141414]"
                              {...props}
                            />
                          ),
                          code: ({ inline, className, children, ...props }: any) => {
                            if (inline) {
                              return (
                                <code
                                  className="bg-[#EAEAEA] border border-[#141414]/30 px-1.5 py-0.5 text-[#141414] font-mono text-[11px] font-bold"
                                  {...props}
                                >
                                  {children}
                                </code>
                              );
                            }
                            return (
                              <pre className="my-2.5 p-3 bg-[#141414] text-emerald-400 font-mono text-xs border border-[#141414] overflow-x-auto shadow-[2px_2px_0px_#141414]">
                                <code {...props}>{children}</code>
                              </pre>
                            );
                          },
                          p: ({ ...props }) => (
                            <p className="mb-2 last:mb-0 leading-relaxed font-sans" {...props} />
                          ),
                          ul: ({ ...props }) => (
                            <ul className="list-disc pl-5 mb-2 space-y-1 font-sans" {...props} />
                          ),
                          ol: ({ ...props }) => (
                            <ol className="list-decimal pl-5 mb-2 space-y-1 font-sans" {...props} />
                          ),
                          li: ({ ...props }) => <li className="leading-relaxed" {...props} />,
                          strong: ({ ...props }) => (
                            <strong className="font-bold text-[#141414]" {...props} />
                          ),
                          h1: ({ ...props }) => (
                            <h1
                              className="text-sm font-black font-mono uppercase mt-2.5 mb-1 pb-1 border-b border-[#141414]/20 text-[#141414]"
                              {...props}
                            />
                          ),
                          h2: ({ ...props }) => (
                            <h2
                              className="text-xs font-black font-mono uppercase mt-2 mb-1 text-[#141414]"
                              {...props}
                            />
                          ),
                          h3: ({ ...props }) => (
                            <h3
                              className="text-xs font-bold font-mono uppercase mt-1.5 mb-1 text-[#141414]"
                              {...props}
                            />
                          ),
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>

                    <div
                      className={`text-[9px] font-mono mt-2 text-right ${
                        isUser ? 'text-white/60' : 'text-[#141414]/40'
                      }`}
                    >
                      {msg.timestamp}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Animated Typing Indicator without container */}
            {isLoading && (
              <div className="flex items-center gap-2.5 py-1.5 px-1 text-xs font-mono animate-fade-in">
                {/* Animated 3 Bouncing Dots */}
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#141414] animate-bounce [animation-delay:-0.32s]" />
                  <span className="w-2 h-2 rounded-full bg-[#FF6B35] animate-bounce [animation-delay:-0.16s]" />
                  <span className="w-2 h-2 rounded-full bg-emerald-600 animate-bounce" />
                </div>
                <span className="text-xs font-mono font-bold text-[#141414]/80 animate-pulse">
                  Sedang mengetik, tunggu ya...
                </span>
              </div>
            )}

            {/* Error Message Box with Retry Action */}
            {errorMessage && (
              <div className="p-3 bg-red-50 border-2 border-red-800 text-xs font-mono text-red-950 shadow-[2px_2px_0px_#991b1b]">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <strong className="block mb-1 text-red-900">Perhatian:</strong>
                    <div className="leading-relaxed mb-2.5">{errorMessage}</div>
                    {lastFailedQuery && (
                      <button
                        type="button"
                        onClick={() => handleSendMessage(lastFailedQuery)}
                        disabled={isLoading}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-800 hover:bg-red-900 text-white font-bold text-[11px] border border-red-950 shadow-[1px_1px_0px_#141414] transition-colors cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Coba Lagi Pertanyaan</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts Carousel with Left/Right Arrows, Wheel & Touch Pan */}
          <div className="relative bg-white border-t border-[#141414]/20 px-1.5 py-2 flex items-center gap-1.5 shrink-0">
            {/* Left Scroll Button */}
            <button
              type="button"
              onClick={() => handleScrollCarousel('left')}
              disabled={!canScrollLeft}
              className={`p-1.5 min-w-[28px] min-h-[28px] flex items-center justify-center text-[#141414] hover:bg-[#FF6B35] hover:text-white border-2 border-[#141414] rounded-none shrink-0 transition-all shadow-[1px_1px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 ${
                canScrollLeft ? 'opacity-100 cursor-pointer bg-white' : 'opacity-25 cursor-not-allowed bg-[#EAEAEA]'
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
                  className="whitespace-nowrap px-3 py-1.5 text-[11px] font-mono font-bold bg-[#F0F0EE] hover:bg-[#DEDEDE] text-[#141414] border-2 border-[#141414] transition-all cursor-pointer shrink-0 disabled:opacity-50 active:translate-x-0.5 active:translate-y-0.5 shadow-[1px_1px_0px_#141414]"
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
              className={`p-1.5 min-w-[28px] min-h-[28px] flex items-center justify-center text-[#141414] hover:bg-[#FF6B35] hover:text-white border-2 border-[#141414] rounded-none shrink-0 transition-all shadow-[1px_1px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 ${
                canScrollRight ? 'opacity-100 cursor-pointer bg-white' : 'opacity-25 cursor-not-allowed bg-[#EAEAEA]'
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
            className="p-2.5 sm:p-3 bg-white border-t-2 border-[#141414] flex gap-2 shrink-0"
          >
            <input
              ref={inputRef}
              type="text"
              id="input-ai-chat-query"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tanyakan apa saja tentang data tabel..."
              disabled={isLoading}
              className="flex-1 px-3 py-2 bg-[#F5F5F3] border-2 border-[#141414] text-xs font-mono text-[#141414] placeholder-[#141414]/50 focus:outline-none focus:bg-white transition-colors"
            />
            <button
              type="submit"
              id="btn-ai-chat-send"
              disabled={isLoading || !input.trim()}
              className="px-4 py-2 bg-[#141414] hover:bg-[#2A2A2A] text-white border-2 border-[#141414] text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-[2px_2px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
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
