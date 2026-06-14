'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { createApiClient } from '@/lib/api';
import { ProLockBadge } from './ProLockBadge';
import { useGameStore } from '@/store/gameStore';
import type { Preset, BotStrategy, Game } from '@/lib/api';

interface CreateGameModalProps {
  onClose: () => void;
}

const PRESETS: Array<{ id: Preset; label: string; description: string; turns: string; pro: boolean }> = [
  { id: 'quick',      label: 'Quick',      description: 'Fast & volatile',          turns: '6 turns',   pro: false },
  { id: 'standard',   label: 'Standard',   description: 'Balanced simulation',      turns: '12 turns',  pro: false },
  { id: 'leveraged',  label: 'Leveraged',  description: 'ARM mortgages, 80% LTV',   turns: '12 turns',  pro: true  },
  { id: 'distressed', label: 'Distressed', description: 'Grade D/F only',           turns: '12 turns',  pro: true  },
  { id: 'long_run',   label: 'Long Run',   description: 'Long-horizon strategy',    turns: '120 turns', pro: true  },
];

const STRATEGY_LABELS: Record<BotStrategy, string> = {
  aggressive: 'Aggressive', conservative: 'Conservative', balanced: 'Balanced',
  momentum: 'Momentum', income: 'Income', value_add: 'Value-Add',
};

const BOT_STRATEGIES = Object.keys(STRATEGY_LABELS) as BotStrategy[];

interface BotConfig { display_name: string; strategy: BotStrategy }

const DEFAULT_BOTS: BotConfig[] = [
  { display_name: 'Aggro Agnes', strategy: 'aggressive' },
  { display_name: 'Value Victor', strategy: 'value_add' },
];
const EXTRA_BOT_NAMES = ['Income Ivan', 'Momentum Max', 'Conservative Carl', 'Balanced Beth'];

// ── Waiting room ─────────────────────────────────────────────────────────────

function WaitingRoom({ game, onStart }: { game: Game; onStart: () => void }) {
  const { getToken } = useAuth();
  const api = createApiClient(getToken);
  const queryClient = useQueryClient();

  // Poll game state every 3s to update player list
  const { data: liveGame } = useQuery<Game>({
    queryKey: ['waiting-room', game.id],
    queryFn: () => api.getGame(game.id),
    refetchInterval: 3000,
  });

  const players = liveGame?.players ?? game.players ?? [];
  const humans = players.filter((p) => !p.is_bot);
  const bots = players.filter((p) => p.is_bot);

  function copyCode() {
    navigator.clipboard.writeText(game.invite_code);
  }

  const startMutation = useMutation({
    mutationFn: () => api.advanceTurn(game.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['game', game.id] });
      onStart();
    },
  });

  return (
    <div className="flex flex-col h-full">
      {/* Invite code hero */}
      <div className="px-6 py-5 text-center" style={{ backgroundColor: 'var(--color-navy)' }}>
        <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
          Game created · Share this code
        </p>
        <button
          onClick={copyCode}
          className="group inline-flex items-center gap-3 px-6 py-3 rounded-2xl transition-all hover:scale-105"
          style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
        >
          <span className="font-financial text-3xl font-bold text-white tracking-[0.25em]">
            {game.invite_code}
          </span>
          <span className="text-xs text-white/50 group-hover:text-white/80 transition-colors">copy</span>
        </button>
        <p className="text-xs mt-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
          Friends join at sandbox.rentline.xyz → "Join with code"
        </p>
      </div>

      <div className="p-5 flex-1 overflow-y-auto space-y-4">
        {/* Players */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--color-gray-500)' }}>
            Lobby ({players.length})
          </p>
          <div className="space-y-1.5">
            {humans.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                style={{ backgroundColor: p.is_host ? 'var(--color-navy)' : 'var(--color-gray-100)' }}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ backgroundColor: p.is_host ? 'rgba(255,255,255,0.2)' : 'var(--color-gray-300)', color: p.is_host ? 'white' : 'var(--color-navy)' }}>
                  {p.display_name[0]?.toUpperCase()}
                </div>
                <span className="text-sm font-semibold" style={{ color: p.is_host ? 'white' : 'var(--color-navy)' }}>
                  {p.display_name}
                </span>
                {p.is_host && <span className="text-xs px-2 py-0.5 rounded-full ml-auto" style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)' }}>host</span>}
              </div>
            ))}
            {bots.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ backgroundColor: 'var(--color-gray-100)' }}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ backgroundColor: 'var(--color-gray-200)' }}>🤖</div>
                <span className="text-sm" style={{ color: 'var(--color-gray-500)' }}>{p.display_name}</span>
                <span className="text-xs ml-auto capitalize" style={{ color: 'var(--color-gray-400)' }}>{p.bot_strategy}</span>
              </div>
            ))}

            {/* Waiting pulse for open slots */}
            {players.length < 8 && (
              <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 border-dashed border-2" style={{ borderColor: 'var(--color-gray-200)' }}>
                <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}
                  className="w-7 h-7 rounded-full" style={{ backgroundColor: 'var(--color-gray-200)' }} />
                <span className="text-sm" style={{ color: 'var(--color-gray-400)' }}>Waiting for players…</span>
              </div>
            )}
          </div>
        </div>

        {/* Start button */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => startMutation.mutate()}
          disabled={startMutation.isPending}
          className="w-full py-3.5 rounded-xl text-white font-semibold text-sm hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-red)' }}
        >
          {startMutation.isPending ? 'Starting…' : `▶ Start Game (${humans.length} human${humans.length !== 1 ? 's' : ''} + ${bots.length} bot${bots.length !== 1 ? 's' : ''})`}
        </motion.button>
        <p className="text-xs text-center" style={{ color: 'var(--color-gray-400)' }}>
          You can start now — additional players can join mid-game
        </p>
      </div>
    </div>
  );
}

// ── Main modal ───────────────────────────────────────────────────────────────

export function CreateGameModal({ onClose }: CreateGameModalProps) {
  const { getToken } = useAuth();
  const api = createApiClient(getToken);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { setCurrentPlayer, setCurrentGame } = useGameStore();

  const [step, setStep] = useState<'form' | 'waiting'>('form');
  const [createdGame, setCreatedGame] = useState<Game | null>(null);

  const [preset, setPreset] = useState<Preset>('standard');
  const [gameName, setGameName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [bots, setBots] = useState<BotConfig[]>(DEFAULT_BOTS);

  const isAllBots = !displayName.trim();
  const effectiveAutoAdvance = isAllBots || autoAdvance;

  const addBot = () => {
    if (bots.length < 7) {
      setBots([...bots, { display_name: EXTRA_BOT_NAMES[(bots.length - 2) % EXTRA_BOT_NAMES.length], strategy: 'balanced' }]);
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const game = await api.createGameFromPreset({
        preset,
        name: gameName || (displayName ? `${displayName}'s Game` : 'Bot Arena'),
        display_name: displayName || 'Observer',
        bots,
      });
      if (effectiveAutoAdvance) await api.startAutonomous((game as any).id, 30);
      return game;
    },
    onSuccess: (game) => {
      queryClient.invalidateQueries({ queryKey: ['lobby-games'] });
      const ourPlayer = (game as any).players?.find((p: any) => !p.is_bot);
      if (ourPlayer) setCurrentPlayer(ourPlayer.id);
      setCurrentGame((game as any).id);

      if (isAllBots || effectiveAutoAdvance) {
        // Bot-only or auto-advance — go straight to game
        router.push(`/game/${(game as any).id}`);
      } else {
        // Human player — show waiting room with invite code
        setCreatedGame(game as Game);
        setStep('waiting');
      }
    },
  });

  const modalContent = (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 flex items-end sm:items-center justify-center p-4"
        style={{ zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.55)' }}
        onClick={step === 'form' ? onClose : undefined}
      >
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="rounded-2xl overflow-hidden w-full max-w-lg"
          style={{ backgroundColor: 'white', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.35)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {step === 'waiting' && createdGame ? (
            <WaitingRoom
              game={createdGame}
              onStart={() => router.push(`/game/${createdGame.id}`)}
            />
          ) : (
            <>
              {/* Header */}
              <div className="px-6 py-4 flex items-center justify-between shrink-0" style={{ backgroundColor: 'var(--color-navy)' }}>
                <p className="text-white font-display text-lg font-semibold">Create Game</p>
                <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none">×</button>
              </div>

              {/* Scrollable form */}
              <div className="overflow-y-auto flex-1 p-6 space-y-5">

                {/* Display name */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide mb-1.5 block" style={{ color: 'var(--color-gray-500)' }}>
                    Your display name
                  </label>
                  <input
                    type="text"
                    maxLength={40}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Alice"
                    className="w-full rounded-lg border px-4 py-3 text-sm focus:outline-none"
                    style={{ borderColor: 'var(--color-gray-200)', color: 'var(--color-navy)' }}
                  />
                  {!displayName.trim() && (
                    <p className="text-xs mt-1" style={{ color: 'var(--color-gray-400)' }}>
                      Leave blank to watch a bot-only game
                    </p>
                  )}
                </div>

                {/* Game name */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide mb-1.5 block" style={{ color: 'var(--color-gray-500)' }}>
                    Game name <span style={{ color: 'var(--color-gray-400)' }}>(optional)</span>
                  </label>
                  <input
                    type="text"
                    maxLength={80}
                    value={gameName}
                    onChange={(e) => setGameName(e.target.value)}
                    placeholder={displayName ? `${displayName}'s Game` : 'Bot Arena'}
                    className="w-full rounded-lg border px-4 py-3 text-sm focus:outline-none"
                    style={{ borderColor: 'var(--color-gray-200)', color: 'var(--color-navy)' }}
                  />
                </div>

                {/* Preset picker */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide mb-2 block" style={{ color: 'var(--color-gray-500)' }}>
                    Preset
                  </label>
                  <div className="grid grid-cols-1 gap-1.5">
                    {PRESETS.map((p) => (
                      <div
                        key={p.id}
                        role={!p.pro ? 'button' : undefined}
                        tabIndex={!p.pro ? 0 : undefined}
                        onClick={() => !p.pro && setPreset(p.id)}
                        onKeyDown={(e) => !p.pro && e.key === 'Enter' && setPreset(p.id)}
                        className="flex items-center justify-between rounded-xl px-4 py-3 border-2 transition-colors"
                        style={{
                          borderColor: !p.pro && preset === p.id ? 'var(--color-navy)' : 'var(--color-gray-200)',
                          backgroundColor: !p.pro && preset === p.id ? 'rgba(29,30,44,0.04)' : 'white',
                          cursor: p.pro ? 'default' : 'pointer',
                          opacity: p.pro ? 0.85 : 1,
                        }}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold" style={{ color: 'var(--color-navy)' }}>{p.label}</p>
                            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--color-gray-100)', color: 'var(--color-gray-500)' }}>
                              {p.turns}
                            </span>
                          </div>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--color-gray-500)' }}>{p.description}</p>
                        </div>
                        {p.pro
                          ? <ProLockBadge featureName={`${p.label} preset`} />
                          : preset === p.id && <span style={{ color: 'var(--color-positive)' }}>✓</span>
                        }
                      </div>
                    ))}
                  </div>
                </div>

                {/* Public / Private toggle */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide mb-2 block" style={{ color: 'var(--color-gray-500)' }}>
                    Visibility
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: false, icon: '🌐', label: 'Public', desc: 'Visible in lobby' },
                      { id: true,  icon: '🔒', label: 'Private', desc: 'Invite code only', pro: true },
                    ].map((opt) => (
                      <div
                        key={String(opt.id)}
                        onClick={() => !opt.pro && setIsPrivate(opt.id)}
                        className="rounded-xl border-2 px-4 py-3 transition-colors"
                        style={{
                          borderColor: isPrivate === opt.id && !opt.pro ? 'var(--color-navy)' : 'var(--color-gray-200)',
                          backgroundColor: isPrivate === opt.id && !opt.pro ? 'rgba(29,30,44,0.04)' : 'white',
                          cursor: opt.pro ? 'default' : 'pointer',
                        }}
                      >
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-sm font-semibold" style={{ color: 'var(--color-navy)' }}>
                            {opt.icon} {opt.label}
                          </span>
                          {opt.pro ? <ProLockBadge featureName="Private games" /> : isPrivate === opt.id && <span style={{ color: 'var(--color-positive)' }}>✓</span>}
                        </div>
                        <p className="text-xs" style={{ color: 'var(--color-gray-500)' }}>{opt.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bots */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-gray-500)' }}>
                      Bot players
                    </label>
                    <button
                      onClick={addBot}
                      disabled={bots.length >= 7}
                      className="text-xs hover:underline disabled:opacity-40"
                      style={{ color: 'var(--color-blue)' }}
                    >
                      + Add bot
                    </button>
                  </div>
                  <div className="space-y-2">
                    {bots.map((bot, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={bot.display_name}
                          onChange={(e) => { const u = [...bots]; u[i] = { ...u[i], display_name: e.target.value }; setBots(u); }}
                          className="flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none"
                          style={{ borderColor: 'var(--color-gray-200)', color: 'var(--color-navy)' }}
                        />
                        <select
                          value={bot.strategy}
                          onChange={(e) => { const u = [...bots]; u[i] = { ...u[i], strategy: e.target.value as BotStrategy }; setBots(u); }}
                          className="rounded-lg border px-2 py-2 text-xs focus:outline-none"
                          style={{ borderColor: 'var(--color-gray-200)', color: 'var(--color-navy)' }}
                        >
                          {BOT_STRATEGIES.map((s) => (
                            <option key={s} value={s}>{STRATEGY_LABELS[s]}</option>
                          ))}
                        </select>
                        <button onClick={() => setBots(bots.filter((_, idx) => idx !== i))}
                          className="text-lg leading-none hover:opacity-70"
                          style={{ color: 'var(--color-gray-400)' }}>×</button>
                      </div>
                    ))}
                    {bots.length === 0 && (
                      <p className="text-xs text-center py-2" style={{ color: 'var(--color-gray-500)' }}>No bots — humans only</p>
                    )}
                  </div>
                </div>

                {/* Auto-advance */}
                <div
                  onClick={() => !isAllBots && setAutoAdvance(!autoAdvance)}
                  className="flex items-center justify-between rounded-xl border-2 px-4 py-3"
                  style={{
                    borderColor: effectiveAutoAdvance ? 'var(--color-blue)' : 'var(--color-gray-200)',
                    backgroundColor: effectiveAutoAdvance ? 'rgba(0,78,137,0.04)' : 'white',
                    cursor: isAllBots ? 'default' : 'pointer',
                  }}
                >
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--color-navy)' }}>
                      Auto-advance turns
                      {isAllBots && <span className="ml-2 text-xs font-normal" style={{ color: 'var(--color-blue)' }}>(required for bot-only)</span>}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-gray-500)' }}>
                      Advances every 30s automatically
                    </p>
                  </div>
                  <div className="w-10 h-6 rounded-full relative transition-colors"
                    style={{ backgroundColor: effectiveAutoAdvance ? 'var(--color-blue)' : 'var(--color-gray-300)' }}>
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${effectiveAutoAdvance ? 'translate-x-5' : 'translate-x-1'}`} />
                  </div>
                </div>

                {/* Submit */}
                <button
                  onClick={() => createMutation.mutate()}
                  disabled={createMutation.isPending}
                  className="w-full py-3.5 rounded-xl text-white font-semibold text-sm hover:opacity-90 disabled:opacity-40 transition-opacity"
                  style={{ backgroundColor: 'var(--color-red)' }}
                >
                  {createMutation.isPending ? 'Creating…' : displayName.trim() ? 'Create & Get Invite Code' : 'Create Bot Game'}
                </button>
                {createMutation.isError && (
                  <p className="text-xs text-center" style={{ color: 'var(--color-negative)' }}>
                    {(createMutation.error as Error).message}
                  </p>
                )}
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  return typeof window !== 'undefined' ? createPortal(modalContent, document.body) : null;
}
