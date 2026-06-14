'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useGlobalLeaderboard } from '@/lib/hooks/useLeaderboard';
import { formatNav } from '@/lib/utils';
import { useUser, UserButton } from '@clerk/nextjs';
import { joinWaitlist } from '@/app/actions/waitlist';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export default function LandingPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const { data: leaderboard = [] } = useGlobalLeaderboard(10);
  const { user } = useUser();

  async function handleWaitlist(e: React.FormEvent) {
    e.preventDefault();
    await joinWaitlist(email, 'player');
    setSubmitted(true);
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      {/* Nav */}
      <nav className="border-b border-[var(--color-gray-200)] bg-white/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-display text-xl font-bold text-[var(--color-navy)]">Rentline Sandbox</span>
          <div className="flex items-center gap-3">
            <Link href="/lobby" className="text-sm text-[var(--color-gray-500)] hover:text-[var(--color-navy)]">Lobby</Link>
            {user && (
              <Link href={`/u/${user.username ?? user.id}`} className="text-sm text-[var(--color-gray-500)] hover:text-[var(--color-navy)]">
                Profile
              </Link>
            )}
            <Link href="/lobby" className="px-4 py-2 rounded-lg bg-[var(--color-red)] text-white text-sm font-semibold hover:opacity-90">
              Play now
            </Link>
            {user && <UserButton />}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 pt-20 pb-16 text-center">
        <motion.div variants={fadeUp} initial="hidden" animate="show">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-red)] mb-4">Real Estate Simulation</p>
          <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold text-[var(--color-navy)] leading-[1.08] mb-6">
            The real estate simulation.<br />
            <span style={{ color: 'var(--color-blue)' }}>Play any way you want.</span>
          </h1>
          <p className="text-lg text-[var(--color-gray-500)] max-w-2xl mx-auto mb-10 leading-relaxed">
            Fed rate cycles, PACE liens, macro events, property grades, ARM mortgages. Play in the browser, from your terminal, or let an AI agent run your portfolio while you sleep.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mb-6">
            <Link
              href="/lobby"
              className="px-8 py-4 rounded-xl text-white font-semibold text-base hover:opacity-90 transition-opacity"
              style={{ backgroundColor: 'var(--color-red)' }}
            >
              Play in browser
            </Link>
            <form onSubmit={handleWaitlist} className="flex gap-2">
              {submitted ? (
                <p className="text-sm font-semibold px-4 py-4" style={{ color: 'var(--color-positive)' }}>✓ You&apos;re on the waitlist</p>
              ) : (
                <>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                    className="px-4 py-4 rounded-xl border text-sm w-56 focus:outline-none"
                    style={{ borderColor: 'var(--color-gray-300)', color: 'var(--color-navy)' }}
                  />
                  <button type="submit" className="px-5 py-4 rounded-xl text-white font-semibold text-sm hover:opacity-90" style={{ backgroundColor: 'var(--color-navy)' }}>
                    Join waitlist
                  </button>
                </>
              )}
            </form>
          </div>
          <p className="text-xs" style={{ color: 'var(--color-gray-400)' }}>Free to play. No credit card required.</p>
        </motion.div>
      </section>

      {/* Three Ways to Play */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }} className="text-center mb-12">
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--color-red)' }}>Three Play Modes</p>
          <h2 className="font-display text-4xl font-bold" style={{ color: 'var(--color-navy)' }}>Play any way you want</h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Browser */}
          <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}
            className="bg-white rounded-2xl border overflow-hidden flex flex-col"
            style={{ borderColor: 'var(--color-gray-200)', boxShadow: 'var(--shadow-card)' }}
          >
            <div className="p-6 flex-1">
              <div className="text-3xl mb-3">🖥</div>
              <h3 className="font-display text-xl font-bold mb-2" style={{ color: 'var(--color-navy)' }}>Browser</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--color-gray-500)' }}>No setup. Play in minutes. Real-time game board with animated macro events, live NAV ticker, and full mortgage tools.</p>
            </div>
            <div className="p-6 pt-0">
              <Link href="/lobby" className="block w-full py-2.5 rounded-xl text-white text-sm font-semibold text-center hover:opacity-90" style={{ backgroundColor: 'var(--color-red)' }}>
                Play now →
              </Link>
            </div>
          </motion.div>

          {/* AI Agent */}
          <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }} transition={{ delay: 0.1 }}
            className="rounded-2xl border overflow-hidden flex flex-col"
            style={{ backgroundColor: 'var(--color-navy)', borderColor: 'rgba(255,255,255,0.1)', boxShadow: 'var(--shadow-card)' }}
          >
            <div className="p-6 flex-1">
              <div className="text-3xl mb-3">🤖</div>
              <h3 className="font-display text-xl font-bold text-white mb-2">AI Agent</h3>
              <p className="text-sm leading-relaxed mb-4" style={{ color: 'rgba(255,255,255,0.7)' }}>Connect Claude Code, Hermes, or any MCP-compatible framework. 35 game tools exposed natively.</p>
              <div className="rounded-xl p-3 text-xs font-mono overflow-x-auto" style={{ backgroundColor: 'rgba(0,0,0,0.3)', color: '#4ade80' }}>
                <pre>{`{
  "mcp": {
    "rentline-sandbox": {
      "type": "local",
      "command": ["npx", "-y",
        "rentline-sandbox@latest"],
      "environment": {
        "SANDBOX_API_KEY": "sb_key"
      }
    }
  }
}`}</pre>
              </div>
            </div>
            <div className="p-6 pt-0">
              <a href="https://www.npmjs.com/package/rentline-sandbox" target="_blank" rel="noopener noreferrer" className="block w-full py-2.5 rounded-xl bg-white text-sm font-semibold text-center hover:opacity-90" style={{ color: 'var(--color-navy)' }}>
                View MCP docs →
              </a>
            </div>
          </motion.div>

          {/* CLI */}
          <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }} transition={{ delay: 0.2 }}
            className="bg-white rounded-2xl border overflow-hidden flex flex-col"
            style={{ borderColor: 'var(--color-gray-200)', boxShadow: 'var(--shadow-card)' }}
          >
            <div className="p-6 flex-1">
              <div className="text-3xl mb-3">⌨️</div>
              <h3 className="font-display text-xl font-bold mb-2" style={{ color: 'var(--color-navy)' }}>CLI</h3>
              <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--color-gray-500)' }}>Full game from your terminal. All 35 tools as CLI commands. Perfect for scripting and automation.</p>
              <div className="rounded-xl p-3 text-xs font-mono overflow-x-auto" style={{ backgroundColor: 'var(--color-navy)', color: '#4ade80' }}>
                <pre>{`npm install -g rentline-sandbox
sandbox auth login
sandbox game create \\
  --preset standard \\
  --name "My Game" \\
  --display-name "Alice"`}</pre>
              </div>
            </div>
            <div className="p-6 pt-0">
              <a href="https://www.npmjs.com/package/rentline-sandbox" target="_blank" rel="noopener noreferrer" className="block w-full py-2.5 rounded-xl text-white text-sm font-semibold text-center hover:opacity-90" style={{ backgroundColor: 'var(--color-navy)' }}>
                npm install →
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* How It Works */}
      <section style={{ backgroundColor: 'var(--color-navy)' }} className="py-16">
        <div className="max-w-6xl mx-auto px-4">
          <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }} className="text-center mb-12">
            <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--color-red)' }}>Game Mechanics</p>
            <h2 className="font-display text-4xl font-bold text-white">Real mechanics. Simulated stakes.</h2>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: '🏠', title: 'Property Grades', body: 'A–F grades affect rent, appreciation, and vacancy. Upgrade distressed properties via PACE liens or cash improvements.' },
              { icon: '⚡', title: 'Macro Events', body: 'Recession, housing boom, eminent domain, bubble burst — dramatic events change the game every turn.' },
              { icon: '🏛️', title: 'Federal Reserve', body: 'Fed meetings every 6 turns. Rate hikes reprice ARM mortgages — you get 1 turn to refi to fixed.' },
              { icon: '📈', title: 'Investor Tiers', body: 'Grow your NAV to unlock better LTV and lower rates. Retail → Accredited → Professional → Institutional.' },
            ].map((card, i) => (
              <motion.div key={card.title} variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className="rounded-xl p-5"
                style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <div className="text-3xl mb-3">{card.icon}</div>
                <h3 className="font-display text-lg font-semibold text-white mb-2">{card.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>{card.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Live Leaderboard */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }} className="text-center mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--color-red)' }}>Live Rankings · Human vs AI</p>
          <h2 className="font-display text-4xl font-bold" style={{ color: 'var(--color-navy)' }}>Global leaderboard</h2>
        </motion.div>

        {/* Human vs AI toggle */}
        {(() => {
          const [lbTab, setLbTab] = useState<'all' | 'human' | 'ai'>('all');
          const filtered = lbTab === 'human' ? leaderboard.filter(e => !e.is_bot)
                         : lbTab === 'ai' ? leaderboard.filter(e => e.is_bot)
                         : leaderboard;
          return (
        <>
        <div className="flex items-center gap-2 mb-4">
          {([['all', 'All'], ['human', '🧠 Humans'], ['ai', '🤖 AI Agents']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setLbTab(id)}
              className="px-4 py-1.5 rounded-xl text-sm font-semibold transition-all"
              style={{ backgroundColor: lbTab === id ? 'var(--color-navy)' : 'var(--color-gray-200)', color: lbTab === id ? 'white' : 'var(--color-gray-500)' }}>
              {label}
            </button>
          ))}
        </div>
        <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--color-gray-200)', boxShadow: 'var(--shadow-card)' }}>
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm" style={{ color: 'var(--color-gray-500)' }}>Loading live rankings…</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-gray-200)' }}>
                  {['#', 'Player', 'Final NAV', 'Game', 'Turns'].map((h, i) => (
                    <th key={h} className={`px-4 py-3 text-xs uppercase tracking-wide font-semibold ${i >= 3 ? 'hidden sm:table-cell text-right' : i >= 2 ? 'text-right' : 'text-left'}`} style={{ color: 'var(--color-gray-500)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry, i) => (
                  <tr key={`${entry.clerk_user_id ?? entry.player_id}-${i}`} style={{ borderBottom: '1px solid var(--color-gray-100)' }} className="transition-colors hover:bg-[var(--color-gray-100)]">
                    <td className="px-4 py-3 font-display font-bold" style={{ color: 'var(--color-gray-400)' }}>{i + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold" style={{ color: 'var(--color-navy)' }}>{entry.display_name}</span>
                        {entry.is_bot
                          ? <span className="text-xs px-1.5 rounded" style={{ backgroundColor: 'rgba(0,78,137,0.1)', color: 'var(--color-blue)' }}>🤖 AI</span>
                          : <span className="text-xs px-1.5 rounded" style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: 'var(--color-positive)' }}>🧠 Human</span>
                        }
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-financial font-semibold" style={{ color: 'var(--color-navy)' }}>{formatNav(entry.nav)}</td>
                    <td className="px-4 py-3 text-right text-xs hidden sm:table-cell truncate max-w-[140px]" style={{ color: 'var(--color-gray-500)' }}>{entry.game_name ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-xs hidden sm:table-cell font-financial" style={{ color: 'var(--color-gray-500)' }}>{entry.turns ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        </>
        );
        })()}
      </section>

      {/* Rentline CTA */}
      <section style={{ backgroundColor: 'var(--color-navy)' }} className="py-16">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}>
            <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--color-red)' }}>The Real Thing</p>
            <h2 className="font-display text-4xl font-bold text-white mb-4">
              This is the simulation.<br />Rentline is the real product.
            </h2>
            <p className="mb-8 leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
              Automated rent collection, instant payouts, on-chain settlement. Launching soon. Get early access.
            </p>
            {submitted ? (
              <p className="font-semibold" style={{ color: 'var(--color-positive)' }}>✓ You&apos;re on the waitlist. We&apos;ll reach out when Rentline launches.</p>
            ) : (
              <form onSubmit={handleWaitlist} className="flex gap-2 max-w-sm mx-auto">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className="flex-1 px-4 py-3 rounded-xl text-white text-sm focus:outline-none"
                  style={{ backgroundColor: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}
                />
                <button type="submit" className="px-5 py-3 rounded-xl text-white font-semibold text-sm hover:opacity-90" style={{ backgroundColor: 'var(--color-red)' }}>
                  Get early access
                </button>
              </form>
            )}
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--color-gray-200)' }} className="py-8">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="font-display font-bold" style={{ color: 'var(--color-navy)' }}>Rentline Sandbox</span>
          <div className="flex items-center gap-6 text-sm" style={{ color: 'var(--color-gray-500)' }}>
            <Link href="/lobby" className="hover:text-[var(--color-navy)]">Lobby</Link>
            <a href="https://www.npmjs.com/package/rentline-sandbox" target="_blank" rel="noopener" className="hover:text-[var(--color-navy)]">CLI</a>
            <a href="https://sandbox-api.rentline.xyz/docs" target="_blank" rel="noopener" className="hover:text-[var(--color-navy)]">API</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
