import demoPhotos from './demoPhotos.json';
import { supabase } from './supabase';

/* The seller's stores, products and orders, read from and written to the database (the server is the truth:
   nothing here lives only in a browser).
     public.stores   one row per store; `fiche` (JSON) holds its name, products, sections, theme…
     public.orders   one row per order of a store
   The shape of `fiche` is the current site's (creer/data.js): this module reads and writes the parts the
   dashboard edits and leaves every other key exactly as it found it. */

export type Badge = '' | 'best' | 'new' | 'promo';

export interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  description: string;
  badge?: Badge | string;
  image?: string | null;
  photo?: string | null;
  /** fields this dashboard does not edit yet (drawing, colour, options…) are kept as they are */
  [key: string]: unknown;
}

/** How buyers pay her by mobile money: her Wave payment link and the numbers that receive each service. */
export interface PayNumbers { wave?: string; wavePhone?: string; orange?: string; mtn?: string; moov?: string }
export type PaymentKey = 'wave' | 'orange' | 'mtn' | 'moov' | 'cod' | 'card';
export const PAYMENT_METHODS: { key: PaymentKey; label: string; number?: keyof PayNumbers }[] = [
  { key: 'wave', label: 'Wave', number: 'wavePhone' },
  { key: 'orange', label: 'Orange Money', number: 'orange' },
  { key: 'mtn', label: 'MTN MoMo', number: 'mtn' },
  { key: 'moov', label: 'Moov Money', number: 'moov' },
  { key: 'cod', label: 'Paiement à la livraison' },
];
export interface Zone { name: string; fee: number }
export interface Section { id: string; type: string; enabled?: boolean; settings?: Record<string, unknown>; [key: string]: unknown }

export interface Fiche {
  version?: number;
  store?: { name?: string; city?: string; tagline?: string; whatsapp?: string; niche?: string; pay?: PayNumbers; [key: string]: unknown };
  products?: Product[];
  payments?: Partial<Record<PaymentKey, boolean>>;
  sections?: Section[];
  [key: string]: unknown;
}

export interface Store {
  id: string;
  slug: string;
  fiche: Fiche;
  published: boolean;
  published_at: string | null;
  custom_domain: string | null;
  domain_status: string | null;
  plan: string | null;
  updated_at: string;
  /** 'owner' for her own stores, otherwise her role in a store shared with her */
  role: string;
}

export type OrderStatus = 'nouvelle' | 'confirmee' | 'preparee' | 'expediee' | 'livree' | 'annulee';
export const ORDER_STATUSES: { id: OrderStatus; label: string }[] = [
  { id: 'nouvelle', label: 'Nouvelle' },
  { id: 'confirmee', label: 'Confirmée' },
  { id: 'preparee', label: 'Préparée' },
  { id: 'expediee', label: 'Expédiée' },
  { id: 'livree', label: 'Livrée' },
  { id: 'annulee', label: 'Annulée' },
];
export const statusLabel = (s: string): string => ORDER_STATUSES.find((x) => x.id === s)?.label ?? s;
export const PAYMENT_LABEL: Record<string, string> = { '': 'À encaisser', en_attente: 'Paiement en attente', payee: 'Payée', echouee: 'Paiement échoué', remboursee: 'Remboursée' };

export interface OrderLine { id?: string; name: string; qty: number; price: number; amount: number }
export interface Order {
  id: string;
  store_id: string;
  number: number;
  status: OrderStatus;
  customer: { name?: string; phone?: string; email?: string; commune?: string; address?: string };
  lines: OrderLine[];
  subtotal: number;
  delivery_fee: number;
  total: number;
  currency: string;
  payment: string;
  payment_status: string;
  note: string | null;
  source: string | null;
  created_at: string;
}

const STORE_COLS = 'id, slug, fiche, published, published_at, custom_domain, domain_status, plan, updated_at';

/** Her own stores, then the ones shared with her (a partner, an agency). Never the other sellers' public stores. */
export async function listStores(userId: string): Promise<Store[]> {
  const sb = supabase();
  const [own, memberships] = await Promise.all([
    sb.from('stores').select(STORE_COLS).eq('owner', userId).order('updated_at', { ascending: false }),
    sb.from('store_members').select('store_id, role').eq('user_id', userId),
  ]);
  const stores: Store[] = ((own.data ?? []) as Omit<Store, 'role'>[]).map((s) => ({ ...s, role: 'owner' }));
  const shared = ((memberships.data ?? []) as { store_id: string; role: string }[]).filter((m) => !stores.some((s) => s.id === m.store_id));
  if (shared.length) {
    const r = await sb.from('stores').select(STORE_COLS).in('id', shared.map((m) => m.store_id));
    for (const s of (r.data ?? []) as Omit<Store, 'role'>[]) stores.push({ ...s, role: shared.find((m) => m.store_id === s.id)?.role ?? 'editor' });
  }
  return stores;
}

export const storeName = (s: Store): string => (typeof s.fiche?.store?.name === 'string' && s.fiche.store.name.trim()) || s.slug;
export const storeUrl = (s: Store): string => (s.custom_domain && s.domain_status === 'verified' ? `https://${s.custom_domain}` : `https://jehre.com/b/${s.slug}`);
export const productsOf = (s: Store): Product[] => (Array.isArray(s.fiche?.products) ? s.fiche.products : []);

export type SaveResult = { ok: true; store: Store } | { ok: false; conflict: boolean };

/** Write a store's fiche. The row's `updated_at` guards against overwriting a change made elsewhere meanwhile
 *  (another tab, a partner): then nothing is written and `conflict` is true. */
export async function saveFiche(store: Store, fiche: Fiche): Promise<SaveResult> {
  const { data, error } = await supabase().from('stores').update({ fiche }).eq('id', store.id).eq('updated_at', store.updated_at).select(STORE_COLS);
  if (error) return { ok: false, conflict: false };
  const row = (data ?? [])[0] as Omit<Store, 'role'> | undefined;
  if (!row) return { ok: false, conflict: true };
  return { ok: true, store: { ...row, role: store.role } };
}

/** Write the products of a store: only `products` changes in the fiche. */
export const saveProducts = (store: Store, products: Product[]): Promise<SaveResult> => saveFiche(store, { ...store.fiche, products });

/** The photo a product shows: her own first, then the example photo it came with, else none. */
export function productPhoto(p: Product): string | null {
  for (const v of [p.image, p.photo]) {
    if (typeof v !== 'string' || !v) continue;
    if (/^(https:\/\/|data:image\/)/.test(v)) return v;
    const file = (demoPhotos as Record<string, string>)[v];
    if (file) return `https://jehre.com/creer/img/demo/${file}`;
  }
  return null;
}

/** The delivery zones live in the « Livraison » section of the store's page. */
export function zonesOf(s: Store): Zone[] {
  const sec = (s.fiche.sections ?? []).find((x) => x.type === 'delivery');
  const z = sec?.settings?.zones;
  return Array.isArray(z) ? (z as Zone[]).filter((x) => x && typeof x.name === 'string').map((x) => ({ name: x.name, fee: Number(x.fee) || 0 })) : [];
}
export function withZones(fiche: Fiche, zones: Zone[]): Fiche {
  const sections = [...(fiche.sections ?? [])];
  const i = sections.findIndex((x) => x.type === 'delivery');
  if (i >= 0) { const cur = sections[i]!; sections[i] = { ...cur, settings: { ...(cur.settings ?? {}), zones } }; }
  else {
    let n = sections.length + 1;
    while (sections.some((x) => x.id === `s${n}`)) n++;
    sections.push({ id: `s${n}`, type: 'delivery', enabled: true, settings: { title: 'Nos frais de livraison', text: 'Les frais de livraison de votre commune s’ajoutent à la commande.', zones } });
  }
  return { ...fiche, sections };
}

export function newProductId(products: Product[]): string {
  let n = products.length + 1;
  while (products.some((p) => p.id === `p${n}`)) n++;
  return `p${n}`;
}

export async function listOrders(storeId: string): Promise<Order[]> {
  const { data } = await supabase().from('orders')
    .select('id, store_id, number, status, customer, lines, subtotal, delivery_fee, total, currency, payment, payment_status, note, source, created_at')
    .eq('store_id', storeId).order('created_at', { ascending: false }).limit(500);
  return (data ?? []) as Order[];
}

export async function setOrderStatus(order: Order, status: OrderStatus): Promise<boolean> {
  const { data, error } = await supabase().from('orders').update({ status }).eq('id', order.id).select('id');
  return !error && (data ?? []).length === 1;
}
