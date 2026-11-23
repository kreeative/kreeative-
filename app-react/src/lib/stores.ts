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

export interface Fiche {
  version?: number;
  store?: { name?: string; city?: string; tagline?: string; whatsapp?: string; niche?: string; [key: string]: unknown };
  products?: Product[];
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

/** Write the products of a store. Only `products` changes in the fiche; the row's `updated_at` guards against
 *  overwriting a change made elsewhere meanwhile (another tab, a partner). */
export async function saveProducts(store: Store, products: Product[]): Promise<{ ok: true; store: Store } | { ok: false; conflict: boolean }> {
  const fiche: Fiche = { ...store.fiche, products };
  const { data, error } = await supabase().from('stores').update({ fiche }).eq('id', store.id).eq('updated_at', store.updated_at).select(STORE_COLS);
  if (error) return { ok: false, conflict: false };
  const row = (data ?? [])[0] as Omit<Store, 'role'> | undefined;
  if (!row) return { ok: false, conflict: true };
  return { ok: true, store: { ...row, role: store.role } };
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
