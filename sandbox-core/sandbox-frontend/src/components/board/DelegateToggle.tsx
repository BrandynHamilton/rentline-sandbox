'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';
import { createApiClient } from '@/lib/api';
import type { BotStrategy } from '@/lib/api';

interface DelegateToggleProps {
  gameId: string;
  currentDelegate?: boolean;
}

const STRATEGIES: { value: BotStrategy; label: string }[] = [
  { value: 'balanced', label: 'Balanced' },
  { value: 'aggressive', label: 'Aggressive' },
  { value: 'conservative', label: 'Conservative' },
  { value: 'income', label: 'Income' },
  { value: 'value_add', label: 'Value-Add' },
  { value: 'momentum', label: 'Momentum' },
];

export function DelegateToggle({ gameId, currentDelegate }: DelegateToggleProps) {
  const [enabled, setEnabled] = useState(currentDelegate ?? false);
  const [strategy, setStrategy] = useState<BotStrategy>('balanced');
  const { getToken } = useAuth();
  const api = createApiClient(getToken);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (on: boolean) => api.setDelegate(gameId, on, on ? strategy : undefined),
    onSuccess: (_, on) => {
      setEnabled(on);
      queryClient.invalidateQueries({ queryKey: ['game', gameId] });
    },
  });

  return (
    <div className="rounded-xl p-3 border border-[var(--color-gray-200)] bg-white" style={{ boxShadow: 'var(--shadow-card)' }}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div>
          <p className="text-xs font-semibold text-[var(--color-navy)]">AI Delegate</p>
          <p className="text-xs text-[var(--color-gray-500)]">Bot acts for you when idle</p>
        </div>
        <button
          onClick={() => mutation.mutate(!enabled)}
          disabled={mutation.isPending}
          className={`w-10 h-6 rounded-full transition-colors relative ${enabled ? 'bg-[var(--color-blue)]' : 'bg-[var(--color-gray-300)]'}`}
        >
          <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-1'}`} />
        </button>
      </div>
      {enabled && (
        <select
          value={strategy}
          onChange={(e) => setStrategy(e.target.value as BotStrategy)}
          className="w-full text-xs rounded-lg border border-[var(--color-gray-200)] px-2 py-1.5 text-[var(--color-navy)] focus:outline-none"
        >
          {STRATEGIES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      )}
    </div>
  );
}
