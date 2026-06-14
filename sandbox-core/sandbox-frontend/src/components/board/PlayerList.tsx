'use client';

import { motion } from 'framer-motion';
import { formatNav, tierName } from '@/lib/utils';
import type { LeaderboardEntry } from '@/lib/api';

interface PlayerListProps {
  entries: LeaderboardEntry[];
  currentPlayerId?: string;
}

const TIER_ICONS = ['', '✦', '✦✦', '✦✦✦', '♛'];

export function PlayerList({ entries, currentPlayerId }: PlayerListProps) {
  return (
    <div>
      <p className="text-xs text-[var(--color-gray-500)] uppercase tracking-widest mb-3">
        Rankings
      </p>
      <div className="space-y-1.5">
        {entries.map((entry, i) => {
          const isYou = entry.player_id === currentPlayerId;
          return (
            <motion.div
              key={entry.player_id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                isYou
                  ? 'bg-white border-l-2 border-[var(--color-blue)] shadow-sm'
                  : 'bg-[var(--color-gray-100)]'
              }`}
            >
              <span className="font-display text-base font-bold text-[var(--color-gray-400)] w-5 text-center shrink-0">
                {entry.rank}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`font-body text-xs font-semibold truncate ${isYou ? 'text-[var(--color-blue)]' : 'text-[var(--color-navy)]'}`}>
                    {entry.display_name}
                    {isYou && <span className="ml-1 text-[var(--color-gray-400)] font-normal">(you)</span>}
                  </span>
                  {entry.is_bot && (
                    <span className="text-xs bg-[var(--color-gray-200)] text-[var(--color-gray-500)] px-1 rounded">Bot</span>
                  )}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-xs text-[var(--color-warning)]">
                    {TIER_ICONS[entry.investor_tier] || ''}
                  </span>
                  <span className="text-xs text-[var(--color-gray-500)]">{entry.investor_tier_name}</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="font-financial text-sm font-semibold text-[var(--color-navy)]">
                  {formatNav(entry.nav)}
                </p>
                {entry.nav_delta != null && entry.nav_delta !== 0 && (
                  <p className={`text-xs font-financial ${entry.nav_delta > 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
                    {entry.nav_delta > 0 ? '+' : ''}{formatNav(entry.nav_delta)}
                  </p>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
