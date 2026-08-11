import { motion } from 'motion/react';
import { BookOpen, FileText, X } from 'lucide-react';
import type { ChatSession } from '../types';

interface ConsolidationModalProps {
  chats: ChatSession[];
  selectedChatIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onClose: () => void;
  onCompile: (chatIds: string[]) => void;
}

export default function ConsolidationModal({
  chats,
  selectedChatIds,
  onSelectionChange,
  onClose,
  onCompile,
}: ConsolidationModalProps) {
  const activeSessions = chats.filter(c => !c.isArchived);
  const isEmpty = activeSessions.length === 0;

  const handleToggle = (chatId: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedChatIds, chatId]);
    } else {
      onSelectionChange(selectedChatIds.filter(id => id !== chatId));
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-ink/80 backdrop-blur-md"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-2xl bg-paper border border-burgundy/20 shadow-2xl p-8 md:p-10 flex flex-col max-h-[90vh]"
      >
        {isEmpty && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-muted hover:text-ink transition-colors"
            aria-label="Close"
          >
            <X size={24} />
          </button>
        )}
        <div className="w-16 h-16 bg-burgundy rounded-full flex items-center justify-center text-white mx-auto mb-6 shadow-lg flex-shrink-0">
          <FileText size={32} />
        </div>
        <h2 className="font-serif text-2xl font-semibold text-ink mb-2 text-center flex-shrink-0" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
          Briefing Synthesis
        </h2>
        {!isEmpty && (
          <p className="text-sm text-muted text-center mb-6">Select the relevant research chats for synthesis.</p>
        )}
        <div
          className={`text-sm text-ink-soft leading-relaxed font-sans flex-1 overflow-y-auto pr-2 custom-scrollbar ${
            isEmpty
              ? 'flex flex-col items-center justify-center min-h-[200px] mb-0'
              : 'text-left space-y-2 mb-8'
          }`}
        >
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <BookOpen size={28} className="text-gray-400 mb-4" />
              <p className="text-sm font-serif text-muted mb-2 max-w-sm">
                <span className="font-semibold text-ink">No active research chats yet.</span>
              </p>
              <p className="text-xs text-gray-400 max-w-sm">
                Start one to compile a consolidated briefing.
              </p>
            </div>
          ) : (
            activeSessions.map(chat => (
              <label key={chat.id} className="flex items-start gap-3 p-4 border border-border rounded-sm hover:bg-white cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={selectedChatIds.includes(chat.id)}
                  onChange={(e) => handleToggle(chat.id, e.target.checked)}
                  className="mt-1 accent-[#8B2C2C]"
                />
                <div className="flex-1">
                  <h4 className="font-semibold text-ink mb-1">{chat.title}</h4>
                  <p className="text-xs text-muted line-clamp-2">{chat.previewText || 'No preview available.'}</p>
                </div>
              </label>
            ))
          )}
        </div>
        {!isEmpty && (
          <div className="flex items-center justify-between pt-6 border-t border-burgundy/10 flex-shrink-0">
            <button
              onClick={onClose}
              className="px-6 py-2.5 text-xs font-bold uppercase tracking-widest text-muted hover:text-ink transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onClose();
                onCompile(selectedChatIds);
              }}
              disabled={selectedChatIds.length === 0}
              className="px-8 py-3 bg-burgundy text-white text-xs font-bold uppercase tracking-widest hover:bg-burgundy-deep transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              Compile Consolidated Briefing
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
