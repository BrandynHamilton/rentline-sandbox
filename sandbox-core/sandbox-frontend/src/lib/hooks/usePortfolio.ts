'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';
import { createApiClient, type Portfolio } from '@/lib/api';

export function usePortfolio(gameId: string, playerId: string) {
  const { getToken } = useAuth();
  const api = createApiClient(getToken);

  return useQuery<Portfolio>({
    queryKey: ['portfolio', gameId, playerId],
    queryFn: () => api.getPortfolio(gameId, playerId),
    refetchInterval: 5000,
    enabled: Boolean(gameId) && Boolean(playerId),
  });
}
