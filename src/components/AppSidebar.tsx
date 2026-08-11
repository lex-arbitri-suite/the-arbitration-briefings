/**
 * Application sidebar — chat list, trash management, selection mode, and owner sign-out.
 * State for selection, trash view, and delete confirmation is managed internally.
 */
import React, { useState } from 'react';
import { Check, Clock, MessageSquare, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { ChatSession, DeletedChatSession } from '../types';

interface AppSidebarProps {
  chats: ChatSession[];
  deletedChats: DeletedChatSession[];
  currentChatId: string | null;
  isOwner: boolean;
  isSidebarOpen: boolean;
  onCloseSidebar: () => void;
  onOpenChat: (chatId: string) => void;
  onNewChat: () => void;
  onDeleteChats: (chatIds: string[]) => Promise<void>;
  onRestoreChat: (chatId: string) => Promise<void>;
  onSignOut: () => void;
}

export default function AppSidebar({
  chats,
  deletedChats,
  currentChatId,
  isOwner,
  isSidebarOpen,
  onCloseSidebar,
  onOpenChat,
  onNewChat,
  onDeleteChats,
  onRestoreChat,
  onSignOut,
}: AppSidebarProps) {
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [selectedChatIds, setSelectedChatIds] = useState<string[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'single' | 'bulk' | 'all'; id?: string; title?: string } | null>(null);

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;

    let idsToDelete: string[] = [];
    if (deleteConfirm.type === 'single' && deleteConfirm.id) {
      idsToDelete = [deleteConfirm.id];
    } else if (deleteConfirm.type === 'bulk') {
      idsToDelete = selectedChatIds;
    } else if (deleteConfirm.type === 'all') {
      idsToDelete = chats.map((c) => c.id);
    }

    if (idsToDelete.length === 0) {
      setDeleteConfirm(null);
      return;
    }

    await onDeleteChats(idsToDelete);
    setSelectedChatIds([]);
    setIsSelectMode(false);
    setDeleteConfirm(null);
  };

  return (
    <>
      {/* Sidebar Overlay for Mobile */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-20 md:hidden"
          onClick={onCloseSidebar}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed md:relative z-30 h-full transition-all duration-300 ease-in-out flex-shrink-0 no-print overflow-hidden ${isSidebarOpen ? 'w-72' : 'w-0'}`}>
        <div className={`absolute inset-y-0 left-0 w-72 bg-wash border-r border-border flex flex-col transform transition-transform duration-300 ease-in-out will-change-transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="p-4 border-b border-border flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <button
                onClick={onNewChat}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-widest bg-burgundy text-white hover:bg-burgundy-deep transition-colors"
              >
                <Plus size={16} />
                <span>New Chat</span>
              </button>
              <button
                className="ml-2 p-2 text-muted hover:text-ink"
                onClick={onCloseSidebar}
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {(chats.length > 0 || deletedChats.length > 0) && (
                <div className="flex items-center gap-2">
                  {chats.length > 0 && !showTrash && (
                    <>
                      <button
                        onClick={() => {
                          setIsSelectMode(!isSelectMode);
                          setSelectedChatIds([]);
                        }}
                        className={`flex-1 px-3 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-widest transition-all border ${
                          isSelectMode
                            ? 'bg-white border-burgundy text-burgundy'
                            : 'bg-wash border-border-strong text-muted hover:bg-border'
                        }`}
                      >
                        {isSelectMode ? 'Cancel' : 'Select'}
                      </button>

                      {isSelectMode ? (
                        <button
                          onClick={() => {
                            if (selectedChatIds.length === 0) return;
                            setDeleteConfirm({ type: 'bulk' });
                          }}
                          disabled={selectedChatIds.length === 0}
                          className="flex-1 px-3 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-widest bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-50 transition-all"
                        >
                          Delete ({selectedChatIds.length})
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setDeleteConfirm({ type: 'all' });
                          }}
                          className="flex-1 px-3 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-widest bg-wash border border-border-strong text-muted hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all"
                        >
                          Clear All
                        </button>
                      )}
                    </>
                  )}

                  {showTrash && (
                    <button
                      onClick={() => {
                        setShowTrash(false);
                      }}
                      className="flex-1 px-3 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-widest bg-white border-burgundy text-burgundy transition-all"
                    >
                      Back to Chats
                    </button>
                  )}

                  <div className="relative">
                    <button
                      onClick={() => {
                        setShowTrash(!showTrash);
                        setIsSelectMode(false);
                        setSelectedChatIds([]);
                      }}
                      title={showTrash ? 'Back to Chats' : 'View Trash'}
                      className={`p-1.5 rounded transition-all border flex items-center justify-center ${
                        showTrash
                          ? 'bg-burgundy border-burgundy text-white'
                          : 'bg-wash border-border-strong text-muted hover:bg-border'
                      }`}
                    >
                      <Trash2 size={14} />
                    </button>
                    {deletedChats.length > 0 && !showTrash && (
                      <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-burgundy text-white text-[8px] rounded-full flex items-center justify-center border border-wash font-bold">
                        {deletedChats.length}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1 relative">
            {/* Custom Delete Confirmation Overlay */}
            {deleteConfirm && (
              <div className="absolute inset-0 z-50 bg-wash/95 flex items-center justify-center p-6 text-center">
                <div className="bg-white p-6 rounded-sm shadow-xl border border-border max-w-xs w-full">
                  <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Trash2 size={24} />
                  </div>
                  <h3 className="text-lg font-bold text-ink mb-2">
                    {deleteConfirm.type === 'all' ? 'Clear All Chats?' :
                      deleteConfirm.type === 'bulk' ? `Delete ${selectedChatIds.length} Chats?` :
                        'Delete Chat?'}
                  </h3>
                  <p className="text-sm text-muted mb-6">
                    {deleteConfirm.type === 'single' ? `Are you sure you want to delete "${deleteConfirm.title}"?` :
                      'Are you sure you want to delete these chats?'}
                    <br />
                    <span className="text-[10px] mt-2 block italic">Deleted chats can be retrieved from the Trash within 30 days.</span>
                  </p>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={handleConfirmDelete}
                      className="w-full py-2 bg-red-600 text-white rounded-sm text-xs font-bold uppercase tracking-widest hover:bg-red-700 transition-colors"
                    >
                      Confirm Delete
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="w-full py-2 bg-white text-muted border border-border-strong rounded-sm text-xs font-bold uppercase tracking-widest hover:bg-[#f5f5f5] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {showTrash ? (
              <div className="space-y-4">
                <div className="px-2 py-1 text-[10px] font-bold text-muted uppercase tracking-wider flex items-center justify-between">
                  <span>Recently Deleted</span>
                  <span className="normal-case font-normal italic">Auto-clears after 30 days</span>
                </div>
                {deletedChats.length === 0 ? (
                  <div className="text-center text-sm text-muted py-8">
                    Trash is empty
                  </div>
                ) : (
                  deletedChats.map((chat) => (
                    <div
                      key={chat.id}
                      className="group flex flex-col gap-1 p-3 rounded-sm bg-white/50 border border-transparent hover:border-border-strong transition-all"
                    >
                      <div className="flex items-center justify-between gap-2 overflow-hidden">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <MessageSquare size={14} className="text-muted flex-shrink-0" />
                          <div className="truncate text-sm font-medium text-ink">
                            {chat.title}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={async () => {
                              await onRestoreChat(chat.id);
                            }}
                            className="p-1 text-burgundy hover:bg-burgundy hover:text-white rounded transition-colors"
                            title="Restore chat"
                          >
                            <RotateCcw size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="text-[10px] text-muted flex items-center gap-1">
                        <Clock size={10} />
                        <span>Deleted {new Date(chat.deletedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : chats.length === 0 ? (
              <div className="text-center text-sm text-muted mt-6">
                No previous chats
              </div>
            ) : (
              chats.filter((c) => !c.isArchived).map((chat) => (
                <div
                  key={chat.id}
                  className={`group flex items-center gap-3 p-3 rounded-sm cursor-pointer transition-colors ${currentChatId === chat.id ? 'bg-white shadow-sm' : 'hover:bg-border'}`}
                  onClick={() => {
                    if (isSelectMode) {
                      setSelectedChatIds((prev) =>
                        prev.includes(chat.id)
                          ? prev.filter((id) => id !== chat.id)
                          : [...prev, chat.id]
                      );
                    } else {
                      onOpenChat(chat.id);
                    }
                  }}
                >
                  {isSelectMode && (
                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                      selectedChatIds.includes(chat.id)
                        ? 'bg-burgundy border-burgundy'
                        : 'bg-white border-border-strong'
                    }`}>
                      {selectedChatIds.includes(chat.id) && <Check size={10} className="text-white" />}
                    </div>
                  )}
                  <div className="flex-1 flex items-center gap-3 overflow-hidden">
                    <MessageSquare size={16} className={currentChatId === chat.id ? 'text-burgundy' : 'text-muted'} />
                    <div className="truncate text-sm font-medium">
                      {chat.title}
                    </div>
                  </div>
                  {!isSelectMode && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirm({ type: 'single', id: chat.id, title: chat.title });
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-muted hover:text-red-600 transition-opacity"
                      title="Delete chat"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
          {isOwner && (
            <div className="flex-shrink-0 px-4 pb-4 pt-2">
              <button
                type="button"
                onClick={onSignOut}
                className="bg-transparent border-0 p-0 m-0 cursor-pointer text-left font-sans opacity-60 hover:opacity-100 uppercase transition-opacity duration-200"
                style={{
                  color: '#8B2C2C',
                  fontSize: '0.75rem',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
