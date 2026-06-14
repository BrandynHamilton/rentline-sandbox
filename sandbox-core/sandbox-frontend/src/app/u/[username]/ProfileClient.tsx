'use client';

import { useUser, useClerk } from '@clerk/nextjs';
import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { GameNav } from '@/components/shared/GameNav';
import { useGlobalLeaderboard } from '@/lib/hooks/useLeaderboard';
import { formatNav, tierName } from '@/lib/utils';
import type { LeaderboardEntry } from '@/lib/api';

const STARTING_NAV = 100_000;
const TIER_ICONS = ['', '✦', '✦✦', '✦✦✦', '♛'];
const TIER_COLORS = ['var(--color-gray-400)', 'var(--color-grade-b)', 'var(--color-grade-a)', 'var(--color-warning)', '#FFD700'];

interface ProfileClientProps {
  username: string;
}

export function ProfileClient({ username }: ProfileClientProps) {
  const { user } = useUser();
  const { openUserProfile } = useClerk();
  const isOwnProfile = user?.username === username || user?.id === username;

  // The backend may use a different Clerk instance than the frontend.
  // NEXT_PUBLIC_SANDBOX_CLERK_USER_ID is the backend Clerk user ID for the current API key owner.
  // This bridges the gap until both instances are unified.
  const backendClerkId = process.env.NEXT_PUBLIC_SANDBOX_CLERK_USER_ID;

  // Fetch full leaderboard client-side — covers all completed games
  const { data: leaderboard = [], isLoading } = useGlobalLeaderboard(200);

  // Match priority:
  // 1. Own profile + backend ID configured → use backend Clerk ID (cross-instance bridge)
  // 2. Own profile without bridge → match by frontend Clerk user ID
  // 3. Other profile → match by display_name or clerk_user_id slug
  const entries: LeaderboardEntry[] = leaderboard.filter((e) => {
    if (e.is_bot) return false;
    if (isOwnProfile) {
      if (backendClerkId) return e.clerk_user_id === backendClerkId;
      if (user?.id) return e.clerk_user_id === user.id;
    }
    return (
      e.clerk_user_id === username ||
      e.display_name.toLowerCase() === username.toLowerCase()
    );
  });

  const gamesPlayed = entries.length;
  const wins = entries.filter((e) => e.rank === 1).length;
  const podiums = entries.filter((e) => e.rank <= 3).length;
  const bestNav = gamesPlayed > 0 ? Math.max(...entries.map((e) => e.nav)) : null;
  const avgNav = gamesPlayed > 0 ? entries.reduce((s, e) => s + e.nav, 0) / gamesPlayed : null;
  const bestReturn = bestNav != null ? ((bestNav - STARTING_NAV) / STARTING_NAV) * 100 : null;
  const avgReturn = avgNav != null ? ((avgNav - STARTING_NAV) / STARTING_NAV) * 100 : null;
  const avgRank = gamesPlayed > 0 ? (entries.reduce((s, e) => s + e.rank, 0) / gamesPlayed).toFixed(1) : null;
  const totalTurns = entries.reduce((s, e) => s + (e.turns ?? 0), 0);
  const winRate = gamesPlayed > 0 ? ((wins / gamesPlayed) * 100).toFixed(0) : '0';
  const bestEntry = entries.find((e) => e.nav === bestNav);
  const currentTier = bestEntry ? bestEntry.investor_tier : 0;
  const displayName = entries[0]?.display_name ?? username;
  const initial = displayName[0]?.toUpperCase() ?? '?';

  const needsUsername = isOwnProfile && !user?.username;

  if (isLoading) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--color-bg)' }}>
        <GameNav />
        <div className="flex items-center justify-center py-32">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-navy)' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-bg)' }}>
      <GameNav />

      {/* Username setup prompt */}
      {needsUsername && (
        <div className="border-b" style={{ backgroundColor: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.2)' }}>
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span>⚠️</span>
              <p className="text-sm font-semibold" style={{ color: 'var(--color-navy)' }}>
                Set a username so others can find your profile and your results are shareable.
              </p>
            </div>
            <button
              onClick={() => openUserProfile()}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-white shrink-0 hover:opacity-90"
              style={{ backgroundColor: 'var(--color-warning)' }}
            >
              Set username
            </button>
          </div>
        </div>
      )}

      {/* Hero */}
      <div style={{ backgroundColor: 'var(--color-navy)' }}>
        <div className="max-w-3xl mx-auto px-4 py-8">
          <div className="flex items-center gap-5">
            {/* Avatar */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-20 h-20 rounded-2xl overflow-hidden shrink-0 flex items-center justify-center text-3xl font-display font-bold text-white"
              style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}
            >
              {isOwnProfile && user?.imageUrl ? (
                <Image src={user.imageUrl} alt={displayName} width={80} height={80} className="w-full h-full object-cover" />
              ) : initial}
            </motion.div>

            <div className="flex-1 min-w-0">
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="font-display text-2xl font-bold text-white">{displayName}</h1>
                  {isOwnProfile && (
                    <button
                      onClick={() => openUserProfile()}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
                      style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}
                    >
                      ⚙ Settings
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span style={{ color: TIER_COLORS[currentTier] }}>{TIER_ICONS[currentTier] || '○'}</span>
                  <span className="text-sm font-semibold" style={{ color: currentTier > 0 ? TIER_COLORS[currentTier] : 'rgba(255,255,255,0.4)' }}>
                    {tierName(currentTier)}
                  </span>
                </div>
              </motion.div>
            </div>

            {bestNav != null && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="text-right shrink-0 hidden sm:block">
                <p className="text-xs uppercase tracking-widest mb-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Best NAV</p>
                <p className="font-financial text-2xl font-bold text-white">{formatNav(bestNav)}</p>
              </motion.div>
            )}
          </div>

          {/* Stats grid */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-6"
          >
            {[
              { label: 'Games', value: gamesPlayed || '—', sub: null },
              { label: 'Wins', value: wins || '—', sub: gamesPlayed ? `${winRate}% win rate` : null },
              { label: 'Podiums', value: podiums || '—', sub: 'Top 3' },
              { label: 'Best NAV', value: bestNav != null ? formatNav(bestNav) : '—', sub: bestReturn != null ? `+${bestReturn.toFixed(0)}%` : null, subColor: 'var(--color-positive)' },
              { label: 'Avg NAV', value: avgNav != null ? formatNav(avgNav) : '—', sub: avgReturn != null ? `${avgReturn >= 0 ? '+' : ''}${avgReturn.toFixed(0)}%` : null, subColor: avgReturn != null && avgReturn >= 0 ? 'var(--color-positive)' : 'var(--color-negative)' },
              { label: 'Avg Rank', value: avgRank ?? '—', sub: totalTurns > 0 ? `${totalTurns} turns` : null },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl px-3 py-3 text-center" style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}>
                <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>{stat.label}</p>
                <p className="font-financial font-bold text-white text-base leading-tight">{stat.value}</p>
                {stat.sub && <p className="text-xs mt-0.5 font-financial" style={{ color: (stat as any).subColor ?? 'rgba(255,255,255,0.35)' }}>{stat.sub}</p>}
              </div>
            ))}
          </motion.div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {/* Investor tier ladder */}
        {isOwnProfile && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="rounded-2xl p-5" style={{ backgroundColor: 'white', border: '1px solid var(--color-gray-200)', boxShadow: 'var(--shadow-card)' }}
          >
            <h2 className="font-display text-lg font-semibold mb-3" style={{ color: 'var(--color-navy)' }}>Investor Tiers</h2>
            <div className="space-y-2">
              {[
                { tier: 0, label: 'Retail Investor', minNav: 0, benefit: 'Baseline terms' },
                { tier: 1, label: 'Accredited Investor', minNav: 100_000, benefit: '+5% LTV, −25bps' },
                { tier: 2, label: 'Professional Investor', minNav: 500_000, benefit: '+10% LTV, −50bps' },
                { tier: 3, label: 'Institutional Investor', minNav: 2_500_000, benefit: '+15% LTV, −75bps' },
                { tier: 4, label: 'Real Estate Developer', minNav: 25_000_000, benefit: '+20% LTV, −100bps' },
              ].map((t) => {
                const isUnlocked = currentTier >= t.tier;
                const isCurrent = currentTier === t.tier;
                return (
                  <div key={t.tier} className="flex items-center gap-3 rounded-xl px-4 py-2.5"
                    style={{ backgroundColor: isCurrent ? 'var(--color-navy)' : isUnlocked ? 'var(--color-gray-100)' : 'transparent', border: `1px solid ${isCurrent ? 'transparent' : 'var(--color-gray-200)'}` }}
                  >
                    <span style={{ color: isUnlocked ? TIER_COLORS[t.tier] : 'var(--color-gray-300)' }}>{TIER_ICONS[t.tier] || '○'}</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold" style={{ color: isCurrent ? 'white' : isUnlocked ? 'var(--color-navy)' : 'var(--color-gray-400)' }}>{t.label}</p>
                      <p className="text-xs" style={{ color: isCurrent ? 'rgba(255,255,255,0.6)' : 'var(--color-gray-400)' }}>{t.benefit}</p>
                    </div>
                    <p className="text-xs font-financial font-semibold" style={{ color: isCurrent ? 'rgba(255,255,255,0.7)' : 'var(--color-gray-400)' }}>
                      {t.minNav === 0 ? 'Base' : formatNav(t.minNav)}
                    </p>
                    {isUnlocked && !isCurrent && <span className="text-xs" style={{ color: 'var(--color-positive)' }}>✓</span>}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Game history */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'white', border: '1px solid var(--color-gray-200)', boxShadow: 'var(--shadow-card)' }}
        >
          <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--color-gray-200)' }}>
            <h2 className="font-display text-lg font-semibold" style={{ color: 'var(--color-navy)' }}>Game History</h2>
          </div>
          {entries.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-2xl mb-2">🎮</p>
              <p className="text-sm font-semibold" style={{ color: 'var(--color-navy)' }}>No completed games yet</p>
              <p className="text-xs mt-1 mb-4" style={{ color: 'var(--color-gray-500)' }}>Play your first game to build your stats</p>
              <Link href="/lobby" className="inline-flex px-5 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90" style={{ backgroundColor: 'var(--color-red)' }}>
                Go to lobby
              </Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-gray-200)' }}>
                  {['Game', 'Rank', 'Final NAV', 'Turns'].map((h, i) => (
                    <th key={h} className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide ${i >= 2 ? 'text-right hidden sm:table-cell' : i === 1 ? 'text-center' : 'text-left'}`} style={{ color: 'var(--color-gray-500)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, i) => (
                  <tr key={`${entry.game_id}-${i}`} style={{ borderBottom: '1px solid var(--color-gray-100)' }} className="hover:bg-[var(--color-gray-100)] transition-colors">
                    <td className="px-4 py-3"><p className="font-semibold truncate max-w-[160px]" style={{ color: 'var(--color-navy)' }}>{entry.game_name ?? 'Game'}</p></td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${entry.rank === 1 ? 'bg-yellow-100 text-yellow-700' : entry.rank === 2 ? 'bg-gray-100 text-gray-600' : entry.rank === 3 ? 'bg-orange-100 text-orange-600' : 'bg-[var(--color-gray-100)] text-[var(--color-gray-500)]'}`}>
                        #{entry.rank}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right hidden sm:table-cell"><span className="font-financial font-semibold" style={{ color: 'var(--color-navy)' }}>{formatNav(entry.nav)}</span></td>
                    <td className="px-4 py-3 text-right hidden sm:table-cell"><span className="text-xs font-financial" style={{ color: 'var(--color-gray-500)' }}>{entry.turns ?? '—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </motion.div>

        {isOwnProfile && (
          <div className="text-center py-4">
            <Link href="/lobby" className="inline-flex px-6 py-3 rounded-xl text-white text-sm font-semibold hover:opacity-90" style={{ backgroundColor: 'var(--color-red)' }}>
              Play another game →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
