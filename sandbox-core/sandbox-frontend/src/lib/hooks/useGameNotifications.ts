'use client';

import { useEffect, useRef } from 'react';
import { useNotificationStore } from '@/store/notificationStore';
import { playSound } from '@/lib/sounds';
import type { FeedEvent, LeaderboardEntry, Portfolio } from '@/lib/api';

interface UseGameNotificationsProps {
  events: FeedEvent[];
  leaderboard: LeaderboardEntry[];
  portfolio?: Portfolio;
  prevPortfolio?: Portfolio;
}

const DANGER_MACROS = new Set(['RECESSION', 'NATURAL_DISASTER', 'BUBBLE_BURST', 'EMINENT_DOMAIN']);
const POSITIVE_MACROS = new Set(['HOUSING_BOOM', 'GENTRIFICATION', 'PROPERTY_BUBBLE', 'INTEREST_RATE_CUT']);

export function useGameNotifications({ events, leaderboard, portfolio, prevPortfolio }: UseGameNotificationsProps) {
  const push = useNotificationStore((s) => s.push);
  const seenIds = useRef(new Set<string>());
  const prevTier = useRef<number | null>(null);

  // Watch feed for new notable events
  useEffect(() => {
    events.forEach((e) => {
      if (seenIds.current.has(e.id)) return;
      seenIds.current.add(e.id);

      if (e.event_type === 'TURN_SUMMARY') {
        playSound('turn_complete');
        push({ type: 'info', title: `Turn complete`, body: e.message.replace('Turn \\d+ summary — ', ''), duration: 5000 });
        return;
      }

      if (e.event_type === 'FOMC_DECISION') {
        playSound('fomc');
        push({ type: 'warning', title: '🏛️ Fed Decision', body: e.message, duration: 8000 });
        return;
      }

      if (e.event_type === 'FED_WARNING') {
        playSound('fomc');
        push({ type: 'warning', title: 'Fed meeting next turn', body: 'ARM holders: 1 turn to refi to fixed rate', duration: 7000 });
        return;
      }

      if (DANGER_MACROS.has(e.event_type)) {
        playSound('danger');
        push({ type: 'danger', title: e.event_type.replace(/_/g, ' '), body: e.message, duration: 8000 });
        return;
      }

      if (POSITIVE_MACROS.has(e.event_type)) {
        playSound('macro_positive');
        push({ type: 'success', title: e.event_type.replace(/_/g, ' '), body: e.message, duration: 6000 });
        return;
      }

      if (e.event_type === 'CAPEX_HIT' && e.player_id) {
        playSound('error');
        push({ type: 'warning', title: 'CapEx hit', body: e.message, duration: 5000 });
        return;
      }

      if (e.event_type === 'VACANCY' && e.player_id) {
        push({ type: 'warning', title: 'Vacancy', body: e.message, duration: 4000 });
      }
    });
  }, [events, push]);

  // Watch for investor tier upgrade
  useEffect(() => {
    if (!portfolio) return;
    const tier = portfolio.investor_tier;
    if (prevTier.current !== null && tier > prevTier.current) {
      playSound('levelup');
      push({
        type: 'levelup',
        title: `✦ Tier upgrade!`,
        body: `You reached ${portfolio.investor_tier_name}. Better LTV and rates unlocked.`,
        duration: 7000,
      });
    }
    prevTier.current = tier;
  }, [portfolio?.investor_tier, push]);

  // Watch for trade completions (BUY/SELL from activity)
  // Called externally after mutations succeed — see TradeModal
}
