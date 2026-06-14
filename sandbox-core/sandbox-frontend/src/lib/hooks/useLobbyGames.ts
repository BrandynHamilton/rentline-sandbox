'use client';

import { useQuery } from '@tanstack/react-query';
import { createApiClient, type Game } from '@/lib/api';

export function useLobbyGames() {
  const api = createApiClient(async () => null);

  return useQuery<Game[]>({
    queryKey: ['lobby-games'],
    queryFn: () => api.getGames(),
    refetchInterval: 10000,
  });
}
