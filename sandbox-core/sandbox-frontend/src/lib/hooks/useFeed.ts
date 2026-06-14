'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';
import { createApiClient, type FeedEvent } from '@/lib/api';

export function useFeed(gameId: string, sinceTurn?: number) {
  const { getToken } = useAuth();
  const api = createApiClient(getToken);

  return useQuery<FeedEvent[]>({
    queryKey: ['feed', gameId, sinceTurn],
    queryFn: () => api.getFeed(gameId, sinceTurn),
    refetchInterval: 5000,
    enabled: Boolean(gameId),
    select: (data) => [...data].reverse(), // newest first
  });
}
