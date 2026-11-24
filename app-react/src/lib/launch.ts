import { supabase } from './supabase';

/* The launch offer, live (public.launch_spots): the Essentiel pack offered to the first sign-ups, with the REAL
   number of spots left. Same words as the current site (launch.js). Nothing shows when the offer is over or the
   count cannot be read. */

interface Spots { active?: boolean; trial?: boolean; spots?: number; left?: number; months?: number; trialMonths?: number }
export interface LaunchOffer { title: string; detail: string; left: string }

const NB = ' ';

export async function launchOffer(): Promise<LaunchOffer | null> {
  try {
    const { data, error } = await supabase().rpc('launch_spots');
    const o = (error ? null : data) as Spots | null;
    if (!o || typeof o !== 'object' || !(o.active || o.trial)) return null;
    const tm = Number(o.trialMonths) || 1;
    const first = tm > 1 ? `${tm}${NB}mois offerts` : '1er mois offert';
    const left = Number(o.left) || 0;
    // the free month comes only with the purchase of a model
    if (!o.active) return { title: `Ton ${first} d’Essentiel avec ton modèle.`, detail: 'À l’achat d’un modèle.', left: '' };
    return {
      // 3 months of Essentiel at 3 500 F = 10 500 F: « plus de 10 000 F » is true
      title: `Gagne plus de 10${NB}000${NB}F${NB}: ${o.months}${NB}mois de pack Essentiel offerts.`,
      detail: `Pour les ${o.spots} premières. Ensuite, 1er mois offert.`,
      left: left <= 20 ? `Plus que ${left} place${left > 1 ? 's' : ''}` : 'Inscris-toi vite avant que les places finissent',
    };
  } catch { return null; }
}

/** The countries Jehre's sellers call from: dial code, flag, name (the first is the default). */
export const COUNTRIES: readonly [string, string, string][] = [
  ['225', '🇨🇮', 'Côte d’Ivoire'], ['221', '🇸🇳', 'Sénégal'], ['223', '🇲🇱', 'Mali'], ['226', '🇧🇫', 'Burkina Faso'],
  ['228', '🇹🇬', 'Togo'], ['229', '🇧🇯', 'Bénin'], ['227', '🇳🇪', 'Niger'], ['224', '🇬🇳', 'Guinée'],
  ['237', '🇨🇲', 'Cameroun'], ['1', '🇨🇦', 'Canada'], ['33', '🇫🇷', 'France'], ['32', '🇧🇪', 'Belgique'],
  ['41', '🇨🇭', 'Suisse'], ['44', '🇬🇧', 'Royaume-Uni'],
];
