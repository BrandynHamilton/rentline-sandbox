'use client';

import { useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { createCheckoutSession } from '@/app/actions/stripe';

interface ProLockBadgeProps {
  featureName?: string;
}

export function ProLockBadge({ featureName }: ProLockBadgeProps) {
  const [showModal, setShowModal] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [billingInterval, setBillingInterval] = useState<'year' | 'month'>('year');

  function handleUpgrade() {
    startTransition(async () => {
      const { url, error } = await createCheckoutSession(billingInterval);
      if (url) {
        window.location.href = url;
      } else {
        alert(error ?? 'Stripe not configured yet.');
      }
    });
  }

  const modal = showModal ? (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 flex items-center justify-center p-4"
        style={{ zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.6)' }}
        onClick={() => setShowModal(false)}
      >
        <motion.div
          initial={{ scale: 0.95, y: 10 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          className="rounded-2xl overflow-hidden w-full max-w-sm"
          style={{ backgroundColor: 'white', boxShadow: '0 24px 64px rgba(0,0,0,0.35)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Navy header */}
          <div className="p-6" style={{ backgroundColor: 'var(--color-navy)' }}>
            <div className="text-3xl mb-2">🔒</div>
            <h2 className="font-display text-xl font-bold text-white mb-1">
              {featureName ?? 'Pro Feature'}
            </h2>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Unlock advanced presets, all 6 bot strategies, private games, game history, and weekly tournaments.
            </p>
          </div>

          {/* White body */}
          <div className="p-6 space-y-4" style={{ backgroundColor: 'white' }}>
            {/* Billing toggle */}
            <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--color-gray-200)' }}>
              {(['year', 'month'] as const).map((interval) => (
                <button
                  key={interval}
                  onClick={() => setBillingInterval(interval)}
                  className="flex-1 py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                  style={{
                    backgroundColor: billingInterval === interval ? 'var(--color-navy)' : 'white',
                    color: billingInterval === interval ? 'white' : 'var(--color-gray-500)',
                  }}
                >
                  {interval === 'year' ? 'Annual · $99/yr' : 'Monthly · $12/mo'}
                  {interval === 'year' && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--color-positive)', color: 'white' }}>
                      −31%
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Benefits */}
            <ul className="space-y-1.5 text-sm">
              {[
                'All 5 presets: leveraged, distressed, long_run',
                'All 6 bot strategies',
                'Private games & game history',
                'Weekly tournaments with prize pool',
                'Permanent Founder badge (never expires)',
                'Early Rentline access',
              ].map((b) => (
                <li key={b} className="flex items-center gap-2" style={{ color: 'var(--color-navy)' }}>
                  <span style={{ color: 'var(--color-positive)' }}>✓</span> {b}
                </li>
              ))}
            </ul>

            <button
              onClick={handleUpgrade}
              disabled={isPending}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-red)' }}
            >
              {isPending ? 'Redirecting…' : billingInterval === 'year' ? 'Get Pro — $99/year' : 'Get Pro — $12/month'}
            </button>
            <button className="w-full py-2 text-xs" style={{ color: 'var(--color-gray-500)' }} onClick={() => setShowModal(false)}>
              Maybe later
            </button>
            <p className="text-xs text-center" style={{ color: 'var(--color-gray-400)' }}>
              Founder badge is permanent — even if you downgrade later.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  ) : null;

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setShowModal(true); }}
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold hover:opacity-80 transition-opacity"
        style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: 'var(--color-warning)', border: '1px solid rgba(245,158,11,0.3)' }}
      >
        🔒 Pro
      </button>
      {typeof window !== 'undefined' && modal && createPortal(modal, document.body)}
    </>
  );
}
