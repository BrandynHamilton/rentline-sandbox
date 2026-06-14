'use client';

import { create } from 'zustand';

export type NotificationType = 'success' | 'warning' | 'danger' | 'info' | 'levelup';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body?: string;
  duration?: number; // ms, default 4000
}

interface NotificationStore {
  notifications: AppNotification[];
  push: (n: Omit<AppNotification, 'id'>) => void;
  dismiss: (id: string) => void;
}

let _id = 0;

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],
  push: (n) => {
    const id = String(++_id);
    set((s) => ({ notifications: [...s.notifications, { ...n, id }] }));
    const duration = n.duration ?? 4000;
    if (duration > 0) {
      setTimeout(() => set((s) => ({ notifications: s.notifications.filter((x) => x.id !== id) })), duration);
    }
  },
  dismiss: (id) => set((s) => ({ notifications: s.notifications.filter((x) => x.id !== id) })),
}));
