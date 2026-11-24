'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { UPLOAD_ERROR, uploadPhoto } from '@/lib/media';
import { ImageCropper, LOGO_SHAPES, PHOTO_SHAPES } from './ImageCropper';

/** The cropping window, ready to open: a new file she just chose (`openFile`) or a picture already on her site
 *  (`openUrl`). « Appliquer » sends the cropped picture to her folder and gives back its address. */
export function useCropper(userId: string, kind: 'logo' | 'photo', onDone: (url: string) => void): { openFile: (f: File) => void; openUrl: (u: string) => void; node: ReactNode; error: string } {
  const [src, setSrc] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const close = useCallback(() => {
    setSrc((s) => { if (s.startsWith('blob:')) URL.revokeObjectURL(s); return ''; });
    setBusy(false); setError('');
  }, []);
  const openFile = useCallback((f: File) => {
    setError('');
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { setSrc(''); setError(UPLOAD_ERROR.type); return; }
    setSrc(URL.createObjectURL(f));
  }, []);
  const openUrl = useCallback((u: string) => { setError(''); setSrc(u); }, []);
  async function apply(file: File) {
    setBusy(true); setError('');
    const r = await uploadPhoto(file, userId);
    if (!r.ok) { setBusy(false); setError(UPLOAD_ERROR[r.error]); return; }
    onDone(r.url);
    close();
  }
  const node = src ? (
    <ImageCropper src={src} title={kind === 'logo' ? 'Recadrer le logo' : 'Recadrer la photo'} shapes={kind === 'logo' ? LOGO_SHAPES : PHOTO_SHAPES}
      transparent={kind === 'logo'} busy={busy} error={error} onCancel={close} onApply={(f) => void apply(f)} />
  ) : null;
  return { openFile, openUrl, node, error: src ? '' : error };
}
