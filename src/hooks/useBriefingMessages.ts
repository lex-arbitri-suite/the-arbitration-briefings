import { useEffect, useState } from 'react';
import { collection, db, handleFirestoreError, onSnapshot, OperationType, orderBy, query } from '../firebase';
import { Message } from '../types';

/** Subscribes to the messages subcollection of the active briefing document and provides real-time message updates. */
export function useBriefingMessages(currentChatId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!currentChatId) {
      setMessages([]);
      setIsLoading(false);
      return;
    }

    const q = query(
      collection(db, 'briefings', currentChatId, 'messages'),
      orderBy('timestamp', 'asc')
    );

    setIsLoading(true);
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedMessages = snapshot.docs.map((doc) => ({
          ...doc.data(),
          id: doc.id
        })) as Message[];
        setMessages(fetchedMessages);
        setIsLoading(false);
      },
      (error) => {
        setIsLoading(false);
        handleFirestoreError(error, OperationType.LIST, `briefings/${currentChatId}/messages`);
      }
    );

    return () => unsubscribe();
  }, [currentChatId]);

  return { messages, setMessages, isLoading };
}
