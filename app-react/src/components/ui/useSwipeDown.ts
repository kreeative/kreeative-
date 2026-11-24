'use client';

import { useEffect, type RefObject } from 'react';

/** A bottom sheet follows the finger and closes when it is pulled down (far enough, or with a flick). Only on a
 *  phone, where the sheet comes from the bottom; a pull only starts when the sheet itself is scrolled to its top,
 *  so its content still scrolls. Released too early, the sheet goes back to its place. */
export function useSwipeDown(ref: RefObject<HTMLElement | null>, close: () => void, on = true, phone = '(max-width: 820px)') {
  useEffect(() => {
    const el = ref.current;
    if (!el || !on || !window.matchMedia(phone).matches) return;
    let y0 = 0, dy = 0, t0 = 0, drag = false;
    const start = (e: TouchEvent) => { if (e.touches.length !== 1) return; y0 = e.touches[0]!.clientY; dy = 0; drag = false; t0 = Date.now(); };
    const move = (e: TouchEvent) => {
      const d = (e.touches[0]?.clientY ?? y0) - y0;
      if (!drag) { if (d > 8 && el.scrollTop <= 0) drag = true; else return; }
      dy = Math.max(0, d);
      if (e.cancelable) e.preventDefault();
      el.style.animation = 'none'; el.style.transition = 'none'; el.style.transform = `translateY(${dy}px)`;
    };
    const end = () => {
      if (!drag) return;
      drag = false;
      const flick = dy / Math.max(1, Date.now() - t0) > 0.5;
      if (dy > 90 || (flick && dy > 30)) { el.style.transition = 'transform 170ms cubic-bezier(.22, 1, .36, 1)'; el.style.transform = 'translateY(100%)'; close(); }
      else { el.style.transition = 'transform 200ms cubic-bezier(.22, 1, .36, 1)'; el.style.transform = ''; }
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end); el.addEventListener('touchcancel', end);
    return () => { el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move); el.removeEventListener('touchend', end); el.removeEventListener('touchcancel', end); };
  }, [ref, close, on, phone]);
}
