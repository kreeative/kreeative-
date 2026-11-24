'use client';

import { useEffect, useRef } from 'react';
import { LAND, LAND_H, LAND_W } from '@/lib/land';

/* The globe of « En direct », as on the current site (admin/live.js): drawn on a canvas, with no library. The land
   is a grid of dots, the visitors are the dots on it (the ones here now pulse in green). It turns slowly by itself
   and she can turn it with a finger or the mouse. With « reduce motion » it stays still (she can still turn it). */

export interface GlobePoint { lat: number; lon: number; live?: boolean }
type V = [number, number, number];
const RAD = Math.PI / 180;
const vec = (lat: number, lon: number): V => { const a = lat * RAD, o = lon * RAD; return [Math.cos(a) * Math.sin(o), Math.sin(a), Math.cos(a) * Math.cos(o)]; };
const rot = (v: V, cl: number, sl: number, ca: number, sa: number): V => { const x = v[0] * cl - v[2] * sl, z = v[0] * sl + v[2] * cl; return [x, v[1] * ca - z * sa, v[1] * sa + z * ca]; };
let DOTS: V[] | null = null;
function dots(): V[] {
  if (DOTS) return DOTS;
  const bin = atob(LAND), out: V[] = [];
  for (let j = 0; j < LAND_H; j++) for (let i = 0; i < LAND_W; i++) {
    const k = j * LAND_W + i;
    if ((bin.charCodeAt(k >> 3) >> (k & 7)) & 1) out.push(vec(90 - (j + 0.5) * 2, -180 + (i + 0.5) * 2));
  }
  return (DOTS = out);
}

export function Globe({ points, label = 'Globe des visiteurs de votre boutique' }: { points: GlobePoint[]; label?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pts = useRef(points);
  pts.current = points;

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const view = { lon: 5, lat: 14 };
    let drag: { x: number; y: number; lon: number; lat: number } | null = null, raf = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const box = cv.parentElement!.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      const size = Math.max(240, Math.min(box.width, 620));
      if (cv.width !== Math.round(size * dpr)) { cv.width = cv.height = Math.round(size * dpr); cv.style.width = cv.style.height = `${size}px`; }
      const g = cv.getContext('2d');
      if (!g) return;
      const R = size * 0.46, cx = size / 2, cy = size / 2;
      if (!still && !drag) view.lon += 0.06;
      const cl = Math.cos(-view.lon * RAD), sl = Math.sin(-view.lon * RAD), ca = Math.cos(view.lat * RAD), sa = Math.sin(view.lat * RAD);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, size, size);
      const sh = g.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
      sh.addColorStop(0, '#FFFFFF'); sh.addColorStop(1, '#ECECE8');
      g.beginPath(); g.arc(cx, cy, R, 0, 6.2832); g.fillStyle = sh; g.fill();
      g.lineWidth = 1; g.strokeStyle = 'rgba(17,17,17,.10)'; g.stroke();
      const ds = dots(), r0 = Math.max(1, R / 150);
      g.fillStyle = '#111111';
      for (const d of ds) {
        const v = rot(d, cl, sl, ca, sa);
        if (v[2] <= 0.02) continue;
        g.globalAlpha = 0.16 + 0.34 * v[2];
        g.beginPath(); g.arc(cx + v[0] * R, cy - v[1] * R, r0 * (0.55 + 0.6 * v[2]), 0, 6.2832); g.fill();
      }
      g.globalAlpha = 1;
      const list = pts.current, t = still ? 0 : now / 1000;
      for (let k = list.length - 1; k >= 0; k--) {
        const p = list[k]!, w = rot(vec(p.lat, p.lon), cl, sl, ca, sa);
        if (w[2] <= 0.05) continue;
        const x = cx + w[0] * R, y = cy - w[1] * R;
        if (p.live) {
          const ph = (t * 0.8 + k * 0.37) % 1;
          g.beginPath(); g.arc(x, y, 5 + ph * 22, 0, 6.2832); g.strokeStyle = `rgba(34,201,126,${(0.7 * (1 - ph)).toFixed(3)})`; g.lineWidth = 2; g.stroke();
          g.beginPath(); g.arc(x, y, 6, 0, 6.2832); g.fillStyle = 'rgb(34,201,126)'; g.fill();
          g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
        } else {
          g.beginPath(); g.arc(x, y, 4, 0, 6.2832); g.fillStyle = '#111'; g.fill();
          g.lineWidth = 1.5; g.strokeStyle = '#fff'; g.stroke();
        }
      }
    };
    raf = requestAnimationFrame(draw);
    const down = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY, lon: view.lon, lat: view.lat }; try { cv.setPointerCapture(e.pointerId); } catch { /* old browser */ } };
    const move = (e: PointerEvent) => { if (!drag) return; view.lon = drag.lon - (e.clientX - drag.x) * 0.35; view.lat = Math.max(-70, Math.min(70, drag.lat + (e.clientY - drag.y) * 0.35)); };
    const up = () => { drag = null; };
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    return () => { cancelAnimationFrame(raf); cv.removeEventListener('pointerdown', down); cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerup', up); cv.removeEventListener('pointercancel', up); };
  }, []);

  return <canvas ref={canvas} role="img" aria-label={label} style={{ display: 'block', margin: '0 auto', touchAction: 'none', cursor: 'grab' }} />;
}
