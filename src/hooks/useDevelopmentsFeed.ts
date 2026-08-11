import { useEffect, useState } from 'react';
import { formatLastUpdated } from '../utils/formatLastUpdated';
import { Development } from '../types';
import { db, collection, onSnapshot, orderBy, query, Timestamp, where, handleFirestoreError, OperationType } from '../firebase';

/** Subscribes to the developments collection and partitions entries into visible (active feed) and historical (dismissed or overflow) sets. */
export function useDevelopmentsFeed() {
  const [allDevelopments, setAllDevelopments] = useState<Development[]>([]);
  const [nonDismissedDevelopments, setNonDismissedDevelopments] = useState<Development[]>([]);
  const [historicalDevelopments, setHistoricalDevelopments] = useState<Development[]>([]);
  const [dismissedDevelopmentIds, setDismissedDevelopmentIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('arbitration_dismissed_devs');
    return saved ? JSON.parse(saved) : [];
  });
  const [lastUpdated, setLastUpdated] = useState<string | null>(() => {
    return localStorage.getItem('arbitration_last_updated');
  });
  const [lastUpdatedRaw, setLastUpdatedRaw] = useState<number>(() => {
    const saved = localStorage.getItem('arbitration_last_updated_raw');
    return saved ? parseInt(saved) : 0;
  });

  useEffect(() => {
    const thirtyDaysAgoDate = new Date();
    thirtyDaysAgoDate.setDate(thirtyDaysAgoDate.getDate() - 30);
    const thirtyDaysAgoTimestamp = Timestamp.fromDate(thirtyDaysAgoDate);

    const q = query(
      collection(db, 'developments'),
      where('lastRefreshedAt', '>=', thirtyDaysAgoTimestamp),
      orderBy('lastRefreshedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const devs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Development[];

      if (devs.length === 0) {
        // Clean empty state — no synthetic seed data
        setAllDevelopments([]);
        setNonDismissedDevelopments([]);
        setHistoricalDevelopments([]);
        return;
      }

      // Already sorted by createdAt desc from the Firestore query.
      // Dismissed items go to historical; the rest form a rolling window.
      const ACTIVE_LIMIT = 12;
      const active: Development[] = [];
      const historical: Development[] = [];

      devs.forEach(dev => {
        const isDismissed = dismissedDevelopmentIds.includes(dev.id);

        if (isDismissed) {
          historical.push(dev);
        } else if (active.length < ACTIVE_LIMIT) {
          active.push(dev);
        } else {
          // Overflow beyond the rolling window goes to historical
          historical.push(dev);
        }
      });

      const nonDismissedOrdered = devs.filter(
        (dev) => !dismissedDevelopmentIds.includes(dev.id)
      );

      setAllDevelopments(active);
      setNonDismissedDevelopments(nonDismissedOrdered);
      setHistoricalDevelopments(historical);

      if (devs.length > 0 && devs[0].lastRefreshedAt) {
        const timestamp = (devs[0].lastRefreshedAt as Timestamp).toMillis();
        const formatted = formatLastUpdated(timestamp);
        setLastUpdated(formatted);
        setLastUpdatedRaw(timestamp);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'developments');
    });

    return () => unsubscribe();
  }, [dismissedDevelopmentIds]);

  const visibleLatestDevelopments = allDevelopments.slice(0, 6);

  return {
    visibleLatestDevelopments,
    historicalDevelopments,
    nonDismissedDevelopments,
    allDevelopments,
    lastUpdated,
    lastUpdatedRaw,
    dismissedDevelopmentIds,
    setDismissedDevelopmentIds,
    setLastUpdated,
    setLastUpdatedRaw
  };
}
