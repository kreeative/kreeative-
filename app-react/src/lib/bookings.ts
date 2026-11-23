import { SUPABASE_KEY, SUPABASE_URL, supabase } from './supabase';

/* Appointments (the booking models: REGARD, VERNIE, MINUIT). Nothing is kept in the browser: services, hours,
   rules and every appointment live on the server, behind the `bookings` function, exactly as today. */

export type ApptStatus = 'en_attente' | 'confirme' | 'termine' | 'absent' | 'annule';
export const APPT_STATUS: Record<ApptStatus, { label: string; tone: 'warn' | 'ok' | 'info' | 'err' }> = {
  en_attente: { label: 'À confirmer', tone: 'warn' }, confirme: { label: 'Confirmé', tone: 'ok' }, termine: { label: 'Terminé', tone: 'info' },
  absent: { label: 'Absente', tone: 'err' }, annule: { label: 'Annulé', tone: 'err' },
};
export const DEPOSIT_LABEL: Record<string, string> = { en_attente: 'Acompte à recevoir', recu: 'Acompte reçu', rembourse: 'Acompte remboursé', garde: 'Acompte conservé' };

export interface Appointment {
  id: string; number: number; status: ApptStatus; starts_at: string; ends_at: string;
  service: { name?: string; duration?: number; price?: number; addons?: { name?: string }[] };
  customer: { name?: string; phone?: string; email?: string };
  total: number; deposit: number; deposit_status: string; currency: string; note?: string; memo?: string; source?: string;
}
export interface Service {
  id: string; name: string; category: string; duration: number; price: number; from: boolean;
  deposit: number | null; desc: string; photo: string; active: boolean; staff: string[];
}
/** The store's booking settings. Only the services are edited here so far; the rest travels untouched. */
export interface DayHours { open: boolean; from: string; to: string; breaks: { from: string; to: string }[] }
/** The store's booking settings, as the server keeps them. What a page does not edit travels untouched. */
export interface BookingSettings {
  enabled: boolean; timezone: string; services: Service[];
  /** Sunday first (0) to Saturday (6) */
  hours: DayHours[];
  step: number; buffer: number; lead: number; horizon: number; openUntil: string;
  autoConfirm: boolean; cancelWindow: number;
  deposit: { mode: 'none' | 'fixed' | 'percent'; value: number };
  payments: string[]; address: string; intro: string;
  addons: Addon[]; staff: Staff[]; special: SpecialDay[];
  policies: { deposit: string; late: string; cancel: string; payment: string; prep: string };
  [key: string]: unknown;
}
export interface BookingHome { settings: BookingSettings; configured: boolean; bookingUrl: string; currency: string; payments: string[] }
export interface Block { id: string; starts_at: string; ends_at: string; reason: string }
export interface Agenda { appointments: Appointment[]; pending: Appointment[]; blocks: Block[]; timezone: string; today: string }
export interface Addon { id: string; name: string; duration: number; price: number; active: boolean }
export interface Staff { id: string; name: string; role: string; photo: string; active: boolean; hours: DayHours[] | null }
export interface SpecialDay { date: string; open: boolean; from: string; to: string }
/** The cities offered for the store's clock, as in the current dashboard. */
export const ZONES: [string, string][] = [['Africa/Abidjan', 'Abidjan, Dakar, Bamako (GMT)'], ['Africa/Lagos', 'Cotonou, Lagos, Douala'], ['Europe/Paris', 'Paris, Bruxelles'], ['Europe/London', 'Londres'], ['America/Toronto', 'Montréal, Toronto'], ['America/New_York', 'New York'], ['America/Chicago', 'Chicago, Houston'], ['America/Los_Angeles', 'Los Angeles']];

export type Reply<T> = ({ ok: true } & T) | { ok: false; message: string };

async function call<T>(action: string, body: Record<string, unknown>): Promise<Reply<T>> {
  try {
    const { data } = await supabase().auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { ok: false, message: 'Connectez-vous à votre compte Jehre.' };
    const r = await fetch(`${SUPABASE_URL}/functions/v1/bookings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, ...body }),
    });
    const j = (await r.json().catch(() => null)) as ({ ok?: boolean; message?: string } & T) | null;
    if (j?.ok) return { ...j, ok: true };
    return { ok: false, message: j?.message || 'Cela n’a pas fonctionné. Réessayez.' };
  } catch { return { ok: false, message: 'La connexion a été coupée. Réessayez.' }; }
}

export async function bookingHome(storeId: string): Promise<Reply<BookingHome>> {
  const r = await call<{ settings: BookingSettings; configured: boolean; bookingUrl: string; store: { currency?: string }; payments?: string[] }>('settings', { storeId });
  return r.ok ? { ok: true, settings: r.settings, configured: r.configured, bookingUrl: r.bookingUrl, currency: r.store?.currency || 'XOF', payments: r.payments ?? [] } : r;
}
export const saveBookingSettings = (storeId: string, settings: BookingSettings) => call<{ settings: BookingSettings }>('save', { storeId, settings });
export const agenda = (storeId: string, from: Date, to: Date) => call<Agenda>('list', { storeId, from: from.toISOString(), to: to.toISOString() });
/** Another day or hour for an appointment; the client is told by e-mail, as today. A taken slot is refused. */
export const moveAppt = (id: string, start: string) => call<{ appointment: Appointment }>('move', { id, start });
/** Her own note on an appointment; the client never sees it. */
export const setMemo = (id: string, memo: string) => call<{ appointment: Appointment }>('memo', { id, memo });
/** Hours nobody can book (a break, a day off, a trip). */
export const blockSlot = (storeId: string, from: string, to: string, reason: string) => call<{ block: Block }>('block', { storeId, from, to, reason });
export const unblockSlot = (id: string) => call<Record<string, never>>('unblock', { id });
export const setApptStatus = (id: string, status: ApptStatus) => call<{ appointment: Appointment }>('status', { id, status });
/** An appointment she writes herself (a call, a walk-in). The server refuses a slot that is already taken. */
export const createAppt = (storeId: string, o: { serviceId: string; start: string; customer: { name: string; phone: string }; note: string }) => call<{ appointment: Appointment }>('create', { storeId, ...o });
export interface BookingClient { name: string; phone: string; email: string; visits: number; upcoming: number; noShows: number; cancelled: number; spent: number; last: string; next: string; lastService: string }
export const bookingClients = (storeId: string) => call<{ clients: BookingClient[]; currency: string }>('clients', { storeId });
export const setDeposit = (id: string, depositStatus: string) => call<{ appointment: Appointment }>('deposit', { id, depositStatus });

/* ---------------------------------------------------------------- dates, in the store's own time zone */
const fmt = (tz: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('fr-FR', { timeZone: tz || 'Africa/Abidjan', ...o });
/** « 2026-11-23 » for an instant, in the store's time zone. */
export function dayKey(iso: string | Date, tz: string): string {
  const p = fmt(tz, { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(typeof iso === 'string' ? new Date(iso) : iso);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')}`;
}
export const hour = (iso: string, tz: string): string => fmt(tz, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
/** « lun. 23 nov. » for a day key. */
export const dayLabel = (key: string, o: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }): string =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', ...o }).format(new Date(`${key}T12:00:00Z`));
/** The day `n` days after a day key. */
export function addDays(key: string, n: number): string { return new Date(Date.parse(`${key}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10); }
export const durationLabel = (min: number): string => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${String(min % 60).padStart(2, '0')}` : ''}`);

/** « 2026-11-24 » + « 14:30 » in the store's time zone → the instant, as the server wants it. */
export function zonedInstant(date: string, time: string, tz: string): string {
  const guess = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(guess)) return '';
  // what the clock of that zone shows at `guess`, read back as if it were UTC: the difference is the zone's offset
  const p = fmt(tz, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(guess));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '00';
  const shown = Date.parse(`${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}:00Z`);
  return new Date(guess - (shown - guess)).toISOString();
}
