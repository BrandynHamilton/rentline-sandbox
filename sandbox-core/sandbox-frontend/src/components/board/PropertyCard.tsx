'use client';

import { motion } from 'framer-motion';
import { GradeBadge } from './GradeBadge';
import { formatNav, formatPercent, gradeColor } from '@/lib/utils';
import { useGameStore } from '@/store/gameStore';
import type { GameProperty, Holding } from '@/lib/api';

interface PropertyCardProps {
  property: GameProperty;
  holding?: Holding;
}

const GRADE_LABELS: Record<string, string> = {
  A: 'Excellent',
  B: 'Good',
  C: 'Average',
  D: 'Distressed',
  F: 'Value-Add',
};

export function PropertyCard({ property, holding }: PropertyCardProps) {
  const openTradeModal = useGameStore((s) => s.openTradeModal);
  const openImprovementModal = useGameStore((s) => s.openImprovementModal);

  const owned = holding?.tokens_owned ?? 0;
  const yieldPct = holding?.annualized_yield ?? (property.cap_rate ?? 0);
  const rent = property.rent_per_token ?? 0;
  const gradeHex = gradeColor(property.grade);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4, boxShadow: '0 12px 32px rgba(29,30,44,0.16)' }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className="relative cursor-pointer rounded-2xl bg-white overflow-hidden select-none flex flex-col"
      style={{ boxShadow: 'var(--shadow-card)' }}
      onClick={() => openTradeModal(property.id)}
    >
      {/* Grade gradient header */}
      <div
        className="px-4 pt-4 pb-5 relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${gradeHex}22 0%, ${gradeHex}08 100%)`,
          borderBottom: `1px solid ${gradeHex}30`,
        }}
      >
        {/* Vacancy pulse */}
        {property.vacancy && (
          <motion.div
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ repeat: Infinity, duration: 1.8 }}
            className="absolute top-3 right-3 flex items-center gap-1"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-warning)]" />
            <span className="text-xs text-[var(--color-warning)] font-semibold">Vacant</span>
          </motion.div>
        )}

        {/* Mechanics lien */}
        {property.mechanics_lien && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-[var(--color-negative)]" />
        )}

        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: gradeHex }}>
              {GRADE_LABELS[property.grade]} · Grade {property.grade}
            </p>
            <h3 className="font-body text-base font-bold text-[var(--color-navy)] leading-tight">
              {property.name}
            </h3>
            <p className="text-xs text-[var(--color-gray-500)] mt-0.5 truncate">
              {property.location}
            </p>
          </div>
          <GradeBadge grade={property.grade} size="lg" animate />
        </div>
      </div>

      {/* Stats grid */}
      <div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-3 flex-1">
        <div>
          <p className="text-xs text-[var(--color-gray-500)] mb-0.5">Price</p>
          <p className="font-financial text-base font-bold text-[var(--color-navy)]">
            {formatNav(property.current_price)}
          </p>
          {property.price_delta != null && property.price_delta !== 0 && (
            <p className={`text-xs font-financial mt-0.5 ${property.price_delta > 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
              {property.price_delta > 0 ? '▲' : '▼'} {formatPercent(Math.abs(property.price_delta))}
            </p>
          )}
        </div>

        <div>
          <p className="text-xs text-[var(--color-gray-500)] mb-0.5">Cap Rate</p>
          <p className="font-financial text-base font-bold text-[var(--color-positive)]">
            {formatPercent(yieldPct)}
          </p>
          {rent > 0 && (
            <p className="text-xs text-[var(--color-gray-500)] mt-0.5 font-financial">
              {formatNav(rent)}/mo
            </p>
          )}
        </div>

        {owned > 0 && (
          <div className="col-span-2 rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--color-blue)', opacity: 1 }}>
            <p className="text-xs text-white/70 mb-0.5">Your position</p>
            <div className="flex items-center justify-between">
              <p className="font-financial text-sm font-bold text-white">
                {owned.toFixed(2)} tokens
              </p>
              <p className="font-financial text-sm font-semibold text-white/80">
                {formatNav(owned * property.current_price)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Action footer */}
      <div className="grid grid-cols-2 border-t" style={{ borderColor: 'var(--color-gray-200)' }}>
        <button
          className="py-2.5 text-xs font-semibold text-[var(--color-red)] hover:bg-[var(--color-red)] hover:text-white transition-colors"
          onClick={(e) => { e.stopPropagation(); openTradeModal(property.id); }}
        >
          Trade
        </button>
        <button
          className="py-2.5 text-xs font-semibold text-[var(--color-blue)] hover:bg-[var(--color-blue)] hover:text-white transition-colors border-l"
          style={{ borderColor: 'var(--color-gray-200)' }}
          onClick={(e) => { e.stopPropagation(); openImprovementModal(property.id); }}
        >
          Improve
        </button>
      </div>
    </motion.div>
  );
}
