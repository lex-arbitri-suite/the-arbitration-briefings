/**
 * Lightweight application overlays — notification toasts, informational popups, and onboarding modal.
 */
import React from 'react';
import { RefreshCw, Check, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { TermsModal } from './TermsModal';
import { OnboardingHandshakeModal } from './OnboardingHandshakeModal';

interface AppOverlaysProps {
  // Archive toast
  archiveSuccess: string | null;
  refreshError: string | null;
  onDismissRefreshError: () => void;
  refreshSuccess: string | null;
  onDismissRefreshSuccess: () => void;
  // Undo dismiss toast
  undoToast: { id: string; timeout: NodeJS.Timeout } | null;
  onUndoDismiss: () => void;
  // Refresh explainer
  showRefreshExplainer: boolean;
  onCloseRefreshExplainer: () => void;
  // Terms modal
  isTermsModalOpen: boolean;
  onCloseTermsModal: () => void;
  // Onboarding
  isOnboardingVisible: boolean;
  onAcknowledgeOnboarding: () => void;
}

export default function AppOverlays({
  archiveSuccess,
  refreshError,
  onDismissRefreshError,
  refreshSuccess,
  onDismissRefreshSuccess,
  undoToast,
  onUndoDismiss,
  showRefreshExplainer,
  onCloseRefreshExplainer,
  isTermsModalOpen,
  onCloseTermsModal,
  isOnboardingVisible,
  onAcknowledgeOnboarding
}: AppOverlaysProps) {
  return (
    <>
      {archiveSuccess && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[110] animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-ink text-white px-6 py-3 rounded-sm shadow-2xl flex items-center gap-3 border border-white/10">
            <Check size={16} className="text-emerald-400" />
            <span className="text-xs font-bold uppercase tracking-widest">{archiveSuccess}</span>
          </div>
        </div>
      )}

      <AnimatePresence>
        <OnboardingHandshakeModal
          isVisible={isOnboardingVisible}
          onAcknowledge={onAcknowledgeOnboarding}
        />
        {refreshError && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            transition={{ duration: 0.25 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[115] bg-ink text-white px-6 py-3 rounded-sm shadow-2xl flex items-center gap-3 border border-danger/40 max-w-[min(90vw,28rem)]"
          >
            <AlertCircle size={18} className="text-red-400 flex-shrink-0" aria-hidden />
            <span className="text-xs font-bold uppercase tracking-widest">{refreshError}</span>
            <button
              type="button"
              onClick={onDismissRefreshError}
              className="text-xs font-bold text-red-300 uppercase tracking-widest hover:text-white transition-colors ml-1"
            >
              Dismiss
            </button>
          </motion.div>
        )}
        {refreshSuccess && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            transition={{ duration: 0.25 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[115] bg-ink text-white px-6 py-3 rounded-sm shadow-2xl flex items-center gap-3 border border-emerald-500/40 max-w-[min(90vw,28rem)]"
          >
            <Check size={18} className="text-emerald-400 flex-shrink-0" aria-hidden />
            <span className="text-xs font-bold uppercase tracking-widest">{refreshSuccess}</span>
            <button
              type="button"
              onClick={onDismissRefreshSuccess}
              className="text-xs font-bold text-emerald-300 uppercase tracking-widest hover:text-white transition-colors ml-1"
            >
              Dismiss
            </button>
          </motion.div>
        )}
        {undoToast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-ink text-white px-6 py-3 rounded-sm shadow-xl flex items-center gap-4"
          >
            <span className="text-xs font-medium">Development dismissed from feed.</span>
            <button
              onClick={onUndoDismiss}
              className="text-xs font-bold text-burgundy uppercase tracking-widest hover:text-white transition-colors"
            >
              Undo
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showRefreshExplainer && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-ink/80 backdrop-blur-md"
              onClick={onCloseRefreshExplainer}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-paper border border-burgundy/20 shadow-2xl p-8 md:p-10 flex flex-col"
            >
              <div className="w-16 h-16 bg-burgundy rounded-full flex items-center justify-center text-white mx-auto mb-6 shadow-lg">
                <RefreshCw size={32} />
              </div>
              <h2
                className="font-serif text-2xl font-semibold text-ink mb-4 text-center"
                style={{ fontFamily: "'Cormorant Garamond', serif" }}
              >
                Live Refresh is a Developer Function
              </h2>
              <p className="text-sm text-ink-soft leading-relaxed text-center mb-6 font-sans">
                Live Refresh triggers an AI sweep of 60+ legal repositories worldwide. On this site, it is reserved for the developer to manage API costs. If you would like to run your own instance of The Arbitration Briefings with your own API key and unlimited refreshes, the source code is freely available on GitHub.
              </p>
              <a
                href="https://github.com/lex-arbitri-suite/the-arbitration-briefings"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-burgundy font-semibold text-center hover:text-burgundy-deep transition-colors mb-8"
              >
                View the source code on GitHub &rarr;
              </a>
              <div className="flex justify-center pt-4 border-t border-burgundy/10">
                <button
                  onClick={onCloseRefreshExplainer}
                  className="px-8 py-3 bg-burgundy text-white text-xs font-bold uppercase tracking-widest hover:bg-burgundy-deep transition-colors shadow-md"
                  style={{ fontFamily: "'Cormorant Garamond', serif" }}
                >
                  Got it
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <TermsModal
        isOpen={isTermsModalOpen}
        onClose={onCloseTermsModal}
      />
    </>
  );
}
