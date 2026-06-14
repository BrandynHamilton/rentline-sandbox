'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';
import { createApiClient, type DebtSummary } from '@/lib/api';

export function useDebt(gameId: string, playerId: string) {
  const { getToken } = useAuth();
  const api = createApiClient(getToken);

  return useQuery<DebtSummary>({
    queryKey: ['debt', gameId, playerId],
    queryFn: () => api.getDebt(gameId, playerId),
    refetchInterval: 5000,
    enabled: Boolean(gameId) && Boolean(playerId),
  });
}
