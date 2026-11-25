'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { CloudLoader } from '@/components/ui/CloudLoader';
import { Field, Select, TextArea } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Notice } from '@/components/ui/Notice';
import { atlas } from '@/lib/atlas';
import styles from './mail.module.css';

/* Atlas › Courriels: the mail received on @jehre.com (Resend has no mailbox of its own), read here, and answered from
   bonjour@ or contact@jehre.com. Nothing leaves without being seen first, exactly as it will arrive. */
interface MailRow { id: string; from: string; to: string[]; subject: string; at: string; read: boolean }
interface Mail { id: string; from: string; to: string[]; cc: string[]; replyTo: string[]; subject: string; at: string; text: string; html: string; messageId: string; files: { name: string; url: string; size: number }[] }
interface Draft { from: 'bonjour' | 'contact'; to: string; subject: string; text: string; inReplyTo: string }

const NB = ' ';
const name = (v: string) => { const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(v); return m ? (m[1]?.trim() || m[2]!) : v; };
const address = (v: string) => { const m = /<([^>]+)>/.exec(v); return (m ? m[1]! : v).trim().toLowerCase(); };
const when = (v: string) => {
  const d = new Date(v); if (Number.isNaN(+d)) return '';
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

/** The e-mail as it leaves: the same white card as Jehre's other e-mails, the text in paragraphs. */
export function mailHtml(text: string): string {
  const body = text.trim().split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#141414;">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#F6F6F4;font-family:Poppins,Arial,Helvetica,sans-serif;color:#141414;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F6F4;padding:28px 12px;"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:20px;border:1px solid #ECECEA;"><tr><td style="padding:28px 32px 6px;"><img src="https://jehre.com/img/brand/email-logo.png" width="96" alt="Jehre" style="display:block;border:0;height:auto;"></td></tr><tr><td style="padding:18px 32px 20px;">${body}</td></tr></table><p style="margin:16px 0 0;font-size:12px;color:#8A8A8A;">jehre.com</p></td></tr></table></body></html>`;
}
const quote = (m: Mail) => `\n\n\nLe ${new Date(m.at).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}, ${name(m.from)} a écrit :\n${(m.text || '').trim().split('\n').slice(0, 40).map((l) => `> ${l}`).join('\n')}`;

export function MailTab({ onToast }: { onToast: (m: string) => void }) {
  const [rows, setRows] = useState<MailRow[] | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Mail | null>(null);
  const [opening, setOpening] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);

  const load = useCallback(async (after = '') => {
    setError('');
    const r = await atlas<{ mails: MailRow[]; more: boolean }>('mail_list', after ? { after } : {});
    if (!r.ok) { setError(r.message); return; }
    setRows((x) => (after && x ? [...x, ...r.mails] : r.mails));
    setMore(r.more);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function read(id: string) {
    setOpening(id); setDraft(null);
    const r = await atlas<{ mail: Mail }>('mail_get', { id });
    setOpening('');
    if (!r.ok) { onToast(r.message); return; }
    setOpen(r.mail);
    setRows((x) => x?.map((m) => (m.id === id ? { ...m, read: true } : m)) ?? x);
  }
  function reply(m: Mail) {
    const mine = m.to.map(address).find((a) => a === 'contact@jehre.com') ? 'contact' : 'bonjour';
    setDraft({ from: mine, to: address(m.replyTo[0] || m.from), subject: /^re\s*:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`, text: `Bonjour,\n\n${quote(m)}`, inReplyTo: m.messageId });
  }

  if (draft) return <Compose draft={draft} onCancel={() => setDraft(null)} onSent={(to) => { onToast(`Courriel envoyé à ${to}.`); setDraft(null); }} />;

  if (open) {
    return (
      <section className={styles.card} aria-label="Courriel">
        <div className={styles.head}>
          <button type="button" className={styles.back} onClick={() => setOpen(null)}><Icon name="back" size={16} />Boîte de réception</button>
          <Button icon="mail" onClick={() => reply(open)}>Répondre</Button>
        </div>
        <h2 className={styles.subject}>{open.subject || '(sans objet)'}</h2>
        <dl className={styles.meta}>
          <div><dt>De</dt><dd>{open.from}</dd></div>
          <div><dt>À</dt><dd>{open.to.join(', ')}</dd></div>
          {open.cc.length ? <div><dt>Copie</dt><dd>{open.cc.join(', ')}</dd></div> : null}
          <div><dt>Reçu</dt><dd>{new Date(open.at).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}</dd></div>
        </dl>
        {open.html ? <iframe className={styles.body} title="Contenu du courriel" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={`<base target="_blank">${open.html}`} />
          : <pre className={styles.text}>{open.text || '(vide)'}</pre>}
        {open.files.length ? (
          <ul className={styles.files} aria-label="Pièces jointes">
            {open.files.map((f) => <li key={f.url}><a href={f.url} target="_blank" rel="noopener noreferrer"><Icon name="copy" size={14} />{f.name}{f.size ? ` · ${Math.max(1, Math.round(f.size / 1024))}${NB}Ko` : ''}</a></li>)}
          </ul>
        ) : null}
      </section>
    );
  }

  const list = (rows ?? []).filter((m) => !q.trim() || `${m.from} ${m.to.join(' ')} ${m.subject}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <div className={styles.top}>
        <h1 className={styles.h1}>Courriels {rows ? <span>{rows.filter((m) => !m.read).length ? `${rows.filter((m) => !m.read).length} non lus` : ''}</span> : null}</h1>
        <Button icon="plus" onClick={() => setDraft({ from: 'bonjour', to: '', subject: '', text: 'Bonjour,\n\n', inReplyTo: '' })}>Nouveau courriel</Button>
      </div>
      <input className={styles.search} type="search" placeholder="Une adresse, un objet" aria-label="Rechercher un courriel" value={q} onChange={(e) => setQ(e.target.value)} />
      {error ? <Notice tone="error" action={<Button variant="secondary" icon="refresh" onClick={() => void load()}>Réessayer</Button>}>{error}</Notice> : null}
      {!rows && !error ? <CloudLoader /> : null}
      {rows ? (
        <section className={styles.card}>
          <ul className={styles.rows}>
            {list.map((m) => (
              <li key={m.id}>
                <button type="button" className={styles.row} data-unread={m.read ? undefined : ''} aria-busy={opening === m.id || undefined} onClick={() => void read(m.id)}>
                  <span className={styles.dot} aria-label={m.read ? undefined : 'Non lu'} />
                  <span className={styles.main}><b>{name(m.from)}</b><span>{m.subject || '(sans objet)'}</span></span>
                  <small className={styles.to}>{m.to.map(address).filter((a) => a.endsWith('@jehre.com')).join(', ')}</small>
                  <small className={styles.at}>{when(m.at)}</small>
                </button>
              </li>
            ))}
          </ul>
          {!list.length ? <p className={styles.muted}>Aucun courriel ici.</p> : null}
          {more && !q.trim() ? <div className={styles.more}><Button variant="secondary" onClick={() => void load(rows[rows.length - 1]?.id ?? '')}>Plus anciens</Button></div> : null}
        </section>
      ) : null}
    </>
  );
}

/** Write, then see the e-mail exactly as it will arrive, then send. */
function Compose({ draft, onCancel, onSent }: { draft: Draft; onCancel: () => void; onSent: (to: string) => void }) {
  const [d, setD] = useState(draft);
  const [seen, setSeen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (p: Partial<Draft>) => { setD((x) => ({ ...x, ...p })); setSeen(false); };
  const FROM = { bonjour: 'bonjour@jehre.com', contact: 'contact@jehre.com' } as const;
  function check() {
    if (!/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(d.to.trim())) return 'L’adresse du destinataire n’est pas valide.';
    if (!d.subject.trim()) return 'Ajoutez un objet.';
    if (!d.text.trim()) return 'Écrivez votre message.';
    return '';
  }
  async function send() {
    setBusy(true); setError('');
    const r = await atlas('mail_send', { from: d.from, to: d.to.trim(), subject: d.subject.trim(), text: d.text, html: mailHtml(d.text), inReplyTo: d.inReplyTo });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    onSent(d.to.trim());
  }
  return (
    <section className={styles.card} aria-label="Écrire un courriel">
      <div className={styles.head}>
        <button type="button" className={styles.back} onClick={onCancel}><Icon name="back" size={16} />Annuler</button>
      </div>
      {!seen ? (
        <div className={styles.form}>
          <Select label="De" options={[FROM.bonjour, FROM.contact]} value={FROM[d.from]} onChange={(e) => set({ from: e.target.value === FROM.contact ? 'contact' : 'bonjour' })} />
          <Field label="À" type="email" placeholder="prenom@exemple.com" value={d.to} onChange={(e) => set({ to: e.target.value })} />
          <Field label="Objet" value={d.subject} onChange={(e) => set({ subject: e.target.value })} />
          <TextArea label="Message" rows={12} value={d.text} onChange={(e) => set({ text: e.target.value })} />
          {error ? <Notice tone="error">{error}</Notice> : null}
          <div className={styles.acts}><Button icon="eye" onClick={() => { const e = check(); setError(e); if (!e) setSeen(true); }}>Voir avant d’envoyer</Button></div>
        </div>
      ) : (
        <div className={styles.form}>
          <p className={styles.muted}>Voici le courriel tel qu’il arrivera. <b>De</b> {FROM[d.from]} · <b>À</b> {d.to.trim()} · <b>Objet</b> {d.subject.trim()}</p>
          <iframe className={styles.preview} title="Aperçu du courriel" sandbox="" srcDoc={mailHtml(d.text)} />
          {error ? <Notice tone="error">{error}</Notice> : null}
          <div className={styles.acts}>
            <Button icon="mail" busy={busy} onClick={() => void send()}>Envoyer</Button>
            <Button variant="secondary" icon="edit" onClick={() => setSeen(false)}>Modifier</Button>
          </div>
        </div>
      )}
    </section>
  );
}
