'use client';

import Link from 'next/link';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { Empty } from '@/components/admin/AdminShell';
import { useSave } from '@/components/admin/useSave';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, Select, TextArea } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Menu } from '@/components/ui/Menu';
import { Notice } from '@/components/ui/Notice';
import { Toast } from '@/components/ui/Toast';
import { UPLOAD_ERROR, uploadPhoto } from '@/lib/media';
import { brandOf, editorSite, MODEL_COLORS, readSiteMap, sectionLook, sectionOrder, siteValue, withSectionLook, withSectionOrder, withSiteEdit, withSlot, type SectionLook, type SiteItem, type SiteMap, type SiteSection } from '@/lib/models';
import { storeName, storeUrl, type Fiche } from '@/lib/stores';
import { ColorPalette } from '@/components/ui/ColorField';
import { LeaveDialog } from './LeaveDialog';
import { AddedInspector, BandInspector, ColorField, PhotoField, TextStyle } from './Extras';
import { MobileEditor } from './MobileEditor';
import { CloudLoader } from '@/components/ui/CloudLoader';
import { DESK_TOUR, PHONE_TOUR, TOUR_KEY, Tour } from './Tour';
import { ADDED_KINDS, addedName, addedSections, categoriesOf, hiddenItems, hiddenLabel, linkLabel, modelBySlug, sectionHidden, sectionSource, withBand, withImageFrame, withSectionHidden, withSectionSource, newAddedId, withAdded, withTextLook, type Added, type TextLook } from '@/lib/models';
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
  const leaveRef = useRef<(href: string) => void>((h) => window.location.assign(h));
  const [past, setPast] = useState<Fiche[]>([]);
  const [future, setFuture] = useState<Fiche[]>([]);
  const [path, setPath] = useState('');
  const [map, setMap] = useState<SiteMap | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [focus, setFocus] = useState('');
  const [sel, setSel] = useState('');
  const [adding, setAdding] = useState(false);
  const [tip, setTip] = useState(false);
  const [tour, setTour] = useState(false);
  // the guided visit: by itself the first time on this device (or with ?visite=1), then from the « ? » of the bar
  useEffect(() => { try { setTour(window.localStorage.getItem(TOUR_KEY) !== '1' || new URLSearchParams(window.location.search).get('visite') === '1'); } catch { setTour(true); } }, []);
  // she touches an element of her site during the visit: the visit gives way at once
  useEffect(() => { if (sel && tour) { setTour(false); try { window.localStorage.setItem(TOUR_KEY, '1'); } catch { /* shown again next time */ } } }, [sel]);   // eslint-disable-line react-hooks/exhaustive-deps
  const endTour = useCallback(() => { setTour(false); try { window.localStorage.setItem(TOUR_KEY, '1'); } catch { /* shown again next time */ } }, []);
  useEffect(() => { try { setTip(window.localStorage.getItem('jehre-editor-tip') !== '1'); } catch { setTip(true); } }, []);
  const [device, setDevice] = useState<Device>('desktop');
  const [phone, setPhone] = useState(false);
  const [room, setRoom] = useState({ w: 900, h: 700 });
  const [toast, setToast] = useState<'live' | 'saved' | null>(null);
  const [dragged, setDragged] = useState<number | null>(null);
  const [unfolded, setUnfolded] = useState<number[]>([]);
  const [query, setQuery] = useState('');
  const [zoom, setZoom] = useState(1);
  const [leftOpen, setLeftOpen] = useState(true);
  const [narrow, setNarrow] = useState(false);
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
    try { w.postMessage({ jeerePreview: model.key, fiche: latest.current, edit: true, store: store?.slug ?? '' }, siteOrigin); } catch { /* the page keeps the published store */ }
  }, [model, siteOrigin]);
  useEffect(() => {
    if (!model) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== siteOrigin || e.source !== frame.current?.contentWindow) return;
      const d = (e.data ?? {}) as { jeereConnect?: unknown; jeereNone?: unknown; jeereAdded?: unknown; jeerePick?: { key?: unknown; sec?: unknown } };
      if (typeof d.jeereAdded === 'string') { setPicked(null); setFocus(''); setSel(`a:${d.jeereAdded}`); return; }
      if ((d as { jeereGo?: unknown }).jeereGo === 'paiements') { leaveRef.current('/admin/paiements/'); return; }
      if (d.jeereNone === true) { setSel(''); return; }
      if (d.jeereConnect === 'ready') { send(); return; }
      const m = readSiteMap(e.data);
      if (m) { setMap((old) => (same(old, m) ? old : m)); return; }
      if (d.jeerePick && typeof d.jeerePick.key === 'string') {
        if (typeof d.jeerePick.sec === 'number' && d.jeerePick.sec >= 0) setPicked(d.jeerePick.sec); else setPicked(null);
        setFocus(d.jeerePick.key);
        setSel(d.jeerePick.key);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [model, siteOrigin, send]);
  useEffect(() => { send(); }, [draft, send]);
  // what she is working on stays framed on the site until she chooses something else
  useEffect(() => {
    try { frame.current?.contentWindow?.postMessage({ jeereSelect: sel, show: phone }, siteOrigin); } catch { /* the bar still shows its tools */ }
  }, [sel, map, phone, siteOrigin]);
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
    const q = window.matchMedia('(max-width: 767px)'), t = window.matchMedia('(max-width: 1100px)');
    const on = () => { setPhone(q.matches); if (q.matches) setDevice('phone'); setNarrow(t.matches); };
    on(); q.addEventListener('change', on); t.addEventListener('change', on);
    return () => { q.removeEventListener('change', on); t.removeEventListener('change', on); };
  }, []);
  // a tablet has room for one panel beside the site: opening a section puts the list away (one tap brings it back)
  useEffect(() => { if (narrow && picked !== null) setLeftOpen(false); }, [narrow, picked]);
  useEffect(() => { if (!narrow) setLeftOpen(true); }, [narrow]);
  const ready = !!draft && !!model;
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { const c = getComputedStyle(el); setRoom({ w: Math.max(240, el.clientWidth - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight)), h: Math.max(320, el.clientHeight - parseFloat(c.paddingTop) - parseFloat(c.paddingBottom)) }); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);

  const dirty = !!draft && !!origin && !same(draft, origin);
  // closing or reloading the tab with changes not saved: the browser asks first
  const leaving = useRef(false);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { if (leaving.current) return; e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  // a safety copy of her changes on this device, while they are not saved: a crash or a closed tab loses nothing
  const backupKey = storeId ? `jeere-editor-draft:${storeId}` : '';
  const dropBackup = useCallback(() => { try { if (backupKey) window.localStorage.removeItem(backupKey); } catch { /* nothing kept */ } }, [backupKey]);
  useEffect(() => {
    if (!backupKey || !draft || !dirty) return;
    const t = window.setTimeout(() => { try { window.localStorage.setItem(backupKey, JSON.stringify({ base: stamp ?? '', at: Date.now(), fiche: draft })); } catch { /* the device is full: the question before leaving still protects her */ } }, 500);
    return () => window.clearTimeout(t);
  }, [backupKey, draft, dirty, stamp]);
  const [recovered, setRecovered] = useState<Fiche | null>(null);
  useEffect(() => {
    if (!backupKey || !store) return;
    try {
      const raw = window.localStorage.getItem(backupKey); if (!raw) return;
      const b = JSON.parse(raw) as { base?: string; fiche?: Fiche };
      // only on top of the same saved version: a copy older than what is saved now would undo newer work
      if (b.fiche && b.base === (stamp ?? '') && !same(b.fiche, store.fiche)) setRecovered(b.fiche); else window.localStorage.removeItem(backupKey);
    } catch { /* an unreadable copy is ignored */ }
  }, [backupKey, stamp]);   // eslint-disable-line react-hooks/exhaustive-deps
  // leaving the editor (the arrow, a link of the editor): with changes not saved, she is asked first
  const [exitTo, setExitTo] = useState<string | null>(null);
  const go = useCallback((href: string) => { leaving.current = true; window.location.assign(href); }, []);
  const leave = useCallback((href: string) => { if (dirty) setExitTo(href); else go(href); }, [dirty, go]);
  leaveRef.current = leave;
  // every link of the editor that leads elsewhere in Jehre (Produits, Branding, Paiements…) goes through the same question
  useEffect(() => {
    if (!dirty) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const href = a.getAttribute('href') ?? '';
      if (!href.startsWith('/') || href.startsWith('//')) return;
      const url = new URL(href, window.location.href);
      if (url.pathname === window.location.pathname) return;
      e.preventDefault(); e.stopPropagation();
      setExitTo(url.pathname + url.search + url.hash);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
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

  const goPage = (p: string) => { if (p !== path) { setPath(p); setMap(null); setPicked(null); setFocus(''); setSel(''); } };
  async function save(publish: boolean) {
    if (!draft || busy || (!dirty && !(publish && !store?.published))) return;
    setToast(null);
    if (await write(draft, publish)) { setOrigin(draft); dropBackup(); setToast(publish ? 'live' : 'saved'); }
  }
  async function saveAndLeave() {
    if (!draft || !exitTo) return;
    if (await write(draft, !!store?.published)) { setOrigin(draft); dropBackup(); go(exitTo); }
    else setExitTo(null);   // the reason is shown below; she stays with her changes
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
    setPicked(x.sec); setFocus(x.key); setSel(x.key);
    try { frame.current?.contentWindow?.postMessage({ jeereFocus: x.key }, siteOrigin); } catch { /* the field still opens */ }
  };
  const openSection = (s: SiteSection) => {
    setPicked(s.n); setFocus(''); setSel(s.key);
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

  // the sections she added to this page, and what she does with them
  const page = map?.page ?? '';
  const added = draft && map ? addedSections(draft, page) : [];
  const chosen = sel.startsWith('a:') ? added.find((a) => a.id === sel.slice(2)) : undefined;
  const bands = (map?.items ?? []).filter((x) => x.kind === 'm');
  const band = bands.find((x) => x.key === sel);
  const lastBody = [...sections].reverse().find((x) => !x.fixed)?.n ?? -1;
  const anchorOf = (a: Added) => (sections.some((x) => x.n === a.after && x.name !== 'Pied de page') ? a.after : lastBody);
  const addSection = (type: Added['type']) => {
    const kind = ADDED_KINDS.find((k) => k.type === type)!, id = newAddedId();
    const after = picked !== null && sections.some((x) => x.n === picked && x.name !== 'Pied de page') ? picked : chosen ? chosen.after : lastBody;
    change((d) => withAdded(d, page, [...addedSections(d, page), { id, type, after, ...kind.start } as Added]));
    setAdding(false); setPicked(null); setFocus(''); setSel(`a:${id}`);
  };
  const patchAdded = (id: string, patch: Partial<Added>, tag = '') => change((d) => withAdded(d, page, addedSections(d, page).map((a) => (a.id === id ? { ...a, ...patch } : a))), tag ? `a:${id}:${tag}` : '');
  const copyAdded = (a: Added) => { const id = newAddedId(); change((d) => { const l = addedSections(d, page), i = l.findIndex((x) => x.id === a.id); return withAdded(d, page, [...l.slice(0, i + 1), { ...a, id }, ...l.slice(i + 1)]); }); setSel(`a:${id}`); };
  const dropAdded = (id: string) => { change((d) => withAdded(d, page, addedSections(d, page).filter((a) => a.id !== id))); if (sel === `a:${id}`) setSel(''); };

  if (!store) return <Empty icon="store" title="Pas encore de boutique" action={<ButtonLink href="/admin/modeles/">Voir les modèles</ButtonLink>}>Choisissez un modèle pour créer votre boutique.</Empty>;
  if (!draft) return <CloudLoader full label="Ouverture de l’éditeur…" />;
  if (!model) return <Empty icon="template" title="Choisissez d’abord un modèle" action={<ButtonLink href="/admin/modeles/">Voir les modèles</ButtonLink>}>L’éditeur s’ouvre sur votre modèle : MICHOU, SÈVE, ANSE, REGARD… Choisissez le vôtre, puis revenez ici.</Empty>;

  const pageName = pages.find((p) => p.path === path)?.name ?? 'Accueil';
  const wide = device === 'desktop';
  const frameW = wide ? Math.max(1280, room.w) : 390;
  const fit = Math.min(1, room.w / frameW);
  const scale = fit * zoom;
  const frameH = wide ? Math.max(room.h, Math.round(room.h * zoom)) : Math.min(room.h, 844) * zoom;
  // the sections that answer the quick search (by their name, or by a word of what they hold)
  const needle = query.trim().toLowerCase();
  const shown = needle ? sections.filter((x) => x.name.toLowerCase().includes(needle) || (map?.items ?? []).some((i) => i.sec === x.n && `${i.role} ${i.text}`.toLowerCase().includes(needle))) : sections;
  const url = storeUrl(store, modelSlug);
  const inspector = current ? (
    <Inspector key={current.key} section={current} items={items} fiche={draft} userId={account.userId} focus={focus} pages={pages}
      onTextLook={(key, patch, tag) => change((d) => withTextLook(d, key, patch), `x:${key}:${tag}`)}
      onSource={(cat) => change((d) => withSectionSource(d, current.key, cat))}
      onLogo={(v) => change((d) => { const st = { ...(d.store ?? {}) } as Record<string, unknown>; if (v) st.logo = v; else delete st.logo; return { ...d, store: st }; })}
      onLook={(patch) => change((d) => withSectionLook(d, current.key, patch), `look:${current.key}:${Object.keys(patch).join()}`)}
      onEdit={(kind, key, value) => change((d) => withSiteEdit(d, kind, key, value), `${kind}:${key}`)} onSlot={(slot, value) => change((d) => withSlot(d, slot, value))} />
  ) : null;

  const toasts = (<>
      {exitTo ? <LeaveDialog published={!!store.published} busy={busy} onSave={() => void saveAndLeave()} onDrop={() => { dropBackup(); go(exitTo); }} onStay={() => setExitTo(null)} /> : null}
      {recovered ? <Toast onDone={() => { setRecovered(null); dropBackup(); }} ms={15000} action={<button type="button" onClick={() => { change(() => recovered); setRecovered(null); }}>Reprendre</button>}>Des modifications non enregistrées ont été retrouvées.</Toast> : null}
      {tour && map ? <Tour steps={phone ? PHONE_TOUR : DESK_TOUR} onDone={endTour} /> : null}
      {path.includes('commande') && map ? <p className={phone ? styles.payNotePhone : styles.payNote}><Icon name="wallet" size={14} />Le paiement se règle dans <a href="/admin/paiements/"><b>Paiements</b></a>.</p> : null}
      {problem === 'conflict' ? <Toast onDone={clear} ms={12000} action={<button type="button" onClick={() => void reload()}>Recharger</button>}>Votre boutique a changé entre-temps. Rien n’a été écrasé.</Toast> : null}
      {problem === 'network' ? <Toast onDone={clear} ms={8000}>Rien n’a été enregistré. Vérifiez votre connexion.</Toast> : null}
      {toast === 'live' && !problem ? <Toast onDone={() => setToast(null)} action={<a href={url} target="_blank" rel="noopener">Voir mon site</a>}>Votre site est en ligne · {url.replace(/^https:\/\//, '')}</Toast> : null}
      {toast === 'saved' && !problem ? <Toast onDone={() => setToast(null)} ms={3000}>Brouillon enregistré. Votre site n’est pas encore en ligne.</Toast> : null}
  </>);
  // the colours offered in every colour field: her brand's, then her model's own
  const b0 = brandOf(draft);
  const palette: [string, string][] = [
    ...([[b0.btnBg, 'Boutons'], [b0.bg, 'Fond'], [b0.text, 'Textes'], [b0.accent, 'Accent']] as [string | undefined, string][]).filter((x): x is [string, string] => !!x[0]),
    ...(MODEL_COLORS[modelSlug || model.key] ?? []),
  ];
  if (phone) return (
    <ColorPalette value={palette}><MobileEditor published={store.published} pages={pages} path={path} goPage={goPage} canUndo={past.length > 0} canRedo={future.length > 0} undo={undo} redo={redo}
      busy={busy} dirty={dirty} save={(pub) => void save(pub)} site={site} frame={frame} map={map} sections={sections} draft={draft} change={change} moveSection={moveSection}
      sel={sel} setSel={setSel} onHelp={() => setTour(true)} hideHint={tour} onLeave={leave} userId={account.userId} modelName={modelBySlug(modelSlug)?.name ?? model.name} booking={!!modelBySlug(modelSlug)?.rdv}>{toasts}</MobileEditor></ColorPalette>
  );

  return (
    <ColorPalette value={palette}><div className={styles.editor}>
      <header className={styles.top}>
        <div className={styles.topLeft}>
          <a className={styles.icon} href="/admin/" aria-label="Retour au tableau de bord" onClick={(e) => { e.preventDefault(); leave('/admin/'); }}><Icon name="back" size={16} /></a>
          {phone ? null : <button type="button" className={styles.icon} aria-pressed={leftOpen} onClick={() => setLeftOpen((v) => !v)} aria-label={leftOpen ? 'Masquer les sections' : 'Afficher les sections'}><Icon name="menu" size={16} /></button>}
          <b className={styles.name}>{storeName(store)}</b>
          <span className={styles.badge} data-live={store.published ? '' : undefined}>{store.published ? 'En ligne' : 'Brouillon'}</span>
        </div>
        <div className={styles.topCenter}>
          {pages.length > 1 ? <Menu label="Page" options={pages.map((p) => ({ value: p.path, label: p.name }))} value={path} onChange={goPage} /> : <span className={styles.onePage}>{pageName}</span>}
        </div>
        <div className={styles.topRight}>
          <div className={styles.devices} role="group" aria-label="Taille de l’aperçu" data-device={device} data-tour="devices">
            <span className={styles.devThumb} aria-hidden="true" />
            <button type="button" aria-pressed={wide} onClick={() => setDevice('desktop')} aria-label="Ordinateur"><Icon name="desktop" size={16} /><span>Ordinateur</span></button>
            <button type="button" aria-pressed={!wide} onClick={() => setDevice('phone')} aria-label="Téléphone"><Icon name="phone" size={16} /><span>Téléphone</span></button>
          </div>
          <div className={styles.group} data-tour="history">
            <button type="button" className={styles.icon} disabled={!past.length} onClick={undo} aria-label="Annuler"><Icon name="undo" size={18} /></button>
            <button type="button" className={styles.icon} disabled={!future.length} onClick={redo} aria-label="Rétablir"><Icon name="redo" size={18} /></button>
          </div>
          {store.published ? null : <Button className={styles.action} variant="secondary" disabled={!dirty || busy} onClick={() => void save(false)}>Enregistrer</Button>}
          <button type="button" className={styles.icon} onClick={() => setTour(true)} aria-label="Revoir la visite de l’éditeur" title="Revoir la visite"><Icon name="info" size={18} /></button>
          <span data-tour="publish" style={{ display: 'inline-flex' }}><Button className={styles.action} busy={busy} disabled={store.published && !dirty} onClick={() => void save(true)}>Publier</Button></span>
        </div>
      </header>

      <div className={styles.cols} data-open={(current || chosen || band) && !phone ? '' : undefined} data-left={leftOpen || phone ? '' : undefined} data-narrow={narrow ? '' : undefined}>
        {leftOpen || phone ? (
        <aside className={styles.left} aria-label="Sections de la page" data-tour="sections">
          <h2 className={styles.title}>{path === '' ? 'Page d’accueil' : `Page ${pageName}`}</h2>
          {sections.length > 5 ? <input className={styles.search} type="search" placeholder="Rechercher..." aria-label="Rechercher une section ou un texte" value={query} onChange={(e) => setQuery(e.target.value)} /> : null}
          {map ? (
            <ol className={styles.list}>
              {shown.map((s) => {
                const off = sectionHidden(draft, s);
                const inside = (map.items ?? []).filter((x) => x.sec === s.n && x.kind !== 's');
                const open = unfolded.includes(s.n) || (!!needle && !s.name.toLowerCase().includes(needle));
                const mine = added.filter((a) => anchorOf(a) === s.n);
                return (
                 <Fragment key={s.key}>
                 <li className={styles.node}>
                  <div className={styles.row} data-on={picked === s.n ? '' : undefined} data-off={off ? '' : undefined} data-over={dragged !== null && dragged !== s.n && !s.fixed ? '' : undefined}
                    draggable={!s.fixed} onDragStart={(e) => { setDragged(s.n); e.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => setDragged(null)}
                    onDragOver={(e) => { if (dragged !== null && !s.fixed) e.preventDefault(); }}
                    onDrop={(e) => { e.preventDefault(); if (dragged !== null && !s.fixed) moveSection(dragged, sections.filter((x) => !x.fixed).findIndex((x) => x.n === s.n)); setDragged(null); }}>
                    {s.fixed ? <span className={styles.grip} aria-hidden="true" />
                      : <button type="button" className={styles.grip} onKeyDown={(e) => onGripKey(e, s.n)} aria-label={`Déplacer ${s.name} (flèches haut et bas)`}><Icon name="grip" size={16} /></button>}
                    {inside.length ? <button type="button" className={styles.fold} aria-expanded={open} onClick={() => setUnfolded((u) => (open ? u.filter((n) => n !== s.n) : [...u, s.n]))} aria-label={open ? `Replier ${s.name}` : `Déplier ${s.name}`}><Icon name="chevron" size={14} /></button> : <span className={styles.fold} aria-hidden="true" />}
                    <button type="button" className={styles.rowMain} onClick={() => openSection(s)} aria-current={picked === s.n ? 'true' : undefined}>{s.name}</button>
                    {s.fixed ? null : <button type="button" className={styles.eye} aria-pressed={!off} onClick={() => change((d) => withSectionHidden(d, s, !off))} aria-label={off ? `Afficher ${s.name}` : `Masquer ${s.name}`}><Icon name={off ? 'eyeOff' : 'eye'} size={14} /></button>}
                    {s.fixed || off ? null : <button type="button" className={styles.eye} onClick={() => change((d) => withSectionHidden(d, s, true))} aria-label={`Supprimer ${s.name}`} title="Supprimer (elle reste dans la liste, grisée, pour la remettre)"><Icon name="trash" size={14} /></button>}
                  </div>
                  {open ? (() => {
                    const words = inside.filter((x) => x.kind === 't' || x.kind === 'c'), pics = inside.filter((x) => x.kind === 'i'), cases = inside.filter((x) => x.kind === 'p');
                    return (
                    <ul className={styles.leaves}>
                      {words.slice(0, 5).map((x) => {
                        const said = siteValue(draft, x.kind === 'c' ? 'c' : 't', x.key) ?? x.text;
                        return <li key={x.key}><button type="button" className={styles.leaf} data-on={focus === x.key ? '' : undefined} onClick={() => openItem(x)}><Icon name="edit" size={14} /><span>{x.role}{said ? <i> – {said}</i> : null}</span></button></li>;
                      })}
                      {words.length > 5 ? <li><button type="button" className={styles.leaf} onClick={() => openSection(s)}><Icon name="edit" size={14} /><span>{words.length - 5} autres textes</span></button></li> : null}
                      {pics.length ? <li><button type="button" className={styles.leaf} onClick={() => openItem(pics[0]!)}><Icon name="image" size={14} /><span>{pics.length > 1 ? `${pics.length} images` : 'Image'}</span></button></li> : null}
                      {cases.length ? <li><button type="button" className={styles.leaf} onClick={() => openItem(cases[0]!)}><Icon name="tag" size={14} /><span>{cases.length > 1 ? `${cases.length} produits` : 'Produit'}</span></button></li> : null}
                    </ul>
                    );
                  })() : null}
                 </li>
                 {mine.map((a) => (
                   <li key={a.id} className={styles.node}>
                     <div className={styles.row} data-on={sel === `a:${a.id}` ? '' : undefined} data-added="">
                       <span className={styles.grip} aria-hidden="true" /><span className={styles.fold} aria-hidden="true" />
                       <button type="button" className={styles.rowMain} onClick={() => { setPicked(null); setFocus(''); setSel(`a:${a.id}`); }} aria-current={sel === `a:${a.id}` ? 'true' : undefined}>{addedName(a)}{a.title ? ` – ${a.title}` : ''}</button>
                       <button type="button" className={styles.eye} onClick={() => copyAdded(a)} aria-label={`Dupliquer ${addedName(a)}`} title="Dupliquer"><Icon name="copy" size={14} /></button>
                       <button type="button" className={styles.eye} onClick={() => dropAdded(a.id)} aria-label={`Supprimer ${addedName(a)}`} title="Supprimer"><Icon name="trash" size={14} /></button>
                     </div>
                   </li>
                 ))}
                 </Fragment>
                );
              })}
            </ol>
          ) : <CloudLoader label="Chargement de votre modèle…" />}
          {map && needle && !shown.length ? <p className={styles.hint}>Aucune section ne correspond.</p> : null}
          {map && !needle ? bands.map((x) => (
            <div key={x.key} className={styles.row} data-on={sel === x.key ? '' : undefined} data-added="">
              <span className={styles.grip} aria-hidden="true" /><span className={styles.fold} aria-hidden="true" />
              <button type="button" className={styles.rowMain} onClick={() => { setPicked(null); setFocus(''); setSel(x.key); }} aria-current={sel === x.key ? 'true' : undefined}>Bandeau défilant</button>
            </div>
          )) : null}
          {map && !needle && hiddenItems(draft, map).length ? (
            <div className={styles.hiddenBox} aria-label="Éléments masqués">
              {hiddenItems(draft, map).map((x) => <button key={x.key} type="button" className={styles.leaf} onClick={() => change((d) => (x.kind === 'm' ? withBand(d, x.key, { hide: undefined }) : x.kind === 'i' ? withImageFrame(d, x.key, { hide: undefined }) : withTextLook(d, x.key, { hide: undefined })))}><Icon name="eye" size={14} /><span>Remettre {hiddenLabel(x)}</span></button>)}
            </div>
          ) : null}
          {map && !needle ? (
            <div className={styles.addBox}>
              <a className={styles.brandLink} href="/admin/branding/"><Icon name="brush" size={14} />Logo, couleurs et boutons</a>
              <button type="button" className={styles.add} data-tour="add" aria-expanded={adding} aria-haspopup="menu" onClick={() => setAdding((v) => !v)}><Icon name="plus" size={14} /><span>Ajouter une section</span></button>
              {adding ? (
                <div className={styles.addMenu} role="menu" aria-label="Type de section">
                  {ADDED_KINDS.map((k) => <button key={k.type} type="button" role="menuitem" onClick={() => addSection(k.type)}>{k.name}</button>)}
                </div>
              ) : null}
            </div>
          ) : null}
        </aside>
        ) : null}

        <div className={styles.stage} ref={stage} data-device={device} data-zoomed={zoom > 1 ? '' : undefined}>
          <div className={styles.frameBox} style={{ width: Math.round(frameW * scale), height: Math.round(frameH) }} data-device={device} data-tour="site">
            <iframe ref={frame} key={path} title="Votre site" src={site + path} width={frameW} height={Math.round(frameH / scale)} style={{ transform: `scale(${scale})` }} />
          </div>
        </div>

        {/* the one-line help: a small notice on top of the screen, over the site, closed for good with × */}
        {tip && !tour && !phone ? (
            <p className={styles.tip} role="note">
              <span>Cliquez sur un texte ou une photo pour le changer. Vos produits : <Link href="/admin/produits/"><b>Produits</b></Link>.</span>
              <button type="button" onClick={() => { setTip(false); try { window.localStorage.setItem('jehre-editor-tip', '1'); } catch { /* shown again next time */ } }} aria-label="Fermer cette aide"><Icon name="close" size={12} /></button>
            </p>
        ) : null}
        {/* the view: a small bar that floats over the site and never moves with it */}
        {phone ? null : (
          <div className={styles.viewBar} role="group" aria-label="Zoom">
            <button type="button" className={styles.icon} disabled={zoom <= 0.5} onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))} aria-label="Réduire"><span aria-hidden="true">−</span></button>
            <button type="button" className={styles.zoom} onClick={() => setZoom(1)} aria-label={`Zoom ${Math.round(zoom * 100)} %, revenir à 100 %`}>{Math.round(zoom * 100)} %</button>
            <button type="button" className={styles.icon} disabled={zoom >= 2} onClick={() => setZoom((z) => Math.min(2, Math.round((z + 0.1) * 10) / 10))} aria-label="Agrandir"><span aria-hidden="true">+</span></button>
          </div>
        )}

        {band && !phone ? (
          <aside className={styles.right} aria-label="Contenu : Bandeau défilant">
            <div className={styles.rightHead}>
              <h2>Bandeau défilant</h2>
              <button type="button" className={styles.icon} onClick={() => setSel('')} aria-label="Fermer"><Icon name="close" size={16} /></button>
            </div>
            <BandInspector key={band.key} item={band} fiche={draft} onChange={(patch, tag) => change((d) => withBand(d, band.key, patch), tag ? `m:${band.key}:${tag}` : '')} />
          </aside>
        ) : null}
        {chosen && !current && !phone ? (
          <aside className={styles.right} aria-label={`Contenu : ${addedName(chosen)}`}>
            <div className={styles.rightHead}>
              <h2>{addedName(chosen)}</h2>
              <button type="button" className={styles.icon} onClick={() => setSel('')} aria-label="Fermer"><Icon name="close" size={16} /></button>
            </div>
            <AddedInspector key={chosen.id} added={chosen} fiche={draft} pages={pages} userId={account.userId} onChange={(patch, tag) => patchAdded(chosen.id, patch, tag)} />
          </aside>
        ) : null}
        {current && !band && !phone ? (
          <aside className={styles.right} aria-label={`Contenu : ${current.name}`}>
            <div className={styles.rightHead}>
              <h2>{current.name}</h2>
              <button type="button" className={styles.icon} onClick={() => { setPicked(null); setSel(''); }} aria-label="Fermer"><Icon name="close" size={16} /></button>
            </div>
            {inspector}
          </aside>
        ) : null}
      </div>

      {toasts}
    </div></ColorPalette>
  );
}

/** What one section of the model holds, in two calm groups: its texts, then its pictures (and its product cases). */
const ALIGN: [SectionLook['align'] | undefined, string][] = [[undefined, 'Modèle'], ['left', 'Gauche'], ['center', 'Centre'], ['right', 'Droite']];
const px = (v: string, max: number): number | undefined => (v.trim() === '' ? undefined : Math.min(max, Number(v.replace(/\D/g, '')) || 0));

function Inspector({ section, items, fiche, userId, focus, pages, onEdit, onSlot, onLook, onTextLook, onLogo, onSource }: {
  section: SiteSection; items: SiteItem[]; fiche: Fiche; userId: string; focus: string; pages: { path: string; name: string }[]; onLook: (patch: SectionLook) => void;
  onTextLook: (key: string, patch: TextLook, tag: string) => void; onLogo: (v: string | null) => void; onSource: (cat: string) => void;
  onEdit: (kind: 't' | 'i' | 'c' | 'k' | 'l', key: string, value: string | null) => void; onSlot: (slot: string, value: string) => void;
}) {
  const products = Array.isArray(fiche.products) ? fiche.products : [];
  const slots = ((fiche.store?.slots ?? {}) as Record<string, string>);
  const texts = items.filter((x) => x.kind === 't' || x.kind === 'c'), images = items.filter((x) => x.kind === 'i'), cases = items.filter((x) => x.kind === 'p');
  const look = sectionLook(fiche, section.key);
  // long lists stay short until she asks for the rest; what she clicked on the site is always shown
  const [allTexts, setAllTexts] = useState(false);
  const [allCases, setAllCases] = useState(false);
  const [chosen, setChosen] = useState('');
  useEffect(() => { if (images.some((x) => x.key === focus)) setChosen(focus); }, [focus]);   // eslint-disable-line react-hooks/exhaustive-deps
  const TEXTS = 6, CASES = 4;
  const textsShown = allTexts || texts.length <= TEXTS || texts.slice(TEXTS).some((x) => x.key === focus) ? texts : texts.slice(0, TEXTS);
  const casesShown = allCases || cases.length <= CASES || cases.slice(CASES).some((x) => x.key === focus) ? cases : cases.slice(0, CASES);
  const picked = images.find((x) => x.key === chosen) ?? images[0];
  const imageName = (i: number) => IMAGE_NAMES[i] ?? `Image ${i + 1}`;
  const onText = texts.find((x) => x.key === focus && x.kind === 't');
  const cats = categoriesOf(fiche), source = sectionSource(fiche, section.key);
  const logo = typeof fiche.store?.logo === 'string' ? fiche.store.logo : '';
  return (
    <div className={styles.inspector}>
      <h3 className={styles.group3}>Contenu</h3>
      {!items.length ? <p className={styles.hint}>{section.fixed ? 'Votre nom et votre logo viennent de vos paramètres.' : 'Cette section n’a pas de texte ni de photo à changer.'}</p> : null}
      {texts.length ? (
        <section className={styles.block} aria-label="Textes">
          <h3>Textes{texts.length > 1 ? <span> · {texts.length}</span> : null}</h3>
          {textsShown.map((x) => {
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
          {textsShown.length < texts.length ? <button type="button" className={styles.more} onClick={() => setAllTexts(true)}>Afficher les {texts.length - textsShown.length} autres textes</button> : null}
        </section>
      ) : null}
      {onText ? <TextStyle item={onText} fiche={fiche} pages={pages} link={siteValue(fiche, 'k', onText.key) ?? ''} onLook={(patch, tag) => onTextLook(onText.key, patch, tag)} onLink={(v) => onEdit('k', onText.key, v)} /> : null}
      {section.name === 'En-tête' ? (
        <section className={styles.block} aria-label="Logo">
          <h3>Logo</h3>
          <PhotoField name="Votre logo" src={logo} own={!!logo} userId={userId} onChange={onLogo} />
        </section>
      ) : null}
      {images.length ? (
        <section className={styles.block} aria-label="Images">
          <h3>Images{images.length > 1 ? <span> · {images.length}</span> : null}</h3>
          {images.length > 1 ? (
            <div className={styles.thumbs} role="group" aria-label="Choisir une image">
              {images.map((x, i) => { const src = siteValue(fiche, 'i', x.key) ?? x.src; return (
                <button key={x.key} type="button" aria-pressed={picked?.key === x.key} aria-label={imageName(i)} title={imageName(i)} onClick={() => setChosen(x.key)}>
                  {src ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={src} alt="" loading="lazy" /> : <Icon name="image" size={16} />}
                </button>
              ); })}
            </div>
          ) : null}
          {picked ? <MediaCard key={picked.key} item={picked} name={imageName(images.indexOf(picked))} own={siteValue(fiche, 'i', picked.key)} userId={userId} onChange={(v) => onEdit('i', picked.key, v)} /> : null}
          {picked && picked.link ? (() => { const lk = picked.key.replace('|i|', '|l|'), now = siteValue(fiche, 'l', lk) ?? '', prods = Array.isArray(fiche.products) ? fiche.products : [];
            const opts = ['Lien du modèle', ...cats.map((c) => `Catégorie ${c}`), ...prods.map((x) => `Produit ${x.name || x.id}`)];
            const cur = now.startsWith('c:') ? `Catégorie ${now.slice(2)}` : now.startsWith('p:') ? `Produit ${prods.find((x) => x.id === now.slice(2))?.name ?? ''}` : 'Lien du modèle';
            return <Select label="Cette photo mène à" options={opts} value={cur} onChange={(e) => { const v = e.target.value, c = cats.find((x) => `Catégorie ${x}` === v), pr = prods.find((x) => `Produit ${x.name || x.id}` === v); onEdit('l', lk, c ? `c:${c}` : pr ? `p:${pr.id}` : null); }} />; })() : null}
        </section>
      ) : null}
      {cases.length ? (
        <section className={styles.block} aria-label="Produits">
          <h3>Produits{cases.length > 1 ? <span> · {cases.length}</span> : null}</h3>
          {source ? <p className={styles.linked}><Icon name="link" size={12} />Lié à : Catégorie {source}</p> : null}
          <Select label="Afficher" options={['Ma sélection, case par case', ...cats.map((c) => `Catégorie ${c}`)]} value={source ? `Catégorie ${source}` : 'Ma sélection, case par case'}
            onChange={(e) => onSource(cats.find((c) => `Catégorie ${c}` === e.target.value) ?? '')} />
          {casesShown.map((x, i) => {
            // a case shows the product of the same number; when she has fewer products, it keeps the model's own
            const none = 'Masquer cette case', keep = 'Produit du modèle';
            const now = slots[x.ref] ?? x.ref;
            const names = products.map((p) => p.name || p.id);
            const mine = products.find((p) => p.id === now);
            const label = now === '-' ? none : mine ? mine.name || mine.id : keep;
            return (
              <div key={x.key} data-site-key={x.key}>
                <Select label={`Case ${i + 1}`} options={[...names, ...(mine || now === '-' ? [] : [keep]), none]} value={label}
                  onChange={(e) => onSlot(x.ref, e.target.value === none ? '-' : products.find((p) => (p.name || p.id) === e.target.value)?.id ?? x.ref)} />
              </div>
            );
          })}
          {casesShown.length < cases.length ? <button type="button" className={styles.more} onClick={() => setAllCases(true)}>Afficher les {cases.length - casesShown.length} autres cases</button> : null}
        </section>
      ) : null}
      {items.some((x) => x.kind === 's') ? <p className={styles.hint}>Vos prestations s’affichent ici. Elles se gèrent dans <Link href="/admin/prestations/"><b>Prestations</b></Link>.</p> : null}

      <h3 className={styles.group3}>Mise en page</h3>
      <section className={styles.block} aria-label="Mise en page">
        <div className={styles.pair}>
          <Field label="Espace au-dessus (px)" inputMode="numeric" placeholder="Modèle" value={look.pt === undefined ? '' : String(look.pt)} onChange={(e) => onLook({ pt: px(e.target.value, 400) })} />
          <Field label="Espace en dessous (px)" inputMode="numeric" placeholder="Modèle" value={look.pb === undefined ? '' : String(look.pb)} onChange={(e) => onLook({ pb: px(e.target.value, 400) })} />
        </div>
        <div className={styles.control}>
          <span className={styles.caption} id="look-align">Alignement des textes</span>
          <div className={styles.segments} role="group" aria-labelledby="look-align">
            {ALIGN.map(([v, label]) => <button key={label} type="button" aria-pressed={look.align === v} onClick={() => onLook({ align: v })}>{label}</button>)}
          </div>
        </div>
      </section>

      <h3 className={styles.group3}>Apparence</h3>
      <section className={styles.block} aria-label="Apparence">
        <ColorField key={section.key} label="Fond de la section" value={look.bg ?? ''} onChange={(v) => onLook({ bg: v })} />
        <div className={styles.pair}>
          <Field label="Coins des images (px)" inputMode="numeric" placeholder="Modèle" value={look.radius === undefined ? '' : String(look.radius)} onChange={(e) => onLook({ radius: px(e.target.value, 200) })} />
          <div className={styles.control}>
            <span className={styles.caption}>Filet au-dessus</span>
            <button type="button" role="switch" aria-checked={look.line === true} aria-label="Filet au-dessus de la section" className={styles.toggle} onClick={() => onLook({ line: look.line ? undefined : true })} />
          </div>
        </div>
        {Object.keys(look).length ? <button type="button" className={styles.reset} onClick={() => onLook({ pt: undefined, pb: undefined, align: undefined, bg: undefined, line: undefined, radius: undefined })}>Remettre l’apparence du modèle</button> : null}
      </section>
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
