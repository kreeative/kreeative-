// White backdrop -> transparency ("colour to alpha"), so the ribbon and its soft shadow sit on top of the paper.
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const src = 'data:image/webp;base64,' + fs.readFileSync(process.argv[2]).toString('base64');
  const png = await p.evaluate(async (src) => {
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, c.width, c.height), a = d.data;
    for (let i = 0; i < a.length; i += 4) {
      const al = 1 - Math.min(a[i], a[i+1], a[i+2]) / 255;
      if (al < 0.02) { a[i+3] = 0; continue; }
      for (let k = 0; k < 3; k++) a[i+k] = Math.round((a[i+k] - 255 * (1 - al)) / al);
      a[i+3] = Math.round(Math.min(1, al * 1.15 + al * al * 0.5) * 255); // satin is opaque, its shadow stays soft
    }
    x.putImageData(d, 0, 0); return c.toDataURL('image/png');
  }, src);
  fs.writeFileSync(process.argv[3], Buffer.from(png.split(',')[1], 'base64')); await b.close();
})();
