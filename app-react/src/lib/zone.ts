'use client';

import { useEffect, useState } from 'react';
import { money } from './format';

/* Jehre's own prices in the visitor's money (jehre.com/api/geo, by her country).
   - In the franc CFA zones: FCFA, round prices (3 500 F…), charged in FCFA.
   - Anywhere else: charged in Canadian dollars (the money of Jehre's Stripe account). Stripe shows the buyer her own
     money at checkout and she pays the conversion. On the page: $ CA in Canada and elsewhere, « ≈ » in $ US or €
     in the United States and the euro zone.
   The server (`billing`) has its own copy of every price and charges from it. */
export type Show = 'XOF' | 'CAD' | 'USD' | 'EUR';
export interface Zone { pay: 'xof' | 'cad'; show: Show; rate: number }
export const XOF_ZONE: Zone = { pay: 'xof', show: 'XOF', rate: 1 };
const KEY = 'jehre-zone';

let known: Zone | null = null;
let asking: Promise<Zone> | null = null;
const valid = (z: Partial<Zone> | null): z is Zone => !!z && (z.pay === 'xof' || z.pay === 'cad') && ['XOF', 'CAD', 'USD', 'EUR'].includes(String(z.show)) && Number(z.rate) > 0;

/** Her zone: asked once per tab (kept for the session), the franc CFA until it is known or if it can't be read. */
export function loadZone(): Promise<Zone> {
  if (known) return Promise.resolve(known);
  try { const z = JSON.parse(window.sessionStorage.getItem(KEY) ?? 'null') as Zone | null; if (valid(z)) { known = z; return Promise.resolve(z); } } catch { /* asked below */ }
  asking ??= fetch('/api/geo', { credentials: 'omit' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j: Partial<Zone> | null) => {
      const z = valid(j) ? { pay: j.pay, show: j.show, rate: Number(j.rate) } : XOF_ZONE;
      known = z;
      try { window.sessionStorage.setItem(KEY, JSON.stringify(z)); } catch { /* asked again next time */ }
      return z;
    })
    .catch(() => XOF_ZONE);
  return asking;
}
/** The money Jehre charges her in (sent to the server with every payment). */
export const payCurrency = (): 'xof' | 'cad' => known?.pay ?? 'xof';

export function useZone(): Zone {
  const [z, setZ] = useState<Zone>(known ?? XOF_ZONE);
  useEffect(() => { let on = true; void loadZone().then((x) => { if (on) setZ(x); }); return () => { on = false; }; }, []);
  return z;
}

/** A price of Jehre in her money: « 3 500 FCFA », « 9,00 $ CA » → « 9 $ CA », « ≈ 7 $ US ». cad is in cents. */
export function zprice(z: Zone, xof: number, cad: number): string {
  if (z.show === 'XOF') return money(xof, 'XOF');
  const whole = (s: string) => s.replace(/,00(?= )/, '');
  if (z.show === 'CAD') return whole(money(cad, 'CAD'));
  return `≈ ${whole(money(Math.round((cad / 100) * z.rate) * 100, z.show))}${z.show === 'USD' ? ' US' : ''}`;
}
/** The amount she signs for or is charged: FCFA in her zone, else the Canadian dollars Stripe charges. */
export const chargedPrice = (z: Zone, xof: number, cad: number): string => (z.pay === 'xof' ? money(xof, 'XOF') : money(cad, 'CAD').replace(/,00(?= )/, ''));
/** Said under prices that are only about right. */
export const approxNote = (z: Zone): string => (z.show === 'USD' || z.show === 'EUR' ? 'Montants approximatifs : le prix exact dans votre monnaie s’affiche au paiement.' : '');
