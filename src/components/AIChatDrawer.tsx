import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Bot,
  X,
  Send,
  Sparkles,
  Trash2,
  RefreshCw,
  Key,
  Database,
  ChevronDown,
  Info,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  ExternalLink,
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
        'Halo! Saya **BlackEYE AI Assistant**. Saya dapat membaca data hasil konversi file Excel Anda secara langsung. Tanyakan apa saja tentang status CO, rincian Sisa OS, stok gudang, atau perbandingan artikel (SH/ST/BX/DC).',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastFailedQuery, setLastFailedQuery] = useState<string | null>(null);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [customApiKey, setCustomApiKey] = useState<string>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('blackeye_gemini_key') || '' : '';
  });
  const [savedKeySuccess, setSavedKeySuccess] = useState(false);

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
      }, 200);
    }
  }, [isOpen]);

  const handleSaveCustomKey = (key: string) => {
    const trimmed = key.trim();
    setCustomApiKey(trimmed);
    if (trimmed) {
      localStorage.setItem('blackeye_gemini_key', trimmed);
    } else {
      localStorage.removeItem('blackeye_gemini_key');
    }
    setSavedKeySuccess(true);
    haptic.success();
    setTimeout(() => {
      setSavedKeySuccess(false);
      setShowKeyModal(false);
    }, 1200);
  };

  const handleClearHistory = () => {
    haptic.light();
    setMessages([
      {
        id: 'welcome-reset',
        role: 'model',
        content:
          'Riwayat obrolan telah dibersihkan. Konteks data tabel Anda tetap siap dianalisis. Apa yang ingin Anda tanyakan?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setErrorMessage(null);
  };

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
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

    const newHistory = [...messages, userMessage];
    setMessages(newHistory);
    setIsLoading(true);

    try {
      // Prepare chat history payload (exclude system/welcome id)
      const apiHistory = newHistory
        .filter((m) => m.id !== 'welcome' && m.id !== 'welcome-reset')
        .slice(-8) // keep last 8 messages for context
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      // Headers with optional custom key fallback
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
          history: apiHistory.slice(0, -1), // previous history
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
          msg = 'Server Google Gemini sedang mengalami lonjakan antrean trafik (503). Silakan tekan tombol "Coba Lagi" di bawah.';
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
    'Rekap PO dengan status OPEN',
    'Cek artikel yang memiliki Stok Ready',
    'Berapa total Sisa OS (kg & pcs)?',
    'Analisis perbandingan jenis artikel (BX/DC/SH)',
  ];

  return (
    <>
      {/* Floating Action Button */}
      {!isOpen && (
        <button
          type="button"
          id="btn-open-ai-chat"
          onClick={() => {
            haptic.selection();
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
          className="fixed bottom-0 right-0 sm:bottom-5 sm:right-5 z-50 w-full sm:w-[460px] h-[92vh] sm:h-[620px] max-h-[95vh] bg-[#F5F5F3] border-t-2 sm:border-2 border-[#141414] sm:shadow-[8px_8px_0px_#141414] flex flex-col overflow-hidden font-sans animate-in slide-in-from-bottom-5 duration-200"
        >
          {/* Header */}
          <div className="p-3.5 bg-[#141414] text-white border-b-2 border-[#141414] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-emerald-500/20 border border-emerald-400 flex items-center justify-center">
                <Bot className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-black font-mono tracking-wider text-white">
                    BLACKEYE AI ASSISTANT
                  </h3>
                  <span className="px-1.5 py-0.2 bg-emerald-950 text-emerald-300 border border-emerald-500/60 text-[9px] font-mono font-bold uppercase">
                    Gemini 3.8 Flash
                  </span>
                </div>
                <div className="text-[10px] font-mono text-white/60">
                  Analisis Data Hasil Convert ERP
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
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
                className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 transition-colors ml-1"
                title="Tutup Chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Context Status Banner */}
          <div className="px-3.5 py-2 bg-white border-b border-[#141414]/20 flex items-center justify-between text-xs font-mono shrink-0">
            <div className="flex items-center gap-2 truncate">
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  data && data.length > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'
                }`}
              />
              <span className="truncate text-[#141414] font-bold text-[11px]">
                {data && data.length > 0
                  ? `Konteks: ${currentFileName || 'Excel Terkonversi'} (${data.length} PO)`
                  : 'Belum ada data. Silakan upload file Excel.'}
              </span>
            </div>

            {data && data.length > 0 && (
              <span className="text-[10px] text-emerald-800 font-bold bg-emerald-100 px-1.5 py-0.5 border border-emerald-300 shrink-0">
                Data Aktif
              </span>
            )}
          </div>

          {/* Optional Custom API Key Modal Drawer */}
          {showKeyModal && (
            <div className="p-3.5 bg-amber-50 border-b-2 border-[#141414] text-xs font-mono shrink-0">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-[#141414] flex items-center gap-1.5">
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
                  className="px-3 py-1.5 bg-[#141414] text-white font-bold text-xs hover:bg-[#303030] transition-colors cursor-pointer"
                >
                  {savedKeySuccess ? 'Tersimpan!' : 'Simpan'}
                </button>
              </div>
            </div>
          )}

          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 bg-[#F5F5F3]">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[88%] p-3 text-xs leading-relaxed ${
                      isUser
                        ? 'bg-[#141414] text-white rounded-none border border-[#141414] shadow-[2px_2px_0px_#141414]'
                        : 'bg-white text-[#141414] rounded-none border-2 border-[#141414] shadow-[2px_2px_0px_#141414]'
                    }`}
                  >
                    {!isUser && (
                      <div className="flex items-center gap-1.5 mb-1.5 pb-1 border-b border-[#141414]/10 text-[10px] font-mono font-bold text-emerald-800">
                        <Bot className="w-3.5 h-3.5" />
                        <span>BLACKEYE ASSISTANT</span>
                      </div>
                    )}

                    <div className="markdown-body font-sans text-xs space-y-1.5 break-words">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>

                    <div
                      className={`text-[9px] font-mono mt-1 text-right ${
                        isUser ? 'text-white/60' : 'text-[#141414]/40'
                      }`}
                    >
                      {msg.timestamp}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Loading Indicator */}
            {isLoading && (
              <div className="flex items-start">
                <div className="bg-white border-2 border-[#141414] p-3 shadow-[2px_2px_0px_#141414] text-xs font-mono flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-emerald-600 animate-spin" />
                  <span className="text-[#141414]">Menganalisis data tabel...</span>
                </div>
              </div>
            )}

            {/* Error Message Box */}
            {errorMessage && (
              <div className="p-3 bg-red-50 border-2 border-red-800 text-xs font-mono text-red-950 shadow-[2px_2px_0px_#991b1b]">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <strong className="block mb-1 text-red-900">Perhatian:</strong>
                    <div className="leading-relaxed mb-2">{errorMessage}</div>
                    {lastFailedQuery && (
                      <button
                        type="button"
                        onClick={() => handleSendMessage(lastFailedQuery)}
                        disabled={isLoading}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-800 hover:bg-red-900 text-white font-bold text-[11px] border border-red-950 shadow-[1px_1px_0px_#141414] transition-colors cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Coba Lagi</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts Carousel */}
          <div className="px-3 py-2 bg-white border-t border-[#141414]/20 flex gap-1.5 overflow-x-auto shrink-0 scrollbar-none">
            {quickPrompts.map((prompt, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendMessage(prompt)}
                disabled={isLoading}
                className="whitespace-nowrap px-2.5 py-1 text-[11px] font-mono font-bold bg-[#EAEAEA] hover:bg-[#DEDEDE] text-[#141414] border border-[#141414] transition-colors cursor-pointer shrink-0 disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Input Box Footer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3 bg-white border-t-2 border-[#141414] flex gap-2 shrink-0"
          >
            <input
              ref={inputRef}
              type="text"
              id="input-ai-chat-prompt"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                data && data.length > 0
                  ? 'Tanyakan apa saja tentang data tabel...'
                  : 'Ketik pesan atau pertanyaan...'
              }
              disabled={isLoading}
              className="flex-1 px-3 py-2 bg-[#F5F5F3] border-2 border-[#141414] text-xs font-mono focus:outline-none focus:bg-white text-[#141414]"
            />
            <button
              type="submit"
              id="btn-ai-chat-send"
              disabled={!input.trim() || isLoading}
              className="px-4 py-2 bg-[#141414] text-white hover:bg-[#303030] border-2 border-[#141414] font-bold text-xs flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}
    </>
  );
};
