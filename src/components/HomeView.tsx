import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Scale, BookOpen, Download, RefreshCw, X, Eye } from 'lucide-react';
import type { ChatSession, Development, TailoredItem } from '../types';
import { isNewDevelopment, getRelativeTimeLabel } from '../utils/developmentHelpers';
import { validateSourceUrl } from '../utils/urlValidator';

interface HomeViewProps {
  chats: ChatSession[];
  visibleTailoredItems: TailoredItem[];
  latestDevelopments: Development[];
  latestCount: number;
  historicalDevelopments: Development[];
  historicalCount: number;
  showHistoricalLedger: boolean;
  setShowHistoricalLedger: (v: boolean) => void;
  showcaseChats: ChatSession[];
  isRefreshing: boolean;
  isDeveloper: boolean;
  lastUpdatedRaw: number;
  formatLastUpdated: (ts: number) => string;
  onConsolidation: () => void;
  onTailoredClick: (item: TailoredItem) => void;
  onDismissTailored: (e: React.MouseEvent, id: string) => void;
  onDevelopmentClick: (development: Development) => void;
  onDismissDevelopment: (e: React.MouseEvent, id: string) => void;
  onDownloadDigest: () => void;
  onRefresh: () => void;
  onShowRefreshExplainer: () => void;
  onShowcaseClick: (chatId: string) => void;
}

function LatestDevelopmentCard({
  dev,
  isInteractive,
  onDevelopmentClick,
  onDismissDevelopment,
}: {
  dev: Development;
  isInteractive: boolean;
  onDevelopmentClick: (development: Development) => void;
  onDismissDevelopment: (e: React.MouseEvent, id: string) => void;
}) {
  const [showUpdates, setShowUpdates] = useState(false);
  const hasUpdates = Boolean(dev.updates && dev.updates.length > 0);

  return (
    <div className="relative w-full h-full group">
      <div
        onClick={() => {
          if (isInteractive) onDevelopmentClick(dev);
        }}
        className={`w-full h-full transition-all flex flex-col text-left group border rounded-sm ${isInteractive ? 'cursor-pointer' : 'cursor-default'}
                    p-6 min-h-[240px]
                    lg:p-8 lg:pt-10 lg:pb-12 lg:min-h-[320px]
                    ${
                      dev.isPlaceholder
                        ? 'bg-paper-dim border-border/50 border-dashed opacity-60 hover:opacity-100 hover:border-burgundy hover:bg-white'
                        : 'border-border hover:border-burgundy hover:shadow-md hover:bg-white bg-white shadow-sm'
                    }`}
      >
        <div className="flex items-center justify-between w-full mb-4">
          <span className={`text-[10px] font-bold uppercase tracking-[0.15em] px-2 py-0.5 rounded-sm transition-colors ${
            dev.isPlaceholder ? 'text-muted bg-[#f5f5f5]' : 'text-burgundy bg-wash'
          }`}>
            {dev.isPlaceholder ? 'Suggested Enquiry' : dev.category}
          </span>
          <div className="flex items-center gap-2">
            <div className="text-right">
              <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                {dev.date}
              </span>
              {!dev.isPlaceholder && getRelativeTimeLabel(dev.createdAt) && (
                <div className="text-[9px] text-muted mt-0.5 font-sans normal-case tracking-normal">
                  {getRelativeTimeLabel(dev.createdAt)}
                </div>
              )}
            </div>
            {!dev.isPlaceholder && isNewDevelopment(dev.createdAt) && (
              <span className="text-[9px] font-bold uppercase tracking-wider text-white bg-success px-2 py-0.5 rounded-full leading-none whitespace-nowrap">
                New
              </span>
            )}
          </div>
        </div>

        <div className="mb-3">
          <h3 className={`text-base lg:text-lg font-serif font-bold leading-tight line-clamp-2 transition-colors ${
            dev.isPlaceholder ? 'text-muted' : 'text-ink group-hover:text-burgundy'
          }`}>
            {dev.title}
          </h3>
        </div>

        <p className={`text-[13px] lg:text-sm leading-relaxed line-clamp-3 mb-4 ${
          dev.isPlaceholder ? 'text-muted/60' : 'text-gray-600'
        }`}>
          {dev.summary}
        </p>

        {hasUpdates && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowUpdates((v) => !v);
            }}
            className="text-xs font-bold uppercase tracking-wide text-burgundy hover:underline transition-colors mb-4 text-left"
          >
            {showUpdates ? 'HIDE UPDATES' : 'SHOW UPDATES'}
          </button>
        )}

        {hasUpdates && showUpdates && dev.updates && (
          <div className="pt-4 border-t border-dashed border-border w-full text-left mb-4">
            <p className="text-[9px] font-bold text-burgundy uppercase tracking-[0.2em] mb-2">
              Latest Updates
            </p>
            <ul className="text-[10px] text-ink-soft space-y-1.5">
              {dev.updates.slice(0, 2).map((u: string, i: number) => (
                <li key={i} className="line-clamp-1 flex items-start gap-2">
                  <span className="text-burgundy">•</span>
                  {u.replace('Latest Update: ', '')}
                </li>
              ))}
              {dev.updates.length > 2 && (
                <li className="text-gray-400 text-[9px] italic pl-3">
                  +{dev.updates.length - 2} additional briefings
                </li>
              )}
            </ul>
          </div>
        )}

        {!dev.isPlaceholder && dev.sourceUrl && dev.urlVerified !== false && validateSourceUrl(dev.sourceUrl).isValid && (
          <a
            href={dev.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-auto text-[10px] font-bold uppercase tracking-widest text-burgundy hover:underline transition-colors inline-block"
          >
            View Source Document →
          </a>
        )}
        {!dev.isPlaceholder && dev.sourceUrl && (dev.urlVerified === false || !validateSourceUrl(dev.sourceUrl).isValid) && (
          <span className="mt-auto text-[10px] font-bold uppercase tracking-widest text-gray-400 inline-block">
            Source Unverified
          </span>
        )}
      </div>
      {!dev.isPlaceholder && isInteractive && (
        <button
          type="button"
          onClick={(e) => onDismissDevelopment(e, dev.id)}
          className="absolute top-2 right-2 p-1.5 text-muted hover:text-burgundy hover:bg-wash rounded-sm transition-all opacity-0 group-hover:opacity-100"
          title="Dismiss from feed"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export default function HomeView({
  chats,
  visibleTailoredItems,
  latestDevelopments,
  latestCount,
  historicalDevelopments,
  historicalCount,
  showHistoricalLedger,
  setShowHistoricalLedger,
  showcaseChats,
  isRefreshing,
  isDeveloper,
  lastUpdatedRaw,
  formatLastUpdated,
  onConsolidation,
  onTailoredClick,
  onDismissTailored,
  onDevelopmentClick,
  onDismissDevelopment,
  onDownloadDigest,
  onRefresh,
  onShowRefreshExplainer,
  onShowcaseClick,
}: HomeViewProps) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col">
      <div className="flex flex-col items-center text-center pt-16 pb-2 mb-16 min-h-[28vh]">
        <div className="w-16 h-16 rounded-full bg-wash flex items-center justify-center text-burgundy mb-3">
          <Scale size={32} />
        </div>
        <h2 className="font-serif text-4xl font-medium text-center mb-2 text-ink px-4">
          Daily intelligence for international arbitration.
        </h2>
        <div className="w-full max-w-4xl mx-auto py-1">
          <div className="border-t-[0.5px] border-slate-200 w-full"></div>
        </div>
      </div>

      <div className="flex flex-col w-full max-w-5xl mx-auto px-4 sm:px-0">
        {(
          <div className="w-full mt-6 mb-16">
            <div className="flex w-full items-center justify-between mb-4">
              <h3 className="text-xs font-semibold text-burgundy uppercase tracking-wider flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-burgundy"></span>
                Tailored to Your Research
              </h3>
              <div />
              {isDeveloper ? (
                <button
                  onClick={onConsolidation}
                  className="text-burgundy text-[10px] font-bold uppercase tracking-widest hover:underline transition-all px-2 py-1"
                  style={{ lineHeight: 1.2 }}
                  title="Compile Consolidated Briefing"
                >
                  Compile Consolidated Briefing
                </button>
              ) : null}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-left justify-items-center">
              {visibleTailoredItems.length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
                  <BookOpen size={28} className="text-gray-400 mb-4" />
                  <p className="text-sm font-serif text-muted mb-2">Start a research enquiry to build your personalised feed.</p>
                  <p className="text-xs text-gray-400 max-w-sm">
                    Your active research topics will appear here as cards.
                  </p>
                </div>
              )}
              {visibleTailoredItems.map((item: TailoredItem) => (
                <div key={item.id} className="relative group w-full">
                  <button
                    onClick={() => onTailoredClick(item)}
                    className="w-full transition-all flex flex-col text-left group border rounded-sm
                                p-6 min-h-[240px]
                                lg:p-8 lg:pt-10 lg:pb-12 lg:min-h-[320px]
                                border-border hover:border-burgundy hover:shadow-md hover:bg-white bg-white shadow-sm"
                  >
                  <div className="flex items-center justify-between w-full mb-4">
                    <span className="text-[10px] font-bold uppercase tracking-[0.15em] px-2 py-0.5 rounded-sm text-burgundy bg-wash">
                      {item.category}
                    </span>
                    <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                      {item.date}
                    </span>
                  </div>

                  <div className="mb-3">
                    <h3 className="text-base lg:text-lg font-serif font-bold leading-tight line-clamp-2 transition-colors text-ink group-hover:text-burgundy">
                      {item.title}
                    </h3>
                  </div>

                  <p className="text-[13px] lg:text-sm leading-relaxed line-clamp-3 text-gray-600">
                    {item.summary}
                  </p>
                  </button>
                  <button
                    onClick={(e) => onDismissTailored(e, item.id)}
                    className="absolute top-3 right-3 p-1.5 rounded-sm text-gray-400 hover:text-ink hover:bg-wash opacity-0 group-hover:opacity-100 transition-all"
                    title="Dismiss recommendation"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="w-full mb-8">
          <div className="flex w-full items-center justify-between mb-8">
            <h3 className="text-xs font-semibold text-ink uppercase tracking-wider">
              Browse Latest Developments
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={onDownloadDigest}
                className="p-0 sm:p-1.5 text-muted hover:text-burgundy hover:bg-wash rounded-sm transition-all flex items-center gap-1.5"
                title="Download Daily Digest"
              >
                <Download size={12} />
                <span className="text-[9px] font-bold uppercase tracking-widest hidden sm:inline">
                  Download Daily Digest
                </span>
              </button>
              <button
                onClick={isDeveloper ? onRefresh : onShowRefreshExplainer}
                disabled={isRefreshing}
                className="p-0 sm:p-1.5 text-muted hover:text-burgundy hover:bg-wash rounded-sm transition-all disabled:opacity-50 flex items-center gap-1.5"
                title="Refresh with Live Intelligence"
              >
                <RefreshCw size={12} className={isRefreshing ? "animate-spin" : ""} />
                <span className="text-[9px] font-bold uppercase tracking-widest">
                  {isRefreshing ? "Sweeping Archives..." : (lastUpdatedRaw ? `Last Updated: ${formatLastUpdated(lastUpdatedRaw)}` : "Live Refresh")}
                </span>
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 items-stretch gap-4 text-left justify-items-center">
            {latestDevelopments.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
                <BookOpen size={28} className="text-gray-400 mb-4" />
                <p className="text-sm font-serif text-muted mb-2">No developments yet.</p>
                <p className="text-xs text-gray-400 max-w-sm">
                  {isDeveloper
                    ? <>Click <span className="font-semibold">Live Refresh</span> above to conduct the first intelligence sweep of the approved archives.</>
                    : 'Intelligence sweep in progress — check back shortly'}
                </p>
              </div>
            )}
            {latestDevelopments.slice(0, latestCount).map((dev: Development, idx: number) => (
              <LatestDevelopmentCard
                key={dev.id || String(idx)}
                dev={dev}
                isInteractive={isDeveloper}
                onDevelopmentClick={onDevelopmentClick}
                onDismissDevelopment={onDismissDevelopment}
              />
            ))}
          </div>

          <div className="flex justify-center mt-8">
            <button
              onClick={() => setShowHistoricalLedger(!showHistoricalLedger)}
              className="text-[10px] font-bold text-muted hover:text-burgundy uppercase tracking-widest transition-colors flex items-center gap-2"
            >
              {showHistoricalLedger ? 'Hide Historical Ledger' : 'View Previous Developments'}
            </button>
          </div>

          {showHistoricalLedger && historicalDevelopments.length > 0 && (
          <div className="mt-8 pt-12 border-t border-border">
            <h3 className="text-sm lg:text-base font-serif font-bold text-ink uppercase tracking-[0.2em] mb-10 border-b border-border pb-4">
              Historical Ledger
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 items-stretch gap-4 text-left justify-items-center opacity-85 hover:opacity-100 transition-opacity">
              {historicalDevelopments.slice(0, historicalCount).map((dev, idx) => (
                <LatestDevelopmentCard
                  key={dev.id || String(idx)}
                  dev={dev}
                  isInteractive={isDeveloper}
                  onDevelopmentClick={onDevelopmentClick}
                  onDismissDevelopment={onDismissDevelopment}
                />
              ))}
            </div>
          </div>
          )}
        </div>
      </div>

      {showcaseChats.length > 0 && (
        <div className="w-full mt-16 mb-8">
          <div className="flex w-full items-center justify-between mb-6">
            <h3 className="text-xs font-semibold text-ink uppercase tracking-wider flex items-center gap-2">
              <Eye size={14} className="text-burgundy" />
              See It in Action
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-left justify-items-center">
            {showcaseChats.map((chat) => (
              <button
                key={chat.id}
                onClick={() => onShowcaseClick(chat.id)}
                className="w-full transition-all flex flex-col text-left group border rounded-sm
                  p-6 min-h-[240px]
                  lg:p-8 lg:pt-10 lg:pb-12 lg:min-h-[320px]
                  border-border hover:border-burgundy hover:shadow-md hover:bg-white bg-white shadow-sm"
              >
                <div className="flex items-center gap-2 flex-wrap w-full mb-4">
                  {chat.category && (
                    <span className="text-[10px] font-bold uppercase tracking-[0.15em] px-2 py-0.5 rounded-sm text-burgundy bg-wash">
                      {chat.category}
                    </span>
                  )}
                </div>

                <div className="mb-3">
                  <h3 className="text-base lg:text-lg font-serif font-bold text-ink leading-tight line-clamp-3 group-hover:text-burgundy transition-colors">
                    {chat.title}
                  </h3>
                </div>

                {chat.previewText && (
                  <p className="text-[13px] lg:text-sm leading-relaxed line-clamp-3 mb-4 text-gray-600">
                    {chat.previewText}
                  </p>
                )}

                <div className="mt-auto pt-4 border-t border-dashed border-border w-full flex items-center gap-2">
                  <Eye size={12} className="text-burgundy" />
                  <span className="text-[9px] font-bold text-burgundy uppercase tracking-[0.2em]">View Showcase</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="w-full max-w-2xl mx-auto mt-8">
      </div>

      <div className="w-full max-w-4xl mx-auto mt-12 text-center text-xs text-muted pb-8">
      </div>
    </div>
  );
}
