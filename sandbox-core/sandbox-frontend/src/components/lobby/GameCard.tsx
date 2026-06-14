'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { formatNav } from '@/lib/utils';
import type { Game } from '@/lib/api';

interface GameCardProps {
  game: Game;
}

const PRESET_COLORS: Record<string, { bg: string; text: string }> = {
  quick:      { bg: '#84cc16', text: 'white' },
  standard:   { bg: 'var(--color-blue)', text: 'white' },
  leveraged:  { bg: 'var(--color-warning)', text: 'var(--color-navy)' },
  distressed: { bg: 'var(--color-negative)', text: 'white' },
  long_run:   { bg: 'var(--color-navy)', text: 'white' },
};

const STATUS_CONFIG: Record<string, { dot: string; label: string; bg: string; color: string }> = {
  lobby:      { dot: 'bg-amber-400',   label: 'Open to join',  bg: 'rgba(251,191,36,0.12)',  color: '#d97706' },
  trading:    { dot: 'bg-green-400',   label: 'In progress',   bg: 'rgba(34,197,94,0.12)',   color: 'var(--color-positive)' },
  advancing:  { dot: 'bg-blue-400',    label: 'Advancing…',   bg: 'rgba(59,130,246,0.12)',  color: '#3b82f6' },
  completed:  { dot: 'bg-gray-400',    label: 'Completed',     bg: 'rgba(156,163,175,0.12)', color: 'var(--color-gray-500)' },
};

const MAX_SLOTS = 8;

export function GameCard({ game }: GameCardProps) {
  const router = useRouter();
  const players = game.players ?? [];
  const isAllBots = players.length > 0 && players.every((p) => p.is_bot);
  const humanCount = players.filter((p) => !p.is_bot).length;
  const totalSlots = players.length || (game.player_count ?? 0);
  const preset = game.preset ? PRESET_COLORS[game.preset] : null;
  const status = STATUS_CONFIG[game.status] ?? STATUS_CONFIG.lobby;
  const turnPct = game.max_turns > 0 ? (game.current_turn / game.max_turns) * 100 : 0;

  return (
    <motion.div
      whileHover={{ y: -4, boxShadow: '0 12px 32px rgba(29,30,44,0.14)' }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      className="rounded-2xl bg-white overflow-hidden cursor-pointer flex flex-col"
      style={{ border: '1px solid var(--color-gray-200)', boxShadow: 'var(--shadow-card)' }}
      onClick={() => router.push(`/game/${game.id}`)}
    >
      {/* Top: status bar + preset badge */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <div className="flex items-center gap-1.5">
          <motion.div
            animate={game.status === 'trading' ? { opacity: [1, 0.4, 1] } : {}}
            transition={{ repeat: Infinity, duration: 1.6 }}
            className={`w-2 h-2 rounded-full ${status.dot}`}
          />
          <span className="text-xs font-semibold" style={{ color: status.color }}>
            {status.label}
          </span>
        </div>
        {preset && game.preset && (
          <span
            className="text-xs font-bold px-2.5 py-1 rounded-full capitalize"
            style={{ backgroundColor: preset.bg, color: preset.text }}
          >
            {game.preset}
          </span>
        )}
      </div>

      {/* Game name + bot names */}
      <div className="px-4 pb-3">
        {isAllBots && (
          <p className="text-xs mb-0.5" style={{ color: 'var(--color-gray-400)' }}>🤖 AI match</p>
        )}
        <p className="font-body font-bold text-base leading-tight truncate" style={{ color: 'var(--color-navy)' }}>
          {game.name}
        </p>
        {players.filter(p => p.is_bot).length > 0 && (
          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-gray-400)' }}>
            {players.filter(p => p.is_bot).slice(0, 3).map(p => p.display_name).join(' · ')}
            {players.filter(p => p.is_bot).length > 3 && ` +${players.filter(p => p.is_bot).length - 3}`}
          </p>
        )}
      </div>

      {/* Turn progress bar */}
      {game.current_turn > 0 && (
        <div className="mx-4 mb-3">
          <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--color-gray-400)' }}>
            <span>Turn {game.current_turn}</span>
            <span>{game.max_turns} turns</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-gray-200)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${turnPct}%`, backgroundColor: game.status === 'completed' ? 'var(--color-gray-400)' : 'var(--color-blue)' }}
            />
          </div>
        </div>
      )}
      {game.current_turn === 0 && (
        <div className="px-4 mb-3">
          <p className="text-xs" style={{ color: 'var(--color-gray-400)' }}>
            {game.max_turns} turn game · Not started
          </p>
        </div>
      )}

      {/* Player slots */}
      <div className="px-4 pb-4 mt-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-0.5">
            {Array.from({ length: MAX_SLOTS }, (_, i) => {
              const player = players[i];
              const filled = i < totalSlots;
              return (
                <div
                  key={i}
                  className="w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs"
                  style={{
                    backgroundColor: filled
                      ? player?.is_bot ? 'var(--color-gray-300)' : 'var(--color-blue)'
                      : 'transparent',
                    borderColor: filled
                      ? player?.is_bot ? 'var(--color-gray-300)' : 'var(--color-blue)'
                      : 'var(--color-gray-200)',
                  }}
                  title={player?.display_name}
                >
                  {filled && !player?.is_bot && (
                    <span style={{ color: 'white', fontSize: 8, fontWeight: 700 }}>
                      {player?.display_name?.[0]?.toUpperCase()}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* CTA */}
          {game.status === 'lobby' && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-lg"
              style={{ backgroundColor: 'var(--color-blue)', color: 'white' }}>
              Join →
            </span>
          )}
          {game.status === 'trading' && isAllBots && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-lg"
              style={{ backgroundColor: 'var(--color-gray-100)', color: 'var(--color-blue)' }}>
              Spectate →
            </span>
          )}
          {game.status === 'completed' && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-lg"
              style={{ backgroundColor: 'var(--color-gray-100)', color: 'var(--color-gray-500)' }}>
              Results →
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
