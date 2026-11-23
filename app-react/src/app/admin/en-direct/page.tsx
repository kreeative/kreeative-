'use client';

import { useEffect, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { Empty, PageHead } from '@/components/admin/AdminShell';
import { ButtonLink } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { liveVisits, type Live } from '@/lib/team';
import shared from '../admin.module.css';
import styles from '../abonnement/abonnement.module.css';

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

  const cities = [...new Set((live?.points ?? []).filter((p) => p.live && p.city).map((p) => `${p.city}${p.country ? `, ${COUNTRY(p.country)}` : ''}`))].slice(0, 8);
  return (
    <>
      <PageHead title="En direct" sub="Qui visite votre boutique, en ce moment." />
      <div className={styles.page}>
        {live === undefined ? <p className={shared.muted}>Chargement…</p> : null}
        {live === null ? <Notice tone="error">Les visites n’ont pas pu être lues. Vérifiez votre connexion.</Notice> : null}
        {live && !live.ok && live.reason === 'plan' ? <Notice tone="info" title="Avec les formules Pro et Business" action={<ButtonLink variant="secondary" href="/admin/abonnement/">Voir les formules</ButtonLink>}>Voyez en direct qui est sur votre boutique, et d’où.</Notice> : null}
        {live && !live.ok && live.reason !== 'plan' ? <Notice tone="info">Les visites de cette boutique ne sont pas disponibles.</Notice> : null}
        {live?.ok ? (
          <>
            <dl className={shared.kpis}>
              <div><dt>En ce moment</dt><dd>{live.now ?? 0}</dd><small>{(live.now ?? 0) > 1 ? 'personnes' : 'personne'} sur la boutique</small></div>
              <div><dt>Aujourd’hui</dt><dd>{live.today ?? 0}</dd><small>sur 24 heures</small></div>
              <div><dt>Cette semaine</dt><dd>{live.week ?? 0}</dd><small>sur 7 jours</small></div>
            </dl>
            {cities.length ? <section className={shared.card}><div className={shared.cardHead}><h2>En ce moment, depuis</h2></div><p>{cities.join(' · ')}</p></section> : null}
            <section className={shared.card} aria-label="Pays">
              <div className={shared.cardHead}><h2>D’où viennent vos visites (24 h)</h2></div>
              {(live.countries ?? []).length ? (
                <ul className={shared.rows}>
                  {(live.countries ?? []).map((c) => <li key={c.country}><div className={shared.row} style={{ cursor: 'default' }}><span className={shared.rowMain}><b>{COUNTRY(c.country)}</b></span><span className={shared.amount}>{c.n}</span></div></li>)}
                </ul>
              ) : <p className={shared.muted}>Pas encore de visite aujourd’hui. Partagez le lien de votre boutique.</p>}
            </section>
          </>
        ) : null}
      </div>
    </>
  );
}
