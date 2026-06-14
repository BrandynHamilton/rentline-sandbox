'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { gsap } from 'gsap';
import { macroEventSeverity } from '@/lib/utils';
import type { MacroEvent } from '@/lib/api';

const EVENT_LABELS: Record<string, string> = {
  RECESSION: 'RECESSION',
  HOUSING_BOOM: 'HOUSING BOOM',
  NATURAL_DISASTER: 'NATURAL DISASTER',
  INTEREST_RATE_RISE: 'RATE HIKE WARNING',
  INTEREST_RATE_CUT: 'RATE CUT',
  FED_WARNING: 'FED MEETING NEXT TURN',
  GENTRIFICATION: 'GENTRIFICATION',
  EMINENT_DOMAIN: 'EMINENT DOMAIN',
  BUBBLE_BURST: 'BUBBLE BURST',
  PROPERTY_BUBBLE: 'PROPERTY BUBBLE',
  TAX_HIKE: 'TAX HIKE',
  INSURANCE_CRISIS: 'INSURANCE CRISIS',
  POLICY_CHANGE: 'POLICY CHANGE',
  RENT_CONTROL: 'RENT CONTROL',
  TENANT_STRIKE: 'TENANT STRIKE',
  ZONING_CHANGE: 'ZONING CHANGE',
};

const EVENT_EFFECTS: Record<string, string> = {
  RECESSION: 'Property prices falling −5%/turn. Rent down 8%. Vacancy risk elevated.',
  HOUSING_BOOM: 'Property prices rising +6%/turn. Rent up 5%. Good time to hold.',
  NATURAL_DISASTER: 'One property hit: price −20%, rent halted, vacancy +40%.',
  INTEREST_RATE_RISE: 'ARM rate rising +1.5% next turn. ARM holders: 1 turn to refi to fixed.',
  INTEREST_RATE_CUT: 'ARM rate falling −1.0%. Your ARM mortgage payments will decrease.',
  FED_WARNING: 'Fed meets next turn. ARM holders: 1 turn to refi to fixed rate.',
  GENTRIFICATION: 'D/F properties upgraded one grade. Rent +15%, price +10%.',
  EMINENT_DOMAIN: 'One property force-purchased at 110% market value. Mortgages cleared.',
  BUBBLE_BURST: 'All prices falling −12%/turn. Vacancy +20%. Ride it out or sell.',
  PROPERTY_BUBBLE: 'All prices rising +8%/turn. High risk, high reward.',
  TAX_HIKE: 'New per-token expense applies this turn. Check your debt coverage.',
  INSURANCE_CRISIS: 'Insurance expense per token increased. Check debt service coverage.',
  POLICY_CHANGE: 'Market policy shift: prices and rents adjusting.',
  RENT_CONTROL: 'Lease renewal increases blocked for this property type.',
  TENANT_STRIKE: 'Rent collection halted for targeted property type.',
  ZONING_CHANGE: 'Targeted property type: rent −10%, price −5%.',
};

const SEVERITY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  danger: { bg: 'bg-[var(--color-negative)]', text: 'text-white', border: 'border-red-900' },
  positive: { bg: 'bg-[var(--color-blue)]', text: 'text-white', border: 'border-blue-800' },
  warning: { bg: 'bg-[var(--color-warning)]', text: 'text-[var(--color-navy)]', border: 'border-amber-500' },
  info: { bg: 'bg-[var(--color-navy)]', text: 'text-white', border: 'border-gray-700' },
};

interface MacroEventBannerProps {
  events: MacroEvent[];
}

export function MacroEventBanner({ events }: MacroEventBannerProps) {
  const safeEvents = events ?? [];
  return (
    <div className="flex flex-col gap-1">
      <AnimatePresence initial={false}>
        {safeEvents.map((event) => (
          <BannerItem key={event.id} event={event} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function BannerItem({ event }: { event: MacroEvent }) {
  const bannerRef = useRef<HTMLDivElement>(null);
  const [dismissed, setDismissed] = useState(false);
  const severity = macroEventSeverity(event.event_type);
  const styles = SEVERITY_STYLES[severity];
  const isEminent = event.event_type === 'EMINENT_DOMAIN';
  const isDanger = severity === 'danger';

  useEffect(() => {
    if (!bannerRef.current) return;
    if (isDanger) {
      gsap.fromTo(
        bannerRef.current,
        { x: -6 },
        { x: 6, duration: 0.08, repeat: 5, yoyo: true, ease: 'none' }
      );
    }
  }, [isDanger]);

  if (dismissed && !isEminent) return null;

  return (
    <motion.div
      ref={bannerRef}
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.3 }}
      className={`w-full ${styles.bg} ${styles.text} border-b ${styles.border} overflow-hidden`}
    >
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center gap-3">
        <span className="text-base font-bold font-display tracking-wide whitespace-nowrap">
          {EVENT_LABELS[event.event_type] ?? event.event_type}
        </span>
        <span className={`text-xs opacity-90 flex-1 ${severity === 'warning' ? 'text-[var(--color-navy)]' : 'text-white/90'}`}>
          {EVENT_EFFECTS[event.event_type] ?? event.description ?? ''}
        </span>
        {event.turns_remaining > 0 && (
          <span className="text-xs opacity-70 whitespace-nowrap">
            {event.turns_remaining} turn{event.turns_remaining !== 1 ? 's' : ''} remaining
          </span>
        )}
        {!isEminent && (
          <button
            onClick={() => setDismissed(true)}
            className="ml-2 opacity-70 hover:opacity-100 transition-opacity text-lg leading-none"
            aria-label="Dismiss"
          >
            ×
          </button>
        )}
        {isEminent && (
          <span className="text-xs font-bold animate-pulse">READ CAREFULLY</span>
        )}
      </div>
    </motion.div>
  );
}

export function FedWarningBanner({ nextMeetingTurn, currentTurn }: { nextMeetingTurn?: number; currentTurn: number }) {
  const [dismissed, setDismissed] = useState(false);
  if (!nextMeetingTurn || nextMeetingTurn !== currentTurn + 1 || dismissed) return null;

  return (
    <motion.div
      initial={{ height: 0 }}
      animate={{ height: 'auto' }}
      exit={{ height: 0 }}
      className="w-full bg-[var(--color-warning)] text-[var(--color-navy)] border-b border-amber-500"
    >
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-3">
        <span className="text-sm font-bold">🏛️ FED MEETING NEXT TURN</span>
        <span className="text-xs flex-1">
          ARM holders: 1 turn to refi to fixed rate before potential rate change.
        </span>
        <button onClick={() => setDismissed(true)} className="opacity-70 hover:opacity-100 text-lg">×</button>
      </div>
    </motion.div>
  );
}
