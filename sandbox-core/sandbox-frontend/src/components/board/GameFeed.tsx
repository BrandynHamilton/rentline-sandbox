'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { feedEventIcon, feedEventColor, formatNav } from '@/lib/utils';
import type { FeedEvent } from '@/lib/api';

interface GameFeedProps {
  events: FeedEvent[];
  currentPlayerId?: string;
}

// Noise — hide by default
const SKIP_TYPES = new Set(['TURN_START', 'DISTRIBUTE']);

// Only show mine
const MINE_TYPES = new Set(['RENT_RECEIVED', 'DEBT_SERVICE']);

const COLOR_MAP: Record<string, string> = {
  positive: 'var(--color-positive)',
  negative: 'var(--color-negative)',
  warning: 'var(--color-warning)',
  info: 'var(--color-blue)',
  neutral: 'var(--color-gray-400)',
};

// Turn summary gets special pill treatment
const SUMMARY_TYPES = new Set(['TURN_SUMMARY', 'TURN_END', 'FOMC_DECISION', 'FED_WARNING']);

export function GameFeed({ events, currentPlayerId }: GameFeedProps) {
  const [showAll, setShowAll] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  const filtered = events.filter((e) => {
    if (showAll) return true;
    if (SKIP_TYPES.has(e.event_type)) return false;
    if (MINE_TYPES.has(e.event_type) && e.player_id && e.player_id !== currentPlayerId) return false;
    return true;
  });

  // Auto-scroll to top when new events arrive (newest is at top)
  useEffect(() => {
    if (filtered.length > prevCountRef.current && scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    prevCountRef.current = filtered.length;
  }, [filtered.length]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'var(--color-gray-500)' }}>
          Feed
        </p>
        <button
          onClick={() => setShowAll(!showAll)}
          className="text-xs transition-colors hover:underline"
          style={{ color: 'var(--color-gray-400)' }}
        >
          {showAll ? 'Filter' : 'All'}
        </button>
      </div>

      {/* Events — newest at top */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 space-y-1 pr-0.5">
        <AnimatePresence initial={false}>
          {filtered.map((event) => {
            const colorKey = feedEventColor(event.event_type);
            const accentColor = COLOR_MAP[colorKey];
            const isMyEvent = event.player_id === currentPlayerId;
            const isSummary = SUMMARY_TYPES.has(event.event_type);
            const hasDelta = event.delta_usdc != null && Math.abs(event.delta_usdc) > 0;
            const hasPct = !hasDelta && event.delta_pct != null && event.delta_pct !== 0;

            return (
              <motion.div
                key={event.id}
                layout
                initial={{ opacity: 0, y: -12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              >
                {isSummary ? (
                  /* Turn summary — full-width divider card */
                  <div
                    className="rounded-xl px-3 py-2.5 text-xs"
                    style={{
                      backgroundColor: event.event_type === 'FOMC_DECISION' || event.event_type === 'FED_WARNING'
                        ? 'rgba(245,158,11,0.1)'
                        : 'var(--color-gray-100)',
                      border: `1px solid ${event.event_type === 'FOMC_DECISION' || event.event_type === 'FED_WARNING'
                        ? 'rgba(245,158,11,0.25)'
                        : 'var(--color-gray-200)'}`,
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-sm shrink-0">{feedEventIcon(event.event_type)}</span>
                      <p className="leading-relaxed" style={{ color: 'var(--color-navy)' }}>
                        {event.message}
                      </p>
                    </div>
                    <p className="mt-1 text-xs" style={{ color: 'var(--color-gray-400)' }}>Turn {event.turn}</p>
                  </div>
                ) : (
                  /* Regular event row */
                  <div
                    className="rounded-lg px-2.5 py-2 text-xs flex items-start gap-2"
                    style={{
                      backgroundColor: isMyEvent ? `${accentColor}12` : 'white',
                      borderLeft: `2px solid ${accentColor}`,
                    }}
                  >
                    <span className="text-sm shrink-0 leading-none mt-0.5">{feedEventIcon(event.event_type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="leading-snug" style={{ color: 'var(--color-navy)' }}>
                        {event.message}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span style={{ color: 'var(--color-gray-400)' }}>T{event.turn}</span>
                        {hasDelta && (
                          <span className="font-financial font-semibold" style={{ color: accentColor }}>
                            {(event.delta_usdc ?? 0) > 0 ? '+' : ''}{formatNav(event.delta_usdc ?? 0)}
                          </span>
                        )}
                        {hasPct && (
                          <span className="font-financial font-semibold" style={{ color: accentColor }}>
                            {(event.delta_pct! > 0 ? '+' : '')}{(event.delta_pct! * 100).toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>

        {filtered.length === 0 && (
          <p className="text-xs text-center py-8" style={{ color: 'var(--color-gray-400)' }}>
            Waiting for the first turn…
          </p>
        )}
      </div>
    </div>
  );
}
