/**
 * Subscribes to showcase conversations from the `briefings` collection for
 * display in the "See It in Action" section on the home view.
 */

import { useEffect, useState } from 'react';
import {
  db,
  onSnapshot,
  collection,
  query,
  where,
  orderBy,
  Timestamp,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import type { ChatSession } from '../types';

export function useShowcaseChats(): { showcaseChats: ChatSession[] } {
  const [showcaseChats, setShowcaseChats] = useState<ChatSession[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, 'briefings'),
      where('isShowcase', '==', true),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedShowcase = snapshot.docs.map((doc) => {
          const data = doc.data();
          const updatedAt = data.updatedAt instanceof Timestamp
            ? data.updatedAt.toMillis()
            : typeof data.updatedAt === 'number' ? data.updatedAt : 0;
          return { ...data, id: doc.id, updatedAt };
        }) as ChatSession[];
        setShowcaseChats(fetchedShowcase);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'briefings');
      }
    );

    return () => unsubscribe();
  }, []);

  return { showcaseChats };
}
