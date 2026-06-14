'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';
import { createApiClient, type LeaderboardEntry } from '@/lib/api';

export function useLeaderboard(gameId: string) {
  const { getToken } = useAuth();
  const api = createApiClient(getToken);

  return useQuery<LeaderboardEntry[]>({
    queryKey: ['leaderboard', gameId],
    queryFn: () => api.getLeaderboard(gameId),
    refetchInterval: 5000,
    enabled: Boolean(gameId),
  });
}

export function useGlobalLeaderboard(limit = 10) {
  const { getToken } = useAuth();
  const api = createApiClient(getToken);

  return useQuery<LeaderboardEntry[]>({
    queryKey: ['global-leaderboard', limit],
    queryFn: () => api.getGlobalLeaderboard(limit),
    refetchInterval: 30000,
  });
}
