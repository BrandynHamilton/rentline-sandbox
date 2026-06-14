'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotificationStore } from '@/store/notificationStore';
import { getSoundEnabled, setSoundEnabled } from '@/lib/sounds';
import { useState } from 'react';

const TYPE_STYLES = {
  success: { bg: 'var(--color-positive)', icon: '✓', textColor: 'white' },
  warning: { bg: 'var(--color-warning)', icon: '⚠', textColor: 'var(--color-navy)' },
  danger:  { bg: 'var(--color-negative)', icon: '⚡', textColor: 'white' },
  info:    { bg: 'var(--color-blue)', icon: 'ℹ', textColor: 'white' },
  levelup: { bg: '#FFD700', icon: '✦', textColor: 'var(--color-navy)' },
};

export function NotificationCenter() {
  const { notifications, dismiss } = useNotificationStore();
  const [soundOn, setSoundOn] = useState(true);

  useEffect(() => {
    setSoundOn(getSoundEnabled());
  }, []);

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
  }

  return (
    <>
      {/* Toast stack — bottom right */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none" style={{ maxWidth: 360 }}>
        <AnimatePresence initial={false}>
          {notifications.map((n) => {
            const s = TYPE_STYLES[n.type];
            return (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                className="pointer-events-auto flex items-start gap-3 rounded-2xl px-4 py-3 shadow-lg cursor-pointer"
                style={{ backgroundColor: s.bg, minWidth: 260 }}
                onClick={() => dismiss(n.id)}
              >
                <span className="text-lg leading-none shrink-0 mt-0.5" style={{ color: s.textColor }}>{s.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-tight" style={{ color: s.textColor }}>{n.title}</p>
                  {n.body && (
                    <p className="text-xs mt-0.5 opacity-80 leading-snug" style={{ color: s.textColor }}>{n.body}</p>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Sound toggle — bottom left */}
      <button
        onClick={toggleSound}
        className="fixed bottom-4 left-4 z-[100] w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all"
        style={{
          backgroundColor: 'rgba(29,30,44,0.7)',
          color: soundOn ? 'white' : 'rgba(255,255,255,0.3)',
          backdropFilter: 'blur(8px)',
        }}
        title={soundOn ? 'Mute sounds' : 'Unmute sounds'}
      >
        {soundOn ? '🔊' : '🔇'}
      </button>
    </>
  );
}
