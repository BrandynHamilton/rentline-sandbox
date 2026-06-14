'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { formatNav } from '@/lib/utils';
import type { PlayerAction } from '@/lib/api';

interface ActivityPanelProps {
  actions: PlayerAction[];
}

const TYPE_ICONS: Record<string, string> = {
  BUY: '🏠', BUY_LEVERAGED: '🏦', SELL: '💰',
  RENT_RECEIVED: '💵', DEBT_SERVICE: '💳',
  DISTRIBUTE: '💸', IMPROVE: '🔨',
  PACE_LIEN: '📎', REFI: '🔄', HELOC: '🏧',
};

const TYPE_COLORS: Record<string, string> = {
  BUY: 'var(--color-blue)', BUY_LEVERAGED: 'var(--color-blue)',
  SELL: 'var(--color-positive)', RENT_RECEIVED: 'var(--color-positive)',
  DISTRIBUTE: 'var(--color-positive)',
  DEBT_SERVICE: 'var(--color-negative)',
  IMPROVE: 'var(--color-warning)', PACE_LIEN: 'var(--color-warning)',
};

export function ActivityPanel({ actions }: ActivityPanelProps) {
  // Group by turn
  const byTurn = actions.reduce<Record<number, PlayerAction[]>>((acc, a) => {
    const t = a.turn ?? 0;
    if (!acc[t]) acc[t] = [];
    acc[t].push(a);
    return acc;
  }, {});

  const turns = Object.keys(byTurn).map(Number).sort((a, b) => b - a);

  if (actions.length === 0) {
    return (
      <p className="text-xs text-center py-8" style={{ color: 'var(--color-gray-400)' }}>
        No activity yet
      </p>
    );
  }

  return (
    <div className="space-y-3 overflow-y-auto flex-1 min-h-0 pr-1">
      {turns.map((turn) => (
        <div key={turn}>
          <p className="text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--color-gray-400)' }}>
            Turn {turn}
          </p>
          <div className="space-y-1">
            {byTurn[turn].map((action) => {
              const type = action.type ?? action.action_type ?? '';
              const icon = TYPE_ICONS[type] ?? '📋';
              const color = TYPE_COLORS[type] ?? 'var(--color-gray-500)';
              const amount = action.amount_usdc ?? action.amount;
              const isPositive = amount != null && amount > 0;

              return (
                <motion.div
                  key={action.id ?? action.created_at}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
                  style={{ backgroundColor: 'var(--color-gray-100)', borderLeft: `2px solid ${color}` }}
                >
                  <span className="shrink-0">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="leading-snug" style={{ color: 'var(--color-navy)' }}>
                      {action.description}
                    </p>
                    {action.tokens != null && action.price_per_token_usd != null && (
                      <p className="mt-0.5 font-financial" style={{ color: 'var(--color-gray-500)' }}>
                        {action.tokens} tokens @ {formatNav(action.price_per_token_usd)}
                      </p>
                    )}
                  </div>
                  {amount != null && (
                    <span className="font-financial font-semibold shrink-0" style={{ color: isPositive ? 'var(--color-positive)' : 'var(--color-negative)' }}>
                      {isPositive ? '+' : ''}{formatNav(amount)}
                    </span>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
