'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { FeedEvent } from '@/lib/api';

interface TurnSummaryBannerProps {
  events: FeedEvent[];
}

export function TurnSummaryBanner({ events }: TurnSummaryBannerProps) {
  const [visible, setVisible] = useState(false);
  const [summary, setSummary] = useState<FeedEvent | null>(null);
  const [seenId, setSeenId] = useState<string | null>(null);

  useEffect(() => {
    // Find the latest TURN_SUMMARY or FOMC_DECISION event
    const notable = events.find(
      (e) => (e.event_type === 'TURN_SUMMARY' || e.event_type === 'FOMC_DECISION')
    );
    if (notable && notable.id !== seenId) {
      setSummary(notable);
      setVisible(true);
      setSeenId(notable.id);
      const t = setTimeout(() => setVisible(false), 6000);
      return () => clearTimeout(t);
    }
  }, [events]);

  const isFomc = summary?.event_type === 'FOMC_DECISION';

  return (
    <AnimatePresence>
      {visible && summary && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.3 }}
          className="rounded-xl px-4 py-3 flex items-start gap-3 cursor-pointer"
          style={{
            backgroundColor: isFomc ? 'rgba(245,158,11,0.12)' : 'rgba(0,78,137,0.08)',
            border: `1px solid ${isFomc ? 'rgba(245,158,11,0.3)' : 'rgba(0,78,137,0.2)'}`,
          }}
          onClick={() => setVisible(false)}
        >
          <span className="text-lg shrink-0">{isFomc ? '🏛️' : '📊'}</span>
          <p className="text-xs leading-relaxed flex-1" style={{ color: 'var(--color-navy)' }}>
            {summary.message}
          </p>
          <button className="text-xs shrink-0" style={{ color: 'var(--color-gray-400)' }}>✕</button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
