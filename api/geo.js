/*
 * Jehre — /api/geo: the visitor's country, the money Jehre's own prices are shown in, and the rate to show them.
 *
 *   { country: 'CA', pay: 'cad', show: 'CAD', rate: 1 }
 *
 * pay  = the money Jehre charges in: 'xof' in the franc CFA zones (round prices: 3 500 F…), else 'cad'. In 'cad',
 *        Stripe's Adaptive Pricing shows the buyer's own money at checkout and the buyer pays the conversion.
 * show = the money the prices are shown in on the page: XOF, CAD, USD or EUR (any other country sees CAD).
 * rate = 1 $ CA in the shown money (an estimate, ECB rate + 3 % for the conversion the buyer pays), for « ≈ » prices.
 * The country comes from Vercel (x-vercel-ip-country); ?pays=XX overrides it, to check a country by hand.
 */
const XOF = ['CI', 'SN', 'ML', 'BF', 'TG', 'BJ', 'NE', 'GW', 'CM', 'GA', 'CG', 'TD', 'CF', 'GQ'];
const EURO = ['FR', 'BE', 'DE', 'ES', 'IT', 'PT', 'NL', 'LU', 'IE', 'AT', 'FI', 'GR', 'SK', 'SI', 'EE', 'LV', 'LT', 'MT', 'CY', 'HR', 'MC', 'AD', 'SM', 'VA', 'ME', 'RE', 'GP', 'MQ', 'GF', 'YT', 'PM', 'BL', 'MF'];
const FALLBACK = { USD: 0.72, EUR: 0.66 };
const FEE = 1.03;
let cache = { at: 0, rates: null };

async function rates() {
  if (cache.rates && Date.now() - cache.at < 12 * 3600e3) return cache.rates;
  try {
    const r = await fetch('https://api.frankfurter.dev/v1/latest?base=CAD&symbols=USD,EUR', { signal: AbortSignal.timeout(2500) });
    const j = r.ok ? await r.json() : null;
    const usd = Number(j && j.rates && j.rates.USD), eur = Number(j && j.rates && j.rates.EUR);
    if (usd > 0.3 && usd < 2 && eur > 0.3 && eur < 2) { cache = { at: Date.now(), rates: { USD: usd, EUR: eur } }; return cache.rates; }
  } catch (e) { /* the fallback below */ }
  return cache.rates || FALLBACK;
}

module.exports = async function handler(req, res) {
  const q = req.query && typeof req.query === 'object' ? req.query : {};
  const asked = String(q.pays || '').toUpperCase();
  const country = /^[A-Z]{2}$/.test(asked) ? asked : String(req.headers['x-vercel-ip-country'] || '').toUpperCase().slice(0, 2);
  const pay = XOF.includes(country) ? 'xof' : 'cad';
  const show = pay === 'xof' ? 'XOF' : country === 'US' ? 'USD' : EURO.includes(country) ? 'EUR' : 'CAD';
  let rate = 1;
  if (show === 'USD' || show === 'EUR') rate = Math.round((await rates())[show] * FEE * 10000) / 10000;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(JSON.stringify({ country, pay, show, rate }));
};
