'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { formatNav, tierName, tierMinNAV } from '@/lib/utils';

interface InvestorTierBarProps {
  currentTier: number;
  currentNav: number;
  nextTierNav?: number;
}

const TIER_BENEFITS = [
  'Baseline terms',
  '+5% LTV, −25bps on new mortgages',
  '+10% LTV, −50bps on new mortgages',
  '+15% LTV, −75bps on new mortgages',
  '+20% LTV, −100bps on new mortgages',
];

export function InvestorTierBar({ currentTier, currentNav, nextTierNav }: InvestorTierBarProps) {
  const prevTierRef = useRef(currentTier);
  const tierNameStr = tierName(currentTier);
  const nextTierNameStr = currentTier < 4 ? tierName(currentTier + 1) : null;
  const currentTierMin = tierMinNAV(currentTier);
  const nextMin = nextTierNav ?? (currentTier < 4 ? tierMinNAV(currentTier + 1) : currentTierMin);
  const progressRange = nextMin - currentTierMin;
  const progressVal = currentNav - currentTierMin;
  const progressPct = progressRange > 0 ? Math.min(1, Math.max(0, progressVal / progressRange)) : 1;

  useEffect(() => {
    if (currentTier > prevTierRef.current) {
      // Tier up celebration — could add confetti here
    }
    prevTierRef.current = currentTier;
  }, [currentTier]);

  return (
    <div className="rounded-xl bg-white border border-[var(--color-gray-200)] p-4" style={{ boxShadow: 'var(--shadow-card)' }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs text-[var(--color-gray-500)] uppercase tracking-widest">Investor tier</p>
          <p className="font-display text-lg font-semibold text-[var(--color-navy)] mt-0.5">{tierNameStr}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-[var(--color-gray-500)]">{TIER_BENEFITS[currentTier]}</p>
        </div>
      </div>

      {nextTierNameStr && (
        <>
          <div className="flex justify-between text-xs text-[var(--color-gray-500)] mb-1.5">
            <span>{tierNameStr}</span>
            <span>{nextTierNameStr} — {formatNav(nextMin)}</span>
          </div>
          <div className="relative h-2 rounded-full bg-[var(--color-gray-200)] overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progressPct * 100}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-blue)]"
            />
          </div>
          <div className="flex justify-between text-xs text-[var(--color-gray-500)] mt-1">
            <span>{formatNav(currentNav)}</span>
            <span>{formatNav(Math.max(0, nextMin - currentNav))} to go</span>
          </div>
        </>
      )}

      {!nextTierNameStr && (
        <p className="text-xs text-[var(--color-positive)] font-semibold">
          Maximum tier reached
        </p>
      )}
    </div>
  );
}
