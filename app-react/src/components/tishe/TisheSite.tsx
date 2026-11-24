'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { PageHead } from '@/components/admin/AdminShell';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Toast } from '@/components/ui/Toast';
import { plural } from '@/lib/format';
import { TISHE, tisheCall, tisheImg } from '@/lib/tishe';
import { TisheGate, tisheSet, useTisheData } from './useTishe';
import type { TxStore } from './TisheProducts';
import styles from './tishe.module.css';

/* The site of The Ivory Sukundu, edited in place (the shop's docs/jeere-editor.md): the site opens with ?jeere=edit
   and speaks with this page by messages ({ source: 'tishe' } from it, { source: 'jeere' } to it). She clicks a text of
   the site to write it there, or uses the list beside; a photo is replaced from the list. Nothing is live before
   « Enregistrer » (action saveContent). */
const ORIGIN = TISHE.site;
const LABELS: Record<string, string> = { hero: 'Accueil', campaign: 'Campagne', collection: 'Collection', reviews: 'Avis', lengths: 'Guide des longueurs', ourhair: 'Nos cheveux', circle: 'The Circle', contact: 'Contact', footer: 'Pied de page' };
const WORDS: [RegExp, string][] = [[/eyebrow/, 'surtitre'], [/title/, 'titre'], [/body/, 'texte'], [/cta/, 'bouton'], [/tip/, 'conseil'], [/closing/, 'conclusion'], [/motto/, 'devise'], [/about/, 'à propos']];
function keyLabel(k: string): string {
  const parts = k.split('.'), sec = LABELS[parts[0]!] ?? parts[0];
  let rest = parts.slice(1).join(' ').replace(/(\d)/, ' $1');
  WORDS.forEach(([re, w]) => { rest = rest.replace(re, w); });
  return `${sec} · ${rest}`;
}
interface TxField { key: string; kind?: 'text' | 'image'; value: string; original: string; changed?: boolean }
function toJpeg(img: ImageBitmap, w: number, q: number): string {
  const s = Math.min(1, w / img.width), c = document.createElement('canvas');
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}

export function TisheSite() { return <TisheGate title="Le site"><Site /></TisheGate>; }
function Site() {
  const { account } = useAdmin();
  const { data: store } = useTisheData<TxStore>('store', 'store');
  const frame = useRef<HTMLIFrameElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [pages, setPages] = useState<{ route: string; name: string }[]>([{ route: '/', name: 'Accueil' }]);
  const [route, setRoute] = useState('/');
  const [fields, setFields] = useState<TxField[]>([]);
  const [changes, setChanges] = useState<Record<string, string>>({});
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop');
  const [edit, setEdit] = useState(true);
  const [imgKey, setImgKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [ready, setReady] = useState(false);
  const toShop = useCallback((msg: Record<string, unknown>) => { frame.current?.contentWindow?.postMessage({ source: 'jeere', ...msg }, ORIGIN); }, []);
  useEffect(() => {
    const on = (e: MessageEvent) => {
      const d = e.data as { source?: string; type?: string; [k: string]: unknown } | null;
      if (e.origin !== ORIGIN || !d || d.source !== 'tishe') return;
      if (d.type === 'ready') { setReady(true); if (Array.isArray(d.pages) && d.pages.length) setPages(d.pages as { route: string; name: string }[]); }
      else if (d.type === 'page') { setRoute(String(d.route || '/')); setFields((d.fields as TxField[]) ?? []); if (d.changes) setChanges(d.changes as Record<string, string>); }
      else if (d.type === 'change') { if (d.changes) setChanges(d.changes as Record<string, string>); }
      else if (d.type === 'select') {
        if (d.kind === 'image') { setImgKey(String(d.key)); file.current?.click(); }
        document.querySelector(`[data-tx-key="${CSS.escape(String(d.key))}"]`)?.scrollIntoView({ block: 'nearest' });
      }
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, []);
  const n = Object.keys(changes).length;
  const set = (key: string, value: string) => { setChanges((c) => ({ ...c, [key]: value })); toShop({ type: 'set', key, value }); };
  async function photo(f: File | undefined) {
    if (!f || !imgKey) return;
    setToast('Envoi de la photo…');
    try {
      const img = await createImageBitmap(f, { imageOrientation: 'from-image' });
      const full = toJpeg(img, 1600, 0.84), thumb = toJpeg(img, 640, 0.8); img.close();
      const j = await tisheCall<{ url: string }>('upload', { handle: 'site', full, thumb }, account.userId);
      set(imgKey, j.url); setToast('Photo prête : pensez à enregistrer.');
    } catch (e) { setToast((e as Error).message); }
  }
  async function save() {
    setBusy(true);
    try {
      const j = await tisheCall<{ doc?: TxStore['doc'] }>('saveContent', { content: changes }, account.userId);
      if (j.doc && store) tisheSet('store', { ...store, doc: j.doc });
      toShop({ type: 'store', doc: j.doc }); setChanges({});
      setToast('Enregistré : les clientes le voient d’ici une minute.');
    } catch (e) { setToast((e as Error).message); }
    setBusy(false);
  }
  return (
    <>
      <PageHead title="Le site" sub="Cliquez un texte du site pour l’écrire sur place, ou changez-le dans la liste. Les clientes ne voient rien avant « Enregistrer »." />
      <div className={styles.ed}>
        <div className={styles.edBar}>
          <Select label="Page du site" className={styles.edPage} options={pages.map((p) => p.name)} value={pages.find((p) => p.route === route)?.name ?? pages[0]!.name} onChange={(e) => toShop({ type: 'navigate', route: pages.find((p) => p.name === e.target.value)?.route ?? '/' })} />
          <div className={styles.seg} role="group" aria-label="Appareil">
            <button type="button" aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')}><Icon name="desktop" size={16} />Ordinateur</button>
            <button type="button" aria-pressed={device === 'phone'} onClick={() => setDevice('phone')}><Icon name="phone" size={16} />Téléphone</button>
          </div>
          <label className={styles.edMode}><input type="checkbox" checked={edit} onChange={(e) => { setEdit(e.target.checked); toShop({ type: 'edit', on: e.target.checked }); }} />Cliquer pour écrire</label>
          <span className={styles.muted} aria-live="polite">{n ? plural(n, 'changement pas encore enregistré', 'changements pas encore enregistrés') : 'Aucun changement'}</span>
          <Button variant="quiet" icon="undo" disabled={!n} onClick={() => { toShop({ type: 'discard' }); setChanges({}); }}>Annuler</Button>
          <Button icon="check" busy={busy} disabled={!n} onClick={() => void save()}>Enregistrer</Button>
        </div>
        <div className={styles.edBody}>
          <div className={styles.stage}><div className={styles.frame} data-dev={device}><iframe ref={frame} src={`${ORIGIN}/?jeere=edit#/`} title="theivorysukundu.com, modifiable" /></div></div>
          <aside className={styles.side} aria-label="Sur cette page">
            <p className={styles.caption}>Sur cette page</p>
            {!ready ? <p className={styles.muted}>Chargement du site…</p> : !fields.length ? <p className={styles.muted}>Rien à modifier sur cette page : les produits se règlent dans « Produits ».</p> : fields.map((f) => {
              const v = f.key in changes ? changes[f.key]! : f.value, cur = v === '' ? f.original : v;
              return (
                <div key={f.key} className={styles.field} data-tx-key={f.key}>
                  <button type="button" className={styles.fieldK} onClick={() => toShop({ type: 'select', key: f.key })}>{keyLabel(f.key)}{f.key in changes || f.changed ? <i aria-label="modifié" /> : null}</button>
                  {f.kind === 'image'
                    ? <div className={styles.fieldImg}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={tisheImg(cur)} alt="" /><Button variant="secondary" icon="image" onClick={() => { setImgKey(f.key); file.current?.click(); }}>Remplacer</Button></div>
                    : <textarea aria-label={keyLabel(f.key)} rows={Math.min(6, Math.max(1, Math.ceil(String(cur || '').length / 34)))} value={cur} onChange={(e) => set(f.key, e.target.value)} />}
                </div>
              );
            })}
          </aside>
        </div>
        <input ref={file} type="file" accept="image/*" hidden aria-label="Choisir une photo" onChange={(e) => { void photo(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      {toast ? <Toast onDone={() => setToast('')}>{toast}</Toast> : null}
    </>
  );
}
