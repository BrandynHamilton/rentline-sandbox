'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface TurnTimerProps {
  turnStartedAt?: string | null;
  turnDurationSeconds: number;
  onExpired?: () => void;
}

export function TurnTimer({ turnStartedAt, turnDurationSeconds, onExpired }: TurnTimerProps) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    // No deadline configured, or turn hasn't started yet
    if (!turnStartedAt || turnDurationSeconds === 0) {
      setSecondsLeft(null);
      return;
    }

    function compute() {
      const elapsed = (Date.now() - new Date(turnStartedAt!).getTime()) / 1000;
      const remaining = Math.max(0, turnDurationSeconds - elapsed);
      setSecondsLeft(Math.floor(remaining));
      if (remaining <= 0) onExpired?.();
    }

    compute();
    const id = setInterval(compute, 1000);
    return () => clearInterval(id);
  }, [turnStartedAt, turnDurationSeconds, onExpired]);

  // No active timer
  if (secondsLeft === null) {
    return (
      <div className="flex flex-col items-end">
        <p className="text-xs uppercase tracking-widest mb-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Turn window</p>
        <p className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.6)' }}>
          {turnDurationSeconds === 0 ? 'Manual' : 'Waiting…'}
        </p>
      </div>
    );
  }

  const fraction = secondsLeft / turnDurationSeconds;
  const isUrgent = fraction < 0.25;
  const isCritical = fraction < 0.10;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const timeStr = `${minutes}:${String(seconds).padStart(2, '0')}`;

  const color = isCritical
    ? 'var(--color-negative)'
    : isUrgent
    ? 'var(--color-warning)'
    : 'white';

  return (
    <motion.div
      animate={
        isCritical
          ? { scale: [1, 1.05, 1], transition: { repeat: Infinity, duration: 0.5 } }
          : isUrgent
          ? { scale: [1, 1.02, 1], transition: { repeat: Infinity, duration: 1 } }
          : {}
      }
      className="flex flex-col items-end"
    >
      <p className="text-xs uppercase tracking-widest mb-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
        Turn window
      </p>
      <p className="font-financial text-2xl font-bold leading-none" style={{ color }}>
        {timeStr}
      </p>
    </motion.div>
  );
}
