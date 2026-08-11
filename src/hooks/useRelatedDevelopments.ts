import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { deleteField } from 'firebase/firestore';
import { db, doc, getDoc, handleFirestoreError, OperationType, updateDoc } from '../firebase';
import { APPROVED_SOURCES } from '../utils/approvedSources';
import { generateJSON, mapAIErrorToUserMessage } from '../utils/aiProvider';
import { getRelatedDevelopmentsPrompt } from '../prompts/relatedDevelopments';
import { Message, RelatedDevelopment } from '../types';

interface UseRelatedDevelopmentsParams {
  chatId: string | null;
  canWrite: boolean;
  messages: Message[];
  sourceDevelopmentTitle?: string;
  sourceDevelopmentCategory?: string;
  firstUserMessage?: string;
}

interface BriefingRelatedDevelopmentsData {
  relatedDevelopments?: RelatedDevelopment[];
  relatedDevelopmentsLoaded?: boolean;
}

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

const APPROVED_DOMAINS: Set<string> = (() => {
  const domains = new Set<string>();

  for (const source of APPROVED_SOURCES) {
    const domain = extractDomain(source.url);
    if (domain) domains.add(domain);
  }

  return domains;
})();

function isDomainApproved(url: string): boolean {
  const domain = extractDomain(url);
  if (!domain) return false;

  const parts = domain.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join('.');
    if (APPROVED_DOMAINS.has(candidate)) return true;
  }

  return false;
}

function normalizeRelatedDevelopment(raw: unknown): RelatedDevelopment {
  const candidate = (raw ?? {}) as Record<string, unknown>;
  const sourceUrl = typeof candidate.sourceUrl === 'string' ? candidate.sourceUrl.trim() : '';

  return {
    title: typeof candidate.title === 'string' ? candidate.title.trim() : '',
    query: typeof candidate.query === 'string' ? candidate.query.trim() : '',
    summary: typeof candidate.summary === 'string' ? candidate.summary.trim() : '',
    date: typeof candidate.date === 'string' ? candidate.date.trim() : '',
    category: typeof candidate.category === 'string' ? candidate.category.trim() : '',
    sourceUrl,
  };
}

function parseRelatedDevelopments(items: unknown[]): RelatedDevelopment[] {
  return items.map((item) => normalizeRelatedDevelopment(item)).filter(
    item => item.title && item.summary && item.date && item.category
  );
}

// The server-side generateRelatedDevelopments callable is now the
// authoritative liveness and structural validation layer. This function
// is a display-only safeguard: it blanks any URL whose domain was not on
// the approved list at the time of the fetch (e.g. a stale Firestore
// record written before a domain was removed from the registry). It does
// not re-probe liveness; the server already did that.
function verifyRelatedDevelopmentUrls(items: RelatedDevelopment[]): RelatedDevelopment[] {
  return items.map((item) => {
    const rawUrl = item.sourceUrl.trim();
    const sourceUrl = rawUrl && isDomainApproved(rawUrl) ? rawUrl : '';

    return {
      ...item,
      sourceUrl
    };
  });
}

export function useRelatedDevelopments({
  chatId,
  canWrite,
  messages,
  sourceDevelopmentTitle,
  sourceDevelopmentCategory,
  firstUserMessage
}: UseRelatedDevelopmentsParams): {
  relatedDevelopments: RelatedDevelopment[];
  isLoading: boolean;
  loadingMessage: string;
  sweepError: string | null;
  refresh: () => Promise<void>;
} {
  const [relatedDevelopments, setRelatedDevelopments] = useState<RelatedDevelopment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sweepError, setSweepError] = useState<string | null>(null);
  const [loadedState, setLoadedState] = useState<boolean | undefined>(undefined);
  const [isInitialised, setIsInitialised] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [relatedLoadingPhrase, setRelatedLoadingPhrase] = useState(
    'Finding related developments...'
  );

  const sweepInFlightRef = useRef(false);
  const requestedForTokenRef = useRef<number | null>(null);

  const topicContext = useMemo(() => {
    if (sourceDevelopmentTitle?.trim()) {
      if (sourceDevelopmentCategory?.trim()) {
        return `${sourceDevelopmentTitle.trim()} (${sourceDevelopmentCategory.trim()})`;
      }
      return sourceDevelopmentTitle.trim();
    }
    if (firstUserMessage?.trim()) {
      return firstUserMessage.trim();
    }
    return '';
  }, [firstUserMessage, sourceDevelopmentCategory, sourceDevelopmentTitle]);

  const hasAssistantMessage = useMemo(
    () => messages.some(message => message.role === 'assistant'),
    [messages]
  );

  useEffect(() => {
    if (!chatId) {
      setRelatedDevelopments([]);
      setLoadedState(undefined);
      setIsInitialised(false);
      setIsLoading(false);
      setSweepError(null);
      sweepInFlightRef.current = false;
      requestedForTokenRef.current = null;
      return;
    }

    let cancelled = false;

    const hydrateFromFirestore = async () => {
      try {
        const chatRef = doc(db, 'briefings', chatId);
        const snapshot = await getDoc(chatRef);

        if (cancelled) return;

        const data = (snapshot.exists() ? snapshot.data() : {}) as BriefingRelatedDevelopmentsData;
        const persistedLoaded = data.relatedDevelopmentsLoaded === true;
        const persistedItems = Array.isArray(data.relatedDevelopments) ? data.relatedDevelopments : [];

        if (persistedLoaded) {
          setRelatedDevelopments(persistedItems.map(normalizeRelatedDevelopment));
          setLoadedState(true);
          requestedForTokenRef.current = refreshToken;
        } else {
          setRelatedDevelopments([]);
          setLoadedState(undefined);
          requestedForTokenRef.current = null;
        }
      } catch (error) {
        if (!cancelled) {
          handleFirestoreError(error, OperationType.GET, `briefings/${chatId}`);
        }
      } finally {
        if (!cancelled) {
          setIsInitialised(true);
        }
      }
    };

    hydrateFromFirestore();

    return () => {
      cancelled = true;
    };
  }, [chatId, refreshToken]);

  useEffect(() => {
    if (!canWrite || !chatId || !isInitialised || loadedState === true || !hasAssistantMessage || !topicContext) {
      return;
    }

    if (sweepInFlightRef.current) return;
    if (requestedForTokenRef.current === refreshToken) return;

    let cancelled = false;
    sweepInFlightRef.current = true;
    requestedForTokenRef.current = refreshToken;
    setIsLoading(true);
    setRelatedLoadingPhrase('Finding related developments...');

    const runSweep = async () => {
      try {
        const currentDate = new Date().toISOString().slice(0, 10);
        const prompt = getRelatedDevelopmentsPrompt(topicContext, sourceDevelopmentCategory, currentDate);
        const response = await generateJSON(prompt, {
          onRetry: () => {
            setRelatedLoadingPhrase((prev) =>
              prev === 'Briefly retrying…' ? prev : 'Briefly retrying…'
            );
          },
        });
        if (cancelled) return;

        const results = parseRelatedDevelopments(response as unknown[]);
        const verifiedResults = verifyRelatedDevelopmentUrls(results);
        const chatRef = doc(db, 'briefings', chatId);

        await updateDoc(chatRef, {
          relatedDevelopments: verifiedResults,
          relatedDevelopmentsLoaded: true
        });

        if (cancelled) return;
        setRelatedDevelopments(verifiedResults);
        setLoadedState(true);
      } catch (error) {
        if (!cancelled) {
          console.error('Related developments sweep failed:', error);
          const userMessage = mapAIErrorToUserMessage(error);
          if (userMessage !== '') setSweepError(userMessage);
          requestedForTokenRef.current = null;
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
        sweepInFlightRef.current = false;
      }
    };

    runSweep();

    return () => {
      cancelled = true;
    };
  }, [
    chatId,
    canWrite,
    hasAssistantMessage,
    isInitialised,
    loadedState,
    refreshToken,
    sourceDevelopmentCategory,
    topicContext
  ]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!canWrite || !chatId) return;

    const chatRef = doc(db, 'briefings', chatId);
    requestedForTokenRef.current = null;

    try {
      await updateDoc(chatRef, {
        relatedDevelopmentsLoaded: deleteField()
      });
    } catch (error) {
      console.error('Failed to clear related developments cache flag:', error);
    }

    // The four state updates below MUST be issued after the await, not before.
    // React 18 batches setState within a single synchronous block, so issuing
    // these before `await updateDoc` would produce a re-render and effect
    // re-run BEFORE setRefreshToken runs, starting a sweep that is then
    // orphaned when setRefreshToken triggers a second re-run whose cleanup
    // sets cancelled=true on the in-flight sweep.
    setRelatedDevelopments([]);
    setLoadedState(undefined);
    setSweepError(null);
    setRefreshToken(token => token + 1);
  }, [canWrite, chatId]);

  return {
    relatedDevelopments,
    isLoading,
    loadingMessage: relatedLoadingPhrase,
    sweepError,
    refresh
  };
}
