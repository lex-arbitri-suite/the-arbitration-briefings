/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter, useNavigate, useLocation } from 'react-router-dom';
import {
  streamChat,
  generateText,
  isApiKeyConfigured,
  mapAIErrorToUserMessage,
} from './utils/aiProvider';
import { isNewDevelopment, getRelativeTimeLabel } from './utils/developmentHelpers';
import { formatLastUpdated } from './utils/formatLastUpdated';
import { handleDownloadDailyDigest } from './utils/printDailyDigest';
import { MarkdownRenderer } from './components/MarkdownRenderer';
import { AnimatePresence } from 'motion/react';
import { Send, Scale, BookOpen, Clock, Plus, X, Search, Eye, Github, Folder, ChevronDown, ChevronUp } from 'lucide-react';
import { normaliseCategory } from './constants';
import { getSystemInstruction } from './prompts/systemInstruction';
import { getConsolidationPrompt, getTitlePrompt, getCategoryPrompt } from './prompts/briefingGeneration';
import { GeneratedBriefingView } from './components/GeneratedBriefingView';
import MethodologyPage from './components/MethodologyPage';
import BriefingOverlay from './components/BriefingOverlay';
import ChatBreadcrumb from './components/ChatBreadcrumb';
import ChatView from './components/ChatView';
import ConsolidationModal from './components/ConsolidationModal';
import ArchiveView from './components/ArchiveView';
import HomeView from './components/HomeView';
import SignInPage from './components/SignInPage';
import AppSidebar from './components/AppSidebar';
import AppHeader from './components/AppHeader';
import ResearchInputDock from './components/ResearchInputDock';
import AppOverlays from './components/AppOverlays';
import { 
  db, onSnapshot, auth, signOut,
  doc, collection, query, where, 
  Timestamp, addDoc, updateDoc, orderBy, limit, serverTimestamp,
  getDocs, setDoc, getDoc, arrayUnion,
  handleFirestoreError, OperationType
} from './firebase';
import { Development, Message, ChatSession, DeletedChatSession, TailoredItem } from './types';
import { useOwnerAuth } from './hooks/useOwnerAuth';
import { useShowcaseChats } from './hooks/useShowcaseChats';
import { useChatScroll } from './hooks/useChatScroll';
import { useBriefingMessages } from './hooks/useBriefingMessages';
import { useDevelopmentsFeed } from './hooks/useDevelopmentsFeed';
import { useDevelopmentGridDensity } from './hooks/useDevelopmentGridDensity';
import { useRelatedDevelopments } from './hooks/useRelatedDevelopments';

const DEFAULT_CHAT_AWAIT_LABEL = 'Consulting the arbitral archives...';
const CHAT_BRIEFLY_RETRY_LABEL = 'Briefly retrying…';

/** Collapses whitespace and lowercases for dedupe comparison only; display strings stay unchanged. */
function normaliseEnquiryKeyForDedupe(query: string): string {
  return query.trim().replace(/\s+/g, ' ').toLowerCase();
}

function buildSuggestedEnquiriesFromDevelopments(devs: Development[]): { query: string }[] {
  const seen = new Set<string>();
  const out: { query: string }[] = [];
  for (const dev of devs) {
    const raw = typeof dev.query === 'string' ? dev.query : '';
    const key = normaliseEnquiryKeyForDedupe(raw);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ query: raw });
  }
  return out;
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isOwner, authLoading, uid } = useOwnerAuth();
  const { showcaseChats } = useShowcaseChats();
  const [hasAcknowledged, setHasAcknowledged] = useState(() => localStorage.getItem('arbitration_briefings_acknowledged') === 'true');
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [isShowcaseView, setIsShowcaseView] = useState(false);
  const [deletedChats, setDeletedChats] = useState<DeletedChatSession[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const { messages, setMessages } = useBriefingMessages(currentChatId);
  const { latestCount, historicalCount } = useDevelopmentGridDensity();
  
  useEffect(() => {
    if (!currentChatId) {
      setIsShowcaseView(false);
    }
  }, [currentChatId]);

  useEffect(() => {
    if (isOwner || isShowcaseView) return;
    setCurrentChatId(null);
    setMessages([]);
    setShowFullBriefing(false);
  }, [isOwner, isShowcaseView, setMessages]);

  const [showHistoricalLedger, setShowHistoricalLedger] = useState(false);
  const [undoToast, setUndoToast] = useState<{ id: string, timeout: NodeJS.Timeout } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshInFlightRef = useRef<boolean>(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const {
    visibleLatestDevelopments,
    historicalDevelopments,
    nonDismissedDevelopments,
    allDevelopments: latestDevelopments,
    lastUpdated,
    lastUpdatedRaw,
    dismissedDevelopmentIds,
    setDismissedDevelopmentIds,
    setLastUpdated,
    setLastUpdatedRaw
  } = useDevelopmentsFeed();

  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    // Default open on desktop, closed on mobile
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1024;
    }
    return false;
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatLoadingMessage, setChatLoadingMessage] = useState(
    DEFAULT_CHAT_AWAIT_LABEL
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [archiveSuccess, setArchiveSuccess] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshSuccess, setRefreshSuccess] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [showRefreshExplainer, setShowRefreshExplainer] = useState(false);

  const [activeArchiveTab, setActiveArchiveTab] = useState<'briefings' | 'chats'>('briefings');
  const [showFullBriefing, setShowFullBriefing] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: 'refresh' | 'submit' | 'download' | 'downloadImage', query?: string } | null>(null);

  const [generatedBriefingContent, setGeneratedBriefingContent] = useState<string | null>(null);
  const [generatedBriefingTitle, setGeneratedBriefingTitle] = useState<string>('');
  const [generatedBriefingCategory, setGeneratedBriefingCategory] = useState<string>('General');
  const [isGeneratingBriefing, setIsGeneratingBriefing] = useState(false);
  const [sourceChatIds, setSourceChatIds] = useState<string[]>([]);
  const [selectedChatsForConsolidation, setSelectedChatsForConsolidation] = useState<string[]>([]);
  const [showConsolidationConfig, setShowConsolidationConfig] = useState(false);

  const [dismissedTailoredIds, setDismissedTailoredIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('arbitration_briefings_dismissed_tailored');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('arbitration_briefings_dismissed_tailored', JSON.stringify(dismissedTailoredIds));
  }, [dismissedTailoredIds]);

  useEffect(() => {
    if (!refreshError) return;
    const timeout = setTimeout(() => setRefreshError(null), 5000);
    return () => clearTimeout(timeout);
  }, [refreshError]);
  useEffect(() => {
    if (!refreshSuccess) return;
    const timeout = setTimeout(() => setRefreshSuccess(null), 5000);
    return () => clearTimeout(timeout);
  }, [refreshSuccess]);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  const {
    messagesEndRef,
    mainScrollRef,
    handleScroll,
    scrollToBottom,
    scrollToTop,
    shouldAutoScrollRef,
    scrollTimeoutRef,
    showScrollButton,
    showScrollTopButton,
    setPendingScroll
  } = useChatScroll(messages, isLoading);

  // Sync Briefings from Firestore
  useEffect(() => {
    if (isOwner !== true || uid === null) {
      setChats([]);
      return;
    }

    const q = query(
      collection(db, 'briefings'),
      where('ownerUid', '==', uid),
      where('deletedAt', '==', null),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedChats = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
        updatedAt: (doc.data().updatedAt as Timestamp).toMillis(),
        authorisedAt: doc.data().authorisedAt ? (doc.data().authorisedAt as Timestamp).toMillis() : undefined
      })) as ChatSession[];
      setChats(fetchedChats);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'briefings');
    });

    return () => unsubscribe();
  }, [isOwner, uid]);

  // Sync Deleted Briefings from Firestore (Trash)
  useEffect(() => {
    if (isOwner !== true || uid === null) {
      setDeletedChats([]);
      return;
    }

    const q = query(
      collection(db, 'briefings'),
      where('ownerUid', '==', uid),
      where('deletedAt', '!=', null),
      orderBy('deletedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedDeleted = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
        updatedAt: (doc.data().updatedAt as Timestamp).toMillis(),
        deletedAt: (doc.data().deletedAt as Timestamp).toMillis()
      })) as DeletedChatSession[];
      setDeletedChats(fetchedDeleted);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'briefings');
    });

    return () => unsubscribe();
  }, [isOwner, uid]);

  const handleGenerateBriefing = async (chatIds: string[]) => {
    if (!isOwner) return;
    if (chatIds.length === 0) return;
    setIsGeneratingBriefing(true);
    setSourceChatIds(chatIds);
    setGeneratedBriefingContent(null);
    setShowFullBriefing(true);

    try {
      // Fetch messages for all selected chats
      const allChatMessages: { chatId: string, title: string, messages: Message[] }[] = [];
      for (const id of chatIds) {
        const chat = chats.find(c => c.id === id);
        if (!chat) continue;
        
        const messagesSnapshot = await getDocs(
          query(collection(db, 'briefings', id, 'messages'), orderBy('timestamp', 'asc'))
        );
        const msgs = messagesSnapshot.docs.map(doc => doc.data() as Message);
        allChatMessages.push({ chatId: id, title: chat.title, messages: msgs });
      }

      // Format context for Gemini
      let context = "Here are the research chats to consolidate:\n\n";
      allChatMessages.forEach(chat => {
        context += `--- Chat: ${chat.title} ---\n`;
        chat.messages.forEach(msg => {
          context += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n\n`;
        });
      });

      const prompt = getConsolidationPrompt(context);

      const content = await generateText(prompt) || "Failed to generate briefing.";
      setGeneratedBriefingContent(content);

      // Generate a title
      const titlePrompt = getTitlePrompt(content.slice(0, 1000));
      setGeneratedBriefingTitle((await generateText(titlePrompt, { model: 'flash' })).trim() || "Consolidated Research Briefing");

      // Generate a category
      const categoryPrompt = getCategoryPrompt(content.slice(0, 1000));
      const rawCategory = (await generateText(categoryPrompt, { model: 'flash' })).trim();
      setGeneratedBriefingCategory(normaliseCategory(rawCategory));

    } catch (error) {
      console.error("Error generating briefing:", error);
      setShowFullBriefing(false);
      const msg = mapAIErrorToUserMessage(error);
      alert(msg || 'Briefing generation failed. Please try again.');
    } finally {
      setIsGeneratingBriefing(false);
    }
  };

  const handleSaveBriefing = async (title: string, content: string) => {
    if (!isOwner || uid === null) {
      handleFirestoreError(new Error('Owner authentication is required to save a briefing.'), OperationType.CREATE, 'briefings');
      return;
    }

    const newBriefing = {
      title: title,
      updatedAt: Timestamp.now(),
      isArchived: true,
      status: 'authorised',
      visibility: 'private',
      ownerUid: uid,
      deletedAt: null,
      previewText: content.replace(/[#*`]/g, '').slice(0, 200),
      parentChatIds: sourceChatIds,
      category: generatedBriefingCategory
    };

    try {
      const docRef = await addDoc(collection(db, 'briefings'), newBriefing);
      await setDoc(doc(db, 'briefings', docRef.id, 'messages', 'msg-1'), {
        id: 'msg-1',
        role: 'assistant',
        content: content,
        timestamp: Timestamp.now()
      });
      
      // Update parent chats to link to this briefing
      for (const chatId of sourceChatIds) {
        try {
          await updateDoc(doc(db, 'briefings', chatId), {
            generatedBriefingIds: arrayUnion(docRef.id)
          });
        } catch (e) {
          console.error("Failed to update parent chat with generatedBriefingIds", e);
        }
      }

      setCurrentChatId(docRef.id);
      setArchiveSuccess("Briefing successfully saved to My Saved Briefings.");
      setActiveArchiveTab('briefings');
      navigate('/archive');
      setTimeout(() => setArchiveSuccess(null), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'briefings');
    }
  };

  const handleSaveToPersonalArchive = async (chatId: string) => {
    const docRef = doc(db, 'briefings', chatId);
    try {
      await updateDoc(docRef, {
        isArchived: true,
        status: 'approved',
        visibility: 'private',
        updatedAt: Timestamp.now()
      });
      // Clear phantom ID to prevent stale state on restore
      if (currentChatId === chatId) {
        setCurrentChatId(null);
        setMessages([]);
      }
      setArchiveSuccess("Chat successfully saved to My Saved Chats.");
      setActiveArchiveTab('chats');
      navigate('/archive');
      setTimeout(() => setArchiveSuccess(null), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `briefings/${chatId}`);
    }
  };

  const currentChat = chats.find(c => c.id === currentChatId) || showcaseChats.find(c => c.id === currentChatId);

  // Tailored to Your Research: derived from the user's active chats. Empty state handled in HomeView.
  const chatDerivedItems: TailoredItem[] = chats
    .filter(c => !c.isArchived && c.title)
    .slice(0, 6)
    .map((c): TailoredItem => ({
      id: c.id,
      title: c.title,
      category: c.category ? normaliseCategory(c.category) : 'General',
      summary: c.previewText || 'Continue your research on this topic.',
      query: c.title, // fallback for suggested submit
      date: new Date(c.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      isChatDerived: true,
    }));

  const filteredTailoredItems = chatDerivedItems
    .filter(item => !dismissedTailoredIds.includes(item.id));

  const visibleTailoredItems = filteredTailoredItems.slice(0, 6);

  const allSuggestedEnquiries = buildSuggestedEnquiriesFromDevelopments(nonDismissedDevelopments);

  const handleDismissDevelopment = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    
    const newDismissed = [...dismissedDevelopmentIds, id];
    setDismissedDevelopmentIds(newDismissed);
    localStorage.setItem('arbitration_dismissed_devs', JSON.stringify(newDismissed));

    if (undoToast) clearTimeout(undoToast.timeout);
    
    const timeout = setTimeout(() => {
      setUndoToast(null);
    }, 5000);

    setUndoToast({ id, timeout });
  };

  const handleUndoDismiss = () => {
    if (!undoToast) return;
    
    const newDismissed = dismissedDevelopmentIds.filter(id => id !== undoToast.id);
    setDismissedDevelopmentIds(newDismissed);
    localStorage.setItem('arbitration_dismissed_devs', JSON.stringify(newDismissed));
    
    clearTimeout(undoToast.timeout);
    setUndoToast(null);
  };

  const handleDismissTailored = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDismissedTailoredIds(prev => [...prev, id]);
  };

  const handleDownloadBriefingPDF = () => {
    document.documentElement.classList.add('is-printing-briefing');
    window.focus();
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.documentElement.classList.remove('is-printing-briefing');
      }, 500);
    }, 500);
  };

  const refreshIntelligence = async () => {
    const user = auth.currentUser;
    if (!user?.email) {
      setRefreshError('You must be signed in to refresh.');
      return;
    }

    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;

    setRefreshError(null);
    setRefreshSuccess(null);
    setIsRefreshing(true);

    let unsubscribe: (() => void) | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = undefined;
      }
      refreshInFlightRef.current = false;
      setIsRefreshing(false);
      cleanupRef.current = null;
    };
    cleanupRef.current = cleanup;

    try {
      const docRef = await addDoc(collection(db, 'refreshRequests'), {
        requestedAt: serverTimestamp(),
        requestedBy: user.email,
      });

      timeoutId = setTimeout(() => {
        setRefreshError('Refresh timed out.');
        cleanup();
      }, 330_000);

      unsubscribe = onSnapshot(
        docRef,
        (snap) => {
          const data = snap.data();
          const status = data?.status;

          if (!status || status === 'running') return;

          if (status === 'complete') {
            const completedAt = data?.completedAt as { toMillis?: () => number } | undefined;
            if (completedAt && typeof completedAt.toMillis === 'function') {
              const completedMs = completedAt.toMillis();
              const formatted = formatLastUpdated(completedMs);
              setLastUpdated(formatted);
              setLastUpdatedRaw(completedMs);
              localStorage.setItem('arbitration_last_updated', formatted || '');
              localStorage.setItem('arbitration_last_updated_raw', completedMs.toString());
            }

            setRefreshSuccess(
              `Feed refreshed: ${data?.created ?? 0} new, ${data?.updated ?? 0} updated.`
            );
            cleanup();
          } else if (status === 'failed') {
            setRefreshError(data?.errorMessage ?? 'Refresh failed.');
            cleanup();
          }
        },
        (error) => {
          console.error('refreshRequests listener error:', error);
          setRefreshError('Refresh status could not be read.');
          cleanup();
        }
      );
    } catch (error) {
      console.error('Failed to start refresh:', error);
      setRefreshError('Could not start refresh.');
      cleanup();
    }
  };

  const handleSuggestedSubmit = async (
    message: string,
    sourceDevelopmentId?: string,
    options?: { existingUserMessageId?: string }
  ) => {
    if (isLoading) return;
    if (!isOwner || uid === null) {
      handleFirestoreError(new Error('Owner authentication is required to create a briefing.'), OperationType.CREATE, 'briefings');
      return;
    }

    setInput('');
    setIsLoading(true);
    setChatLoadingMessage(DEFAULT_CHAT_AWAIT_LABEL);

    // Practitioner should be able to read the beginning of the synthesis.
    // When a card is clicked, scroll to the top of the chat view, not the footer.
    shouldAutoScrollRef.current = false;
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = null;
    }

    const mainEl = mainScrollRef.current;
    if (mainEl) {
      // Use "auto" to ensure we update scroll position before effects run.
      mainEl.scrollTo({ top: 0, behavior: 'auto' });
    } else {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }

    let activeChatId = currentChatId;
    let isNewChat = !activeChatId;

    if (isNewChat) {
      activeChatId = Date.now().toString();
      setCurrentChatId(activeChatId);
    }

    const shouldPersistNewUserMessage = !options?.existingUserMessageId;
    const userMsg: Message = {
      id: options?.existingUserMessageId ?? Date.now().toString(),
      role: 'user',
      content: message,
      timestamp: Date.now()
    };
    
    if (isNewChat) {
      const sourceDevelopment = sourceDevelopmentId
        ? (
          latestDevelopments.find((dev) => dev.id === sourceDevelopmentId)
          || historicalDevelopments.find((dev) => dev.id === sourceDevelopmentId)
        )
        : undefined;

      const newChatData = {
        title: message.slice(0, 40) + (message.length > 40 ? '...' : ''),
        updatedAt: Timestamp.now(),
        isArchived: false,
        status: 'ephemeral',
        ownerUid: uid,
        deletedAt: null,
        visibility: 'private',
        ...(sourceDevelopmentId ? { sourceDevelopmentId } : {}),
        ...(sourceDevelopment ? {
          sourceDevelopmentTitle: sourceDevelopment.title,
          sourceDevelopmentCategory: sourceDevelopment.category
        } : {})
      };
      try {
        const docRef = await addDoc(collection(db, 'briefings'), newChatData);
        activeChatId = docRef.id;
        setCurrentChatId(activeChatId);
        if (shouldPersistNewUserMessage) {
          await setDoc(doc(db, 'briefings', activeChatId, 'messages', userMsg.id), {
            ...userMsg,
            timestamp: Timestamp.now()
          });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'briefings');
        setIsLoading(false);
        return;
      }
    } else {
      const chatRef = doc(db, 'briefings', activeChatId!);
      try {
        await updateDoc(chatRef, {
          updatedAt: Timestamp.now()
        });
        if (shouldPersistNewUserMessage) {
          await setDoc(doc(db, 'briefings', activeChatId!, 'messages', userMsg.id), {
            ...userMsg,
            timestamp: Timestamp.now()
          });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `briefings/${activeChatId}`);
        setIsLoading(false);
        return;
      }
    }

    if (!isApiKeyConfigured()) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I apologise, but the AI API key is not configured. Please ensure it is set in the application settings.",
        isError: true,
        timestamp: Date.now()
      }]);
      setIsLoading(false);
      return;
    }

    try {
      // Get the current chat's messages for context
      const previousMessages = isNewChat ? [] : messages;
      const allMessages = shouldPersistNewUserMessage ? [...previousMessages, userMsg] : previousMessages;

      const chatMessages = allMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      setIsStreaming(true);
      const stream = streamChat(chatMessages, getSystemInstruction(), {
        onRetry: () => {
          setChatLoadingMessage((prev) =>
            prev === CHAT_BRIEFLY_RETRY_LABEL ? prev : CHAT_BRIEFLY_RETRY_LABEL
          );
        },
      });

      const aiMsgId = (Date.now() + 1).toString();
      let fullResponse = '';
      let isFirstChunk = true;

      for await (const chunkText of stream) {
        fullResponse += chunkText;

        if (isFirstChunk) {
          setIsLoading(false);
          isFirstChunk = false;
          // Add the initial message to the state
          setMessages(prev => [...prev, { id: aiMsgId, role: 'assistant', content: fullResponse, timestamp: Date.now() }]);
        } else {
          // Update local state for immediate feedback
          setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: fullResponse } : m));
        }

        // Smart-Scroll: Check if we should auto-scroll
        if (shouldAutoScrollRef.current) {
          scrollToBottom();
        }
      }

      // Stream completed, trigger a final scroll check
      setTimeout(() => {
        if (shouldAutoScrollRef.current) {
          scrollToBottom();
        }
      }, 100);

      // Final update to Firestore
      const chatRef = doc(db, 'briefings', activeChatId!);
      try {
        await updateDoc(chatRef, {
          updatedAt: Timestamp.now()
        });
        await setDoc(doc(db, 'briefings', activeChatId!, 'messages', aiMsgId), {
          id: aiMsgId,
          role: 'assistant',
          content: fullResponse,
          timestamp: Timestamp.now()
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `briefings/${activeChatId}`);
      }
        
      // Extract title from the first heading if it's a new chat
      const currentChat = chats.find(c => c.id === activeChatId);
      if (currentChat) {
        let newTitle = currentChat.title;
        if (isNewChat) {
          const firstHeading = fullResponse.match(/^#\s+(.*)$/m);
          if (firstHeading) {
            const headingText = firstHeading[1].trim();
            newTitle = headingText.length > 60 ? headingText.slice(0, 57) + '...' : headingText;
          }
        }

        try {
          await updateDoc(chatRef, {
            title: newTitle,
            previewText: fullResponse.replace(/[#*`]/g, '').slice(0, 200),
            updatedAt: Timestamp.now()
          });
          
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `briefings/${activeChatId}`);
        }
      }
    } catch (error: unknown) {
      console.error('Error generating response:', error);
      setIsStreaming(false);
      const userMessage = mapAIErrorToUserMessage(error);
      if (userMessage !== '') {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: 'assistant',
            content: userMessage,
            isError: true,
            timestamp: Date.now(),
          },
        ]);
      }
    } finally {
      setIsStreaming(false);
      setIsLoading(false);
    }
  };

  const handleRetry = (content: string) => {
    // Compute the existing user message ID synchronously from current state.
    // If computed inside the setMessages updater, it runs after React's batch
    // flush and would be undefined when handleSuggestedSubmit reads it.
    const last = messages[messages.length - 1];
    const searchBase = last?.isError ? messages.slice(0, -1) : messages;
    const retryUserMessageId = searchBase
      .slice()
      .reverse()
      .find((m) => m.role === 'user' && m.content === content)?.id;

    setMessages((prev) => {
      const lastMsg = prev[prev.length - 1];
      return lastMsg?.isError ? prev.slice(0, -1) : prev;
    });

    handleSuggestedSubmit(content, undefined, { existingUserMessageId: retryUserMessageId });
  };

  const sourceDevelopmentTitle = currentChat?.sourceDevelopmentId
    ? currentChat.sourceDevelopmentTitle || (
      latestDevelopments.find((dev) => dev.id === currentChat.sourceDevelopmentId)?.title
      || historicalDevelopments.find((dev) => dev.id === currentChat.sourceDevelopmentId)?.title
    )
    : undefined;

  const sourceDevelopmentCategory = currentChat?.sourceDevelopmentId
    ? currentChat.sourceDevelopmentCategory || (
      latestDevelopments.find((dev) => dev.id === currentChat.sourceDevelopmentId)?.category
      || historicalDevelopments.find((dev) => dev.id === currentChat.sourceDevelopmentId)?.category
    )
    : undefined;

  const firstUserMessage = messages.find((message) => message.role === 'user')?.content;

  const {
    relatedDevelopments,
    isLoading: relatedDevelopmentsLoading,
    loadingMessage: relatedDevelopmentsLoadingMessage,
    sweepError: relatedDevelopmentsSweepError,
    refresh: onRefreshRelatedDevelopments
  } = useRelatedDevelopments({
    chatId: currentChatId,
    canWrite: isOwner === true,
    messages,
    sourceDevelopmentTitle,
    sourceDevelopmentCategory,
    firstUserMessage
  });

  const handleHeaderNavigate = (path: string) => {
    if (path === '/workspace') {
      setCurrentChatId(null);
      setMessages([]);
      setIsShowcaseView(false);
      setShowFullBriefing(false);
    } else if (path === '/archive' || path === '/methodology') {
      setShowFullBriefing(false);
    } else if (path === '/') {
      setCurrentChatId(null);
    }
    navigate(path);
  };

  const handleOpenChatFromSidebar = (chatId: string) => {
    setCurrentChatId(chatId);
    setPendingScroll();
    setIsShowcaseView(false);
    if (location.pathname !== '/workspace') navigate('/workspace');
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const handleNewChatFromSidebar = () => {
    navigate('/workspace');
    setCurrentChatId(null);
    setMessages([]);
    setInput('');
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const handleDeleteChatsFromSidebar = async (chatIds: string[]) => {
    const now = Timestamp.now();
    for (const chatId of chatIds) {
      try {
        await updateDoc(doc(db, 'briefings', chatId), { deletedAt: now });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `briefings/${chatId}`);
      }
    }

    if (currentChatId && chatIds.includes(currentChatId)) {
      setCurrentChatId(null);
    }
  };

  const handleRestoreChatFromSidebar = async (chatId: string) => {
    try {
      await updateDoc(doc(db, 'briefings', chatId), { deletedAt: null });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `briefings/${chatId}`);
    }
  };

  const handleSignOutFromSidebar = () => {
    setCurrentChatId(null);
    setMessages([]);
    setIsShowcaseView(false);
    setShowFullBriefing(false);
    navigate('/workspace');
    void signOut(auth);
  };

  const canShowComposerSlot = location.pathname !== '/archive'
    && location.pathname !== '/methodology'
    && location.pathname !== '/signin'
    && !isShowcaseView;

  return (
    <div className="flex h-screen bg-paper-dim text-ink font-sans overflow-hidden">
      <AppSidebar
        chats={chats}
        deletedChats={deletedChats}
        currentChatId={currentChatId}
        isOwner={isOwner}
        isSidebarOpen={isSidebarOpen}
        onCloseSidebar={() => setIsSidebarOpen(false)}
        onOpenChat={handleOpenChatFromSidebar}
        onNewChat={handleNewChatFromSidebar}
        onDeleteChats={handleDeleteChatsFromSidebar}
        onRestoreChat={handleRestoreChatFromSidebar}
        onSignOut={handleSignOutFromSidebar}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 h-screen relative">
        {/* Header */}
        <AppHeader
          pathname={location.pathname}
          currentChatId={currentChatId}
          isCurrentChatArchived={currentChat?.isArchived ?? false}
          isSidebarOpen={isSidebarOpen}
          isShowcaseView={isShowcaseView}
          isOwner={isOwner}
          hasMessages={messages.length > 0}
          messages={messages}
          chatTitle={currentChat?.title}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          onNavigate={handleHeaderNavigate}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          onGenerateBriefing={() => currentChatId && handleGenerateBriefing([currentChatId])}
          onSaveChat={() => currentChatId && handleSaveToPersonalArchive(currentChatId)}
        />

        {location.pathname === '/workspace' && messages.length > 0 && sourceDevelopmentTitle && (
          <div className="w-full border-b border-border bg-paper-dim no-print">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3">
              <ChatBreadcrumb
                developmentTitle={sourceDevelopmentTitle}
              />
            </div>
          </div>
        )}

        {/* Main Chat Area */}
        <main 
          ref={mainScrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto w-full no-print"
        >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 pb-32">
          {location.pathname === '/archive' ? (
            <ArchiveView
              chats={chats}
              onViewBriefingContent={async (chatId) => {
                try {
                  const messagesRef = collection(db, 'briefings', chatId, 'messages');
                  const messagesSnap = await getDocs(messagesRef);
                  if (!messagesSnap.empty) {
                    const msgDoc = messagesSnap.docs[0];
                    setGeneratedBriefingContent(msgDoc.data().content);
                    const chatData = chats.find(c => c.id === chatId);
                    setGeneratedBriefingTitle(chatData?.title || '');
                    setGeneratedBriefingCategory(chatData?.category || 'General');
                    setShowFullBriefing(true);
                  }
                } catch (error) {
                  console.error("Error fetching briefing content:", error);
                }
              }}
              onViewBriefingFromChat={async (briefingId) => {
                try {
                  const briefingDoc = await getDoc(doc(db, 'briefings', briefingId));
                  if (briefingDoc.exists()) {
                    const messagesRef = collection(db, 'briefings', briefingId, 'messages');
                    const messagesSnap = await getDocs(messagesRef);
                    if (!messagesSnap.empty) {
                      const msgDoc = messagesSnap.docs[0];
                      setGeneratedBriefingContent(msgDoc.data().content);
                      setGeneratedBriefingTitle(briefingDoc.data().title);
                      setGeneratedBriefingCategory(briefingDoc.data().category || 'General');
                      setShowFullBriefing(true);
                    }
                  }
                } catch (error) {
                  console.error("Error fetching briefing content:", error);
                }
              }}
              onOpenChat={(chatId) => {
                setCurrentChatId(chatId);
                setPendingScroll();
                navigate('/workspace');
              }}
              onRestoreChat={async (chatId) => {
                try {
                  await updateDoc(doc(db, 'briefings', chatId), {
                    isArchived: false,
                    status: 'ephemeral',
                    updatedAt: Timestamp.now()
                  });
                } catch (error) {
                  handleFirestoreError(error, OperationType.UPDATE, `briefings/${chatId}`);
                }
              }}
            />
          ) : location.pathname === '/methodology' ? (
            <MethodologyPage />
          ) : location.pathname === '/signin' ? (
            <SignInPage />
          ) : messages.length === 0 ? (
            currentChatId ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[50vh] text-center">
                <div className="w-16 h-16 rounded-full bg-wash flex items-center justify-center text-burgundy mb-6 animate-pulse">
                  <Scale size={32} />
                </div>
                <h2 className="font-serif text-2xl font-medium text-center mb-4 text-ink px-4">
                  Loading Archive...
                </h2>
              </div>
            ) : (
              <HomeView
                chats={chats}
                visibleTailoredItems={visibleTailoredItems}
                latestDevelopments={latestDevelopments}
                latestCount={latestCount}
                historicalDevelopments={historicalDevelopments}
                historicalCount={historicalCount}
                showHistoricalLedger={showHistoricalLedger}
                setShowHistoricalLedger={setShowHistoricalLedger}
                showcaseChats={showcaseChats}
                isRefreshing={isRefreshing}
                isDeveloper={isOwner}
                lastUpdatedRaw={lastUpdatedRaw}
                formatLastUpdated={formatLastUpdated}
                onConsolidation={() => {
                  setSelectedChatsForConsolidation(chats.filter(c => !c.isArchived).map(c => c.id));
                  setShowConsolidationConfig(true);
                }}
                onTailoredClick={(dev) => {
                  if (!isOwner) return;
                  if (dev.isChatDerived) {
                    setCurrentChatId(dev.id);
                    setPendingScroll();
                    navigate('/workspace');
                  } else {
                    setInput(dev.query);
                    handleSuggestedSubmit(dev.query);
                  }
                }}
                onDismissTailored={handleDismissTailored}
                onDevelopmentClick={(development) => {
                  if (!isOwner) return;
                  setInput(development.query);
                  handleSuggestedSubmit(development.query, development.id);
                }}
                onDismissDevelopment={handleDismissDevelopment}
                onDownloadDigest={() => handleDownloadDailyDigest(visibleLatestDevelopments)}
                onRefresh={refreshIntelligence}
                onShowRefreshExplainer={() => setShowRefreshExplainer(true)}
                onShowcaseClick={(chatId) => {
                  setCurrentChatId(chatId);
                  setPendingScroll();
                  setIsShowcaseView(true);
                }}
              />
            )
          ) : (
            <ChatView
              messages={messages}
              isShowcaseView={isShowcaseView}
              isLoading={isLoading}
              chatLoadingMessage={chatLoadingMessage}
              isStreaming={isStreaming}
              relatedDevelopments={relatedDevelopments}
              relatedDevelopmentsLoading={relatedDevelopmentsLoading}
              relatedDevelopmentsLoadingMessage={relatedDevelopmentsLoadingMessage}
              relatedDevelopmentsSweepError={relatedDevelopmentsSweepError}
              canRefreshRelatedDevelopments={isOwner}
              onRefreshRelatedDevelopments={onRefreshRelatedDevelopments}
              messagesEndRef={messagesEndRef}
              onRelatedClick={(q) => { setInput(q); handleSuggestedSubmit(q); }}
              onRetry={!isShowcaseView ? handleRetry : undefined}
            />
          )}
        </div>
      </main>

      {/* Scroll Controls */}
      {(showScrollTopButton || showScrollButton) && messages.length > 0 && (
        <div className="flex justify-center gap-2 pb-2 no-print">
          {showScrollTopButton && (
            <button
              onClick={() => scrollToTop(true)}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: '#8B2C2C',
                color: '#FFFFFF',
                border: 'none',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 0.9,
                transition: 'opacity 200ms'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.9'; }}
              aria-label="Scroll to top"
            >
              <ChevronUp size={20} />
            </button>
          )}
          {showScrollButton && (
            <button
              onClick={() => scrollToBottom(true)}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: '#8B2C2C',
                color: '#FFFFFF',
                border: 'none',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 0.9,
                transition: 'opacity 200ms'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.9'; }}
              aria-label="Scroll to bottom"
            >
              <ChevronDown size={20} />
            </button>
          )}
        </div>
      )}

      {/* Input Area */}
      {canShowComposerSlot && isOwner && (
        <ResearchInputDock
          input={input}
          setInput={setInput}
          hasMessages={messages.length > 0}
          suggestedEnquiries={allSuggestedEnquiries}
          isCurrentChatAuthorised={currentChat?.status === 'authorised'}
          isLoading={isLoading}
          isStreaming={isStreaming}
          onSubmitEnquiry={(enquiry) => handleSuggestedSubmit(enquiry)}
          onOpenTermsDisclaimer={() => setIsTermsModalOpen(true)}
        />
      )}

      {canShowComposerSlot && !isOwner && (
        <div className="bg-transparent pb-10 flex flex-col items-center no-print">
          <div className="max-w-4xl w-full mx-auto bg-surface-input rounded-sm border border-border shadow-sm p-6 text-center">
            <p className="text-sm text-ink leading-relaxed mb-5">
              On this site, AI features are reserved for the developer to manage API costs. If you would like to run your own instance of The Arbitration Briefings with your own API key, the source code is freely available on GitHub.
            </p>
            <a
              href="https://github.com/lex-arbitri-suite/the-arbitration-briefings"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-3 bg-burgundy text-white rounded-sm text-xs font-bold uppercase tracking-widest hover:bg-burgundy-deep transition-colors"
            >
              <Github size={16} />
              <span>View on GitHub →</span>
            </a>
          </div>
        </div>
      )}
      
      {showFullBriefing && (
        <BriefingOverlay
          isGenerating={isGeneratingBriefing}
          content={generatedBriefingContent}
          title={generatedBriefingTitle}
          category={generatedBriefingCategory}
          onClose={() => {
            setShowFullBriefing(false);
            navigate('/archive');
            window.scrollTo(0, 0);
          }}
          onSaveBriefing={handleSaveBriefing}
        />
      )}

      {/* Briefing Synthesis Modal */}
      <AnimatePresence>
        {showConsolidationConfig && (
          <ConsolidationModal
            chats={chats}
            selectedChatIds={selectedChatsForConsolidation}
            onSelectionChange={setSelectedChatsForConsolidation}
            onClose={() => setShowConsolidationConfig(false)}
            onCompile={handleGenerateBriefing}
          />
        )}
      </AnimatePresence>
      <AppOverlays
        archiveSuccess={archiveSuccess}
        refreshError={refreshError}
        onDismissRefreshError={() => setRefreshError(null)}
        refreshSuccess={refreshSuccess}
        onDismissRefreshSuccess={() => setRefreshSuccess(null)}
        undoToast={undoToast}
        onUndoDismiss={handleUndoDismiss}
        showRefreshExplainer={showRefreshExplainer}
        onCloseRefreshExplainer={() => setShowRefreshExplainer(false)}
        isTermsModalOpen={isTermsModalOpen}
        onCloseTermsModal={() => setIsTermsModalOpen(false)}
        isOnboardingVisible={!hasAcknowledged}
        onAcknowledgeOnboarding={() => {
          setHasAcknowledged(true);
          localStorage.setItem('arbitration_briefings_acknowledged', 'true');
        }}
      />

      {/* Mobile Navigation Drawer */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-[100] bg-white animate-in slide-in-from-right duration-300">
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-burgundy flex items-center justify-center text-white">
                  <Scale size={16} />
                </div>
                <span className="font-serif text-lg font-semibold">Menu</span>
              </div>
              <button 
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 text-muted hover:text-ink transition-colors"
                aria-label="Close Menu"
              >
                <X size={24} />
              </button>
            </div>
            <nav className="flex flex-col p-6 gap-8">
              <button 
                className={`text-xl font-medium text-left transition-colors flex items-center justify-between group ${location.pathname === '/workspace' && !currentChatId ? 'text-burgundy' : 'text-ink hover:text-burgundy'}`}
                onClick={() => { navigate('/workspace'); setCurrentChatId(null); setShowFullBriefing(false); setIsMobileMenuOpen(false); }}
              >
                <span>Home</span>
                <div className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${location.pathname === '/workspace' && !currentChatId ? 'border-burgundy' : 'border-border group-hover:border-burgundy'}`}>
                  <Plus size={16} className={location.pathname === '/workspace' && !currentChatId ? 'text-burgundy' : 'text-muted group-hover:text-burgundy'} />
                </div>
              </button>

              <button 
                className={`text-xl font-medium text-left transition-colors flex items-center justify-between group ${location.pathname === '/archive' ? 'text-burgundy' : 'text-ink hover:text-burgundy'}`}
                onClick={() => { navigate('/archive'); setShowFullBriefing(false); setIsMobileMenuOpen(false); }}
              >
                <span>Archive</span>
                <div className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${location.pathname === '/archive' ? 'border-burgundy' : 'border-border group-hover:border-burgundy'}`}>
                  <Plus size={16} className={location.pathname === '/archive' ? 'text-burgundy' : 'text-muted group-hover:text-burgundy'} />
                </div>
              </button>

              <button 
                className={`text-xl font-medium text-left transition-colors flex items-center justify-between group ${location.pathname === '/methodology' ? 'text-burgundy' : 'text-ink hover:text-burgundy'}`}
                onClick={() => { navigate('/methodology'); setShowFullBriefing(false); setIsMobileMenuOpen(false); }}
              >
                <span>Methodology</span>
                <div className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${location.pathname === '/methodology' ? 'border-burgundy' : 'border-border group-hover:border-burgundy'}`}>
                  <Plus size={16} className={location.pathname === '/methodology' ? 'text-burgundy' : 'text-muted group-hover:text-burgundy'} />
                </div>
              </button>

              <a 
                href="https://github.com/lex-arbitri-suite/the-arbitration-briefings"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xl font-medium text-ink hover:text-burgundy transition-colors flex items-center justify-between group"
              >
                <span>View Source</span>
                <div className="w-8 h-8 rounded-full border border-border flex items-center justify-center group-hover:border-burgundy transition-colors">
                  <Github size={16} className="text-muted group-hover:text-burgundy" />
                </div>
              </a>
            </nav>
            
            <div className="mt-auto p-6 border-t border-border bg-[#f9f9f9]">
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3 text-xs text-muted uppercase tracking-widest font-bold">
                  <BookOpen size={14} />
                  <span>Open-Access Sources Only</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted uppercase tracking-widest font-bold">
                  <Clock size={14} />
                  <span>Verifiable Foundations</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
