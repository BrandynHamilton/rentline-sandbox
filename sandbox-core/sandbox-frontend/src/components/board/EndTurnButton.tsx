'use client';

import { motion } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';
import { createApiClient } from '@/lib/api';
import type { Player } from '@/lib/api';

interface EndTurnButtonProps {
  gameId: string;
  players: Player[];
  currentPlayerId: string;
  isHost: boolean;
  gameStatus: string;
}

export function EndTurnButton({ gameId, players, currentPlayerId, isHost, gameStatus }: EndTurnButtonProps) {
  const { getToken } = useAuth();
  const api = createApiClient(getToken);
  const queryClient = useQueryClient();

  const currentPlayer = players.find((p) => p.id === currentPlayerId);
  const humanPlayers = players.filter((p) => !p.is_bot);
  const notReady = humanPlayers.filter((p) => !p.is_ready && p.id !== currentPlayerId);
  const alreadyReady = currentPlayer?.is_ready ?? false;

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['game', gameId] });
    queryClient.invalidateQueries({ queryKey: ['feed', gameId] });
    queryClient.invalidateQueries({ queryKey: ['leaderboard', gameId] });
    queryClient.invalidateQueries({ queryKey: ['portfolio', gameId] });
  }

  const readyMutation = useMutation({
    mutationFn: () => api.markReady(gameId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['game', gameId] }),
  });

  const advanceMutation = useMutation({
    mutationFn: () => api.advanceTurn(gameId),
    onSuccess: invalidateAll,
  });

  const autoMutation = useMutation({
    mutationFn: () => api.startAutonomous(gameId, 30),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['game', gameId] }),
  });

  // ── Lobby: host can start the game by advancing turn 0 ───────────────────
  if (gameStatus === 'lobby') {
    if (!isHost) {
      return (
        <div className="w-full py-3 rounded-xl bg-[var(--color-gray-100)] border border-[var(--color-gray-200)] text-center text-sm text-[var(--color-gray-500)]">
          Waiting for host to start…
        </div>
      );
    }
    return (
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => advanceMutation.mutate()}
        disabled={advanceMutation.isPending}
        className="w-full py-3.5 rounded-xl bg-[var(--color-red)] text-white font-semibold text-sm disabled:opacity-50 hover:opacity-90 transition-opacity"
      >
        {advanceMutation.isPending ? 'Starting…' : '▶ Start Game'}
      </motion.button>
    );
  }

  if (gameStatus === 'advancing') {
    return (
      <div className="w-full py-3 rounded-xl bg-[var(--color-gray-200)] text-center text-sm text-[var(--color-gray-500)]">
        Processing turn…
      </div>
    );
  }

  if (gameStatus === 'completed') {
    return (
      <div className="w-full py-3 rounded-xl bg-[var(--color-gray-200)] text-center text-sm text-[var(--color-gray-500)]">
        Game over
      </div>
    );
  }

  // ── Trading ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-2">
      {!alreadyReady ? (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => readyMutation.mutate()}
          disabled={readyMutation.isPending}
          className="w-full py-3.5 rounded-xl bg-[var(--color-red)] text-white font-semibold text-sm disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {readyMutation.isPending ? 'Marking ready…' : 'End Turn'}
        </motion.button>
      ) : (
        <div className="w-full py-3 rounded-xl bg-[var(--color-gray-100)] border border-[var(--color-gray-200)] text-center">
          <p className="text-sm text-[var(--color-positive)] font-semibold">✓ Ready</p>
          {notReady.length > 0 && (
            <p className="text-xs text-[var(--color-gray-500)] mt-0.5">
              Waiting for: {notReady.map((p) => p.display_name).join(', ')}
            </p>
          )}
        </div>
      )}

      {isHost && (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => advanceMutation.mutate()}
            disabled={advanceMutation.isPending}
            className="py-2 rounded-lg border border-[var(--color-gray-300)] text-xs text-[var(--color-gray-500)] hover:text-[var(--color-navy)] hover:border-[var(--color-navy)] transition-colors"
          >
            {advanceMutation.isPending ? '…' : 'Force advance'}
          </button>
          <button
            onClick={() => autoMutation.mutate()}
            disabled={autoMutation.isPending || autoMutation.isSuccess}
            className="py-2 rounded-lg border border-[var(--color-blue)]/40 text-xs text-[var(--color-blue)] hover:bg-[var(--color-blue)]/5 transition-colors disabled:opacity-40"
          >
            {autoMutation.isSuccess ? '✓ Auto on' : autoMutation.isPending ? '…' : '⚡ Auto-advance'}
          </button>
        </div>
      )}
    </div>
  );
}
