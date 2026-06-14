'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { PropertyCard } from './PropertyCard';
import { GradeBadge } from './GradeBadge';
import { formatNav, formatPercent, gradeColor } from '@/lib/utils';
import { useGameStore } from '@/store/gameStore';
import type { GameProperty, Holding } from '@/lib/api';

interface PropertyMarketProps {
  properties: GameProperty[];
  holdings: Holding[];
}

export function PropertyMarket({ properties, holdings }: PropertyMarketProps) {
  const [tab, setTab] = useState<'market' | 'owned'>('market');

  const holdingMap = new Map(holdings.map((h) => [h.property_id, h]));
  const ownedIds = new Set(holdings.filter((h) => h.tokens_owned > 0).map((h) => h.property_id));

  const marketProps = properties.filter((p) => !ownedIds.has(p.property_id ?? p.id));
  const ownedProps = properties.filter((p) => ownedIds.has(p.property_id ?? p.id));

  const tabs = [
    { id: 'market' as const, label: 'Market', count: marketProps.length },
    { id: 'owned' as const, label: 'Owned', count: ownedProps.length },
  ];

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.04 } },
  };

  return (
    <div>
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-4">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{
              backgroundColor: tab === t.id ? 'var(--color-navy)' : 'var(--color-gray-200)',
              color: tab === t.id ? 'white' : 'var(--color-gray-500)',
            }}
          >
            {t.label}
            <span
              className="text-xs rounded-full px-1.5 py-0.5 font-bold"
              style={{
                backgroundColor: tab === t.id ? 'rgba(255,255,255,0.2)' : 'var(--color-gray-300)',
                color: tab === t.id ? 'white' : 'var(--color-gray-500)',
              }}
            >
              {t.count}
            </span>
          </button>
        ))}
        <span className="ml-auto text-xs" style={{ color: 'var(--color-gray-400)' }}>
          Click card to trade · Improve footer
        </span>
      </div>

      {/* Market tab */}
      {tab === 'market' && (
        <motion.div
          key="market"
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          {marketProps.length === 0 ? (
            <div className="col-span-2 rounded-2xl p-8 text-center" style={{ backgroundColor: 'white', border: '1px solid var(--color-gray-200)' }}>
              <p className="text-2xl mb-2">🏆</p>
              <p className="text-sm font-semibold" style={{ color: 'var(--color-navy)' }}>You own everything!</p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-gray-500)' }}>All properties in your portfolio.</p>
            </div>
          ) : (
            marketProps.map((property) => (
              <PropertyCard
                key={property.id}
                property={property}
                holding={holdingMap.get(property.property_id ?? property.id)}
              />
            ))
          )}
        </motion.div>
      )}

      {/* Owned tab */}
      {tab === 'owned' && (
        <motion.div
          key="owned"
          variants={container}
          initial="hidden"
          animate="show"
          className="space-y-2"
        >
          {ownedProps.length === 0 ? (
            <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: 'white', border: '1px solid var(--color-gray-200)' }}>
              <p className="text-2xl mb-2">💼</p>
              <p className="text-sm font-semibold" style={{ color: 'var(--color-navy)' }}>No positions yet</p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-gray-500)' }}>Buy tokens from the Market tab to get started.</p>
            </div>
          ) : (
            <>
              {/* Portfolio summary row */}
              <div className="rounded-2xl p-4 mb-3" style={{ backgroundColor: 'var(--color-navy)' }}>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <p className="text-white/50 mb-0.5">Holdings</p>
                    <p className="font-financial font-bold text-white">
                      {formatNav(holdings.reduce((s, h) => s + h.tokens_owned * h.current_price, 0))}
                    </p>
                  </div>
                  <div>
                    <p className="text-white/50 mb-0.5">Unrealised P&L</p>
                    <p className={`font-financial font-bold ${holdings.reduce((s, h) => s + h.unrealized_pnl, 0) >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
                      {formatNav(holdings.reduce((s, h) => s + h.unrealized_pnl, 0))}
                    </p>
                  </div>
                  <div>
                    <p className="text-white/50 mb-0.5">Positions</p>
                    <p className="font-financial font-bold text-white">{ownedProps.length}</p>
                  </div>
                </div>
              </div>

              {/* Owned property rows — detailed view */}
              {ownedProps.map((property) => {
                const holding = holdingMap.get(property.property_id ?? property.id);
                if (!holding) return null;
                const pnlPct = holding.cost_basis > 0
                  ? (holding.unrealized_pnl / holding.cost_basis) * 100
                  : 0;
                const gradeHex = gradeColor(property.grade);

                return (
                  <motion.div
                    key={property.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl bg-white overflow-hidden"
                    style={{ border: `1px solid var(--color-gray-200)`, boxShadow: 'var(--shadow-card)' }}
                  >
                    {/* Header */}
                    <div
                      className="px-4 pt-3 pb-3 flex items-center justify-between gap-3"
                      style={{ background: `linear-gradient(135deg, ${gradeHex}18 0%, ${gradeHex}06 100%)`, borderBottom: `1px solid ${gradeHex}25` }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <GradeBadge grade={property.grade} size="md" animate />
                        <div className="min-w-0">
                          <p className="font-body font-bold text-sm text-[var(--color-navy)] truncate">{property.name}</p>
                          <p className="text-xs truncate" style={{ color: 'var(--color-gray-500)' }}>{property.location}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-financial font-bold text-base text-[var(--color-navy)]">{formatNav(holding.current_price)}</p>
                        {property.price_delta != null && property.price_delta !== 0 && (
                          <p className={`text-xs font-financial ${property.price_delta > 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
                            {property.price_delta > 0 ? '▲' : '▼'} {formatPercent(Math.abs(property.price_delta))}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-4 text-xs border-t" style={{ borderColor: 'var(--color-gray-200)' }}>
                      {[
                        { label: 'Tokens', value: holding.tokens_owned.toFixed(3) },
                        { label: 'Value', value: formatNav(holding.tokens_owned * holding.current_price) },
                        { label: 'P&L', value: `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%`, color: pnlPct >= 0 ? 'var(--color-positive)' : 'var(--color-negative)' },
                        { label: 'Yield', value: formatPercent(holding.annualized_yield), color: 'var(--color-positive)' },
                      ].map((stat) => (
                        <div key={stat.label} className="px-3 py-2.5 text-center">
                          <p style={{ color: 'var(--color-gray-400)' }}>{stat.label}</p>
                          <p className="font-financial font-semibold mt-0.5" style={{ color: stat.color ?? 'var(--color-navy)' }}>{stat.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Actions */}
                    <div className="grid grid-cols-2 border-t" style={{ borderColor: 'var(--color-gray-200)' }}>
                      <button
                        className="py-2.5 text-xs font-semibold transition-colors hover:bg-[var(--color-red)] hover:text-white"
                        style={{ color: 'var(--color-red)' }}
                        onClick={() => useGameStore.getState().openTradeModal(property.id)}
                      >
                        Trade
                      </button>
                      <button
                        className="py-2.5 text-xs font-semibold transition-colors hover:bg-[var(--color-blue)] hover:text-white border-l"
                        style={{ color: 'var(--color-blue)', borderColor: 'var(--color-gray-200)' }}
                        onClick={() => useGameStore.getState().openImprovementModal(property.id)}
                      >
                        Improve
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </>
          )}
        </motion.div>
      )}
    </div>
  );
}
