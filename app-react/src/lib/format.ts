const NB = ' ';

const SYMBOL: Record<string, string> = { XOF: 'FCFA', EUR: '€', USD: '$', CAD: '$ CA' };
/** Currencies whose amounts are stored in cents (the franc CFA has no cents). */
const CENTS = new Set(['EUR', 'USD', 'CAD']);

/** 18000, 'XOF' → « 18 000 FCFA » ; 2499, 'CAD' → « 24,99 $ CA » */
export function money(amount: number, currency = 'XOF'): string {
  const cur = (currency || 'XOF').toUpperCase();
  const value = CENTS.has(cur) ? amount / 100 : amount;
  const text = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: CENTS.has(cur) ? 2 : 0, maximumFractionDigits: CENTS.has(cur) ? 2 : 0 }).format(value).replace(/[   ]/g, NB);
  return `${text}${NB}${SYMBOL[cur] ?? cur}`;
}

/** « aujourd’hui 14:05 », « hier 09:12 », « 21 nov. » */
export function when(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 864e5);
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (diff === 0) return `aujourd’hui ${time}`;
  if (diff === 1) return `hier ${time}`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}

export const plural = (n: number, one: string, many: string): string => `${n}${NB}${n > 1 ? many : one}`;

/** A WhatsApp link to a number as typed by a customer. */
export function waLink(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  return digits ? `https://wa.me/${digits}` : '';
}

/** An amount already in the currency's own unit (18000 FCFA, 24.99 $): what the booking server sends. */
export const price = (amount: number, currency = 'XOF'): string => money(CENTS.has((currency || 'XOF').toUpperCase()) ? Math.round(amount * 100) : amount, currency);
