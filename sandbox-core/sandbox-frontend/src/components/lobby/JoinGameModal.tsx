'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { createApiClient } from '@/lib/api';
import { useGameStore } from '@/store/gameStore';

interface JoinGameModalProps {
  onClose: () => void;
}

export function JoinGameModal({ onClose }: JoinGameModalProps) {
  const { getToken } = useAuth();
  const api = createApiClient(getToken);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { setCurrentPlayer, setCurrentGame } = useGameStore();

  const [inviteCode, setInviteCode] = useState('');
  const [displayName, setDisplayName] = useState('');

  const joinMutation = useMutation({
    mutationFn: async () => {
      // The join endpoint requires the game_id. We need to find it from the invite code.
      // For now we search open games for matching invite code.
      const games = await api.getGames();
      const game = games.find((g) => g.invite_code === inviteCode.trim().toUpperCase());
      if (!game) throw new Error('Game not found. Check your invite code.');
      return api.joinGame(game.id, inviteCode.trim(), displayName);
    },
    onSuccess: (player, _variables) => {
      queryClient.invalidateQueries({ queryKey: ['lobby-games'] });
      setCurrentPlayer((player as any).id ?? '');
      // We need the game id — stored separately
      const gameId = (player as any).game_id;
      if (gameId) {
        setCurrentGame(gameId);
        router.push(`/game/${gameId}`);
      }
    },
  });

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="bg-white rounded-2xl w-full max-w-sm p-6"
          style={{ boxShadow: 'var(--shadow-modal)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-display text-lg font-semibold text-[var(--color-navy)]">Join Game</h2>
            <button onClick={onClose} className="text-[var(--color-gray-400)] hover:text-[var(--color-navy)] text-2xl">×</button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs text-[var(--color-gray-500)] mb-1.5 block font-semibold uppercase tracking-wide">Invite code</label>
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="XXXXXX"
                className="w-full rounded-lg border border-[var(--color-gray-200)] px-4 py-3 font-mono text-lg text-center tracking-widest text-[var(--color-navy)] focus:outline-none focus:border-[var(--color-blue)]"
                maxLength={10}
              />
            </div>
            <div>
              <label className="text-xs text-[var(--color-gray-500)] mb-1.5 block font-semibold uppercase tracking-wide">Your display name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Alice"
                maxLength={40}
                className="w-full rounded-lg border border-[var(--color-gray-200)] px-4 py-3 text-[var(--color-navy)] focus:outline-none focus:border-[var(--color-blue)]"
              />
            </div>

            <button
              onClick={() => joinMutation.mutate()}
              disabled={!inviteCode.trim() || !displayName.trim() || joinMutation.isPending}
              className="w-full py-3.5 rounded-xl bg-[var(--color-red)] text-white font-semibold disabled:opacity-40 hover:opacity-90"
            >
              {joinMutation.isPending ? 'Joining…' : 'Join Game'}
            </button>
            {joinMutation.isError && (
              <p className="text-xs text-[var(--color-negative)] text-center">
                {(joinMutation.error as Error).message}
              </p>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
