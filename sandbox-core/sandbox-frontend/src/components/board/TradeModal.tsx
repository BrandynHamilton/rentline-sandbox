'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';
import { createApiClient } from '@/lib/api';
import { playSound } from '@/lib/sounds';
import { useNotificationStore } from '@/store/notificationStore';
import { GradeBadge } from './GradeBadge';
import { formatNav, formatPercent } from '@/lib/utils';
import { useGameStore } from '@/store/gameStore';
import type { GameProperty, Portfolio } from '@/lib/api';

interface TradeModalProps {
  gameId: string;
  property: GameProperty;
  portfolio: Portfolio;
}

export function TradeModal({ gameId, property, portfolio }: TradeModalProps) {
  const { getToken } = useAuth();
  const api = createApiClient(getToken);
  const queryClient = useQueryClient();
  const closeTradeModal = useGameStore((s) => s.closeTradeModal);
  const currentPlayerId = useGameStore((s) => s.currentPlayerId);

  const [tab, setTab] = useState<'buy' | 'sell'>('buy');
  const [tokens, setTokens] = useState('');

  const holding = portfolio.holdings.find((h) => h.property_id === property.id);
  const ownedTokens = holding?.tokens_owned ?? 0;

  const tokensNum = parseFloat(tokens) || 0;
  const totalCost = tokensNum * property.current_price;
  const canAfford = portfolio.usdc_balance >= totalCost;

  const push = useNotificationStore((s) => s.push);

  const tradeMutation = useMutation({
    mutationFn: () => api.trade(gameId, property.id, tab, tokensNum),
    onSuccess: () => {
      playSound('trade');
      push({
        type: tab === 'buy' ? 'success' : 'info',
        title: tab === 'buy' ? `Bought ${tokensNum} tokens` : `Sold ${tokensNum} tokens`,
        body: `${property.name} · ${tab === 'buy' ? `−` : `+`}${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.abs(tokensNum * property.current_price))}`,
        duration: 3500,
      });
      queryClient.invalidateQueries({ queryKey: ['portfolio', gameId] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard', gameId] });
      queryClient.invalidateQueries({ queryKey: ['game', gameId] });
      closeTradeModal();
    },
  });

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4"
        onClick={closeTradeModal}
      >
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="bg-white rounded-2xl w-full max-w-md overflow-hidden"
          style={{ boxShadow: 'var(--shadow-modal)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-[var(--color-navy)] px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <p className="text-white font-display text-lg font-semibold">{property.name}</p>
                <p className="text-white/60 text-xs">{property.location}</p>
              </div>
              <GradeBadge grade={property.grade} />
            </div>
            <button onClick={closeTradeModal} className="text-white/60 hover:text-white text-2xl leading-none">×</button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-[var(--color-gray-200)]">
            {(['buy', 'sell'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-3 text-sm font-semibold transition-colors capitalize ${
                  tab === t
                    ? 'text-[var(--color-navy)] border-b-2 border-[var(--color-navy)]'
                    : 'text-[var(--color-gray-500)]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="p-6 space-y-5">
            {/* Price info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-[var(--color-gray-500)]">Price per token</p>
                <p className="font-financial text-lg font-bold text-[var(--color-navy)]">{formatNav(property.current_price)}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--color-gray-500)]">Rent yield</p>
                <p className="font-financial text-lg font-bold text-[var(--color-positive)]">{formatPercent(property.cap_rate ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--color-gray-500)]">Your cash</p>
                <p className="font-financial text-sm font-semibold text-[var(--color-navy)]">{formatNav(portfolio.usdc_balance)}</p>
              </div>
              {tab === 'sell' && (
                <div>
                  <p className="text-xs text-[var(--color-gray-500)]">You own</p>
                  <p className="font-financial text-sm font-semibold text-[var(--color-blue)]">{ownedTokens.toFixed(2)} tokens</p>
                </div>
              )}
            </div>

            {/* Token input */}
            <div>
              <label className="text-xs text-[var(--color-gray-500)] mb-1.5 block">Tokens to {tab}</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                max={tab === 'sell' ? ownedTokens : undefined}
                value={tokens}
                onChange={(e) => setTokens(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-gray-200)] px-4 py-3 font-financial text-[var(--color-navy)] focus:outline-none focus:border-[var(--color-blue)] text-lg"
                placeholder="0.00"
              />
            </div>

            {/* Cost preview */}
            {tokensNum > 0 && (
              <div className="rounded-lg bg-[var(--color-gray-100)] p-3 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--color-gray-500)]">{tab === 'buy' ? 'Total cost' : 'Proceeds'}</span>
                  <span className="font-financial font-bold text-[var(--color-navy)]">{formatNav(totalCost)}</span>
                </div>
                {tab === 'buy' && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--color-gray-500)]">Monthly rent income</span>
                    <span className="font-financial text-[var(--color-positive)]">
                      {formatNav(tokensNum * (property.rent_per_token ?? 0))}/turn
                    </span>
                  </div>
                )}
                {tab === 'buy' && !canAfford && (
                  <p className="text-xs text-[var(--color-negative)] font-semibold">Insufficient funds</p>
                )}
              </div>
            )}

            {/* Rentline CTA */}
            <p className="text-xs text-[var(--color-gray-500)] italic border-t border-[var(--color-gray-200)] pt-3">
              In Rentline, this rent payment would hit your account on the 1st of every month, automatically.
            </p>

            {/* Submit */}
            <button
              onClick={() => tradeMutation.mutate()}
              disabled={!tokensNum || tradeMutation.isPending || (tab === 'buy' && !canAfford) || (tab === 'sell' && tokensNum > ownedTokens)}
              className="w-full py-3.5 rounded-xl bg-[var(--color-red)] text-white font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            >
              {tradeMutation.isPending ? 'Processing…' : tab === 'buy' ? `Buy ${tokens || '0'} tokens` : `Sell ${tokens || '0'} tokens`}
            </button>
            {tradeMutation.isError && (
              <p className="text-xs text-[var(--color-negative)] text-center">
                {(tradeMutation.error as Error).message}
              </p>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
