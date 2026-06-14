import type { Metadata } from 'next';
import { ProfileClient } from './ProfileClient';
import type { LeaderboardEntry } from '@/lib/api';

interface Props {
  params: Promise<{ username: string }>;
}

const BASE_URL = process.env.NEXT_PUBLIC_SANDBOX_API_URL ?? 'https://sandbox-api.rentline.xyz';
const API_KEY = process.env.NEXT_PUBLIC_SANDBOX_API_KEY ?? '';

const TIER_MAP: Record<string, number> = {
  'Retail Investor': 0, 'Accredited Investor': 1,
  'Professional Investor': 2, 'Institutional Investor': 3, 'Real Estate Developer': 4,
};

async function fetchGlobalLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch(`${BASE_URL}/api/sandbox/leaderboard?limit=200`, {
      headers: API_KEY ? { 'X-API-Key': API_KEY } : {},
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const raw: Record<string, unknown>[] = await res.json();
    return raw.map((e) => {
      const tierRaw = e.tier ?? e.investor_tier;
      const tierNum = typeof tierRaw === 'string' ? (TIER_MAP[tierRaw] ?? 0) : (tierRaw as number ?? 0);
      const tierStr = typeof tierRaw === 'string' ? tierRaw : (Object.keys(TIER_MAP)[tierNum] ?? 'Retail Investor');
      return {
        ...(e as unknown as LeaderboardEntry),
        investor_tier: tierNum,
        investor_tier_name: tierStr,
        is_bot: typeof e.clerk_user_id === 'string' && (e.clerk_user_id as string).startsWith('bot_'),
        rank: (e.rank ?? 0) as number,
      };
    });
  } catch {
    return [];
  }
}

function matchEntries(leaderboard: LeaderboardEntry[], username: string): LeaderboardEntry[] {
  // Match by display_name (case-insensitive) OR clerk_user_id (when url uses user.id)
  const lower = username.toLowerCase();
  return leaderboard.filter((e) => {
    if (e.is_bot) return false;
    if (e.display_name.toLowerCase() === lower) return true;
    if (e.clerk_user_id === username) return true;
    return false;
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const leaderboard = await fetchGlobalLeaderboard();
  const entries = matchEntries(leaderboard, username);
  const bestNav = entries.length > 0 ? Math.max(...entries.map((e) => e.nav)) : null;
  const displayName = entries[0]?.display_name ?? username;

  return {
    title: `${displayName} — Rentline Sandbox`,
    description: bestNav
      ? `${displayName} achieved a best NAV of $${Math.round(bestNav).toLocaleString()} on Rentline Sandbox. ${entries.filter(e => e.rank === 1).length} wins in ${entries.length} games.`
      : `${displayName}'s real estate simulation profile on Rentline Sandbox.`,
    openGraph: {
      title: `${displayName} on Rentline Sandbox`,
      description: `Real estate simulation player profile.`,
      type: 'profile',
    },
  };
}

export default async function UserProfilePage({ params }: Props) {
  const { username } = await params;
  // ProfileClient fetches its own leaderboard data client-side for reactivity.
  // SSR is only used for metadata generation above.
  return <ProfileClient username={username} />;
}
