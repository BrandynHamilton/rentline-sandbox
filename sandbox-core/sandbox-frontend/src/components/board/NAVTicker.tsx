'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { gsap } from 'gsap';
import numeral from 'numeral';
import { formatDelta, tierName } from '@/lib/utils';

interface NAVTickerProps {
  nav: number;
  delta?: number;
  tier: number;
  tierName?: string;
}

export function NAVTicker({ nav, delta, tier }: NAVTickerProps) {
  const countRef = useRef<HTMLSpanElement>(null);
  const prevNavRef = useRef<number>(nav);
  const [showDelta, setShowDelta] = useState(false);

  useEffect(() => {
    if (!countRef.current) return;
    const from = prevNavRef.current;
    if (from === nav) return;

    setShowDelta(true);

    const obj = { val: from };
    gsap.to(obj, {
      val: nav,
      duration: 0.8,
      ease: 'power2.out',
      onUpdate() {
        if (countRef.current) {
          countRef.current.textContent = numeral(obj.val).format('$0,0');
        }
      },
    });

    prevNavRef.current = nav;

    const timeout = setTimeout(() => setShowDelta(false), 3000);
    return () => clearTimeout(timeout);
  }, [nav]);

  const isPositive = (delta ?? 0) >= 0;
  const tierLabel = tierName(tier);

  return (
    <div className="flex flex-col items-start">
      <p className="text-xs uppercase tracking-widest font-body mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
        Your NAV
      </p>
      <div className="flex items-baseline gap-3">
        <span
          ref={countRef}
          className="font-financial text-3xl font-bold text-white leading-none"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {numeral(nav).format('$0,0')}
        </span>
        <AnimatePresence>
          {showDelta && delta != null && Math.abs(delta) > 0 && (
            <motion.span
              key={delta}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className={`font-financial text-sm font-semibold ${isPositive ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}
            >
              {formatDelta(delta)}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <div className="flex items-center gap-1.5 mt-1.5">
        <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: `var(--color-grade-${tier === 0 ? 'c' : tier === 1 ? 'b' : 'a'})` }} />
        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>{tierLabel}</span>
      </div>
    </div>
  );
}
