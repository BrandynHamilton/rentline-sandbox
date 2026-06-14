'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { cn, gradeColor } from '@/lib/utils';
import type { Grade } from '@/lib/api';

interface GradeBadgeProps {
  grade: Grade;
  size?: 'sm' | 'md' | 'lg';
  animate?: boolean;
  className?: string;
}

export function GradeBadge({ grade, size = 'md', animate = false, className }: GradeBadgeProps) {
  const sizeClass = {
    sm: 'text-xs px-1.5 py-0.5 min-w-[1.5rem]',
    md: 'text-sm px-2 py-1 min-w-[2rem]',
    lg: 'text-base px-3 py-1.5 min-w-[2.5rem]',
  }[size];

  const badge = (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded font-bold font-mono text-white leading-none',
        sizeClass,
        className
      )}
      style={{ backgroundColor: gradeColor(grade) }}
    >
      {grade}
    </span>
  );

  if (animate) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={grade}
          initial={{ scale: 1.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 25 }}
          className="inline-flex"
        >
          {badge}
        </motion.div>
      </AnimatePresence>
    );
  }

  return badge;
}
