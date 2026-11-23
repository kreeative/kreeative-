'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { Empty } from '@/components/admin/AdminShell';
import { useSave } from '@/components/admin/useSave';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, Select, TextArea } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Notice } from '@/components/ui/Notice';
import { Sheet } from '@/components/ui/Sheet';
import { UPLOAD_ERROR, uploadPhoto } from '@/lib/media';
import { MODEL_PAGES, currentModel, modelBySlug, modelSite, myModels, readSiteMap, siteValue, withSiteEdit, withSlot, type SiteItem, type SiteMap, type SiteSection } from '@/lib/models';
import { storeName, type Fiche } from '@/lib/stores';
import styles from './editeur.module.css';

type Device = 'phone' | 'desktop';
const WIDTH: Record<Device, number> = { phone: 390, desktop: 1280 };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The editor of a store. It opens on HER model (MICHOU, ANSE, REGARD…): the designer's real site, with her
 *  products in it. On the left the sections of the page; a click on the site, or on a section, opens what it
 *  holds (its texts, its pictures, its product cases). Nothing is live until « Enregistrer ». */
export default function EditorPage() {
  const { account, store, reload } = useAdmin();
  const { busy, problem, saved, write, clear } = useSave();
  const [owned, setOwned] = useState<string[] | null>(null);
  const [draft, setDraft] = useState<Fiche | null>(null);
  const [origin, setOrigin] = useState<Fiche | null>(null);
  const [path, setPath] = useState('');
  const [map, setMap] = useState<SiteMap | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [focus, setFocus] = useState('');
  const [device, setDevice] = useState<Device>('phone');
  const [phone, setPhone] = useState(false);
  const [room, setRoom] = useState({ w: 390, h: 700 });
  const frame = useRef<HTMLIFrameElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const latest = useRef<Fiche | null>(null);
  latest.current = draft;

  useEffect(() => { let on = true; void myModels().then((l) => { if (on) setOwned(l); }); return () => { on = false; }; }, []);
  const storeId = store?.id, stamp = store?.updated_at;
  useEffect(() => { if (store) { setDraft(store.fiche); setOrigin(store.fiche); } }, [storeId, stamp]);   // eslint-disable-line react-hooks/exhaustive-deps

  const slug = owned ? currentModel(store?.fiche, owned) : '';
  const model = modelBySlug(slug);
  const site = model ? modelSite(model.slug) : '';
  const siteOrigin = site ? new URL(site).origin : '';
  const pages = model ? MODEL_PAGES[model.slug] ?? [{ path: '', name: 'Accueil' }] : [];

  // the conversation with the model's page: it says it is ready, the editor sends the store being edited
  const send = useCallback(() => {
    const w = frame.current?.contentWindow;
    if (!w || !model || !latest.current) return;
    try { w.postMessage({ jeerePreview: model.slug, fiche: latest.current, edit: true }, siteOrigin); } catch { /* the page keeps the published store */ }
  }, [model, siteOrigin]);
  useEffect(() => {
    if (!model) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== siteOrigin || e.source !== frame.current?.contentWindow) return;
      const d = (e.data ?? {}) as { jeereConnect?: unknown; jeerePick?: { key?: unknown; sec?: unknown } };
      if (d.jeereConnect === 'ready') { send(); return; }
      const m = readSiteMap(e.data);
      if (m) { setMap((old) => (same(old, m) ? old : m)); return; }
      if (d.jeerePick && typeof d.jeerePick.key === 'string') {
        if (typeof d.jeerePick.sec === 'number' && d.jeerePick.sec >= 0) setPicked(d.jeerePick.sec);
        setFocus(d.jeerePick.key);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [model, siteOrigin, send]);
  useEffect(() => { send(); }, [draft, send]);
  // the field of what was clicked on the site, brought into view
  useEffect(() => {
    if (!focus) return;
    const t = setTimeout(() => {
      const n = document.querySelector(`[data-site-key="${CSS.escape(focus)}"]`);
      n?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      (n?.querySelector('input:not([type=file]), textarea, select') as HTMLElement | null)?.focus({ preventScroll: true });
    }, 80);
    return () => clearTimeout(t);
  }, [focus, picked]);

  useEffect(() => {
    const q = window.matchMedia('(max-width: 820px)');
    const on = () => setPhone(q.matches);
    on(); q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);
  const ready = !!draft && !!model;
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setRoom({ w: Math.max(240, el.clientWidth - 32), h: Math.max(320, el.clientHeight - 32) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);

  const dirty = !!draft && !!origin && !same(draft, origin);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const change = useCallback((f: (d: Fiche) => Fiche) => { clear(); setDraft((d) => (d ? f(d) : d)); }, [clear]);
  const openSection = (s: SiteSection) => {
    setPicked(s.n); setFocus('');
    try { frame.current?.contentWindow?.postMessage({ jeereSection: s.n }, siteOrigin); } catch { /* the list still opens it */ }
  };
  const goPage = (p: string) => { if (p !== path) { setPath(p); setMap(null); setPicked(null); setFocus(''); } };
  async function save() {
    if (!draft || !dirty || busy) return;
    if (await write(draft)) setOrigin(draft);
  }

  const sections = map?.sections ?? [];
  const current = picked === null ? undefined : sections.find((s) => s.n === picked);
  const items = useMemo(() => (map && picked !== null ? map.items.filter((x) => x.sec === picked) : []), [map, picked]);

  if (!store) return <Empty icon="store" title="Pas encore de boutique" action={<ButtonLink href="/admin/modeles/">Voir les modèles</ButtonLink>}>Choisissez un modèle pour créer votre boutique.</Empty>;
  if (owned === null || !draft) return <div className={styles.wait}><p>Chargement de l’éditeur…</p></div>;
  if (!model) return <Empty icon="template" title="Choisissez d’abord un modèle" action={<ButtonLink href="/admin/modeles/">Voir les modèles</ButtonLink>}>L’éditeur s’ouvre sur votre modèle : MICHOU, SÈVE, ANSE, REGARD… Choisissez le vôtre, puis revenez ici.</Empty>;

  const scale = Math.min(1, room.w / WIDTH[device]);
  const panel = current ? (
    <SectionPanel section={current} items={items} fiche={draft} userId={account.userId}
      onEdit={(kind, key, value) => change((d) => withSiteEdit(d, kind, key, value))} onSlot={(slot, value) => change((d) => withSlot(d, slot, value))} />
  ) : null;

  return (
    <div className={styles.editor}>
      <header className={styles.top}>
        <Link className={styles.back} href="/admin/" aria-label="Retour au tableau de bord"><Icon name="back" size={20} /></Link>
        <div className={styles.what}><b>{storeName(store)}</b><span>{dirty ? 'Modifications non enregistrées' : saved ? 'Enregistré' : `Modèle ${model.name}`}</span></div>
        <div className={styles.devices} role="group" aria-label="Taille de l’aperçu">
          <button type="button" aria-pressed={device === 'phone'} onClick={() => setDevice('phone')}>Téléphone</button>
          <button type="button" aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')}>Ordinateur</button>
        </div>
        <Button className={styles.save} busy={busy} disabled={!dirty} onClick={() => void save()}>Enregistrer</Button>
      </header>

      {problem ? <div className={styles.problem}>{problem === 'conflict'
        ? <Notice tone="warn" title="Votre boutique a changé entre-temps" action={<Button variant="secondary" onClick={() => void reload()}>Recharger</Button>}>Elle a été modifiée ailleurs. Rien n’a été écrasé : rechargez, puis refaites vos changements.</Notice>
        : <Notice tone="error">Rien n’a été enregistré. Vérifiez votre connexion, puis réessayez.</Notice>}</div> : null}

      <div className={styles.cols} data-open={current && !phone ? '' : undefined}>
        <aside className={styles.left} aria-label="Sections de la page">
          {pages.length > 1 ? (
            <div className={styles.pages} role="tablist" aria-label="Pages du modèle">
              {pages.map((p) => <button key={p.path} type="button" role="tab" aria-selected={p.path === path} onClick={() => goPage(p.path)}>{p.name}</button>)}
            </div>
          ) : null}
          {map ? (
            <ol className={styles.list}>
              {sections.map((s) => {
                const off = siteValue(draft, 'h', s.key) !== undefined;
                return (
                  <li key={s.key} className={styles.row} data-on={picked === s.n ? '' : undefined} data-off={off ? '' : undefined}>
                    <button type="button" className={styles.rowMain} onClick={() => openSection(s)} aria-current={picked === s.n ? 'true' : undefined}>
                      <b>{s.name}</b>{off ? <span>Masquée</span> : null}
                    </button>
                    {s.fixed ? null : <button type="button" role="switch" aria-checked={!off} aria-label={`Afficher ${s.name}`} className={styles.switch} onClick={() => change((d) => withSiteEdit(d, 'h', s.key, off ? null : '1'))} />}
                  </li>
                );
              })}
            </ol>
          ) : <p className={styles.hint}>Chargement de votre modèle…</p>}
          <p className={styles.hint}>Touchez un texte ou une photo sur votre site pour le changer. Vos produits se gèrent dans <Link href="/admin/produits/"><b>Produits</b></Link>.</p>
        </aside>

        <div className={styles.stage} ref={stage}>
          <div className={styles.frameBox} style={{ width: Math.round(WIDTH[device] * scale), height: room.h }} data-device={device}>
            <iframe ref={frame} key={path} title="Votre site" src={site + path} width={WIDTH[device]} height={Math.round(room.h / scale)} style={{ transform: `scale(${scale})` }} />
          </div>
        </div>

        {current && !phone ? (
          <aside className={styles.right} aria-label={`Contenu : ${current.name}`}>
            <div className={styles.rightHead}>
              <h2>{current.name}</h2>
              <button type="button" className={styles.tool} onClick={() => setPicked(null)} aria-label="Fermer"><Icon name="close" size={18} /></button>
            </div>
            {panel}
          </aside>
        ) : null}
      </div>

      {current && phone ? <Sheet title={current.name} onClose={() => setPicked(null)}>{panel}</Sheet> : null}
    </div>
  );
}

/** What one section of the model holds: its texts, its pictures, its product cases. */
function SectionPanel({ section, items, fiche, userId, onEdit, onSlot }: {
  section: SiteSection; items: SiteItem[]; fiche: Fiche; userId: string;
  onEdit: (kind: 't' | 'i' | 'c', key: string, value: string | null) => void; onSlot: (slot: string, value: string) => void;
}) {
  const products = Array.isArray(fiche.products) ? fiche.products : [];
  const slots = ((fiche.store?.slots ?? {}) as Record<string, string>);
  if (!items.length) return <p className={styles.hint}>{section.fixed ? 'Rien à changer ici : votre nom et votre logo viennent de vos paramètres.' : 'Cette section n’a rien à changer.'}</p>;
  let cases = 0;
  return (
    <div className={styles.form}>
      {items.map((x) => {
        if (x.kind === 's') return <p key={x.key} className={styles.hint} data-site-key={x.key}>Vos prestations s’affichent ici. Elles se gèrent dans votre tableau de bord.</p>;
        if (x.kind === 'p') {
          cases += 1;
          const none = 'Masquer cette case';
          const now = slots[x.ref] ?? x.ref;
          const names = products.map((p) => p.name || p.id);
          const label = now === '-' ? none : products.find((p) => p.id === now)?.name ?? names[0] ?? none;
          return (
            <div key={x.key} data-site-key={x.key}>
              <Select label={`Produit de la case ${cases}`} options={[...names, none]} value={label}
                onChange={(e) => onSlot(x.ref, e.target.value === none ? '-' : products.find((p) => (p.name || p.id) === e.target.value)?.id ?? x.ref)} />
            </div>
          );
        }
        if (x.kind === 'i') return <PhotoField key={x.key} item={x} own={siteValue(fiche, 'i', x.key)} userId={userId} onChange={(v) => onEdit('i', x.key, v)} />;
        const kind = x.kind === 'c' ? 'c' : 't';
        const own = siteValue(fiche, kind, x.key);
        const value = own ?? x.text;
        return (
          <div key={x.key} className={styles.text} data-site-key={x.key}>
            {x.long ? <TextArea label={x.role} rows={4} maxLength={800} value={value} onChange={(e) => onEdit(kind, x.key, e.target.value.trim() ? e.target.value : null)} />
              : <Field label={x.role} maxLength={200} value={value} onChange={(e) => onEdit(kind, x.key, e.target.value.trim() ? e.target.value : null)} />}
            {own !== undefined ? <button type="button" className={styles.reset} onClick={() => onEdit(kind, x.key, null)}>Remettre le texte du modèle</button> : null}
          </div>
        );
      })}
    </div>
  );
}

/** A picture of the model: her own photo, shrunk and sent to her folder like a product's. */
function PhotoField({ item, own, onChange, userId }: { item: SiteItem; own: string | undefined; onChange: (v: string | null) => void; userId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true); setError('');
    const r = await uploadPhoto(file, userId);
    setBusy(false);
    if (r.ok) onChange(r.url); else setError(UPLOAD_ERROR[r.error]);
  }
  const src = own ?? item.src;
  return (
    <div className={styles.image} data-site-key={item.key}>
      <p className={styles.imageLabel}>Photo{item.label ? ` · ${item.label}` : ''}</p>
      <div className={styles.imageRow}>
        <span className={styles.thumb}>{src ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={src} alt="" /> : <Icon name="image" size={22} />}</span>
        <div className={styles.imageActs}>
          <Button variant="secondary" busy={busy} onClick={() => input.current?.click()}>Changer la photo</Button>
          {own !== undefined ? <Button variant="quiet" onClick={() => onChange(null)}>Remettre</Button> : null}
        </div>
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void pick(e)} aria-label={`Photo ${item.label}`} />
      {error ? <Notice tone="error">{error}</Notice> : null}
    </div>
  );
}
