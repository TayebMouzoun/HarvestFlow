import type { Language } from '../types/domain';

export function formatKg(qty: number, lang: Language): string {
  const locale = lang === 'es' ? 'es-ES' : 'fr-FR';
  return `${new Intl.NumberFormat(locale).format(qty)} kg`;
}

export function formatTime(iso?: string, lang: Language = 'fr'): string {
  if (!iso) return '-';
  const locale = lang === 'es' ? 'es-ES' : 'fr-FR';
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatDateTime(iso?: string, lang: Language = 'fr'): string {
  if (!iso) return '-';
  const locale = lang === 'es' ? 'es-ES' : 'fr-FR';
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function getMinutesSince(iso?: string): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

export function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
