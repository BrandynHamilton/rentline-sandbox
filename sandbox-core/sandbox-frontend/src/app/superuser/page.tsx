import { createAdminApiClient } from '@/lib/api';
import type { Game, LeaderboardEntry } from '@/lib/api';

// Server component — admin key stays server-side
async function getAdminData() {
  if (!process.env.ADMIN_API_KEY) {
    return { games: [] as Game[], leaderboard: [] as LeaderboardEntry[], error: 'ADMIN_API_KEY not configured. Add it to .env.local.' };
  }
  try {
    const admin = createAdminApiClient();
    const [games, leaderboard] = await Promise.all([
      admin.getGames(),
      admin.getGlobalLeaderboard(20),
    ]);
    return { games, leaderboard, error: null };
  } catch (e) {
    return { games: [] as Game[], leaderboard: [] as LeaderboardEntry[], error: String(e) };
  }
}

export const dynamic = 'force-dynamic';

export default async function SuperuserPage() {
  const { games, leaderboard, error } = await getAdminData();
  const activeGames = games.filter((g) => g.status !== 'completed');
  const completedGames = games.filter((g) => g.status === 'completed');

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-navy)', color: 'white' }}>
      {/* Header */}
      <div className="border-b" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl font-bold text-white">Superuser Panel</h1>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Rentline Sandbox Admin</p>
          </div>
          <a href="/" className="text-xs hover:underline" style={{ color: 'rgba(255,255,255,0.5)' }}>← Back to site</a>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-8">
        {error && (
          <div className="rounded-xl p-4 text-sm" style={{ backgroundColor: 'rgba(141,8,1,0.3)', border: '1px solid rgba(141,8,1,0.5)' }}>
            {error.includes('ADMIN_API_KEY') ? 'Configure ADMIN_API_KEY in .env.local to use this panel.' : error}
          </div>
        )}

        {/* Metrics row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Active Games', value: activeGames.length },
            { label: 'Total Games', value: games.length },
            { label: 'Completed', value: completedGames.length },
            { label: 'Players (active)', value: activeGames.reduce((s, g) => s + g.players.length, 0) },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl p-4" style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>{stat.label}</p>
              <p className="font-financial text-2xl font-bold text-white">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Active games table */}
        <div>
          <h2 className="font-display text-lg font-semibold text-white mb-3">Active Games</h2>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  {['ID', 'Name', 'Preset', 'Turn', 'Players', 'Status', 'Auto'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.5)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeGames.map((game) => (
                  <tr key={game.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{game.id.slice(0, 8)}…</td>
                    <td className="px-4 py-2.5 font-semibold text-white">{game.name}</td>
                    <td className="px-4 py-2.5 text-xs capitalize" style={{ color: 'rgba(255,255,255,0.6)' }}>{game.preset ?? '—'}</td>
                    <td className="px-4 py-2.5 font-financial text-xs text-white">{game.current_turn}/{game.max_turns}</td>
                    <td className="px-4 py-2.5 font-financial text-xs text-white">{game.players.length}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                        game.status === 'trading' ? 'bg-green-500/20 text-green-400' :
                        game.status === 'lobby' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-white/10 text-white/50'
                      }`}>
                        {game.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      {game.auto_advance ? '✓ auto' : 'manual'}
                    </td>
                  </tr>
                ))}
                {activeGames.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      No active games
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Global leaderboard */}
        <div>
          <h2 className="font-display text-lg font-semibold text-white mb-3">Top Players (All Games)</h2>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  {['#', 'Player', 'NAV', 'Tier', 'Game'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.5)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((entry, i) => (
                  <tr key={`${entry.player_id}-${i}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td className="px-4 py-2.5 font-display font-bold" style={{ color: 'rgba(255,255,255,0.3)' }}>{i + 1}</td>
                    <td className="px-4 py-2.5 font-semibold text-white">
                      {entry.display_name}
                      {entry.is_bot && <span className="ml-1.5 text-xs px-1.5 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}>Bot</span>}
                    </td>
                    <td className="px-4 py-2.5 font-financial font-semibold text-white">
                      ${entry.nav.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>{entry.investor_tier_name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{entry.game_id?.slice(0, 8) ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tournament stub */}
        <div className="rounded-xl p-6" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <h2 className="font-display text-lg font-semibold text-white mb-2">Tournament Controls</h2>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Coming in Phase 2 — tournament bracket, prize pool management, and Stripe Connect payouts.</p>
        </div>
      </div>
    </div>
  );
}
