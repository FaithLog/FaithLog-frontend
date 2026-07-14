import {useCallback, useEffect, useState} from 'react';

export const DEFAULT_PROGRESSIVE_ITEM_BATCH = 24;

export function getProgressiveItems<T>(items: readonly T[], limit: number): T[] {
  return items.slice(0, Math.max(0, limit));
}

export function getNextProgressiveItemLimit(
  currentLimit: number,
  total: number,
  batchSize = DEFAULT_PROGRESSIVE_ITEM_BATCH,
) {
  return Math.min(total, Math.max(0, currentLimit) + Math.max(1, batchSize));
}

export function useProgressiveRendering(
  total: number,
  identity: string,
  batchSize = DEFAULT_PROGRESSIVE_ITEM_BATCH,
) {
  const [progress, setProgress] = useState({identity, limit: batchSize});
  const limit = progress.identity === identity ? progress.limit : batchSize;

  useEffect(() => {
    setProgress((current) => current.identity === identity
      ? current
      : {identity, limit: batchSize});
  }, [batchSize, identity]);

  const showMore = useCallback(() => {
    setProgress((current) => ({
      identity,
      limit: getNextProgressiveItemLimit(
        current.identity === identity ? current.limit : batchSize,
        total,
        batchSize,
      ),
    }));
  }, [batchSize, identity, total]);

  return {hasMore: limit < total, limit, showMore};
}
