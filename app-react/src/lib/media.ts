import { supabase } from './supabase';

/* A seller's photo → Supabase Storage, the same way as the current site (creer/media.js): shrunk in the browser to
   up to three WebP widths (640, 1280, 2048 px, never above the original) and written under HER folder of the public
   bucket:   store-media/<her user id>/<sha-256 of the largest, 20 hex>-<width>.webp
   The storage rules let her write only there. The fiche keeps the URL of the largest width. */

const BUCKET = 'store-media';
const WIDTHS = [640, 1280, 2048];
const QUALITY = 0.82;
export const MAX_FILE = 15 * 1024 * 1024;

export type UploadError = 'type' | 'size' | 'read' | 'upload';
export type UploadResult = { ok: true; url: string } | { ok: false; error: UploadError };
export const UPLOAD_ERROR: Record<UploadError, string> = {
  type: 'Choisissez une image (JPEG, PNG ou WebP).',
  size: 'Cette image est trop lourde (15 Mo au plus).',
  read: 'Cette image n’a pas pu être lue. Essayez-en une autre.',
  upload: 'La photo n’a pas pu être envoyée. Vérifiez votre connexion, puis réessayez.',
};

function load(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('read')); };
    img.src = url;
  });
}
function toWebp(img: HTMLImageElement, width: number): Promise<Blob> {
  const side = Math.max(img.naturalWidth, img.naturalHeight), k = Math.min(1, width / side);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('read'))), 'image/webp', QUALITY));
}
async function hash20(blob: Blob): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 20);
}

export async function uploadPhoto(file: File, userId: string): Promise<UploadResult> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return { ok: false, error: 'type' };
  if (file.size > MAX_FILE) return { ok: false, error: 'size' };
  let img: HTMLImageElement;
  try { img = await load(file); } catch { return { ok: false, error: 'read' }; }
  const side = Math.max(img.naturalWidth, img.naturalHeight);
  const top = Math.min(side, WIDTHS[WIDTHS.length - 1]!);
  const widths = [...WIDTHS.filter((w) => w < side), ...(WIDTHS.includes(top) && top < side ? [] : [top])];
  try {
    const blobs = await Promise.all(widths.map(async (w) => ({ w, b: await toWebp(img, w) })));
    const name = await hash20(blobs[blobs.length - 1]!.b);
    const store = supabase().storage.from(BUCKET);
    for (const { w, b } of blobs) {
      const { error } = await store.upload(`${userId}/${name}-${w}.webp`, b, { upsert: true, contentType: 'image/webp', cacheControl: '31536000' });
      if (error) return { ok: false, error: 'upload' };
    }
    return { ok: true, url: store.getPublicUrl(`${userId}/${name}-${widths[widths.length - 1]}.webp`).data.publicUrl };
  } catch { return { ok: false, error: 'upload' }; }
}
