'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { useLobbyGames } from '@/lib/hooks/useLobbyGames';
import { GameCard } from '@/components/lobby/GameCard';
import { CreateGameModal } from '@/components/lobby/CreateGameModal';
import { JoinGameModal } from '@/components/lobby/JoinGameModal';
import { GameNav } from '@/components/shared/GameNav';
import { createApiClient } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';

const BOT_GAME_NAMES = [
  'Downtown Strategy Classic',
  'Pacific Heights Arena',
  'Midwest Value League',
  'Coastal Leverage Tournament',
  'Urban Renewal Challenge',
  'Distressed Assets Bowl',
  'Fed Rate Showdown',
];

const BOT_CAST = [
  [
    { display_name: 'Aggro Agnes', strategy: 'aggressive' as const },
    { display_name: 'Value Victor', strategy: 'value_add' as const },
    { display_name: 'Income Ivan', strategy: 'income' as const },
  ],
  [
    { display_name: 'Momentum Max', strategy: 'momentum' as const },
    { display_name: 'Conservative Carl', strategy: 'conservative' as const },
    { display_name: 'Balanced Beth', strategy: 'balanced' as const },
  ],
];

type FilterTab = 'all' | 'open' | 'live' | 'ai';

const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } };

export default function LobbyPage() {
  const { getToken } = useAuth();
  const api = createApiClient(getToken);
  const queryClient = useQueryClient();

  const { data: games = [], isLoading } = useLobbyGames();
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [fillingLobby, setFillingLobby] = useState(false);
  const [filter, setFilter] = useState<FilterTab>('all');

  // Always keep ≥5 active games
  useEffect(() => {
    if (isLoading || fillingLobby) return;
    const active = games.filter((g) => g.status !== 'completed');
    if (active.length < 5) {
      setFillingLobby(true);
      const needed = 5 - active.length;
      const promises = Array.from({ length: needed }, (_, i) =>
        api.createGameFromPreset({
          preset: 'standard',
          name: BOT_GAME_NAMES[i % BOT_GAME_NAMES.length],
          display_name: 'Observer',
          bots: BOT_CAST[i % BOT_CAST.length],
        }).then((game: any) => api.startAutonomous(game.id, 30)).catch(() => null)
      );
      Promise.all(promises).finally(() => {
        setFillingLobby(false);
        queryClient.invalidateQueries({ queryKey: ['lobby-games'] });
      });
    }
  }, [games, isLoading, fillingLobby]);

  const activeGames = games.filter((g) => g.status !== 'completed');
  const completedGames = games.filter((g) => g.status === 'completed');
  const liveGames = activeGames.filter((g) => g.status === 'trading' || g.status === 'advancing');
  const openGames = activeGames.filter((g) => g.status === 'lobby');
  const aiGames = activeGames.filter((g) => (g.players ?? []).every((p) => p.is_bot));

  const filteredGames =
    filter === 'open' ? openGames :
    filter === 'live' ? liveGames :
    filter === 'ai'   ? aiGames :
    activeGames;

  const TABS: { id: FilterTab; label: string; count: number }[] = [
    { id: 'all',  label: 'All',       count: activeGames.length },
    { id: 'open', label: 'Open',      count: openGames.length },
    { id: 'live', label: 'Live',      count: liveGames.length },
    { id: 'ai',   label: '🤖 AI',    count: aiGames.length },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-bg)' }}>
      <GameNav
        rightSlot={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowJoin(true)}
              className="px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors hover:bg-white/10"
              style={{ borderColor: 'rgba(255,255,255,0.25)', color: 'white' }}
            >
              Join with code
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity"
              style={{ backgroundColor: 'var(--color-red)', color: 'white' }}
            >
              + New game
            </button>
          </div>
        }
      />

      {/* Hero bar */}
      <div style={{ backgroundColor: 'var(--color-navy)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="max-w-5xl mx-auto px-4 py-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-white">Game Lobby</h1>
              <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
                {liveGames.length > 0
                  ? `${liveGames.length} game${liveGames.length !== 1 ? 's' : ''} in progress · ${openGames.length} open to join`
                  : `${activeGames.length} active game${activeGames.length !== 1 ? 's' : ''}`}
              </p>
            </div>

            {/* Live pulse indicator */}
            {liveGames.length > 0 && (
              <div className="hidden sm:flex items-center gap-2 text-xs font-semibold" style={{ color: 'rgba(74,222,128,0.9)' }}>
                <motion.div
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="w-2 h-2 rounded-full bg-green-400"
                />
                {liveGames.length} live
              </div>
            )}
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-1 mt-4">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{
                  backgroundColor: filter === tab.id ? 'rgba(255,255,255,0.15)' : 'transparent',
                  color: filter === tab.id ? 'white' : 'rgba(255,255,255,0.45)',
                }}
              >
                {tab.label}
                <span
                  className="rounded-full px-1.5 py-0.5 text-xs"
                  style={{
                    backgroundColor: filter === tab.id ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)',
                    color: filter === tab.id ? 'white' : 'rgba(255,255,255,0.4)',
                  }}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-5xl mx-auto px-4 py-6">

        {/* Loading */}
        {isLoading && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-navy)' }} />
          </div>
        )}

        {!isLoading && (
          <>
            {fillingLobby && (
              <div className="mb-4 flex items-center gap-2 text-xs" style={{ color: 'var(--color-gray-500)' }}>
                <div className="w-3 h-3 border border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-gray-400)' }} />
                Starting AI games…
              </div>
            )}

            {/* Empty state */}
            {filteredGames.length === 0 && !fillingLobby && (
              <div className="rounded-2xl p-12 text-center" style={{ backgroundColor: 'white', border: '1px solid var(--color-gray-200)' }}>
                <p className="text-3xl mb-3">🎮</p>
                <p className="font-semibold text-base mb-1" style={{ color: 'var(--color-navy)' }}>
                  No {filter !== 'all' ? filter : ''} games right now
                </p>
                <p className="text-sm mb-5" style={{ color: 'var(--color-gray-500)' }}>
                  Start one and bots will join automatically
                </p>
                <button
                  onClick={() => setShowCreate(true)}
                  className="px-6 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90"
                  style={{ backgroundColor: 'var(--color-red)' }}
                >
                  Create game
                </button>
              </div>
            )}

            {/* Game grid */}
            <motion.div
              key={filter}
              variants={container}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {filteredGames.map((game) => (
                <motion.div key={game.id} variants={item}>
                  <GameCard game={game} />
                </motion.div>
              ))}
            </motion.div>

            {/* Completed section */}
            {completedGames.length > 0 && filter === 'all' && (
              <div className="mt-10">
                <div className="flex items-center gap-3 mb-3">
                  <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'var(--color-gray-400)' }}>
                    Recently completed
                  </p>
                  <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-gray-200)' }} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 opacity-55">
                  {completedGames.slice(0, 3).map((game) => (
                    <GameCard key={game.id} game={game} />
                  ))}
                </div>
              </div>
            )}

            {/* How to play — shown when lobby is empty or user is new */}
            {activeGames.length <= 2 && (
              <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { icon: '🖥', title: 'Play in browser', body: 'Create a game, pick a preset, bots join automatically. Trade properties every turn.' },
                  { icon: '🤖', title: 'Watch AI battle', body: 'Filter to AI tab to spectate bot games — aggressive, value-add, income strategies competing live.' },
                  { icon: '⌨️', title: 'CLI & Agent mode', body: 'npm install -g rentline-sandbox · Connect any MCP-compatible AI agent to play autonomously.' },
                ].map((card) => (
                  <div
                    key={card.title}
                    className="rounded-2xl p-5"
                    style={{ backgroundColor: 'white', border: '1px solid var(--color-gray-200)' }}
                  >
                    <div className="text-2xl mb-2">{card.icon}</div>
                    <p className="font-semibold text-sm mb-1" style={{ color: 'var(--color-navy)' }}>{card.title}</p>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--color-gray-500)' }}>{card.body}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {showCreate && <CreateGameModal onClose={() => setShowCreate(false)} />}
      {showJoin && <JoinGameModal onClose={() => setShowJoin(false)} />}
    </div>
  );
}
