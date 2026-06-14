'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';
import { createApiClient, type Game } from '@/lib/api';

export function useGame(gameId: string) {
  const { getToken } = useAuth();
  const api = createApiClient(getToken);

  return useQuery<Game>({
    queryKey: ['game', gameId],
    queryFn: () => api.getGame(gameId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'trading' || status === 'lobby' ? 5000 : false;
    },
    enabled: Boolean(gameId),
  });
}
