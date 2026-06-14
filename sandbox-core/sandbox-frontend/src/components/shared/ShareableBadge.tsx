'use client';

import { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatNav, tierName } from '@/lib/utils';
import type { LeaderboardEntry } from '@/lib/api';

interface ShareableBadgeProps {
  entry: LeaderboardEntry;
  totalPlayers: number;
  gameName?: string;
  preset?: string;
  maxTurns?: number;
}

const TIER_COLORS = ['#8B8C89', '#84cc16', '#22c55e', '#f59e0b', '#FFD700'];
const TIER_ICONS = ['', '✦', '✦✦', '✦✦✦', '♛'];
const RANK_MEDALS = ['🥇', '🥈', '🥉'];

export function ShareableBadge({ entry, totalPlayers, gameName, preset, maxTurns }: ShareableBadgeProps) {
  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const startingNav = 100_000;
  const returnPct = ((entry.nav - startingNav) / startingNav * 100);
  const tierColor = TIER_COLORS[entry.investor_tier] ?? TIER_COLORS[0];
  const medal = entry.rank <= 3 ? RANK_MEDALS[entry.rank - 1] : `#${entry.rank}`;

  const shareText = `[Rentline Sandbox]\n${entry.display_name} finished ${medal} of ${totalPlayers} players\nFinal NAV: ${formatNav(entry.nav)} (${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(1)}%)\nTier: ${entry.investor_tier_name}\nPreset: ${preset ?? 'standard'} · ${maxTurns ?? 12} turns\nplay → sandbox.rentline.xyz`;

  function shareToX() {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`, '_blank');
  }

  function copyText() {
    navigator.clipboard.writeText(shareText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
        style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: 'white' }}
      >
        Share result
      </button>

      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ scale: 0.92, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 20 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              className="w-full max-w-sm rounded-3xl overflow-hidden"
              style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* The badge itself — this is what gets shared */}
              <div
                className="relative p-6"
                style={{
                  background: `linear-gradient(135deg, var(--color-navy) 0%, #2a2b3d 100%)`,
                  border: `1px solid ${tierColor}30`,
                }}
              >
                {/* Tier glow */}
                <div
                  className="absolute inset-0 opacity-10"
                  style={{ background: `radial-gradient(ellipse at top right, ${tierColor}, transparent 60%)` }}
                />

                {/* Header */}
                <div className="flex items-center justify-between mb-5 relative">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ backgroundColor: 'var(--color-red)' }}>
                      <span className="text-white text-xs font-bold">R</span>
                    </div>
                    <span className="text-white/60 text-xs font-semibold tracking-widest uppercase">Rentline Sandbox</span>
                  </div>
                  {preset && (
                    <span className="text-xs px-2 py-0.5 rounded-full capitalize" style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
                      {preset}
                    </span>
                  )}
                </div>

                {/* Rank + name */}
                <div className="relative mb-4">
                  <div className="flex items-start gap-3">
                    <span className="text-4xl leading-none">{medal}</span>
                    <div>
                      <p className="font-display text-2xl font-bold text-white leading-tight">{entry.display_name}</p>
                      <p className="text-white/50 text-xs mt-0.5">
                        {entry.rank} of {totalPlayers} players · {maxTurns ?? 12} turns
                      </p>
                    </div>
                  </div>
                </div>

                {/* NAV */}
                <div className="relative mb-4">
                  <p className="text-white/40 text-xs uppercase tracking-widest mb-1">Final NAV</p>
                  <p className="font-financial text-4xl font-bold text-white">{formatNav(entry.nav)}</p>
                  <p className="font-financial text-base font-semibold mt-0.5" style={{ color: returnPct >= 0 ? 'var(--color-positive)' : 'var(--color-negative)' }}>
                    {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(1)}% return
                  </p>
                </div>

                {/* Tier badge */}
                <div
                  className="relative flex items-center gap-2 rounded-xl px-4 py-2.5 mt-4"
                  style={{ backgroundColor: `${tierColor}18`, border: `1px solid ${tierColor}35` }}
                >
                  <span style={{ color: tierColor }}>{TIER_ICONS[entry.investor_tier] || '○'}</span>
                  <div>
                    <p className="text-xs font-semibold" style={{ color: tierColor }}>{entry.investor_tier_name}</p>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Investor tier achieved</p>
                  </div>
                </div>

                {/* Game name */}
                {gameName && (
                  <p className="relative text-center text-white/30 text-xs mt-4 font-body">{gameName}</p>
                )}
              </div>

              {/* Actions */}
              <div className="p-4 space-y-2" style={{ backgroundColor: 'white' }}>
                <button
                  onClick={shareToX}
                  className="w-full py-3 rounded-xl text-white text-sm font-semibold hover:opacity-90 flex items-center justify-center gap-2"
                  style={{ backgroundColor: '#000' }}
                >
                  <span>𝕏</span> Share on X
                </button>
                <button
                  onClick={copyText}
                  className="w-full py-3 rounded-xl text-sm font-semibold hover:opacity-90"
                  style={{ backgroundColor: 'var(--color-gray-100)', color: 'var(--color-navy)' }}
                >
                  {copied ? '✓ Copied to clipboard' : 'Copy text'}
                </button>
                <button
                  onClick={() => setShowModal(false)}
                  className="w-full py-2 text-xs"
                  style={{ color: 'var(--color-gray-500)' }}
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
