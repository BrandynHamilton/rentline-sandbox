'use client';

import { use, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useLeaderboard } from '@/lib/hooks/useLeaderboard';
import { useGame } from '@/lib/hooks/useGame';
import { formatNav, tierName } from '@/lib/utils';
import { useGameStore } from '@/store/gameStore';
import { GameNav } from '@/components/shared/GameNav';
import { ShareableBadge } from '@/components/shared/ShareableBadge';

interface Props {
  params: Promise<{ id: string }>;
}

const MEDALS = ['🥇', '🥈', '🥉'];

export default function ResultPage({ params }: Props) {
  const { id: gameId } = use(params);
  const { data: game } = useGame(gameId);
  const { data: leaderboard = [] } = useLeaderboard(gameId);
  const { currentPlayerId } = useGameStore();
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);

  // Delay reveal for drama
  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 300);
    return () => clearTimeout(t);
  }, []);

  const preset = game?.preset ?? 'standard';
  const maxTurns = game?.max_turns ?? 12;

  // Find the current user's entry
  const myEntry = leaderboard.find((e) => e.player_id === currentPlayerId) ?? leaderboard.find((e) => !e.is_bot);

  function shareText(rank: number, nav: number, name: string) {
    return `[Rentline Sandbox]\n${name} finished #${rank} of ${leaderboard.length} players\nFinal NAV: ${formatNav(nav)}\nPreset: ${preset} | ${maxTurns} turns\nPlay at sandbox.rentline.xyz`;
  }

  function shareToX() {
    if (!myEntry) return;
    const text = encodeURIComponent(shareText(myEntry.rank, myEntry.nav, myEntry.display_name));
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
  }

  function copyResult() {
    if (!myEntry) return;
    navigator.clipboard.writeText(shareText(myEntry.rank, myEntry.nav, myEntry.display_name)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--color-navy)' }}>
      <GameNav rightSlot={myEntry ? (
        <ShareableBadge
          entry={myEntry}
          totalPlayers={leaderboard.length}
          gameName={game?.name}
          preset={preset}
          maxTurns={maxTurns}
        />
      ) : undefined} />
      {/* Header */}
      <div className="border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <div className="max-w-2xl mx-auto px-4 py-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--color-red)' }}>
            Game Complete
          </p>
          <h1 className="font-display text-3xl font-bold text-white">
            {game?.name ?? 'Final Results'}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {preset} · {maxTurns} turns
          </p>
        </div>
      </div>

      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 space-y-4">

        {/* Leaderboard — staggered reveal */}
        <AnimatePresence>
          {revealed && leaderboard.map((entry, i) => {
            const isMe = entry.player_id === currentPlayerId || (!currentPlayerId && !entry.is_bot && i === 0);
            const startingNav = 100000; // default starting balance
            const pct = ((entry.nav - startingNav) / startingNav) * 100;

            return (
              <motion.div
                key={entry.player_id}
                initial={{ opacity: 0, y: 32, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: i * 0.15, type: 'spring', stiffness: 320, damping: 26 }}
                className="rounded-2xl overflow-hidden"
                style={{
                  backgroundColor: i === 0 ? 'white' : 'rgba(255,255,255,0.06)',
                  border: isMe ? '2px solid var(--color-blue)' : i === 0 ? 'none' : '1px solid rgba(255,255,255,0.1)',
                  boxShadow: i === 0 ? 'var(--shadow-modal)' : 'none',
                }}
              >
                <div className="flex items-center gap-4 p-4">
                  {/* Medal / rank */}
                  <div className="text-3xl w-10 text-center shrink-0">
                    {i < 3 ? MEDALS[i] : <span className="font-display font-bold text-lg" style={{ color: 'rgba(255,255,255,0.3)' }}>#{i + 1}</span>}
                  </div>

                  {/* Name + tier */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`font-body font-bold text-base ${i === 0 ? 'text-[var(--color-navy)]' : 'text-white'}`}>
                        {entry.display_name}
                      </p>
                      {isMe && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: 'var(--color-blue)', color: 'white' }}>
                          you
                        </span>
                      )}
                      {entry.is_bot && (
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.5)' }}>
                          Bot
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: i === 0 ? 'var(--color-gray-500)' : 'rgba(255,255,255,0.4)' }}>
                      {tierName(entry.investor_tier)}
                    </p>
                  </div>

                  {/* NAV + return */}
                  <div className="text-right shrink-0">
                    <p className={`font-financial text-xl font-bold ${i === 0 ? 'text-[var(--color-navy)]' : 'text-white'}`}>
                      {formatNav(entry.nav)}
                    </p>
                    <p className={`text-xs font-financial font-semibold ${pct >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
                      {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Share card */}
        {myEntry && revealed && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: leaderboard.length * 0.15 + 0.2 }}
            className="rounded-2xl p-5"
            style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <p className="text-xs uppercase tracking-widest mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Share your result
            </p>
            <div className="rounded-xl p-4 mb-4 font-mono text-sm" style={{ backgroundColor: 'rgba(0,0,0,0.3)', color: 'rgba(255,255,255,0.8)' }}>
              <p className="font-bold text-white">[Rentline Sandbox]</p>
              <p>{myEntry.display_name} finished #{myEntry.rank} of {leaderboard.length} players</p>
              <p>Final NAV: {formatNav(myEntry.nav)}</p>
              <p>Preset: {preset} | {maxTurns} turns</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={shareToX}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                style={{ backgroundColor: '#000' }}
              >
                Share on X
              </button>
              <button
                onClick={copyResult}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
                style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: 'white' }}
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </motion.div>
        )}

        {/* Rentline CTA */}
        {revealed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: leaderboard.length * 0.15 + 0.4 }}
            className="rounded-2xl p-6 text-center"
            style={{ backgroundColor: 'rgba(141,8,1,0.15)', border: '1px solid rgba(141,8,1,0.3)' }}
          >
            <p className="font-display text-lg font-semibold text-white mb-2">
              You just simulated {myEntry ? formatNav(myEntry.nav) : 'real'} in real estate returns.
            </p>
            <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.6)' }}>
              When Rentline launches, you&apos;ll collect real rent like this — automatically.
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Link
                href="/lobby"
                className="px-6 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90"
                style={{ backgroundColor: 'var(--color-red)' }}
              >
                Play again
              </Link>
              <Link
                href="/"
                className="px-6 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90"
                style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: 'white' }}
              >
                Back to home
              </Link>
            </div>
          </motion.div>
        )}

      </div>
    </div>
  );
}
