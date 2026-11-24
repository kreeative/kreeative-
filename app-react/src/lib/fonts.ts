/* The fonts a seller can give her site (Branding › Polices): the 33 Google Fonts of Jehre, in five styles, as in
   the first editor. The titles can take any of them; the texts only those that read well at 15 px (`text`).
   The site's connector (connect/jeere-connect.js, FONT_CAT) knows the same list: an id outside it is ignored. */

export type FontStyle = 'elegant' | 'moderne' | 'doux' | 'audacieux' | 'manuscrit';
export interface SiteFont { id: string; name: string; style: FontStyle; weights: number[]; text: boolean }

export const FONT_STYLES: { id: FontStyle; label: string }[] = [
  { id: 'elegant', label: 'Élégant' }, { id: 'moderne', label: 'Moderne' }, { id: 'doux', label: 'Arrondi' },
  { id: 'audacieux', label: 'Audacieux' }, { id: 'manuscrit', label: 'Manuscrit' },
];

export const SITE_FONTS: SiteFont[] = [
  { id: 'playfair', name: 'Playfair', style: 'elegant', weights: [400, 500, 600, 700, 800, 900], text: false },
  { id: 'cormorant-garamond', name: 'Cormorant Garamond', style: 'elegant', weights: [300, 400, 500, 600, 700], text: false },
  { id: 'eb-garamond', name: 'EB Garamond', style: 'elegant', weights: [400, 500, 600, 700, 800], text: false },
  { id: 'bodoni-moda', name: 'Bodoni Moda', style: 'elegant', weights: [400, 500, 600, 700, 800, 900], text: false },
  { id: 'dm-serif-display', name: 'DM Serif Display', style: 'elegant', weights: [400], text: false },
  { id: 'libre-baskerville', name: 'Libre Baskerville', style: 'elegant', weights: [400, 500, 600, 700], text: true },
  { id: 'lora', name: 'Lora', style: 'elegant', weights: [400, 500, 600, 700], text: true },
  { id: 'fraunces', name: 'Fraunces', style: 'elegant', weights: [300, 400, 500, 600, 700, 800, 900], text: true },
  { id: 'marcellus', name: 'Marcellus', style: 'elegant', weights: [400], text: false },
  { id: 'inter', name: 'Inter', style: 'moderne', weights: [300, 400, 500, 600, 700, 800, 900], text: true },
  { id: 'montserrat', name: 'Montserrat', style: 'moderne', weights: [300, 400, 500, 600, 700, 800, 900], text: true },
  { id: 'poppins', name: 'Poppins', style: 'moderne', weights: [300, 400, 500, 600, 700, 800, 900], text: true },
  { id: 'dm-sans', name: 'DM Sans', style: 'moderne', weights: [300, 400, 500, 600, 700, 800, 900], text: true },
  { id: 'manrope', name: 'Manrope', style: 'moderne', weights: [300, 400, 500, 600, 700, 800], text: true },
  { id: 'space-grotesk', name: 'Space Grotesk', style: 'moderne', weights: [300, 400, 500, 600, 700], text: true },
  { id: 'fira-sans', name: 'Fira Sans', style: 'moderne', weights: [300, 400, 500, 600, 700, 800, 900], text: true },
  { id: 'onest', name: 'Onest', style: 'moderne', weights: [300, 400, 500, 600, 700, 800, 900], text: true },
  { id: 'nunito', name: 'Nunito', style: 'doux', weights: [300, 400, 500, 600, 700, 800, 900], text: true },
  { id: 'quicksand', name: 'Quicksand', style: 'doux', weights: [300, 400, 500, 600, 700], text: true },
  { id: 'comfortaa', name: 'Comfortaa', style: 'doux', weights: [300, 400, 500, 600, 700], text: false },
  { id: 'baloo-2', name: 'Baloo 2', style: 'doux', weights: [400, 500, 600, 700, 800], text: false },
  { id: 'fredoka', name: 'Fredoka', style: 'doux', weights: [300, 400, 500, 600, 700], text: false },
  { id: 'unbounded', name: 'Unbounded', style: 'audacieux', weights: [300, 400, 500, 600, 700, 800, 900], text: false },
  { id: 'anton', name: 'Anton', style: 'audacieux', weights: [400], text: false },
  { id: 'bebas-neue', name: 'Bebas Neue', style: 'audacieux', weights: [400], text: false },
  { id: 'archivo-black', name: 'Archivo Black', style: 'audacieux', weights: [400], text: false },
  { id: 'oswald', name: 'Oswald', style: 'audacieux', weights: [300, 400, 500, 600, 700], text: false },
  { id: 'bricolage-grotesque', name: 'Bricolage Grotesque', style: 'audacieux', weights: [300, 400, 500, 600, 700, 800], text: true },
  { id: 'pacifico', name: 'Pacifico', style: 'manuscrit', weights: [400], text: false },
  { id: 'dancing-script', name: 'Dancing Script', style: 'manuscrit', weights: [400, 500, 600, 700], text: false },
  { id: 'caveat', name: 'Caveat', style: 'manuscrit', weights: [400, 500, 600, 700], text: false },
  { id: 'great-vibes', name: 'Great Vibes', style: 'manuscrit', weights: [400], text: false },
  { id: 'amatic-sc', name: 'Amatic SC', style: 'manuscrit', weights: [400, 700], text: false },
];

export const fontById = (id: string | undefined): SiteFont | undefined => SITE_FONTS.find((f) => f.id === id);

/** One Google Fonts address for these fonts (their regular weight is enough to show their name). */
export function fontsUrl(fonts: SiteFont[], all = false): string {
  const fam = fonts.map((f) => `family=${encodeURIComponent(f.name).replace(/%20/g, '+')}${all ? `:wght@${f.weights.join(';')}` : ''}`).join('&');
  return `https://fonts.googleapis.com/css2?${fam}&display=swap`;
}

/** The fonts each designer model is drawn with (titles, texts), as its site loads them: what her site shows until
 *  she chooses another one. Hastegi is SOYEUSE's own font (not on Google Fonts). */
export const MODEL_FONTS: Record<string, { head: string; text: string }> = {
  seve: { head: 'Instrument Serif', text: 'Inter' }, soyeuse: { head: 'Hastegi', text: 'Montserrat' },
  michou: { head: 'Archivo', text: 'Space Mono' }, anse: { head: 'Inter Tight', text: 'Inter' },
  regard: { head: 'Anton', text: 'DM Sans' }, vernie: { head: 'Bebas Neue', text: 'DM Mono' },
  minuit: { head: 'Cormorant Garamond', text: 'Montserrat' },
};
const ON_GOOGLE = ['Instrument Serif', 'Archivo', 'Space Mono', 'Inter Tight', 'DM Mono', 'Anton', 'Cormorant Garamond', 'Bebas Neue', 'Montserrat', 'Inter', 'DM Sans'];
/** The models' own fonts, so their names too are written in themselves in the menu. */
export const modelFontsUrl = (): string => `https://fonts.googleapis.com/css2?${ON_GOOGLE.map((n) => `family=${n.replace(/ /g, '+')}`).join('&')}&display=swap`;
