import React, { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { SupportedLanguage } from '../i18n/types';
import { Globe, Check, ChevronDown } from 'lucide-react';
import { haptic } from '../utils/haptics';

export const LanguageSwitcher: React.FC = () => {
  const { language, setLanguage, currentOption, languages, t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleSelectLanguage = (code: SupportedLanguage) => {
    setLanguage(code);
    setIsOpen(false);
    haptic.selection();
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Toggle Button */}
      <button
        type="button"
        onClick={() => {
          haptic.light();
          setIsOpen((prev) => !prev);
        }}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={t.languageSelect}
        className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 cursor-pointer border ${
          isOpen
            ? 'bg-white border-[#EA5413]/50 text-[#EA5413] shadow-sm ring-2 ring-[#EA5413]/15'
            : 'bg-white/80 hover:bg-white border-zinc-200/90 text-zinc-700 hover:text-zinc-900 shadow-2xs hover:shadow-xs'
        }`}
      >
        <span className="text-sm sm:text-base leading-none select-none" aria-hidden="true">
          {currentOption.flag}
        </span>
        <span className="hidden sm:inline font-semibold tracking-tight text-[11px] sm:text-xs">
          {currentOption.name}
        </span>
        <ChevronDown
          className={`w-3 h-3 text-zinc-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-[#EA5413]' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          role="menu"
          aria-orientation="vertical"
          className="absolute right-0 mt-2 w-52 sm:w-56 rounded-2xl bg-white/95 backdrop-blur-xl border border-zinc-200/90 shadow-xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 focus:outline-hidden"
        >
          <div className="px-3 py-2 border-b border-zinc-100 flex items-center justify-between text-[10px] font-mono text-zinc-400 font-semibold uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <Globe className="w-3 h-3 text-[#EA5413]" />
              {t.languageSelect}
            </span>
            <span>5 LANGUAGES</span>
          </div>

          <div className="py-1">
            {languages.map((lang) => {
              const isSelected = lang.code === language;
              return (
                <button
                  key={lang.code}
                  role="menuitem"
                  type="button"
                  onClick={() => handleSelectLanguage(lang.code)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left text-xs transition-colors cursor-pointer group ${
                    isSelected
                      ? 'bg-amber-500/10 text-[#EA5413] font-semibold'
                      : 'text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-base select-none shrink-0" aria-hidden="true">
                      {lang.flag}
                    </span>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs truncate font-medium">
                        {lang.name}
                      </span>
                      <span className="text-[10px] text-zinc-400 font-normal truncate">
                        {lang.nativeName}
                      </span>
                    </div>
                  </div>

                  {isSelected && (
                    <div className="w-4 h-4 rounded-full bg-[#EA5413] text-white flex items-center justify-center shrink-0">
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
