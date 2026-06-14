'use client';

import { motion } from 'framer-motion';
import { PropertyCard } from './PropertyCard';
import type { GameProperty, Holding } from '@/lib/api';

interface PropertyGridProps {
  properties: GameProperty[];
  holdings: Holding[];
}

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

export function PropertyGrid({ properties, holdings }: PropertyGridProps) {
  const holdingMap = new Map(holdings.map((h) => [h.property_id, h]));

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-[var(--color-gray-500)] uppercase tracking-widest font-semibold">
          Properties ({properties.length})
        </p>
        <p className="text-xs text-[var(--color-gray-400)]">Click to trade · Improve footer</p>
      </div>
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-2 gap-3"
      >
        {properties.map((property) => (
          <PropertyCard
            key={property.id}
            property={property}
            holding={holdingMap.get(property.property_id ?? property.id)}
          />
        ))}
      </motion.div>
    </div>
  );
}
