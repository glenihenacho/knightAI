"use client";

import { useEffect } from "react";

const SHINE_TARGETS = "[data-shine='1']";
const REVEAL_TARGETS = "[data-reveal='1']";
const STICKY_NAV = "[data-shine-sticky='1']";

export function MarketingEffects() {
  useEffect(() => {
    const reveals = Array.from(document.querySelectorAll<HTMLElement>(REVEAL_TARGETS));
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            (e.target as HTMLElement).dataset.revealed = "1";
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    reveals.forEach((el) => io.observe(el));

    const shineEls = Array.from(document.querySelectorAll<HTMLElement>(SHINE_TARGETS));
    const stickyEls = shineEls.filter((el) => el.closest(STICKY_NAV));
    const flowEls = shineEls.filter((el) => !el.closest(STICKY_NAV));
    let ticking = false;

    const update = () => {
      const vh = window.innerHeight;
      const docMax = document.documentElement.scrollHeight - vh;
      const progress = docMax > 0 ? window.scrollY / docMax : 0;
      const stickyPos = `${(progress * 360).toFixed(2)}%`;
      for (const el of stickyEls) {
        el.style.setProperty("--shine-x", stickyPos);
      }
      for (const el of flowEls) {
        const rect = el.getBoundingClientRect();
        if (rect.bottom < -200 || rect.top > vh + 200) continue;
        const center = rect.top + rect.height / 2;
        const raw = 1 - center / vh;
        const t = Math.max(0, Math.min(1, raw));
        el.style.setProperty("--shine-x", `${(t * 100).toFixed(2)}%`);
      }
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();

    let pointerCleanup: (() => void) | null = null;
    if (window.matchMedia("(hover: hover)").matches) {
      const buttons = Array.from(document.querySelectorAll<HTMLElement>("[data-pointer-track='1']"));
      const handlers = new Map<HTMLElement, (e: PointerEvent) => void>();
      buttons.forEach((btn) => {
        const handler = (e: PointerEvent) => {
          const r = btn.getBoundingClientRect();
          btn.style.setProperty("--mx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(2)}%`);
          btn.style.setProperty("--my", `${(((e.clientY - r.top) / r.height) * 100).toFixed(2)}%`);
        };
        btn.addEventListener("pointermove", handler);
        handlers.set(btn, handler);
      });
      pointerCleanup = () => {
        handlers.forEach((handler, el) => el.removeEventListener("pointermove", handler));
      };
    }

    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      pointerCleanup?.();
    };
  }, []);

  return null;
}
