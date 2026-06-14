import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import numeral from 'numeral';
import type { Grade } from './api';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNav(value: number): string {
  if (Math.abs(value) >= 1_000_000) return numeral(value).format('$0.0a').toUpperCase();
  return numeral(value).format('$0,0');
}

export function formatDelta(value: number): string {
  const formatted = numeral(Math.abs(value)).format('$0,0');
  return value >= 0 ? `+${formatted}` : `-${formatted}`;
}

export function formatPercent(value: number): string {
  return numeral(value).format('0.0%');
}

export function formatRate(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export function gradeColor(grade: Grade): string {
  const map: Record<Grade, string> = {
    A: 'var(--color-grade-a)',
    B: 'var(--color-grade-b)',
    C: 'var(--color-grade-c)',
    D: 'var(--color-grade-d)',
    F: 'var(--color-grade-f)',
  };
  return map[grade];
}

export function gradeTextClass(grade: Grade): string {
  const map: Record<Grade, string> = {
    A: 'grade-a',
    B: 'grade-b',
    C: 'grade-c',
    D: 'grade-d',
    F: 'grade-f',
  };
  return map[grade];
}

export function tierName(tier: number): string {
  const names = ['Retail Investor', 'Accredited Investor', 'Professional Investor', 'Institutional Investor', 'Real Estate Developer'];
  return names[tier] ?? 'Retail Investor';
}

export function tierMinNAV(tier: number): number {
  return [0, 100_000, 500_000, 2_500_000, 25_000_000][tier] ?? 0;
}

export function macroEventSeverity(eventType: string): 'danger' | 'positive' | 'warning' | 'info' {
  const danger = ['RECESSION', 'NATURAL_DISASTER', 'BUBBLE_BURST', 'EMINENT_DOMAIN'];
  const positive = ['HOUSING_BOOM', 'GENTRIFICATION', 'PROPERTY_BUBBLE', 'INTEREST_RATE_CUT'];
  const warning = ['INTEREST_RATE_RISE', 'FED_WARNING', 'TAX_HIKE', 'INSURANCE_CRISIS'];
  if (danger.includes(eventType)) return 'danger';
  if (positive.includes(eventType)) return 'positive';
  if (warning.includes(eventType)) return 'warning';
  return 'info';
}

const FEED_ICONS: Record<string, string> = {
  BUY: '🏠', BUY_LEVERAGED: '🏦', SELL: '💰',
  RENT_RECEIVED: '💵', RENT_COLLECTED: '💵', DISTRIBUTE: '💸',
  DEBT_SERVICE: '💳', PREPAY: '💳',
  APPRECIATION: '📈', DEPRECIATION: '📉',
  VACANCY: '🚪', LEASE_RENEWAL: '📋', CAPEX_HIT: '🔧',
  FOMC_DECISION: '🏛️', FED_WARNING: '⚠️',
  TURN_START: '▶️', TURN_END: '🔔', TURN_SUMMARY: '📊',
  RECESSION: '🔴', HOUSING_BOOM: '🚀', NATURAL_DISASTER: '⚡',
  BUBBLE_BURST: '💥', PROPERTY_BUBBLE: '🫧',
  GENTRIFICATION: '🌆', EMINENT_DOMAIN: '🏛️',
  INTEREST_RATE_RISE: '📈', INTEREST_RATE_CUT: '📉',
  IMPROVE: '🔨', PACE_LIEN: '📎', REFI: '🔄', HELOC: '🏧',
};

export function feedEventIcon(eventType: string): string {
  return FEED_ICONS[eventType] ?? FEED_ICONS[Object.keys(FEED_ICONS).find(k => eventType.includes(k)) ?? ''] ?? '📋';
}

export function feedEventColor(eventType: string): string {
  if (['APPRECIATION', 'HOUSING_BOOM', 'GENTRIFICATION', 'INTEREST_RATE_CUT', 'PROPERTY_BUBBLE', 'LEASE_RENEWAL', 'BUY', 'BUY_LEVERAGED', 'RENT_RECEIVED', 'RENT_COLLECTED', 'DISTRIBUTE'].includes(eventType)) return 'positive';
  if (['DEPRECIATION', 'RECESSION', 'NATURAL_DISASTER', 'BUBBLE_BURST', 'CAPEX_HIT', 'VACANCY', 'DEBT_SERVICE'].includes(eventType)) return 'negative';
  if (['FED_WARNING', 'FOMC_DECISION', 'INTEREST_RATE_RISE'].includes(eventType)) return 'warning';
  if (['TURN_SUMMARY', 'TURN_END'].includes(eventType)) return 'info';
  return 'neutral';
}
