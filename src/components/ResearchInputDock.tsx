/**
 * Research input dock — text input, suggested enquiries popover, and submission controls.
 */
import React, { useRef, useState } from 'react';
import { Send, X } from 'lucide-react';
import { toTitleCase } from '../utils/developmentHelpers';

interface ResearchInputDockProps {
  input: string;
  setInput: (value: string) => void;
  hasMessages: boolean;
  suggestedEnquiries: { query: string }[];
  isCurrentChatAuthorised: boolean;
  isLoading: boolean;
  isStreaming: boolean;
  onSubmitEnquiry: (enquiry: string) => void;
  onOpenTermsDisclaimer: () => void;
}

export default function ResearchInputDock({
  input,
  setInput,
  hasMessages,
  suggestedEnquiries,
  isCurrentChatAuthorised,
  isLoading,
  isStreaming,
  onSubmitEnquiry,
  onOpenTermsDisclaimer,
}: ResearchInputDockProps) {
  const [showSuggestedEnquiries, setShowSuggestedEnquiries] = useState(false);
  const suggestedEnquiriesRef = useRef<HTMLDivElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSubmitEnquiry(input.trim());
  };

  return (
    <div className="bg-transparent pb-10 flex flex-col items-center no-print">
      <div className="max-w-4xl w-full mx-auto relative bg-surface-input rounded-2xl border border-border shadow-lg focus-within:ring-1 focus-within:ring-burgundy focus-within:border-burgundy transition-all">
        {/* Suggested Enquiries List (Landing Page Only) */}
        {showSuggestedEnquiries && !hasMessages && input.length === 0 && (
          <div
            ref={suggestedEnquiriesRef}
            className="absolute bottom-full left-0 right-0 mb-2 bg-paper border border-burgundy/20 rounded-sm shadow-xl overflow-hidden z-40 animate-in slide-in-from-bottom-4 duration-200"
          >
            <div className="p-3 border-b border-wash bg-paper-bright flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-burgundy">Suggested Research Enquiries</span>
              <button
                onClick={() => setShowSuggestedEnquiries(false)}
                className="p-1 text-gray-400 hover:text-ink transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {suggestedEnquiries.map((item, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setInput(item.query);
                    setShowSuggestedEnquiries(false);
                    onSubmitEnquiry(item.query);
                  }}
                  className="w-full text-left px-4 py-3 text-xs text-ink-soft hover:bg-paper-dim hover:text-burgundy border-b border-wash last:border-0 transition-colors flex items-start gap-3 group"
                >
                  <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-burgundy flex-shrink-0 transition-colors"></div>
                  <span className="leading-relaxed">{toTitleCase(item.query)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {isCurrentChatAuthorised ? null : (
          <form
            onSubmit={handleSubmit}
            className="relative"
          >
            <textarea
              value={input}
              disabled={false}
              onClick={() => setShowSuggestedEnquiries(true)}
              onChange={(e) => {
                setInput(e.target.value);
                if (e.target.value.length === 0) {
                  setShowSuggestedEnquiries(true);
                } else {
                  setShowSuggestedEnquiries(false);
                }
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="Enter your research enquiry..."
              className="w-full focus:outline-none focus:ring-0 border-0 bg-transparent resize-none py-2 pl-6 pr-14 text-base leading-normal max-h-32 min-h-[56px] text-ink placeholder-[#a3a3a3]"
              rows={1}
              style={{ height: 'auto' }}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading || isStreaming}
              className="absolute right-2 bottom-2 p-2 rounded-sm bg-burgundy text-white hover:bg-burgundy-deep disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-burgundy transition-colors"
            >
              <Send size={18} />
            </button>
          </form>
        )}
      </div>
      {/* Source transparency footer — minimalist and quietly authoritative */}
      <footer className="mt-6 text-center">
        <p className="text-[10px] text-muted font-sans tracking-wide">
          Enquiries are processed by a third-party AI service. Do not enter privileged, confidential, or client-identifying case information.
        </p>
        <p className="mt-1 text-[10px] text-muted font-sans tracking-wide">
          The Arbitration Briefings utilises artificial intelligence. Please verify all outputs against primary source texts.
        </p>
        <button
          onClick={onOpenTermsDisclaimer}
          className="mt-2 text-[10px] text-burgundy font-bold uppercase tracking-widest hover:text-burgundy-deep transition-colors underline-offset-4 hover:underline"
        >
          Terms & Disclaimer
        </button>
      </footer>
    </div>
  );
}
