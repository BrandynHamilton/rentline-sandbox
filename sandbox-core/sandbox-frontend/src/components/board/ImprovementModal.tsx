'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';
import { createApiClient } from '@/lib/api';
import { GradeBadge } from './GradeBadge';
import { formatNav, formatRate } from '@/lib/utils';
import { useGameStore } from '@/store/gameStore';
import type { GameProperty, Game, Grade } from '@/lib/api';

interface ImprovementModalProps {
  gameId: string;
  property: GameProperty;
  game: Game;
  playerCash: number;
}

const GRADE_ORDER: Grade[] = ['A', 'B', 'C', 'D', 'F'];

function nextGrade(current: Grade): Grade | null {
  const idx = GRADE_ORDER.indexOf(current);
  return idx > 0 ? GRADE_ORDER[idx - 1] : null;
}

export function ImprovementModal({ gameId, property, game, playerCash }: ImprovementModalProps) {
  const { getToken } = useAuth();
  const api = createApiClient(getToken);
  const queryClient = useQueryClient();
  const closeImprovementModal = useGameStore((s) => s.closeImprovementModal);

  const target = nextGrade(property.grade);
  if (!target) return null;

  const steps = GRADE_ORDER.indexOf(property.grade) - GRADE_ORDER.indexOf(target);
  const upgradeCostPct = game.settings?.upgrade_cost_pct ?? game.upgrade_cost_pct ?? 0.08;
  const valueAddPct = game.settings?.improvement_value_add_pct ?? game.improvement_value_add_pct ?? 0.05;
  const cashCost = steps * upgradeCostPct * property.current_price;
  const priceBump = steps * valueAddPct * property.current_price;
  const newPrice = property.current_price + priceBump;
  const paceLienRate = (game.fed?.base_mortgage_rate ?? 0.075) + (game.settings?.pace_spread ?? game.pace_spread ?? 0.015);
  const monthlyPayment = (cashCost * paceLienRate) / 12;

  const cashMutation = useMutation({
    mutationFn: () => api.improveProperty(gameId, property.id, target),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['game', gameId] });
      queryClient.invalidateQueries({ queryKey: ['portfolio', gameId] });
      closeImprovementModal();
    },
  });

  const paceMutation = useMutation({
    mutationFn: () => api.originatePaceLien(gameId, property.id, target),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['game', gameId] });
      queryClient.invalidateQueries({ queryKey: ['portfolio', gameId] });
      queryClient.invalidateQueries({ queryKey: ['debt', gameId] });
      closeImprovementModal();
    },
  });

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
        onClick={closeImprovementModal}
      >
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="bg-white rounded-2xl w-full max-w-lg overflow-hidden"
          style={{ boxShadow: 'var(--shadow-modal)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-[var(--color-navy)] px-6 py-4 flex items-center justify-between">
            <div>
              <p className="text-white font-display text-lg font-semibold">Improve {property.name}</p>
              <div className="flex items-center gap-2 mt-1">
                <GradeBadge grade={property.grade} size="sm" />
                <span className="text-white/60 text-xs">→</span>
                <GradeBadge grade={target} size="sm" />
              </div>
            </div>
            <button onClick={closeImprovementModal} className="text-white/60 hover:text-white text-2xl">×</button>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-2 gap-4">
              {/* Cash option */}
              <div className="rounded-xl border-2 border-[var(--color-gray-200)] p-4 space-y-3">
                <p className="font-semibold text-[var(--color-navy)]">Cash Upgrade</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[var(--color-gray-500)]">Cost</span>
                    <span className="font-financial font-semibold text-[var(--color-navy)]">{formatNav(cashCost)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--color-gray-500)]">Price bump</span>
                    <span className="font-financial text-[var(--color-positive)]">+{formatNav(priceBump)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--color-gray-500)]">New debt</span>
                    <span className="font-financial text-[var(--color-positive)]">None</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--color-gray-500)]">Your cash</span>
                    <span className={`font-financial ${playerCash >= cashCost ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
                      {formatNav(playerCash)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => cashMutation.mutate()}
                  disabled={playerCash < cashCost || cashMutation.isPending}
                  className="w-full py-2.5 rounded-lg bg-[var(--color-navy)] text-white text-sm font-semibold disabled:opacity-40 hover:opacity-90"
                >
                  {cashMutation.isPending ? '…' : playerCash < cashCost ? 'Insufficient funds' : 'Pay cash'}
                </button>
              </div>

              {/* PACE option */}
              <div className="rounded-xl border-2 border-[var(--color-blue)]/30 p-4 space-y-3 bg-[var(--color-blue)]/3">
                <p className="font-semibold text-[var(--color-navy)]">PACE Lien</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[var(--color-gray-500)]">Cash required</span>
                    <span className="font-financial text-[var(--color-positive)]">$0</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--color-gray-500)]">Loan amount</span>
                    <span className="font-financial font-semibold text-[var(--color-navy)]">{formatNav(cashCost)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--color-gray-500)]">Rate</span>
                    <span className="font-financial text-[var(--color-warning)]">{formatRate(paceLienRate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--color-gray-500)]">Monthly</span>
                    <span className="font-financial text-[var(--color-navy)]">{formatNav(monthlyPayment)}/turn</span>
                  </div>
                </div>
                <button
                  onClick={() => paceMutation.mutate()}
                  disabled={paceMutation.isPending}
                  className="w-full py-2.5 rounded-lg bg-[var(--color-blue)] text-white text-sm font-semibold disabled:opacity-40 hover:opacity-90"
                >
                  {paceMutation.isPending ? '…' : 'PACE finance'}
                </button>
              </div>
            </div>

            <p className="text-xs text-[var(--color-gray-500)] mt-4 text-center">
              New price after upgrade: <span className="font-financial font-semibold">{formatNav(newPrice)}</span>. Grade improves immediately.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
