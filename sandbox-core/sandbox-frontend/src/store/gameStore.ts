'use client';

import { create } from 'zustand';
import type { Player } from '@/lib/api';

interface GameStore {
  currentPlayerId: string | null;
  currentGameId: string | null;
  setCurrentPlayer: (playerId: string) => void;
  setCurrentGame: (gameId: string) => void;
  clearGame: () => void;
  // Trade modal state
  tradeModalPropertyId: string | null;
  openTradeModal: (propertyId: string) => void;
  closeTradeModal: () => void;
  // Improvement modal state
  improvementPropertyId: string | null;
  openImprovementModal: (propertyId: string) => void;
  closeImprovementModal: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  currentPlayerId: null,
  currentGameId: null,
  setCurrentPlayer: (playerId) => set({ currentPlayerId: playerId }),
  setCurrentGame: (gameId) => set({ currentGameId: gameId }),
  clearGame: () => set({ currentPlayerId: null, currentGameId: null }),
  tradeModalPropertyId: null,
  openTradeModal: (propertyId) => set({ tradeModalPropertyId: propertyId }),
  closeTradeModal: () => set({ tradeModalPropertyId: null }),
  improvementPropertyId: null,
  openImprovementModal: (propertyId) => set({ improvementPropertyId: propertyId }),
  closeImprovementModal: () => set({ improvementPropertyId: null }),
}));
