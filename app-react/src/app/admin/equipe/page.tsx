'use client';

import { CloudLoader } from '@/components/ui/CloudLoader';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAdmin } from '@/components/admin/AdminContext';
import { Empty, PageHead } from '@/components/admin/AdminShell';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { when } from '@/lib/format';
import { cancelInvite, invitePartner, listTeam, removeMember, type Invite, type Member } from '@/lib/team';
import shared from '../admin.module.css';
import styles from '../abonnement/abonnement.module.css';

/** The partners of a store: who manages it with its owner, the invitations waiting, and inviting someone. */
export default function TeamPage() {
  const { account, store, reload } = useAdmin();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState('');
  const storeId = store?.id ?? '', owner = store?.role === 'owner';

  const load = useCallback(async () => {
    if (!storeId || !owner) { setMembers([]); return; }
    const r = await listTeam(storeId);
    if (!r) { setError('La liste n’a pas pu être lue. Vérifiez votre connexion.'); return; }
    setError(''); setMembers(r.members); setInvites(r.invites);
  }, [storeId, owner]);
  useEffect(() => { setMembers(null); void load(); }, [load]);

  async function invite(e: FormEvent) {
    e.preventDefault();
    const m = email.trim().toLowerCase();
    setMessage(''); setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(m) || m.length > 254) { setFieldError('Vérifiez l’adresse e-mail.'); return; }
    if (m === (account.email ?? '').toLowerCase()) { setFieldError('C’est votre propre adresse.'); return; }
    if (invites.some((i) => i.email === m) || (members ?? []).some((x) => x.email === m)) { setFieldError('Cette personne est déjà invitée ou associée.'); return; }
    setFieldError(''); setBusy('invite');
    const r = await invitePartner(storeId, m);
    setBusy('');
    if (!r) { setError('L’invitation n’a pas pu être enregistrée. Réessayez.'); return; }
    setInvites([r, ...invites]); setEmail(''); setMessage(`${m} est invitée. Dès qu’elle se connecte à Jehre avec cette adresse, la boutique apparaît dans son compte.`);
  }
  async function act(key: string, f: () => Promise<boolean>, after: () => void | Promise<void>) {
    if (busy) return;
    setBusy(key); setError(''); setMessage('');
    const ok = await f();
    setBusy(''); setConfirm('');
    if (ok) await after(); else setError('Cela n’a pas fonctionné. Réessayez.');
  }

  if (!store) return <><PageHead title="Associés" /><Empty icon="users" title="Pas encore de boutique" action={<ButtonLink href="/admin/modeles/">Voir les modèles</ButtonLink>}>Créez votre boutique, puis invitez les personnes qui la tiennent avec vous.</Empty></>;

  return (
    <>
      <PageHead title="Associés" sub="Vous tenez la boutique à plusieurs ? Chacun se connecte avec son propre e-mail et voit le même tableau de bord." />
      <div className={styles.page}>
        {message ? <Notice tone="ok">{message}</Notice> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}

        {!owner ? (
          <section className={shared.card}>
            <div className={shared.cardHead}><h2>Vous êtes associée</h2></div>
            <div className={styles.stack}>
              <p className={shared.muted}>Cette boutique appartient à sa propriétaire. Vous la gérez avec elle. L’abonnement, le nom de domaine et les associés restent de son côté.</p>
              <div className={shared.sheetActions}>
                {confirm === 'leave'
                  ? <><Button variant="secondary" busy={busy === 'leave'} disabled={!!busy} onClick={() => void act('leave', () => removeMember(storeId, account.userId), async () => { await reload(); })}>Oui, quitter</Button><Button variant="quiet" onClick={() => setConfirm('')}>Annuler</Button></>
                  : <Button variant="quiet" onClick={() => setConfirm('leave')}>Quitter cette boutique</Button>}
              </div>
            </div>
          </section>
        ) : (
          <div className={shared.pair}>
            <section className={shared.card}>
              <div className={shared.cardHead}><h2>Inviter une personne</h2></div>
              <form className={styles.line} onSubmit={invite} noValidate>
                <Field label="Son adresse e-mail" type="email" inputMode="email" autoCapitalize="none" placeholder="prenom@exemple.com" value={email} onChange={(e) => { setEmail(e.target.value); setFieldError(''); }} error={fieldError} />
                <Button type="submit" busy={busy === 'invite'} disabled={!!busy}>Inviter</Button>
              </form>
            </section>

            <section className={shared.card} aria-label="Associés et invitations">
              <div className={shared.cardHead}><h2>Qui gère cette boutique</h2></div>
              {members === null ? <CloudLoader /> : (
                <ul className={shared.rows}>
                  <li><div className={shared.row} style={{ cursor: 'default' }}><span className={shared.rowMain}><b>{account.firstName || 'Vous'}</b><small>{account.email ?? ''}</small></span><span className={styles.pill}>Propriétaire</span></div></li>
                  {members.map((m) => (
                    <li key={m.user_id}><div className={shared.row} style={{ cursor: 'default' }}>
                      <span className={shared.rowMain}><b>{m.first_name || m.email}</b><small>{m.email} · depuis {when(m.added_at)}</small></span>
                      {confirm === m.user_id
                        ? <><Button variant="secondary" busy={busy === m.user_id} disabled={!!busy} onClick={() => void act(m.user_id, () => removeMember(storeId, m.user_id), () => setMembers((l) => (l ?? []).filter((x) => x.user_id !== m.user_id)))}>Oui, retirer</Button><Button variant="quiet" onClick={() => setConfirm('')}>Annuler</Button></>
                        : <Button variant="quiet" onClick={() => setConfirm(m.user_id)} aria-label={`Retirer ${m.first_name || m.email}`}>Retirer</Button>}
                    </div></li>
                  ))}
                  {invites.map((i) => (
                    <li key={i.id}><div className={shared.row} style={{ cursor: 'default' }}>
                      <span className={shared.rowMain}><b>{i.email}</b><small>Invitée {when(i.created_at)} · pas encore connectée</small></span>
                      <span className={styles.pill} data-tone="warn">En attente</span>
                      <Button variant="quiet" busy={busy === i.id} disabled={!!busy} onClick={() => void act(i.id, () => cancelInvite(i.id), () => setInvites((l) => l.filter((x) => x.id !== i.id)))} aria-label={`Annuler l’invitation de ${i.email}`}>Annuler</Button>
                    </div></li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </>
  );
}
