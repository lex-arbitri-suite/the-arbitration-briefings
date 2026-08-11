import React from 'react';
import { Eye, RotateCcw, Search } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { validateSourceUrl } from '../utils/urlValidator';
import type { Message, RelatedDevelopment } from '../types';

interface ChatViewProps {
  messages: Message[];
  isShowcaseView: boolean;
  isLoading: boolean;
  chatLoadingMessage: string;
  isStreaming: boolean;
  relatedDevelopments: RelatedDevelopment[];
  relatedDevelopmentsLoading: boolean;
  relatedDevelopmentsLoadingMessage?: string;
  relatedDevelopmentsSweepError: string | null;
  canRefreshRelatedDevelopments: boolean;
  onRefreshRelatedDevelopments: () => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onRelatedClick: (query: string) => void;
  onRetry?: (content: string) => void;
}

export default function ChatView({
  messages,
  isShowcaseView,
  isLoading,
  chatLoadingMessage,
  isStreaming,
  relatedDevelopments,
  relatedDevelopmentsLoading,
  relatedDevelopmentsLoadingMessage = 'Finding related developments...',
  relatedDevelopmentsSweepError,
  canRefreshRelatedDevelopments,
  onRefreshRelatedDevelopments,
  messagesEndRef,
  onRelatedClick,
  onRetry,
}: ChatViewProps) {
  const hasAssistantMessage = messages.some((message) => message.role === 'assistant');

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {isShowcaseView && (
        <div className="bg-wash border border-border rounded-sm p-5 flex items-start gap-3">
          <Eye size={18} className="text-burgundy mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-serif font-semibold text-ink">This is a showcase chat.</p>
          </div>
        </div>
      )}
      {messages.map((message) => (
        <div
          key={message.id}
          className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[92%] sm:max-w-[85%] ${
              message.role === 'user'
                ? 'bg-ink text-white rounded-sm px-4 py-3 sm:px-6 sm:py-4'
                : message.isError
                  ? 'bg-paper-bright border border-border border-dashed rounded-sm px-4 py-4 sm:px-6 sm:py-5 shadow-sm'
                  : 'bg-white border border-border rounded-sm px-4 py-4 sm:px-6 sm:py-5 shadow-sm'
            }`}
          >
            {message.role === 'user' ? (
              <p className="whitespace-pre-wrap">{message.content}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {message.isError && (
                  <button
                    onClick={() => {
                      if (!onRetry) return;
                      const idx = messages.indexOf(message);
                      const precedingUser = messages
                        .slice(0, idx)
                        .reverse()
                        .find((m) => m.role === 'user');
                      if (precedingUser) onRetry(precedingUser.content);
                    }}
                    disabled={!onRetry}
                    className="flex items-center gap-2 text-muted mb-1 hover:text-burgundy transition-colors duration-200 cursor-pointer group disabled:cursor-default disabled:hover:text-muted"
                  >
                    <RotateCcw size={14} className="group-hover:rotate-[-45deg] transition-transform duration-200" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Connection Interrupted — Retry</span>
                  </button>
                )}
                {message.role === 'assistant' && message.content.includes("has yielded no publicly verifiable developments") && (
                  <div className="flex items-center gap-2 text-muted mb-1">
                    <Search size={14} className="opacity-60" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">No Verified Records Found</span>
                  </div>
                )}
                <MarkdownRenderer content={message.content} className="chat-markdown" />
              </div>
            )}
          </div>
        </div>
      ))}
      {!isLoading && !isStreaming && onRetry && messages.length > 0
        && messages[messages.length - 1].role === 'user' && (
        <div className="flex justify-start">
          <button
            onClick={() => onRetry(messages[messages.length - 1].content)}
            className="bg-paper-bright border border-border border-dashed rounded-sm px-4 py-3 shadow-sm flex items-center gap-2 text-muted hover:text-burgundy hover:border-burgundy transition-colors duration-200 cursor-pointer group"
          >
            <RotateCcw size={14} className="group-hover:rotate-[-45deg] transition-transform duration-200" />
            <span className="text-[10px] font-bold uppercase tracking-widest">
              Enquiry Incomplete — Resubmit
            </span>
          </button>
        </div>
      )}
      {isLoading && (
        <div className="flex justify-start">
          <div className="bg-white border border-border rounded-sm px-6 py-5 shadow-sm max-w-[85%] w-full sm:w-[400px]">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-muted mb-1">
                <span className="text-xs italic font-serif">{chatLoadingMessage}</span>
              </div>
              <div className="space-y-2.5">
                <div className="h-2 bg-border rounded-sm animate-pulse w-full" />
                <div className="h-2 bg-border rounded-sm animate-pulse w-5/6" />
                <div className="h-2 bg-border rounded-sm animate-pulse w-4/5" />
                <div className="h-2 bg-border rounded-sm animate-pulse w-2/3" />
              </div>
            </div>
          </div>
        </div>
      )}
      {!isLoading && hasAssistantMessage && (
        <div className="mt-12 pt-8 border-t border-border">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xs font-semibold text-burgundy uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-burgundy"></span>
              Related Developments
            </h3>
          </div>
          {relatedDevelopmentsSweepError ? (
            <>
              <p className="text-xs text-muted leading-relaxed">
                {relatedDevelopmentsSweepError}
              </p>
              {canRefreshRelatedDevelopments ? (
                <button
                  onClick={onRefreshRelatedDevelopments}
                  className="mt-4 text-[10px] font-bold uppercase tracking-widest text-burgundy hover:underline cursor-pointer"
                >
                  REFRESH
                </button>
              ) : null}
            </>
          ) : relatedDevelopmentsLoading ? (
            <p className="text-xs text-burgundy opacity-60 uppercase tracking-widest">
              {relatedDevelopmentsLoadingMessage}
            </p>
          ) : relatedDevelopments.length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {relatedDevelopments.map((development, idx) => (
                  <button
                    key={`${development.title}-${idx}`}
                    type="button"
                    disabled={!canRefreshRelatedDevelopments}
                    onClick={() => {
                      if (!canRefreshRelatedDevelopments) return;
                      const searchTerm = development.query || development.title;
                      onRelatedClick(searchTerm);
                    }}
                    className={`w-full p-5 border border-border rounded-sm transition-all flex flex-col h-full text-left group bg-paper-bright ${
                      canRefreshRelatedDevelopments
                        ? 'hover:border-burgundy hover:shadow-sm hover:bg-white cursor-pointer'
                        : 'cursor-default'
                    }`}
                  >
                    <div className="min-h-[44px] mb-3">
                      <p className="font-serif text-sm font-medium text-ink leading-snug transition-colors group-hover:text-burgundy line-clamp-2">
                        {development.title}
                      </p>
                    </div>

                    <div className="mb-3">
                      <span className="text-[10px] font-bold uppercase tracking-[0.15em] px-2 py-0.5 rounded-sm text-burgundy bg-wash">
                        {development.category}
                      </span>
                    </div>

                    <p className="text-xs text-ink-soft leading-relaxed mb-3 line-clamp-4">
                      {development.summary}
                    </p>

                    {development.sourceUrl && validateSourceUrl(development.sourceUrl).isValid && (
                      <a
                        href={development.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        className="text-xs text-burgundy hover:underline mb-2"
                      >
                        View Source →
                      </a>
                    )}

                    <p className="text-[10px] text-[#999] mt-auto">
                      {development.date}
                    </p>
                  </button>
                ))}
              </div>
              {canRefreshRelatedDevelopments ? (
                <button
                  onClick={onRefreshRelatedDevelopments}
                  className="mt-4 text-[10px] font-bold uppercase tracking-widest text-burgundy hover:underline cursor-pointer"
                >
                  REFRESH
                </button>
              ) : null}
            </>
          ) : (
            <>
              <p className="text-xs text-[#999] italic">
                No related developments found in the approved source registry.
              </p>
              {canRefreshRelatedDevelopments ? (
                <button
                  onClick={onRefreshRelatedDevelopments}
                  className="mt-4 text-[10px] font-bold uppercase tracking-widest text-burgundy hover:underline cursor-pointer"
                >
                  REFRESH
                </button>
              ) : null}
            </>
          )}
        </div>
      )}
      {isStreaming && (
        <div className="flex justify-start">
          <div className="bg-white border border-border rounded-sm px-4 py-4 sm:px-6 sm:py-5 shadow-sm">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-burgundy animate-[pulse_1.4s_ease-in-out_infinite]" />
              <span className="w-1.5 h-1.5 rounded-full bg-burgundy animate-[pulse_1.4s_ease-in-out_0.2s_infinite]" />
              <span className="w-1.5 h-1.5 rounded-full bg-burgundy animate-[pulse_1.4s_ease-in-out_0.4s_infinite]" />
            </div>
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
