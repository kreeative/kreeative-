'use client';

import { CloudLoader } from '@/components/ui/CloudLoader';
import { useEffect, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { Empty, PageHead } from '@/components/admin/AdminShell';
import { ButtonLink } from '@/components/ui/Button';
import { Globe } from '@/components/admin/Globe';
import { Icon } from '@/components/ui/Icon';
import { Notice } from '@/components/ui/Notice';
import { liveVisits, type Live } from '@/lib/team';
import shared from '../admin.module.css';
import styles from './live.module.css';

const NB = '\u00a0';
function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  return s < 60 ? 'à l’instant' : s < 3600 ? `il y a ${Math.round(s / 60)}${NB}min` : `il y a ${Math.round(s / 3600)}${NB}h`;
}
/** Example visitors, for a plan without « En direct »: the same page, alive, nothing read from the server. */
function sample(): Live {
  const at = (min: number) => new Date(Date.now() - min * 60000).toISOString();
  const P: [number, number, string, string, number][] = [[5.35, -4.0, 'Abidjan', 'CI', 1], [14.7, -17.45, 'Dakar', 'SN', 2], [6.13, 1.22, 'Lomé', 'TG', 3], [48.85, 2.35, 'Paris', 'FR', 14], [12.64, -8.0, 'Bamako', 'ML', 31],
    [6.37, 2.43, 'Cotonou', 'BJ', 52], [45.5, -73.57, 'Montréal', 'CA', 95], [12.37, -1.52, 'Ouagadougou', 'BF', 140], [50.85, 4.35, 'Bruxelles', 'BE', 210], [40.71, -74.0, 'New York', 'US', 380]];
  return { ok: true, now: 3, today: 64, week: 312, points: P.map((x) => ({ lat: x[0], lon: x[1], city: x[2], country: x[3], at: at(x[4]), live: x[4] < 5 })),
    countries: ([['CI', 31], ['SN', 12], ['FR', 8], ['ML', 5], ['TG', 4], ['CA', 2]] as [string, number][]).map(([country, n]) => ({ country, n })) };
}

const COUNTRY = (code: string): string => { try { return new Intl.DisplayNames(['fr'], { type: 'region' }).of(code.toUpperCase()) ?? code; } catch { return code; } };

/** « En direct »: who is on the store right now, today and this week, and from where. Read again every 30 seconds.
 *  It comes with the Pro and Business plans (the server decides). */
export default function LivePage() {
  const { store } = useAdmin();
  const [live, setLive] = useState<Live | null | undefined>(undefined);
  const storeId = store?.id ?? '';

  useEffect(() => {
    if (!storeId) return;
    let on = true;
    const read = () => void liveVisits(storeId).then((r) => { if (on) setLive(r); });
    setLive(undefined); read();
    const t = setInterval(() => { if (!document.hidden) read(); }, 30000);
    return () => { on = false; clearInterval(t); };
  }, [storeId]);

  if (!store) return <><PageHead title="En direct" /><Empty icon="store" title="Pas encore de boutique" action={<ButtonLink href="/admin/modeles/">Voir les modèles</ButtonLink>}>Les visites de votre boutique s’affichent ici.</Empty></>;

  const noPlan = !!live && !live.ok && live.reason === 'plan';
  const shown = live?.ok ? live : noPlan ? sample() : null;
  const points = (shown?.points ?? []).filter((p) => typeof p.lat === 'number' && typeof p.lon === 'number').map((p) => ({ lat: p.lat as number, lon: p.lon as number, live: p.live === true }));
  const last = (shown?.points ?? []).filter((p) => p.city || p.country).slice(0, 8);
  return (
    <>
      <PageHead title="En direct" sub={`Qui regarde votre boutique, et d’où.${live?.ok ? ` Mis à jour toutes les 30${NB}secondes.` : ''}`} />
      {live === undefined ? <CloudLoader /> : null}
      {live === null ? <Notice tone="error">Les visites n’ont pas pu être lues. Vérifiez votre connexion.</Notice> : null}
      {noPlan ? <div className={styles.note}><Notice tone="info" title="Avec les formules Pro et Business" action={<ButtonLink variant="secondary" href="/admin/abonnement/">Voir les formules</ButtonLink>}>Voyez en direct qui est sur votre boutique, et d’où.</Notice></div> : null}
      {live && !live.ok && !noPlan ? <Notice tone="info">Les visites de cette boutique ne sont pas disponibles.</Notice> : null}
      {shown ? (
        <>
          {noPlan ? <p className={styles.tag}>Aperçu · visiteurs d’exemple</p> : null}
          <div className={styles.grid}>
            <section className={styles.stage} aria-label="Globe">
              <Globe points={points} />
              <p className={styles.legend}><span><i className={styles.dot} data-on="" />En ce moment</span><span><i className={styles.dot} />Ces dernières 24{NB}heures</span></p>
            </section>
            <div className={styles.side}>
              <dl className={shared.kpis}>
                <div><dt>En ce moment</dt><dd>{shown.now ?? 0}</dd><small>{(shown.now ?? 0) > 1 ? 'personnes' : 'personne'} sur la boutique</small></div>
                <div><dt>Aujourd’hui</dt><dd>{shown.today ?? 0}</dd><small>sur 24 heures</small></div>
                <div><dt>Cette semaine</dt><dd>{shown.week ?? 0}</dd><small>sur 7 jours</small></div>
              </dl>
              <section className={shared.card} aria-label="Pays">
                <div className={shared.cardHead}><h2>Par pays</h2></div>
                {(shown.countries ?? []).length ? (
                  <ul className={shared.rows}>
                    {(shown.countries ?? []).map((c) => <li key={c.country}><div className={shared.row} style={{ cursor: 'default' }}><span className={shared.rowMain}><b>{COUNTRY(c.country)}</b></span><span className={shared.amount}>{c.n}</span></div></li>)}
                  </ul>
                ) : <p className={shared.muted}>Pas encore de visite aujourd’hui. Partagez le lien de votre boutique.</p>}
              </section>
              {last.length ? (
                <section className={shared.card} aria-label="Dernières visites">
                  <div className={shared.cardHead}><h2>Dernières visites</h2></div>
                  <ul className={styles.last}>{last.map((p, i) => <li key={i}><span>{[p.city, p.country ? COUNTRY(p.country) : ''].filter(Boolean).join(', ')}</span>{p.at ? <small>{ago(p.at)}</small> : null}</li>)}</ul>
                </section>
              ) : null}
            </div>
          </div>
          {live?.ok ? <p className={styles.foot}><Icon name="info" size={14} />Jehre garde la ville d’où vient une visite, jamais l’adresse de l’appareil. Les visites de plus de 30{NB}jours sont effacées.</p> : null}
        </>
      ) : null}
    </>
  );
}
