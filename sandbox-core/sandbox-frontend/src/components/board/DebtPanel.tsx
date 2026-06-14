'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';
import { createApiClient } from '@/lib/api';
import { formatNav, formatRate } from '@/lib/utils';
import type { DebtSummary, Mortgage } from '@/lib/api';

interface DebtPanelProps {
  debt: DebtSummary;
  gameId?: string;
}

export function DebtPanel({ debt, gameId }: DebtPanelProps) {
  const [open, setOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<{ type: 'refi' | 'prepay' | 'heloc'; mortgage: Mortgage } | null>(null);
  const [prepayAmount, setPrepayAmount] = useState('');
  const [cashOutAmount, setCashOutAmount] = useState('');
  const [helocAmount, setHelocAmount] = useState('');

  const { getToken } = useAuth();
  const api = createApiClient(getToken);
  const queryClient = useQueryClient();

  const activeMortgages = (debt.mortgages ?? []).filter((m) => !m.paid_off);

  function invalidate() {
    if (!gameId) return;
    queryClient.invalidateQueries({ queryKey: ['debt', gameId] });
    queryClient.invalidateQueries({ queryKey: ['portfolio', gameId] });
    queryClient.invalidateQueries({ queryKey: ['game', gameId] });
  }

  const refiMutation = useMutation({
    mutationFn: ({ propertyId, cashOut }: { propertyId: string; cashOut: number }) =>
      api.refiMortgage(gameId!, { property_id: propertyId, cash_out_amount: cashOut }),
    onSuccess: () => { invalidate(); setActiveAction(null); },
  });

  const prepayMutation = useMutation({
    mutationFn: ({ propertyId, amount, type }: { propertyId: string; amount: number; type: string }) =>
      api.prepayPrincipal(gameId!, propertyId, amount, type as any),
    onSuccess: () => { invalidate(); setActiveAction(null); setPrepayAmount(''); },
  });

  const helocDrawMutation = useMutation({
    mutationFn: ({ propertyId, amount }: { propertyId: string; amount: number }) =>
      api.helocDraw(gameId!, propertyId, amount),
    onSuccess: () => { invalidate(); setActiveAction(null); setHelocAmount(''); },
  });

  const helocRepayMutation = useMutation({
    mutationFn: ({ propertyId, amount }: { propertyId: string; amount: number }) =>
      api.helocRepay(gameId!, propertyId, amount),
    onSuccess: () => { invalidate(); setActiveAction(null); setHelocAmount(''); },
  });

  return (
    <div className="rounded-xl bg-white border border-[var(--color-gray-200)]" style={{ boxShadow: 'var(--shadow-card)' }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[var(--color-navy)]">Debt</span>
          {activeMortgages.length > 0 && (
            <span className="text-xs bg-[var(--color-gray-200)] text-[var(--color-gray-500)] px-1.5 py-0.5 rounded-full">
              {activeMortgages.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {debt.total_monthly_payment > 0 && (
            <span className="font-financial text-sm font-semibold text-[var(--color-navy)]">
              {formatNav(debt.total_monthly_payment)}/turn
            </span>
          )}
          <span className="text-[var(--color-gray-400)] text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden border-t border-[var(--color-gray-200)]"
          >
            <div className="p-4 space-y-3">
              {activeMortgages.length === 0 && (
                <p className="text-sm text-[var(--color-gray-500)] text-center py-2">No active debt</p>
              )}

              {activeMortgages.map((m) => (
                <div key={m.id}>
                  <div className="flex items-start justify-between gap-2 text-sm">
                    <div>
                      <p className="font-semibold text-[var(--color-navy)]">{m.property_name}</p>
                      <p className="text-xs text-[var(--color-gray-500)] mt-0.5">
                        {m.mortgage_type.replace('_', ' ')} · {(m.rate_type ?? 'fixed').toUpperCase()} · {formatRate(m.rate)}
                        {(m.turns_in_arrears ?? 0) > 0 && (
                          <span className="ml-1 text-[var(--color-negative)] font-semibold">⚠ {m.turns_in_arrears} turn{m.turns_in_arrears !== 1 ? 's' : ''} behind</span>
                        )}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-financial font-semibold text-[var(--color-navy)]">{formatNav(m.balance)}</p>
                      <p className="text-xs text-[var(--color-gray-500)]">{formatNav(m.monthly_payment)}/turn</p>
                    </div>
                  </div>

                  {/* Action buttons */}
                  {gameId && (
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {['acquisition', 'refi', 'first_lien'].includes(m.mortgage_type) && (
                        <button
                          onClick={() => setActiveAction(activeAction?.mortgage.id === m.id && activeAction.type === 'refi' ? null : { type: 'refi', mortgage: m })}
                          className="text-xs px-2.5 py-1 rounded-lg border transition-colors"
                          style={{ borderColor: 'var(--color-blue)', color: 'var(--color-blue)' }}
                        >
                          Refi
                        </button>
                      )}
                      <button
                        onClick={() => setActiveAction(activeAction?.mortgage.id === m.id && activeAction.type === 'prepay' ? null : { type: 'prepay', mortgage: m })}
                        className="text-xs px-2.5 py-1 rounded-lg border transition-colors"
                        style={{ borderColor: 'var(--color-gray-300)', color: 'var(--color-gray-500)' }}
                      >
                        Prepay
                      </button>
                      {['acquisition', 'refi', 'first_lien'].includes(m.mortgage_type) && (
                        <button
                          onClick={() => setActiveAction(activeAction?.mortgage.id === m.id && activeAction.type === 'heloc' ? null : { type: 'heloc', mortgage: m })}
                          className="text-xs px-2.5 py-1 rounded-lg border transition-colors"
                          style={{ borderColor: 'var(--color-positive)', color: 'var(--color-positive)' }}
                        >
                          HELOC
                        </button>
                      )}
                    </div>
                  )}

                  {/* Refi form */}
                  <AnimatePresence>
                    {activeAction?.mortgage.id === m.id && activeAction.type === 'refi' && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-2 p-3 rounded-lg space-y-2" style={{ backgroundColor: 'var(--color-gray-100)' }}>
                          <p className="text-xs font-semibold text-[var(--color-navy)]">Refinance at current rate ({formatRate((m.rate ?? 0))})</p>
                          <div>
                            <label className="text-xs text-[var(--color-gray-500)]">Cash-out amount (0 = rate-and-term)</label>
                            <input
                              type="number"
                              min="0"
                              value={cashOutAmount}
                              onChange={(e) => setCashOutAmount(e.target.value)}
                              placeholder="0"
                              className="w-full mt-1 rounded-lg border border-[var(--color-gray-200)] px-3 py-2 text-sm font-financial text-[var(--color-navy)] focus:outline-none focus:border-[var(--color-blue)]"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => refiMutation.mutate({ propertyId: m.property_id, cashOut: parseFloat(cashOutAmount) || 0 })}
                              disabled={refiMutation.isPending}
                              className="flex-1 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-40"
                              style={{ backgroundColor: 'var(--color-blue)' }}
                            >
                              {refiMutation.isPending ? '…' : 'Confirm Refi'}
                            </button>
                            <button onClick={() => setActiveAction(null)} className="px-3 py-2 rounded-lg text-xs text-[var(--color-gray-500)]">
                              Cancel
                            </button>
                          </div>
                          {refiMutation.isError && (
                            <p className="text-xs text-[var(--color-negative)]">{(refiMutation.error as Error).message}</p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Prepay form */}
                  <AnimatePresence>
                    {activeAction?.mortgage.id === m.id && activeAction.type === 'prepay' && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-2 p-3 rounded-lg space-y-2" style={{ backgroundColor: 'var(--color-gray-100)' }}>
                          <p className="text-xs font-semibold text-[var(--color-navy)]">Prepay principal (balance: {formatNav(m.balance)})</p>
                          <input
                            type="number"
                            min="0"
                            max={m.balance}
                            value={prepayAmount}
                            onChange={(e) => setPrepayAmount(e.target.value)}
                            placeholder="Amount"
                            className="w-full rounded-lg border border-[var(--color-gray-200)] px-3 py-2 text-sm font-financial text-[var(--color-navy)] focus:outline-none"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => prepayMutation.mutate({ propertyId: m.property_id, amount: parseFloat(prepayAmount), type: m.mortgage_type })}
                              disabled={!prepayAmount || prepayMutation.isPending}
                              className="flex-1 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-40"
                              style={{ backgroundColor: 'var(--color-navy)' }}
                            >
                              {prepayMutation.isPending ? '…' : 'Prepay'}
                            </button>
                            <button
                              onClick={() => { setPrepayAmount(String(m.balance)); }}
                              className="px-3 py-2 rounded-lg text-xs border"
                              style={{ borderColor: 'var(--color-gray-300)', color: 'var(--color-gray-500)' }}
                            >
                              Pay off
                            </button>
                            <button onClick={() => setActiveAction(null)} className="px-3 py-2 rounded-lg text-xs text-[var(--color-gray-500)]">
                              Cancel
                            </button>
                          </div>
                          {prepayMutation.isError && (
                            <p className="text-xs text-[var(--color-negative)]">{(prepayMutation.error as Error).message}</p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* HELOC form */}
                  <AnimatePresence>
                    {activeAction?.mortgage.id === m.id && activeAction.type === 'heloc' && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-2 p-3 rounded-lg space-y-2" style={{ backgroundColor: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
                          <p className="text-xs font-semibold" style={{ color: 'var(--color-navy)' }}>
                            HELOC — draw against equity or repay
                          </p>
                          <p className="text-xs" style={{ color: 'var(--color-gray-500)' }}>
                            Credit limit = (price × LTV) − first lien balance
                          </p>
                          <input
                            type="number"
                            min="0"
                            value={helocAmount}
                            onChange={(e) => setHelocAmount(e.target.value)}
                            placeholder="Amount"
                            className="w-full rounded-lg border border-[var(--color-gray-200)] px-3 py-2 text-sm font-financial text-[var(--color-navy)] focus:outline-none"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => helocDrawMutation.mutate({ propertyId: m.property_id, amount: parseFloat(helocAmount) })}
                              disabled={!helocAmount || helocDrawMutation.isPending}
                              className="flex-1 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-40"
                              style={{ backgroundColor: 'var(--color-positive)' }}
                            >
                              {helocDrawMutation.isPending ? '…' : 'Draw'}
                            </button>
                            <button
                              onClick={() => helocRepayMutation.mutate({ propertyId: m.property_id, amount: parseFloat(helocAmount) })}
                              disabled={!helocAmount || helocRepayMutation.isPending}
                              className="flex-1 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-40"
                              style={{ backgroundColor: 'var(--color-navy)' }}
                            >
                              {helocRepayMutation.isPending ? '…' : 'Repay'}
                            </button>
                            <button onClick={() => setActiveAction(null)} className="px-3 py-2 rounded-lg text-xs" style={{ color: 'var(--color-gray-500)' }}>
                              Cancel
                            </button>
                          </div>
                          {(helocDrawMutation.isError || helocRepayMutation.isError) && (
                            <p className="text-xs" style={{ color: 'var(--color-negative)' }}>
                              {((helocDrawMutation.error ?? helocRepayMutation.error) as Error)?.message}
                            </p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}

              {activeMortgages.length > 0 && (
                <div className="border-t border-[var(--color-gray-200)] pt-2 flex justify-between text-sm font-semibold">
                  <span className="text-[var(--color-navy)]">Total balance</span>
                  <span className="font-financial text-[var(--color-navy)]">{formatNav(debt.total_balance)}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
