'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { Empty } from '@/components/admin/AdminShell';
import { useSave } from '@/components/admin/useSave';
import { StorePreview } from '@/components/store/StorePreview';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, Select, TextArea } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Notice } from '@/components/ui/Notice';
import { Sheet } from '@/components/ui/Sheet';
import { loadEngine, type EngineData, type EngineField, type EngineSectionType } from '@/lib/engineData';
import { UPLOAD_ERROR, uploadPhoto } from '@/lib/media';
import { storeName, type Fiche, type Section } from '@/lib/stores';
import styles from './editeur.module.css';

type Device = 'phone' | 'desktop';
type Tab = 'sections' | 'style';
type Values = Record<string, unknown>;

const isOn = (s: Section) => s.enabled !== false;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The editor of a store: its sections on the left, the real store in the middle, the settings of the chosen
 *  section on the right. Nothing is live until « Enregistrer ». The store is drawn by the engine, as in public. */
export default function EditorPage() {
  const { account, store, reload } = useAdmin();
  const { busy, problem, saved, write, clear } = useSave();
  const [engine, setEngine] = useState<EngineData | null>(null);
  const [engineDown, setEngineDown] = useState(false);
  const [draft, setDraft] = useState<Fiche | null>(null);
  const [origin, setOrigin] = useState<Fiche | null>(null);
  const [tab, setTab] = useState<Tab>('sections');
  const [picked, setPicked] = useState('');
  const [device, setDevice] = useState<Device>('phone');
  const [adding, setAdding] = useState(false);
  const [phone, setPhone] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState({ w: 390, h: 700 });

  useEffect(() => { loadEngine().then(setEngine, () => setEngineDown(true)); }, []);
  // the draft starts from the store as the engine reads it (every section it shows, in its order)
  const storeId = store?.id, stamp = store?.updated_at;
  useEffect(() => {
    if (!store || !engine) return;
    const f: Fiche = Array.isArray(store.fiche.sections) && store.fiche.sections.length ? store.fiche : { ...store.fiche, sections: engine.normalize(store.fiche).sections ?? [] };
    setDraft(f); setOrigin(f);
  }, [storeId, stamp, engine]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const q = window.matchMedia('(max-width: 820px)');
    const on = () => setPhone(q.matches);
    on(); q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setRoom({ w: Math.max(240, el.clientWidth - 32), h: Math.max(320, el.clientHeight - 32) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [draft === null]);   // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = !!draft && !!origin && !same(draft, origin);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const types = useMemo(() => new Map((engine?.sectionTypes ?? []).map((t) => [t.type, t])), [engine]);
  const sections = useMemo(() => (draft?.sections ?? []).filter((s) => types.has(s.type)), [draft, types]);
  const current = sections.find((s) => s.id === picked);
  const currentType = current ? types.get(current.type) : undefined;
  const missing = (engine?.sectionTypes ?? []).filter((t) => !sections.some((s) => s.type === t.type));
  const theme = (draft?.theme ?? {}) as Record<string, unknown>;

  const change = useCallback((f: (d: Fiche) => Fiche) => { clear(); setDraft((d) => (d ? f(d) : d)); }, [clear]);
  const mapSections = (f: (list: Section[]) => Section[]) => change((d) => ({ ...d, sections: f([...(d.sections ?? [])]) }));
  const toggle = (id: string) => mapSections((l) => l.map((s) => (s.id === id ? { ...s, enabled: !isOn(s) } : s)));
  const move = (id: string, by: number) => mapSections((l) => {
    const i = l.findIndex((s) => s.id === id), j = i + by;
    if (i < 0 || j < 0 || j >= l.length) return l;
    [l[i], l[j]] = [l[j]!, l[i]!];
    return l;
  });
  const setValue = (id: string, key: string, value: unknown) => mapSections((l) => l.map((s) => (s.id === id ? { ...s, settings: { ...(s.settings ?? {}), [key]: value } } : s)));
  const add = (t: EngineSectionType) => {
    const id = `${t.type}-${Date.now().toString(36)}`;
    const fresh: Section = { id, type: t.type, enabled: true, settings: {} };
    mapSections((l) => (t.type === 'announcement' ? [fresh, ...l] : [...l, fresh]));   // the announcement bar belongs at the very top
    setAdding(false); setPicked(id);
  };
  const setTheme = (patch: Record<string, unknown>, drop: string[] = []) => change((d) => {
    const t = { ...((d.theme as Record<string, unknown> | undefined) ?? {}), ...patch };
    for (const k of drop) delete t[k];
    return { ...d, theme: t };
  });

  async function save() {
    if (!draft || !dirty || busy) return;
    if (await write(draft)) setOrigin(draft);
  }

  if (!store) return <Empty icon="store" title="Pas encore de boutique" action={<ButtonLink href="/creer/">Créer ma boutique</ButtonLink>}>Créez votre boutique pour la personnaliser ici.</Empty>;
  if (engineDown) return <div className={styles.wait}><Notice tone="error" action={<Button variant="secondary" onClick={() => window.location.reload()}>Réessayer</Button>}>L’éditeur n’a pas pu se charger. Vérifiez votre connexion.</Notice></div>;
  if (!engine || !draft) return <div className={styles.wait}><p>Chargement de l’éditeur…</p></div>;

  const settings = current && currentType ? (
    <SectionForm key={current.id} type={currentType} values={(current.settings ?? {}) as Values} userId={account.userId}
      onChange={(k, v) => setValue(current.id, k, v)} />
  ) : null;

  return (
    <div className={styles.editor}>
      <header className={styles.top}>
        <Link className={styles.back} href="/admin/" aria-label="Retour au tableau de bord"><Icon name="back" size={20} /></Link>
        <div className={styles.what}><b>{storeName(store)}</b><span>{dirty ? 'Modifications non enregistrées' : saved ? 'Enregistré' : 'Éditeur'}</span></div>
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
        <aside className={styles.left} aria-label="Contenu de la boutique">
          <div className={styles.tabs} role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'sections'} onClick={() => setTab('sections')}>Sections</button>
            <button type="button" role="tab" aria-selected={tab === 'style'} onClick={() => setTab('style')}>Style</button>
          </div>

          {tab === 'sections' ? (
            <>
              <ol className={styles.list}>
                {sections.map((s, i) => (
                  <li key={s.id} className={styles.row} data-on={picked === s.id ? '' : undefined} data-off={isOn(s) ? undefined : ''}>
                    <button type="button" className={styles.rowMain} onClick={() => setPicked(s.id)} aria-current={picked === s.id ? 'true' : undefined}>
                      <b>{types.get(s.type)!.name}</b>{isOn(s) ? null : <span>Masquée</span>}
                    </button>
                    <button type="button" className={styles.tool} disabled={i === 0} onClick={() => move(s.id, -1)} aria-label={`Monter ${types.get(s.type)!.name}`}><Icon name="chevron" size={16} className={styles.up} /></button>
                    <button type="button" className={styles.tool} disabled={i === sections.length - 1} onClick={() => move(s.id, 1)} aria-label={`Descendre ${types.get(s.type)!.name}`}><Icon name="chevron" size={16} className={styles.down} /></button>
                    <button type="button" role="switch" aria-checked={isOn(s)} aria-label={`Afficher ${types.get(s.type)!.name}`} className={styles.switch} onClick={() => toggle(s.id)} />
                  </li>
                ))}
              </ol>
              {missing.length ? <Button variant="secondary" icon="plus" block onClick={() => setAdding(true)}>Ajouter une section</Button> : null}
              <p className={styles.hint}>Vos produits se gèrent dans <Link href="/admin/produits/"><b>Produits</b></Link>.</p>
            </>
          ) : (
            <div className={styles.style}>
              <fieldset><legend>Couleurs</legend>
                <div className={styles.palettes}>
                  {engine.palettes.map((p) => (
                    <button key={p.id} type="button" aria-pressed={theme.palette === p.id && !theme.colors} onClick={() => setTheme({ palette: p.id }, ['colors'])} title={p.name}>
                      <span className={styles.swatch} style={{ background: p.colors.bg }}><i style={{ background: p.colors.accent }} /><i style={{ background: p.colors.text }} /></span>
                      <span>{p.name}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset><legend>Polices</legend>
                <div className={styles.choices}>
                  {engine.fontPairs.map((f) => <button key={f.id} type="button" aria-pressed={theme.fonts === f.id} onClick={() => change((d) => engine.withFonts(d, f.id))}>{f.name}</button>)}
                </div>
              </fieldset>
              <fieldset><legend>Coins</legend>
                <div className={styles.choices}>
                  {engine.radius.map((o) => <button key={String(o.value)} type="button" aria-pressed={theme.radius === o.value} onClick={() => setTheme({ radius: o.value })}>{o.label}</button>)}
                </div>
              </fieldset>
              <fieldset><legend>Boutons</legend>
                <div className={styles.choices}>
                  {engine.buttons.map((o) => <button key={String(o.value)} type="button" aria-pressed={theme.buttons === o.value} onClick={() => setTheme({ buttons: o.value })}>{o.label}</button>)}
                </div>
              </fieldset>
            </div>
          )}
        </aside>

        <div className={styles.stage} ref={stage}>
          <StorePreview fiche={draft} device={device} width={device === 'phone' ? Math.min(390, room.w) : room.w} height={room.h}
            title="Aperçu de votre boutique" interactive focus={picked || undefined} onPick={(id) => { setTab('sections'); setPicked(id); }} />
        </div>

        {current && currentType && !phone ? (
          <aside className={styles.right} aria-label={`Réglages : ${currentType.name}`}>
            <div className={styles.rightHead}>
              <div><h2>{currentType.name}</h2><p>{currentType.description}</p></div>
              <button type="button" className={styles.tool} onClick={() => setPicked('')} aria-label="Fermer les réglages"><Icon name="close" size={18} /></button>
            </div>
            {settings}
          </aside>
        ) : null}
      </div>

      {current && currentType && phone ? <Sheet title={currentType.name} sub={currentType.description} onClose={() => setPicked('')}>{settings}</Sheet> : null}
      {adding ? (
        <Sheet title="Ajouter une section" onClose={() => setAdding(false)}>
          <ul className={styles.addList}>
            {missing.map((t) => <li key={t.type}><button type="button" onClick={() => add(t)}><b>{t.name}</b><span>{t.description}</span></button></li>)}
          </ul>
        </Sheet>
      ) : null}
    </div>
  );
}

/** The settings of one section, drawn from the engine's description of its fields. */
function SectionForm({ type, values, onChange, userId }: { type: EngineSectionType; values: Values; onChange: (key: string, value: unknown) => void; userId: string }) {
  const value = (f: EngineField) => (values[f.key] !== undefined ? values[f.key] : type.defaults[f.key]);
  return (
    <div className={styles.form}>
      {type.fields.map((f) => {
        if (f.type === 'photo') return null;                 // an example photo of the engine: hers replaces it (« Image »)
        if (f.type === 'image') return <ImageField key={f.key} field={f} value={typeof value(f) === 'string' ? (value(f) as string) : ''} userId={userId} onChange={(v) => onChange(f.key, v)} />;
        if (f.type === 'items') return <ItemsField key={f.key} field={f} items={Array.isArray(value(f)) ? (value(f) as Values[]) : []} onChange={(v) => onChange(f.key, v)} />;
        return <Control key={f.key} field={f} value={value(f)} onChange={(v) => onChange(f.key, v)} />;
      })}
    </div>
  );
}

/** One simple field: a line, several lines, a number or a list of choices. */
function Control({ field: f, value, onChange }: { field: EngineField; value: unknown; onChange: (v: unknown) => void }) {
  if (f.type === 'select' && f.options) {
    const labels = f.options.map((o) => o.label);
    const now = f.options.find((o) => String(o.value) === String(value))?.label ?? labels[0];
    return <Select label={f.label} options={labels} value={now} onChange={(e) => onChange(f.options!.find((o) => o.label === e.target.value)?.value)} />;
  }
  if (f.type === 'textarea') return <TextArea label={f.label} rows={4} maxLength={f.max} placeholder={f.placeholder} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />;
  if (f.type === 'number') {
    const set = (e: ChangeEvent<HTMLInputElement>) => {
      const n = Number(e.target.value.replace(/\D/g, ''));
      onChange(e.target.value.trim() === '' ? (f.min ?? 0) : Math.min(f.max ?? n, n));
    };
    return <Field label={f.money ? `${f.label} (FCFA)` : f.label} inputMode="numeric" placeholder={f.placeholder} value={value === undefined || value === null ? '' : String(value)} onChange={set} />;
  }
  return <Field label={f.label} maxLength={f.max} placeholder={f.placeholder} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />;
}

/** A list inside a section: the reviews, the delivery zones. */
function ItemsField({ field: f, items, onChange }: { field: EngineField; items: Values[]; onChange: (v: Values[]) => void }) {
  const full = items.length >= (f.maxItems ?? 30);
  return (
    <fieldset className={styles.items}>
      <legend>{f.label}</legend>
      {items.map((it, i) => (
        <div key={i} className={styles.item}>
          <div className={styles.itemHead}><b>{f.itemLabel ?? 'Élément'} {i + 1}</b>
            <button type="button" className={styles.tool} onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`Supprimer ${f.itemLabel ?? 'élément'} ${i + 1}`}><Icon name="trash" size={16} /></button>
          </div>
          {(f.itemFields ?? []).map((sf) => <Control key={sf.key} field={sf} value={it[sf.key]} onChange={(v) => onChange(items.map((x, j) => (j === i ? { ...x, [sf.key]: v } : x)))} />)}
        </div>
      ))}
      {full ? null : <Button variant="secondary" icon="plus" block onClick={() => onChange([...items, { ...(f.itemDefaults ?? {}) }])}>Ajouter</Button>}
    </fieldset>
  );
}

/** The picture of a section: her own photo, shrunk and sent to her folder like a product's. */
function ImageField({ field: f, value, onChange, userId }: { field: EngineField; value: string; onChange: (v: string | null) => void; userId: string }) {
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
  return (
    <div className={styles.image}>
      <p className={styles.imageLabel}>{f.label}</p>
      <div className={styles.imageRow}>
        <span className={styles.thumb}>{value ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={value} alt="" /> : <Icon name="image" size={22} />}</span>
        <div className={styles.imageActs}>
          <Button variant="secondary" busy={busy} onClick={() => input.current?.click()}>{value ? 'Changer la photo' : 'Choisir une photo'}</Button>
          {value ? <Button variant="quiet" onClick={() => onChange(null)}>Retirer</Button> : null}
        </div>
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void pick(e)} aria-label={f.label} />
      {error ? <Notice tone="error">{error}</Notice> : null}
    </div>
  );
}
