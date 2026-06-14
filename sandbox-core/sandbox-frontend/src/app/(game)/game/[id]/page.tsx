'use client';

import { use, useEffect } from 'react';
import { useGame } from '@/lib/hooks/useGame';
import { useFeed } from '@/lib/hooks/useFeed';
import { usePortfolio } from '@/lib/hooks/usePortfolio';
import { useLeaderboard } from '@/lib/hooks/useLeaderboard';
import { useDebt } from '@/lib/hooks/useDebt';
import { useGameStore } from '@/store/gameStore';
import { PropertyMarket } from '@/components/board/PropertyMarket';
import { NAVTicker } from '@/components/board/NAVTicker';
import { MacroEventBanner, FedWarningBanner } from '@/components/board/MacroEventBanner';
import { TurnTimer } from '@/components/board/TurnTimer';
import { GameFeed } from '@/components/board/GameFeed';
import { PlayerList } from '@/components/board/PlayerList';
import { InvestorTierBar } from '@/components/board/InvestorTierBar';
import { TradeModal } from '@/components/board/TradeModal';
import { DebtPanel } from '@/components/board/DebtPanel';
import { ImprovementModal } from '@/components/board/ImprovementModal';
import { EndTurnButton } from '@/components/board/EndTurnButton';
import { TurnSummaryBanner } from '@/components/board/TurnSummaryBanner';
import { DelegateToggle } from '@/components/board/DelegateToggle';
import { EventCinematic } from '@/components/board/EventCinematic';
import { ActivityPanel } from '@/components/board/ActivityPanel';
import { GameNav } from '@/components/shared/GameNav';
import { usePlayerActions } from '@/lib/hooks/usePlayerActions';
import { useGameNotifications } from '@/lib/hooks/useGameNotifications';
import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatNav } from '@/lib/utils';

interface Props {
  params: Promise<{ id: string }>;
}

export default function GamePage({ params }: Props) {
  const { id: gameId } = use(params);
  useAuth();

  const router = useRouter();
  const { currentPlayerId, setCurrentGame, setCurrentPlayer, tradeModalPropertyId, improvementPropertyId } = useGameStore();
  const { data: game, isLoading } = useGame(gameId);
  const { data: feed = [] } = useFeed(gameId);
  const { data: leaderboard = [] } = useLeaderboard(gameId);
  const [sidebarTab, setSidebarTab] = useState<'rankings' | 'feed' | 'activity'>('feed');

  // Resolve current player. Priority:
  // 1. Clerk userId matches clerk_user_id (browser login)
  // 2. Store has currentPlayerId (set by CreateGameModal)
  // 3. API key auth: no userId — fall back to the first human player (you're the only human)
  const { userId } = useAuth();
  const humanPlayers = game?.players.filter((p) => !p.is_bot) ?? [];
  const currentPlayer = game?.players.find(
    (p) => (userId && p.clerk_user_id === userId) ||
            p.id === currentPlayerId ||
            (!userId && !currentPlayerId && !p.is_bot)
  ) ?? (humanPlayers.length === 1 ? humanPlayers[0] : undefined);
  const resolvedPlayerId = currentPlayer?.id ?? currentPlayerId ?? '';
  const isHost = currentPlayer?.is_host ?? false;

  const { data: portfolio } = usePortfolio(gameId, resolvedPlayerId);
  const { data: debt } = useDebt(gameId, resolvedPlayerId);
  const { data: playerActions = [] } = usePlayerActions(gameId, resolvedPlayerId);

  useGameNotifications({ events: feed, leaderboard, portfolio });

  // Sync resolved player into store so modals/mutations have it
  useEffect(() => { setCurrentGame(gameId); }, [gameId, setCurrentGame]);
  useEffect(() => {
    if (currentPlayer?.id && currentPlayer.id !== currentPlayerId) {
      setCurrentPlayer(currentPlayer.id);
    }
  }, [currentPlayer?.id, currentPlayerId, setCurrentPlayer]);

  // Redirect to result screen when game completes
  useEffect(() => {
    if (game?.status === 'completed') {
      router.replace(`/result/${gameId}`);
    }
  }, [game?.status, gameId, router]);

  if (isLoading || !game) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-navy)' }}>
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
          <p className="text-sm text-white/50">Loading game…</p>
        </div>
      </div>
    );
  }
  const tradeProperty = tradeModalPropertyId ? game.properties.find((p) => p.id === tradeModalPropertyId) : null;
  const improvementProperty = improvementPropertyId ? game.properties.find((p) => p.id === improvementPropertyId) : null;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--color-bg)' }}>
      {/* ── Macro banners ────────────────────────────────────────────────── */}
      <MacroEventBanner events={game.active_macros ?? []} />
      <FedWarningBanner nextMeetingTurn={game.fed?.next_meeting_turn} currentTurn={game.current_turn} />

      {/* ── Nav bar ───────────────────────────────────────────────────────── */}
      <GameNav
        gameId={gameId}
        gameName={game.name}
        gameStatus={game.status}
        currentTurn={game.current_turn}
        maxTurns={game.max_turns}
        fedRate={game.fed?.rate_current}
        mortgageRate={game.fed?.base_mortgage_rate}
        rightSlot={
          <TurnTimer
            turnStartedAt={game.turn_started_at}
            turnDurationSeconds={game.turn_duration_seconds}
          />
        }
      />

      {/* ── Three-column Bloomberg layout ─────────────────────────────────── */}
      <div className="flex-1 max-w-[1400px] mx-auto w-full px-3 py-3 grid grid-cols-1 lg:grid-cols-[280px_1fr_280px] gap-3 items-start">

        {/* ── LEFT PANEL: Your position ─────────────────────────────────── */}
        <div className="space-y-3 lg:sticky lg:top-3">

          {/* NAV card */}
          <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--color-navy)', boxShadow: 'var(--shadow-card)' }}>
            {portfolio ? (
              <>
                <NAVTicker nav={portfolio.nav} tier={portfolio.investor_tier} />
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg px-3 py-2" style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}>
                    <p className="text-white/50 mb-0.5">Cash</p>
                    <p className="font-financial font-bold text-white">{formatNav(portfolio.usdc_balance)}</p>
                  </div>
                  <div className="rounded-lg px-3 py-2" style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}>
                    <p className="text-white/50 mb-0.5">Debt</p>
                    <p className="font-financial font-bold text-white">{formatNav(portfolio.total_debt)}</p>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <div className="h-8 w-32 rounded animate-pulse" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
                <div className="h-4 w-20 rounded animate-pulse" style={{ backgroundColor: 'rgba(255,255,255,0.07)' }} />
              </div>
            )}
          </div>

          {/* Investor tier */}
          {portfolio && (
            <InvestorTierBar
              currentTier={portfolio.investor_tier}
              currentNav={portfolio.nav}
              nextTierNav={portfolio.next_tier_nav}
            />
          )}

          {/* Turn summary flash */}
          <TurnSummaryBanner events={feed} />

          {/* End turn */}
          <EndTurnButton
            gameId={gameId}
            players={game.players}
            currentPlayerId={resolvedPlayerId}
            isHost={isHost}
            gameStatus={game.status}
          />

          {/* Debt panel */}
          {debt && (
            <DebtPanel debt={debt} gameId={gameId} />
          )}

          {/* AI delegate */}
          {game.status === 'trading' && resolvedPlayerId && (
            <DelegateToggle
              gameId={gameId}
              currentDelegate={currentPlayer?.agent_delegate}
            />
          )}
        </div>

        {/* ── CENTER: Property market ───────────────────────────────────── */}
        <div className="min-w-0">
          <PropertyMarket properties={game.properties} holdings={portfolio?.holdings ?? []} />
        </div>

        {/* ── RIGHT PANEL: Tabbed ─────────────────────────────────────── */}
        <div className="lg:sticky lg:top-3 space-y-3">

          {/* Rankings always visible at top */}
          <div className="rounded-2xl p-4 bg-white" style={{ boxShadow: 'var(--shadow-card)' }}>
            <PlayerList entries={leaderboard} currentPlayerId={resolvedPlayerId} />
          </div>

          {/* Tabbed: Feed / Activity */}
          <div className="rounded-2xl bg-white overflow-hidden flex flex-col" style={{ boxShadow: 'var(--shadow-card)', height: '420px' }}>
            {/* Tab bar */}
            <div className="flex border-b shrink-0" style={{ borderColor: 'var(--color-gray-200)' }}>
              {([
                { id: 'feed', label: 'Feed' },
                { id: 'activity', label: 'My Activity' },
              ] as const).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSidebarTab(tab.id)}
                  className="flex-1 py-2.5 text-xs font-semibold transition-colors"
                  style={{
                    color: sidebarTab === tab.id ? 'var(--color-navy)' : 'var(--color-gray-500)',
                    borderBottom: sidebarTab === tab.id ? '2px solid var(--color-navy)' : '2px solid transparent',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex-1 p-4 overflow-hidden flex flex-col min-h-0">
              {sidebarTab === 'feed' && (
                <GameFeed events={feed} currentPlayerId={resolvedPlayerId} />
              )}
              {sidebarTab === 'activity' && (
                <ActivityPanel actions={playerActions} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Cinematic event popup ─────────────────────────────────────────── */}
      <EventCinematic events={feed} />

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {tradeProperty && portfolio && (
        <TradeModal gameId={gameId} property={tradeProperty} portfolio={portfolio} />
      )}
      {improvementProperty && portfolio && (
        <ImprovementModal gameId={gameId} property={improvementProperty} game={game} playerCash={portfolio.usdc_balance} />
      )}
    </div>
  );
}
