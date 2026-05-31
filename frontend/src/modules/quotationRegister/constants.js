/** Status badge colours — exact labels + seed variants */
export const STATUS_BADGE_STYLES = {
  'Client to advise': { bg: '#FEF3C7', text: '#92400E', border: '#F59E0B' },
  'Cover placed': { bg: '#DCFCE7', text: '#166534', border: '#22C55E' },
  'Cover placed with NCBA': { bg: '#DCFCE7', text: '#166534', border: '#22C55E' },
  'On hold': { bg: '#E2E8F0', text: '#334155', border: '#64748B' },
  'Cover not taken up': { bg: '#FEE2E2', text: '#991B1B', border: '#EF4444' },
  Declined: { bg: '#FEE2E2', text: '#991B1B', border: '#EF4444' },
  Renewed: { bg: '#CCFBF1', text: '#0F766E', border: '#14B8A6' },
  Pending: { bg: '#FEF9C3', text: '#854D0E', border: '#EAB308' },
  'Client no longer responds': { bg: '#F1F5F9', text: '#475569', border: '#94A3B8' },
}

export const DEFAULT_STATUS_STYLE = {
  bg: '#F1F5F9',
  text: '#334155',
  border: '#CBD5E1',
}

export const STORAGE_KEY = 'adt-quotation-tracker-2026'
export const FILTERS_STORAGE_KEY = 'adt-quotation-filters'
export const APP_TITLE = 'adt africa — Quotation Tracker'
export const ATTENTION_SLA_DAYS = 7

/** adt africa brand palette */
export const THEME = {
  brandBlue: '#1B5EA8',
  brandBlueDark: '#134785',
  brandBlueLight: '#E8F1FB',
  brandGreen: '#72BF44',
  brandGreenDark: '#5A9935',
  brandGreenLight: '#EDF7E6',
  navy: '#134785',
  navyLight: '#1B5EA8',
  amber: '#72BF44',
  accent: '#72BF44',
  surface: '#FFFFFF',
  pageBg: '#F0F4F9',
  border: '#DDE4EE',
  text: '#1A2332',
  textMuted: '#64748B',
  shadow: '0 1px 3px rgba(27, 94, 168, 0.06)',
  shadowMd: '0 4px 20px rgba(27, 94, 168, 0.08)',
  radius: 12,
}

export const PLACED_STATUSES = new Set([
  'Cover placed',
  'Cover placed with NCBA',
])

export const FOLLOW_UP_STATUSES = new Set(['Client to advise', 'On hold', 'Pending'])

export const STATUS_OPTIONS = [
  'Client to advise',
  'Cover placed',
  'Cover placed with NCBA',
  'On hold',
  'Cover not taken up',
  'Declined',
  'Renewed',
  'Pending',
  'Client no longer responds',
]

export function isPlacedStatus(status) {
  return PLACED_STATUSES.has(status)
}
