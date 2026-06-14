'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';
import { createApiClient, type PlayerAction } from '@/lib/api';

export function usePlayerActions(gameId: string, playerId: string) {
  const { getToken } = useAuth();
  const api = createApiClient(getToken);

  return useQuery<PlayerAction[]>({
    queryKey: ['player-actions', gameId, playerId],
    queryFn: () => api.getPlayerActions(gameId, playerId),
    refetchInterval: 8000,
    enabled: Boolean(gameId) && Boolean(playerId),
  });
}
