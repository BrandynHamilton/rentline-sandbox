'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { gsap } from 'gsap';
import type { FeedEvent } from '@/lib/api';

interface EventCinematicProps {
  events: FeedEvent[];
}

interface CinematicEvent {
  id: string;
  type: string;
  message: string;
  turn: number;
}

// Which event types get the full cinematic treatment
const CINEMATIC_TYPES = new Set([
  'RECESSION', 'HOUSING_BOOM', 'NATURAL_DISASTER', 'BUBBLE_BURST',
  'PROPERTY_BUBBLE', 'GENTRIFICATION', 'EMINENT_DOMAIN',
  'INTEREST_RATE_RISE', 'INTEREST_RATE_CUT',
  'FOMC_DECISION', 'FED_WARNING',
  'TURN_SUMMARY',
]);

const EVENT_CONFIG: Record<string, {
  bg: string;
  textColor: string;
  icon: string;
  label: string;
  shake?: boolean;
  particles?: string;
}> = {
  RECESSION:          { bg: '#8D0801', textColor: 'white', icon: '📉', label: 'RECESSION', shake: true },
  NATURAL_DISASTER:   { bg: '#8D0801', textColor: 'white', icon: '⚡', label: 'NATURAL DISASTER', shake: true },
  BUBBLE_BURST:       { bg: '#4a0505', textColor: 'white', icon: '💥', label: 'BUBBLE BURST', shake: true },
  EMINENT_DOMAIN:     { bg: '#8D0801', textColor: 'white', icon: '🏛️', label: 'EMINENT DOMAIN', shake: true },
  HOUSING_BOOM:       { bg: '#004E89', textColor: 'white', icon: '🚀', label: 'HOUSING BOOM', particles: 'blue' },
  PROPERTY_BUBBLE:    { bg: '#004E89', textColor: 'white', icon: '🫧', label: 'PROPERTY BUBBLE', particles: 'blue' },
  GENTRIFICATION:     { bg: '#22c55e', textColor: 'white', icon: '🌆', label: 'GENTRIFICATION', particles: 'green' },
  INTEREST_RATE_RISE: { bg: '#f59e0b', textColor: '#1D1E2C', icon: '📈', label: 'RATE HIKE' },
  INTEREST_RATE_CUT:  { bg: '#22c55e', textColor: 'white', icon: '📉', label: 'RATE CUT' },
  FOMC_DECISION:      { bg: '#1D1E2C', textColor: 'white', icon: '🏛️', label: 'FED DECISION' },
  FED_WARNING:        { bg: '#f59e0b', textColor: '#1D1E2C', icon: '⚠️', label: 'FED MEETING NEXT TURN' },
  TURN_SUMMARY:       { bg: '#1D1E2C', textColor: 'white', icon: '📊', label: 'TURN COMPLETE' },
};

export function EventCinematic({ events }: EventCinematicProps) {
  const [queue, setQueue] = useState<CinematicEvent[]>([]);
  const [current, setCurrent] = useState<CinematicEvent | null>(null);
  const seenIds = useRef(new Set<string>());
  const containerRef = useRef<HTMLDivElement>(null);

  // Detect new cinematic events
  useEffect(() => {
    const newEvents = events.filter(
      (e) => CINEMATIC_TYPES.has(e.event_type) && !seenIds.current.has(e.id)
    );
    if (newEvents.length === 0) return;

    newEvents.forEach((e) => seenIds.current.add(e.id));

    const cinematic = newEvents.map((e) => ({
      id: e.id,
      type: e.event_type,
      message: e.message,
      turn: e.turn,
    }));

    setQueue((q) => [...q, ...cinematic]);
  }, [events]);

  // Drain queue one by one
  useEffect(() => {
    if (current || queue.length === 0) return;
    const [next, ...rest] = queue;
    setCurrent(next);
    setQueue(rest);
  }, [queue, current]);

  // GSAP shake for danger events
  useEffect(() => {
    if (!current || !containerRef.current) return;
    const config = EVENT_CONFIG[current.type];
    if (config?.shake) {
      gsap.fromTo(
        containerRef.current,
        { x: -8 },
        { x: 8, duration: 0.07, repeat: 5, yoyo: true, ease: 'none', onComplete: () => gsap.set(containerRef.current, { x: 0 }) }
      );
    }
    // Auto-dismiss after 3.5s (TURN_SUMMARY faster)
    const duration = current.type === 'TURN_SUMMARY' ? 2500 : 3500;
    const t = setTimeout(() => setCurrent(null), duration);
    return () => clearTimeout(t);
  }, [current]);

  const config = current ? (EVENT_CONFIG[current.type] ?? EVENT_CONFIG['TURN_SUMMARY']) : null;

  return (
    <AnimatePresence>
      {current && config && (
        <motion.div
          ref={containerRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none"
          style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
        >
          <motion.div
            initial={{ scale: 0.85, y: 24 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, y: -16, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
            className="relative rounded-3xl overflow-hidden max-w-md w-full mx-4 pointer-events-auto cursor-pointer"
            style={{ backgroundColor: config.bg, boxShadow: '0 32px 80px rgba(0,0,0,0.5)' }}
            onClick={() => setCurrent(null)}
          >
            {/* Particle shimmer for positive events */}
            {config.particles && (
              <motion.div
                className="absolute inset-0 opacity-20"
                animate={{ backgroundPosition: ['0% 0%', '100% 100%'] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                style={{
                  backgroundImage: `radial-gradient(circle, ${config.particles === 'blue' ? '#60a5fa' : '#4ade80'} 1px, transparent 1px)`,
                  backgroundSize: '24px 24px',
                }}
              />
            )}

            <div className="relative px-8 py-8">
              {/* Turn badge */}
              <div className="flex items-center justify-between mb-4">
                <span
                  className="text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full"
                  style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: config.textColor }}
                >
                  Turn {current.turn}
                </span>
                <span className="text-xs opacity-50 cursor-pointer" style={{ color: config.textColor }}>
                  tap to dismiss
                </span>
              </div>

              {/* Icon + label */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-4xl">{config.icon}</span>
                <p className="font-display text-2xl font-bold leading-tight" style={{ color: config.textColor }}>
                  {config.label}
                </p>
              </div>

              {/* Message */}
              <p className="text-sm leading-relaxed opacity-85" style={{ color: config.textColor }}>
                {current.message}
              </p>

              {/* Progress bar — auto-dismiss timer */}
              <motion.div
                className="absolute bottom-0 left-0 h-1 rounded-b-3xl"
                style={{ backgroundColor: 'rgba(255,255,255,0.4)' }}
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: current.type === 'TURN_SUMMARY' ? 2.5 : 3.5, ease: 'linear' }}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
