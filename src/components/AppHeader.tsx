import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Check, Copy, Download, FileText, Github, Menu, Scale, Share2 } from 'lucide-react';
import { Message } from '../types';
import { printChatTranscript } from '../utils/printChatTranscript';

/** Application header — brand identity, navigation links, and contextual action buttons (briefing generation, archive, share menu). */
interface AppHeaderProps {
  pathname: string;
  currentChatId: string | null;
  isCurrentChatArchived: boolean;
  isSidebarOpen: boolean;
  isShowcaseView: boolean;
  isOwner: boolean;
  hasMessages: boolean;
  messages: Message[];
  chatTitle?: string;
  onToggleSidebar: () => void;
  onNavigate: (path: string) => void;
  onOpenMobileMenu: () => void;
  onGenerateBriefing: () => void;
  onSaveChat: () => void;
}

const AppHeader: React.FC<AppHeaderProps> = ({
  pathname,
  currentChatId,
  isCurrentChatArchived,
  isSidebarOpen,
  isShowcaseView,
  isOwner,
  hasMessages,
  messages,
  chatTitle,
  onToggleSidebar,
  onNavigate,
  onOpenMobileMenu,
  onGenerateBriefing,
  onSaveChat,
}) => {
  const [isShareMenuOpen, setIsShareMenuOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const handleCopyChat = async () => {
    if (messages.length === 0) return;
    const chatText = messages.map(m => `${m.role === 'user' ? 'User' : 'The Arbitration Briefings'}:\n${m.content}\n`).join('\n');
    try {
      await navigator.clipboard.writeText(chatText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy chat:', err);
    }
  };

  return (
    <header className="border-b border-border bg-white/80 backdrop-blur-sm sticky top-0 z-10 flex-shrink-0 no-print">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 opacity-70">
          <span className="text-[9px] font-sans uppercase tracking-[0.25em] text-slate">Part of the</span>
          <span className="font-serif text-[11px] text-burgundy italic">Lex Arbitri</span>
          <span className="text-[9px] font-sans uppercase tracking-[0.25em] text-slate">Suite</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              className="p-2 -ml-2 text-muted hover:text-ink transition-colors"
              onClick={onToggleSidebar}
              title={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            >
              <Menu size={24} />
            </button>
            <div
              className={`flex items-center gap-3 group ${pathname === '/' ? 'cursor-default' : 'cursor-pointer'}`}
              onClick={() => {
                if (pathname !== '/') {
                  onNavigate('/');
                }
              }}
            >
              <div className={`w-10 h-10 rounded-full bg-burgundy flex items-center justify-center text-white transition-colors ${pathname === '/' ? '' : 'group-hover:bg-burgundy-deep'}`}>
                <Scale size={20} className="opacity-90" />
              </div>
              <div className="hidden sm:block">
                <h1 className={`font-serif text-xl font-semibold tracking-tight transition-colors ${pathname === '/' ? '' : 'group-hover:text-burgundy'}`}>The Arbitration Briefings</h1>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 sm:gap-6">
            <nav className="hidden md:flex items-center gap-6 text-[10px] font-bold uppercase tracking-widest text-muted">
              <Link
                to="/workspace"
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate('/workspace');
                }}
                className={`hover:text-ink transition-colors ${pathname === '/workspace' && !currentChatId ? 'text-burgundy' : ''}`}
              >
                Home
              </Link>
              <Link
                to="/archive"
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate('/archive');
                }}
                className={`hover:text-ink transition-colors ${pathname === '/archive' ? 'text-burgundy' : ''}`}
              >
                Archive
              </Link>
              <Link
                to="/methodology"
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate('/methodology');
                }}
                className={`hover:text-ink transition-colors ${pathname === '/methodology' ? 'text-burgundy' : ''}`}
              >
                Methodology
              </Link>

              <a
                href="https://github.com/lex-arbitri-suite/the-arbitration-briefings"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted hover:text-ink transition-colors"
                title="View Source on GitHub"
              >
                <Github size={18} />
              </a>
            </nav>

            <div className="md:hidden flex items-center">
              <button
                onClick={onOpenMobileMenu}
                className="flex items-center gap-2 text-muted hover:text-ink transition-colors"
                aria-label="Open Menu"
              >
                <span className="text-xs font-bold uppercase tracking-widest">Menu</span>
                <Menu size={20} />
              </button>
            </div>
            {isOwner && hasMessages && !isShowcaseView && (
              <div className="flex items-center gap-1 sm:gap-2">
                <button
                  onClick={onGenerateBriefing}
                  className="flex items-center gap-2 px-3 py-2 rounded-sm text-xs font-bold uppercase tracking-widest text-burgundy hover:bg-wash hover:text-ink border border-transparent hover:border-border transition-colors"
                  title="Generate Research Briefing"
                >
                  <FileText size={16} />
                  <span className="hidden sm:inline">Generate Briefing</span>
                </button>
                {!isCurrentChatArchived && (
                  <button
                    onClick={onSaveChat}
                    className="flex items-center gap-2 px-3 py-2 rounded-sm text-xs font-bold uppercase tracking-widest text-muted hover:bg-wash hover:text-ink border border-transparent hover:border-border transition-colors"
                    title="Save to My Archive"
                  >
                    <Bookmark size={16} />
                    <span className="hidden sm:inline">Save Chat</span>
                  </button>
                )}
                <div className="relative">
                  <button
                    onClick={() => setIsShareMenuOpen(!isShareMenuOpen)}
                    className="flex items-center gap-2 px-3 py-2 rounded-sm text-xs font-bold uppercase tracking-widest text-muted hover:bg-wash hover:text-ink transition-colors border border-transparent hover:border-border"
                    title="Share or export chat"
                  >
                    <Share2 size={16} />
                    <span className="hidden sm:inline">Share</span>
                  </button>

                  {isShareMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setIsShareMenuOpen(false)}
                      ></div>
                      <div className="absolute right-0 mt-2 w-48 bg-white border border-border rounded-sm shadow-lg z-20 py-1 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                        <button
                          onClick={() => {
                            void handleCopyChat();
                            setIsShareMenuOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-ink hover:bg-wash transition-colors text-left"
                        >
                          {isCopied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} className="text-muted" />}
                          <span>{isCopied ? 'Copied' : 'Copy to Clipboard'}</span>
                        </button>
                        <button
                          onClick={() => {
                            printChatTranscript(messages, chatTitle);
                            setIsShareMenuOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-ink hover:bg-wash transition-colors text-left"
                        >
                          <Download size={16} className="text-muted" />
                          <span>Save as PDF</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
