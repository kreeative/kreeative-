'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { Empty, PageHead } from '@/components/admin/AdminShell';
import { useSave } from '@/components/admin/useSave';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Notice } from '@/components/ui/Notice';
import { brandOf, editorSite, MODEL_COLORS, withBrand, type Brand } from '@/lib/models';
import { ColorPalette } from '@/components/ui/ColorField';
import type { Fiche } from '@/lib/stores';
import { ColorField, PhotoField } from '../editeur/Extras';
import styles from './branding.module.css';

const SHAPES: [Brand['shape'] | undefined, string, string][] = [[undefined, 'Modèle', ''], ['square', 'Carré', '0px'], ['round', 'Arrondi', '10px'], ['pill', 'Pilule', '9999px']];
const STYLES: [Brand['btnStyle'] | undefined, string][] = [[undefined, 'Plein'], ['outline', 'Contour']];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** « Branding »: her identity in one place — her logo, the colours of her whole site, the shape of her buttons.
 *  It is the base of every page of her site; the editor then changes one element at a time on top of it. The site
 *  is shown beside, with the changes, before they are saved. */
export default function BrandingPage() {
  const { store, account, model: modelSlug } = useAdmin();
  const { busy, problem, saved, write, clear } = useSave();
  const [draft, setDraft] = useState<Fiche | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => { if (store) setDraft(store.fiche); }, [store?.id, store?.updated_at]);   // eslint-disable-line react-hooks/exhaustive-deps
  const site = useMemo(() => (store ? editorSite(store.slug, modelSlug) : null), [store?.slug, modelSlug]);   // eslint-disable-line react-hooks/exhaustive-deps
  const origin = site ? new URL(site.url).origin : '';
  const send = useCallback(() => {
    if (!site || !draft) return;
    try { frame.current?.contentWindow?.postMessage({ jeerePreview: site.key, fiche: draft, edit: false, store: store?.slug ?? '' }, origin); } catch { /* the page keeps the published store */ }
  }, [site, draft, origin, store?.slug]);
  useEffect(() => {
    const on = (e: MessageEvent) => { if (e.origin === origin && e.source === frame.current?.contentWindow && (e.data as { jeereConnect?: unknown } | null)?.jeereConnect === 'ready') send(); };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [origin, send]);
  useEffect(() => { send(); }, [send]);

  if (!store) return <><PageHead title="Branding" /><Empty icon="store" title="Pas encore de boutique" action={<ButtonLink href="/admin/modeles/">Voir les modèles</ButtonLink>}>Votre marque s’applique à votre boutique : choisissez d’abord un modèle.</Empty></>;
  if (!draft) return null;

  const b = brandOf(draft);
  const set = (patch: Brand) => { clear(); setDraft((d) => (d ? withBrand(d, patch) : d)); };
  const logo = typeof draft.store?.logo === 'string' ? draft.store.logo : '';
  const setLogo = (v: string | null) => { clear(); setDraft((d) => { if (!d) return d; const st = { ...(d.store ?? {}) } as Record<string, unknown>; if (v) st.logo = v; else delete st.logo; return { ...d, store: st }; }); };
  const dirty = !same(draft, store.fiche);
  const radius = SHAPES.find(([v]) => v === b.shape)?.[2] || '12px';
  const sample = { borderRadius: radius, background: b.btnStyle === 'outline' ? 'transparent' : b.btnBg || '#111111', color: b.btnStyle === 'outline' ? b.btnBg || '#111111' : b.btnText || '#FFFFFF', border: `1.5px solid ${b.btnBg || '#111111'}` };

  return (
    <>
      <PageHead title="Branding" sub="Votre logo, vos couleurs et vos boutons, pour tout votre site."
        action={<Button busy={busy} disabled={!dirty} onClick={() => void write(draft)}>Enregistrer</Button>} />
      {saved ? <div className={styles.note}><Notice tone="ok">{store.published ? 'C’est enregistré : votre site en ligne a changé.' : 'C’est enregistré. Publiez votre site depuis l’éditeur.'}</Notice></div> : null}
      {problem ? <div className={styles.note}><Notice tone="error">{problem === 'conflict' ? 'Votre boutique a changé entre-temps. Rechargez la page.' : 'Rien n’a été enregistré. Vérifiez votre connexion.'}</Notice></div> : null}
      <div className={styles.grid}>
        <div className={styles.panel}>
          <section className={styles.card} aria-label="Logo">
            <h2><Icon name="image" size={18} />Logo</h2>
            <PhotoField name="Votre logo" src={logo} own={!!logo} userId={account.userId} onChange={setLogo} logo />
            <Field label="Hauteur dans l’en-tête (px)" inputMode="numeric" placeholder="42" value={b.logoH ? String(b.logoH) : ''} onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, '')); set({ logoH: n >= 16 && n <= 120 ? n : undefined }); }} />
          </section>

          <ColorPalette value={MODEL_COLORS[modelSlug || site?.key || ''] ?? []}><section className={styles.card} aria-label="Couleurs">
            <h2><Icon name="drop" size={18} />Couleurs</h2>
            <ColorField key={`bb${store.id}`} label="Boutons" value={b.btnBg ?? ''} onChange={(v) => set({ btnBg: v })} />
            <ColorField key={`bt${store.id}`} label="Texte des boutons" value={b.btnText ?? ''} onChange={(v) => set({ btnText: v })} />
            <ColorField key={`bg${store.id}`} label="Fond du site" value={b.bg ?? ''} onChange={(v) => set({ bg: v })} />
            <ColorField key={`tx${store.id}`} label="Textes principaux" value={b.text ?? ''} onChange={(v) => set({ text: v })} />
            <ColorField key={`mu${store.id}`} label="Textes secondaires" value={b.muted ?? ''} onChange={(v) => set({ muted: v })} />
            <ColorField key={`ac${store.id}`} label="Accent (liens)" value={b.accent ?? ''} onChange={(v) => set({ accent: v })} />
          </section></ColorPalette>

          <section className={styles.card} aria-label="Boutons">
            <h2><Icon name="edit" size={18} />Boutons</h2>
            <span className={styles.caption} id="br-shape">Forme</span>
            <div className={styles.segments} role="group" aria-labelledby="br-shape">{SHAPES.map(([v, l]) => <button key={l} type="button" aria-pressed={b.shape === v} onClick={() => set({ shape: v })}>{l}</button>)}</div>
            <span className={styles.caption} id="br-style">Style</span>
            <div className={styles.segments} role="group" aria-labelledby="br-style">{STYLES.map(([v, l]) => <button key={l} type="button" aria-pressed={b.btnStyle === v} onClick={() => set({ btnStyle: v })}>{l}</button>)}</div>
            <div className={styles.sample}><span style={sample}>Ajouter au panier</span></div>
          </section>
          <p className={styles.hint}>Ces réglages sont la base de tout votre site. Dans l’<a href="/admin/editeur/"><b>éditeur</b></a>, vous pouvez encore changer un texte ou un bouton à la fois.</p>
        </div>

        <div className={styles.preview}>
          {site ? <iframe ref={frame} title="Aperçu de votre site" src={site.url} /> : <p className={styles.hint}>Choisissez un modèle pour voir votre site ici.</p>}
        </div>
      </div>
    </>
  );
}
