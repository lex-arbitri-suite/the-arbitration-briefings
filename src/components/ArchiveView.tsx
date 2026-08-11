import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Folder, Eye, MessageSquare, FileText } from 'lucide-react';
import type { ChatSession } from '../types';

interface ArchiveViewProps {
  chats: ChatSession[];
  onViewBriefingContent: (chatId: string) => Promise<void>;
  onViewBriefingFromChat: (briefingId: string) => Promise<void>;
  onOpenChat: (chatId: string) => void;
  onRestoreChat: (chatId: string) => Promise<void>;
}

export default function ArchiveView({
  chats,
  onViewBriefingContent,
  onViewBriefingFromChat,
  onOpenChat,
  onRestoreChat,
}: ArchiveViewProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'briefings' | 'chats'>('briefings');

  const savedBriefings = chats.filter(c => c.isArchived === true && c.status === 'authorised' && c.visibility === 'private');
  const savedChats = chats.filter(c => c.isArchived === true && c.status === 'approved' && c.visibility === 'private');

  const groupedBriefings = savedBriefings.reduce((acc, chat) => {
    const category = chat.category || 'General';
    if (!acc[category]) acc[category] = [];
    acc[category].push(chat);
    return acc;
  }, {} as Record<string, ChatSession[]>);

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-wash flex items-center justify-center text-burgundy">
            <BookOpen size={20} />
          </div>
          <h2 className="font-serif text-3xl font-medium text-ink">The Archive</h2>
        </div>
        <button
          onClick={() => navigate('/workspace')}
          className="text-[10px] font-bold uppercase tracking-widest text-burgundy hover:underline"
        >
          RETURN HOME
        </button>
      </div>

      <div className="flex items-center gap-8 border-b border-border mb-8">
        <button
          onClick={() => setActiveTab('briefings')}
          className={`pb-4 text-[10px] font-bold uppercase tracking-widest transition-all relative ${activeTab === 'briefings' ? 'text-burgundy' : 'text-gray-400 hover:text-muted'}`}
        >
          My Saved Briefings
          {activeTab === 'briefings' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-burgundy" />}
        </button>
        <button
          onClick={() => setActiveTab('chats')}
          className={`pb-4 text-[10px] font-bold uppercase tracking-widest transition-all relative ${activeTab === 'chats' ? 'text-burgundy' : 'text-gray-400 hover:text-muted'}`}
        >
          My Saved Chats
          {activeTab === 'chats' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-burgundy" />}
        </button>
      </div>

      {activeTab === 'briefings' ? (
        savedBriefings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="font-sans text-sm text-muted italic">Your saved briefings will appear here.</p>
            <p className="text-[10px] uppercase tracking-widest text-gray-400 mt-4">Generate a consolidated briefing to save it to your archive.</p>
          </div>
        ) : (
          <div className="space-y-12">
            {Object.entries(groupedBriefings).map(([category, categoryBriefings]) => (
              <div key={category} className="space-y-6">
                <h3 className="text-xs font-semibold text-burgundy uppercase tracking-wider flex items-center gap-2 border-b border-border pb-2">
                  <Folder size={14} />
                  {category}
                </h3>
                <div className="grid grid-cols-1 gap-6">
                  {categoryBriefings.map((chat) => (
                    <div
                      key={chat.id}
                      className="p-8 border border-border rounded-sm bg-white hover:border-burgundy hover:shadow-md transition-all group relative"
                    >
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-burgundy bg-wash px-2 py-1 rounded-sm">Personal Briefing</span>
                          {chat.internalRef && <span className="text-[10px] font-mono text-muted">{chat.internalRef}</span>}
                          {chat.category && (
                            <span className="text-[10px] font-bold uppercase tracking-[0.15em] px-2 py-0.5 rounded-sm text-burgundy bg-wash">
                              {chat.category}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-muted">{new Date(chat.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      </div>
                      <h3 className="text-xl font-serif font-semibold text-ink mb-4 group-hover:text-burgundy transition-colors">{chat.title}</h3>
                      <p className="text-sm text-muted line-clamp-3 leading-relaxed mb-6">
                        {chat.previewText ? `${chat.previewText}...` : 'No preview available.'}
                      </p>
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => onViewBriefingContent(chat.id)}
                          className="text-[10px] font-bold uppercase tracking-widest text-burgundy flex items-center gap-2 hover:underline"
                        >
                          <Eye size={14} />
                          View Generated Briefing
                        </button>
                        {chat.parentChatIds && chat.parentChatIds.length > 0 && (
                          <button
                            onClick={() => onOpenChat(chat.parentChatIds![0])}
                            className="text-[10px] font-bold uppercase tracking-widest text-muted flex items-center gap-2 hover:text-burgundy transition-colors"
                          >
                            <MessageSquare size={14} />
                            Review Source Chat{chat.parentChatIds.length > 1 ? 's' : ''}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        savedChats.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {savedChats.map((chat) => (
              <div
                key={chat.id}
                className="p-6 border border-border rounded-sm bg-paper-bright hover:border-burgundy hover:shadow-sm transition-all text-left group"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted bg-wash px-2 py-1 rounded-sm">Saved Chat</span>
                  {chat.category && (
                    <span className="text-[10px] font-bold uppercase tracking-widest text-burgundy bg-wash px-2 py-1 rounded-sm">{chat.category}</span>
                  )}
                  <span className="text-[10px] text-muted">{new Date(chat.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
                <h3 className="text-sm font-semibold text-ink group-hover:text-burgundy transition-colors mb-2 line-clamp-2">{chat.title}</h3>
                <p className="text-xs text-muted line-clamp-2 leading-relaxed mb-4">
                  {chat.previewText ? `${chat.previewText.slice(0, 120)}...` : 'No preview available.'}
                </p>
                <div className="flex items-center justify-between pt-4 border-t border-wash">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => onOpenChat(chat.id)}
                      className="text-[10px] font-bold uppercase tracking-widest text-burgundy hover:underline"
                    >
                      Open Chat
                    </button>
                    {chat.generatedBriefingIds && chat.generatedBriefingIds.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        {chat.generatedBriefingIds.map((briefingId, index) => (
                          <button
                            key={briefingId}
                            onClick={() => onViewBriefingFromChat(briefingId)}
                            className="text-[10px] font-bold uppercase tracking-widest text-muted hover:text-burgundy flex items-center gap-1 transition-colors"
                          >
                            <FileText size={12} />
                            {chat.generatedBriefingIds.length > 1 ? `Briefing ${index + 1}` : 'View Generated Briefing'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => onRestoreChat(chat.id)}
                    className="text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-burgundy"
                  >
                    Restore to Active
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="font-sans text-sm text-muted italic">Your saved chats will appear here.</p>
            <p className="text-[10px] uppercase tracking-widest text-gray-400 mt-4">Save active research chats to your private archive for later review.</p>
          </div>
        )
      )}
    </div>
  );
}
