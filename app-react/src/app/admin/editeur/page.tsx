'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { Empty } from '@/components/admin/AdminShell';
import { useSave } from '@/components/admin/useSave';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, Select, TextArea } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Menu } from '@/components/ui/Menu';
import { Notice } from '@/components/ui/Notice';
import { Sheet } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';
import { UPLOAD_ERROR, uploadPhoto } from '@/lib/media';
import { editorSite, readSiteMap, sectionOrder, siteValue, withSectionOrder, withSiteEdit, withSlot, type SiteItem, type SiteMap, type SiteSection } from '@/lib/models';
import { storeName, storeUrl, type Fiche } from '@/lib/stores';
import styles from './editeur.module.css';

type Device = 'phone' | 'desktop';
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const IMAGE_NAMES = ['Image principale', 'Image secondaire'];

/** The editor of a store, in the manner of a theme editor: a bar on top (the page, the screen size, undo, publish),
 *  the sections of the page on the left, HER site in the middle (the designer's real model, with her products in
 *  it), and what the chosen section holds on the right. Nothing is live until « Publier ». */
export default function EditorPage() {
  const { account, store, stores, selectStore, reload, model: modelSlug } = useAdmin();
  const { busy, problem, write, clear } = useSave();
  const [draft, setDraft] = useState<Fiche | null>(null);
  const [origin, setOrigin] = useState<Fiche | null>(null);
  const [past, setPast] = useState<Fiche[]>([]);
  const [future, setFuture] = useState<Fiche[]>([]);
  const [path, setPath] = useState('');
  const [map, setMap] = useState<SiteMap | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [focus, setFocus] = useState('');
  const [device, setDevice] = useState<Device>('desktop');
  const [phone, setPhone] = useState(false);
  const [room, setRoom] = useState({ w: 900, h: 700 });
  const [toast, setToast] = useState<'live' | 'saved' | null>(null);
  const [dragged, setDragged] = useState<number | null>(null);
  const [unfolded, setUnfolded] = useState<number[]>([]);
  const frame = useRef<HTMLIFrameElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const latest = useRef<Fiche | null>(null);
  const lastEdit = useRef({ at: 0, tag: '' });
  latest.current = draft;

  // « Modifier » on a site of her account opens THAT site: /admin/editeur/?b=<its id>
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get('b');
    if (want && want !== store?.id && stores.some((x) => x.id === want)) selectStore(want);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const storeId = store?.id, stamp = store?.updated_at;
  useEffect(() => { if (store) { setDraft(store.fiche); setOrigin(store.fiche); } }, [storeId, stamp]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPast([]); setFuture([]); }, [storeId]);

  // what this store is made with: a client's own site, else the designer model in use
  const model = useMemo(() => (store ? editorSite(store.slug, modelSlug) : null), [store?.slug, modelSlug]);   // eslint-disable-line react-hooks/exhaustive-deps
  const site = model?.url ?? '';
  const siteOrigin = site ? new URL(site).origin : '';
  const pages = model?.pages ?? [];

  // the conversation with the model's page: it says it is ready, the editor sends the store being edited
  const send = useCallback(() => {
    const w = frame.current?.contentWindow;
    if (!w || !model || !latest.current) return;
    try { w.postMessage({ jeerePreview: model.key, fiche: latest.current, edit: true }, siteOrigin); } catch { /* the page keeps the published store */ }
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
    const on = () => { setPhone(q.matches); if (q.matches) setDevice('phone'); };
    on(); q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);
  const ready = !!draft && !!model;
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { const c = getComputedStyle(el); setRoom({ w: Math.max(240, el.clientWidth - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight)), h: Math.max(320, el.clientHeight - parseFloat(c.paddingTop) - parseFloat(c.paddingBottom)) }); });
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

  // every change can be undone; the letters typed in one field within a moment count as one change
  const change = useCallback((f: (d: Fiche) => Fiche, tag = '') => {
    clear();
    const d = latest.current;
    if (!d) return;
    const now = Date.now(), together = !!tag && tag === lastEdit.current.tag && now - lastEdit.current.at < 900;
    lastEdit.current = { at: now, tag };
    if (!together) setPast((p) => [...p.slice(-49), d]);
    setFuture([]);
    setDraft(f(d));
  }, [clear]);
  const undo = () => { const d = latest.current, prev = past[past.length - 1]; if (!d || !prev) return; lastEdit.current = { at: 0, tag: '' }; setPast(past.slice(0, -1)); setFuture([d, ...future]); setDraft(prev); clear(); };
  const redo = () => { const d = latest.current, next = future[0]; if (!d || !next) return; lastEdit.current = { at: 0, tag: '' }; setFuture(future.slice(1)); setPast([...past, d]); setDraft(next); clear(); };

  const goPage = (p: string) => { if (p !== path) { setPath(p); setMap(null); setPicked(null); setFocus(''); } };
  async function save(publish: boolean) {
    if (!draft || busy || (!dirty && !(publish && !store?.published))) return;
    setToast(null);
    if (await write(draft, publish)) { setOrigin(draft); setToast(publish ? 'live' : 'saved'); }
  }

  // the sections of the page, in HER order (the header first and the footer last, always)
  const sections = useMemo(() => {
    const all = map?.sections ?? [];
    const order = draft && map ? sectionOrder(draft, map.page) : null;
    const movable = all.filter((s) => !s.fixed);
    if (!order || order.length !== movable.length || !order.every((n) => movable.some((s) => s.n === n))) return all;
    const queue = order.map((n) => movable.find((s) => s.n === n)!);
    return all.map((s) => (s.fixed ? s : queue.shift()!));
  }, [map, draft]);
  const current = picked === null ? undefined : sections.find((s) => s.n === picked);
  const items = useMemo(() => (map && picked !== null ? map.items.filter((x) => x.sec === picked) : []), [map, picked]);

  /** One element of a section, chosen in the tree: its section opens, its field is brought up, the site shows it. */
  const openItem = (x: SiteItem) => {
    setPicked(x.sec); setFocus(x.key);
    try { frame.current?.contentWindow?.postMessage({ jeereFocus: x.key }, siteOrigin); } catch { /* the field still opens */ }
  };
  const openSection = (s: SiteSection) => {
    setPicked(s.n); setFocus('');
    try { frame.current?.contentWindow?.postMessage({ jeereSection: s.n }, siteOrigin); } catch { /* the list still opens it */ }
  };
  /** Puts section `n` just before section `before` (or last, among those that move). */
  const moveSection = (n: number, to: number) => {
    if (!map) return;
    const movable = sections.filter((s) => !s.fixed).map((s) => s.n), from = movable.indexOf(n);
    if (from < 0 || to < 0 || to >= movable.length || to === from) return;
    movable.splice(to, 0, movable.splice(from, 1)[0]!);
    const natural = map.sections.filter((s) => !s.fixed).map((s) => s.n);
    change((d) => withSectionOrder(d, map.page, same(movable, natural) ? null : movable));
  };
  const onGripKey = (e: KeyboardEvent, n: number) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const movable = sections.filter((s) => !s.fixed).map((s) => s.n);
    moveSection(n, movable.indexOf(n) + (e.key === 'ArrowUp' ? -1 : 1));
  };

  if (!store) return <Empty icon="store" title="Pas encore de boutique" action={<ButtonLink href="/admin/modeles/">Voir les modèles</ButtonLink>}>Choisissez un modèle pour créer votre boutique.</Empty>;
  if (!draft) return <div className={styles.wait}><p>Chargement de l’éditeur…</p></div>;
  if (!model) return <Empty icon="template" title="Choisissez d’abord un modèle" action={<ButtonLink href="/admin/modeles/">Voir les modèles</ButtonLink>}>L’éditeur s’ouvre sur votre modèle : MICHOU, SÈVE, ANSE, REGARD… Choisissez le vôtre, puis revenez ici.</Empty>;

  const pageName = pages.find((p) => p.path === path)?.name ?? 'Accueil';
  const wide = device === 'desktop';
  const frameW = wide ? Math.max(1280, room.w) : 390;
  const scale = Math.min(1, room.w / frameW);
  const frameH = wide ? room.h : Math.min(room.h, 844);
  const url = storeUrl(store, modelSlug);
  const inspector = current ? (
    <Inspector section={current} items={items} fiche={draft} userId={account.userId}
      onEdit={(kind, key, value) => change((d) => withSiteEdit(d, kind, key, value), `${kind}:${key}`)} onSlot={(slot, value) => change((d) => withSlot(d, slot, value))} />
  ) : null;

  return (
    <div className={styles.editor}>
      <header className={styles.top}>
        <div className={styles.topLeft}>
          <Link className={styles.icon} href="/admin/" aria-label="Retour au tableau de bord"><Icon name="back" size={18} /></Link>
          <b className={styles.name}>{storeName(store)}</b>
          <span className={styles.badge} data-live={store.published ? '' : undefined}>{store.published ? 'En ligne' : 'Brouillon'}</span>
        </div>
        <div className={styles.topCenter}>
          {pages.length > 1 ? <Menu label="Page" options={pages.map((p) => ({ value: p.path, label: p.name }))} value={path} onChange={goPage} /> : <span className={styles.onePage}>{pageName}</span>}
        </div>
        <div className={styles.topRight}>
          <div className={styles.group} role="group" aria-label="Taille de l’aperçu">
            <button type="button" className={styles.icon} aria-pressed={wide} onClick={() => setDevice('desktop')} aria-label="Ordinateur"><Icon name="desktop" size={18} /></button>
            <button type="button" className={styles.icon} aria-pressed={!wide} onClick={() => setDevice('phone')} aria-label="Téléphone"><Icon name="phone" size={18} /></button>
          </div>
          <div className={styles.group}>
            <button type="button" className={styles.icon} disabled={!past.length} onClick={undo} aria-label="Annuler"><Icon name="undo" size={18} /></button>
            <button type="button" className={styles.icon} disabled={!future.length} onClick={redo} aria-label="Rétablir"><Icon name="redo" size={18} /></button>
          </div>
          {store.published ? null : <Button className={styles.action} variant="secondary" disabled={!dirty || busy} onClick={() => void save(false)}>Enregistrer</Button>}
          <Button className={styles.action} busy={busy} disabled={store.published && !dirty} onClick={() => void save(true)}>Publier</Button>
        </div>
      </header>

      <div className={styles.cols} data-open={current && !phone ? '' : undefined}>
        <aside className={styles.left} aria-label="Sections de la page">
          <h2 className={styles.title}>{path === '' ? 'Page d’accueil' : `Page ${pageName}`}</h2>
          {map ? (
            <ol className={styles.list}>
              {sections.map((s) => {
                const off = siteValue(draft, 'h', s.key) !== undefined;
                const inside = (map.items ?? []).filter((x) => x.sec === s.n && x.kind !== 's');
                const open = unfolded.includes(s.n);
                let nImg = 0;
                return (
                 <li key={s.key} className={styles.node}>
                  <div className={styles.row} data-on={picked === s.n ? '' : undefined} data-off={off ? '' : undefined} data-over={dragged !== null && dragged !== s.n && !s.fixed ? '' : undefined}
                    draggable={!s.fixed} onDragStart={(e) => { setDragged(s.n); e.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => setDragged(null)}
                    onDragOver={(e) => { if (dragged !== null && !s.fixed) e.preventDefault(); }}
                    onDrop={(e) => { e.preventDefault(); if (dragged !== null && !s.fixed) moveSection(dragged, sections.filter((x) => !x.fixed).findIndex((x) => x.n === s.n)); setDragged(null); }}>
                    {s.fixed ? <span className={styles.grip} aria-hidden="true" />
                      : <button type="button" className={styles.grip} onKeyDown={(e) => onGripKey(e, s.n)} aria-label={`Déplacer ${s.name} (flèches haut et bas)`}><Icon name="grip" size={16} /></button>}
                    {inside.length ? <button type="button" className={styles.fold} aria-expanded={open} onClick={() => setUnfolded((u) => (open ? u.filter((n) => n !== s.n) : [...u, s.n]))} aria-label={open ? `Replier ${s.name}` : `Déplier ${s.name}`}><Icon name="chevron" size={14} /></button> : <span className={styles.fold} aria-hidden="true" />}
                    <button type="button" className={styles.rowMain} onClick={() => openSection(s)} aria-current={picked === s.n ? 'true' : undefined}>{s.name}</button>
                    {s.fixed ? null : <button type="button" className={styles.eye} aria-pressed={!off} onClick={() => change((d) => withSiteEdit(d, 'h', s.key, off ? null : '1'))} aria-label={off ? `Afficher ${s.name}` : `Masquer ${s.name}`}><Icon name={off ? 'eyeOff' : 'eye'} size={16} /></button>}
                  </div>
                  {open ? (
                    <ul className={styles.leaves}>
                      {inside.map((x) => {
                        const what = x.kind === 'i' ? (IMAGE_NAMES[nImg++] ?? `Image ${nImg}`) : x.kind === 'p' ? 'Produit' : x.role;
                        const said = x.kind === 't' || x.kind === 'c' ? (siteValue(draft, x.kind, x.key) ?? x.text) : '';
                        return <li key={x.key}><button type="button" className={styles.leaf} data-on={focus === x.key ? '' : undefined} onClick={() => openItem(x)}><Icon name={x.kind === 'i' ? 'image' : x.kind === 'p' ? 'tag' : 'edit'} size={14} /><span>{what}{said ? <i> – {said}</i> : null}</span></button></li>;
                      })}
                    </ul>
                  ) : null}
                 </li>
                );
              })}
            </ol>
          ) : <p className={styles.hint}>Chargement de votre modèle…</p>}
          <p className={styles.hint}>Cliquez sur un texte ou une photo de votre site pour le changer. Vos produits se gèrent dans <Link href="/admin/produits/"><b>Produits</b></Link>.</p>
        </aside>

        <div className={styles.stage} ref={stage} data-device={device}>
          <div className={styles.frameBox} style={{ width: Math.round(frameW * scale), height: frameH }} data-device={device}>
            <iframe ref={frame} key={path} title="Votre site" src={site + path} width={frameW} height={Math.round(frameH / scale)} style={{ transform: `scale(${scale})` }} />
          </div>
        </div>

        {current && !phone ? (
          <aside className={styles.right} aria-label={`Contenu : ${current.name}`}>
            <div className={styles.rightHead}>
              <h2>{current.name}</h2>
              <button type="button" className={styles.icon} onClick={() => setPicked(null)} aria-label="Fermer"><Icon name="close" size={16} /></button>
            </div>
            {inspector}
          </aside>
        ) : null}
      </div>

      {current && phone ? <Sheet title={current.name} onClose={() => setPicked(null)}>{inspector}</Sheet> : null}
      {problem === 'conflict' ? <Toast onDone={clear} ms={12000} action={<button type="button" onClick={() => void reload()}>Recharger</button>}>Votre boutique a changé entre-temps. Rien n’a été écrasé.</Toast> : null}
      {problem === 'network' ? <Toast onDone={clear} ms={8000}>Rien n’a été enregistré. Vérifiez votre connexion.</Toast> : null}
      {toast === 'live' && !problem ? <Toast onDone={() => setToast(null)} action={<a href={url} target="_blank" rel="noopener">Voir mon site</a>}>Votre site est en ligne · {url.replace(/^https:\/\//, '')}</Toast> : null}
      {toast === 'saved' && !problem ? <Toast onDone={() => setToast(null)} ms={3000}>Brouillon enregistré. Votre site n’est pas encore en ligne.</Toast> : null}
    </div>
  );
}

/** What one section of the model holds, in two calm groups: its texts, then its pictures (and its product cases). */
function Inspector({ section, items, fiche, userId, onEdit, onSlot }: {
  section: SiteSection; items: SiteItem[]; fiche: Fiche; userId: string;
  onEdit: (kind: 't' | 'i' | 'c', key: string, value: string | null) => void; onSlot: (slot: string, value: string) => void;
}) {
  const products = Array.isArray(fiche.products) ? fiche.products : [];
  const slots = ((fiche.store?.slots ?? {}) as Record<string, string>);
  const texts = items.filter((x) => x.kind === 't' || x.kind === 'c'), images = items.filter((x) => x.kind === 'i'), cases = items.filter((x) => x.kind === 'p');
  if (!items.length) return <p className={styles.hint}>{section.fixed ? 'Rien à changer ici : votre nom et votre logo viennent de vos paramètres.' : 'Cette section n’a rien à changer.'}</p>;
  return (
    <div className={styles.inspector}>
      {texts.length ? (
        <section className={styles.block} aria-label="Textes">
          <h3>Textes</h3>
          {texts.map((x) => {
            const kind = x.kind === 'c' ? 'c' : 't';
            const own = siteValue(fiche, kind, x.key);
            const value = own ?? x.text;
            const set = (v: string) => onEdit(kind, x.key, v.trim() ? v : null);
            return (
              <div key={x.key} className={styles.text} data-site-key={x.key}>
                {x.long ? <TextArea label={x.role} rows={4} maxLength={800} value={value} onChange={(e) => set(e.target.value)} />
                  : <Field label={x.role} maxLength={200} value={value} onChange={(e) => set(e.target.value)} />}
                {own !== undefined ? <button type="button" className={styles.reset} onClick={() => onEdit(kind, x.key, null)}>Remettre le texte du modèle</button> : null}
              </div>
            );
          })}
        </section>
      ) : null}
      {images.length ? (
        <section className={styles.block} aria-label="Images">
          <h3>Images</h3>
          {images.map((x, i) => <MediaCard key={x.key} item={x} name={IMAGE_NAMES[i] ?? `Image ${i + 1}`} own={siteValue(fiche, 'i', x.key)} userId={userId} onChange={(v) => onEdit('i', x.key, v)} />)}
        </section>
      ) : null}
      {cases.length ? (
        <section className={styles.block} aria-label="Produits">
          <h3>Produits</h3>
          {cases.map((x, i) => {
            const none = 'Masquer cette case';
            const now = slots[x.ref] ?? x.ref;
            const names = products.map((p) => p.name || p.id);
            const label = now === '-' ? none : products.find((p) => p.id === now)?.name ?? names[0] ?? none;
            return (
              <div key={x.key} data-site-key={x.key}>
                <Select label={`Case ${i + 1}`} options={[...names, none]} value={label}
                  onChange={(e) => onSlot(x.ref, e.target.value === none ? '-' : products.find((p) => (p.name || p.id) === e.target.value)?.id ?? x.ref)} />
              </div>
            );
          })}
        </section>
      ) : null}
      {items.some((x) => x.kind === 's') ? <p className={styles.hint}>Vos prestations s’affichent ici. Elles se gèrent dans <Link href="/admin/prestations/"><b>Prestations</b></Link>.</p> : null}
    </div>
  );
}

/** A picture of the section: its miniature, a plain name, and « Remplacer ». Her photo is shrunk and sent to her
 *  folder like a product's. Nothing of the model's own notes (where a demo photo comes from) is ever shown. */
function MediaCard({ item, name, own, onChange, userId }: { item: SiteItem; name: string; own: string | undefined; onChange: (v: string | null) => void; userId: string }) {
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
    <div className={styles.media} data-site-key={item.key}>
      <span className={styles.thumb}>{src ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={src} alt="" /> : <Icon name="image" size={20} />}</span>
      <div className={styles.mediaBody}>
        <b>{name}</b>
        <div className={styles.mediaActs}>
          <Button className={styles.small} variant="secondary" busy={busy} onClick={() => input.current?.click()} aria-label={`Remplacer : ${name}`}>Remplacer</Button>
          {own !== undefined ? <button type="button" className={styles.reset} onClick={() => onChange(null)} aria-label={`Remettre la photo du modèle : ${name}`}>Remettre</button> : null}
        </div>
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void pick(e)} aria-label={`Choisir une photo : ${name}`} />
      {error ? <p className={styles.mediaError} role="alert">{error}</p> : null}
    </div>
  );
}
