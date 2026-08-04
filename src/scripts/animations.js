import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(pointer: fine)').matches;

/* ------------------------------------------------------------------
   Nothing is hidden in the markup — JS hides then reveals. If the
   bundle fails, every section is still visible and readable.
------------------------------------------------------------------- */

function showAll() {
  const targets = document.querySelectorAll('.reveal, .line-inner, [data-hero], .section-head');
  // Take the elements back from GSAP first, otherwise an in-flight tween keeps
  // rewriting the transform on its next tick and the rescue does nothing.
  gsap.killTweensOf(targets);
  gsap.set(targets, { clearProps: 'all', opacity: 1 });
  document.querySelectorAll('[data-counter]').forEach((el) => {
    const target = parseFloat(el.dataset.counter || '0');
    el.textContent = target + (el.dataset.counterSuffix || '');
  });
}

if (reduced) {
  showAll();
} else {
  /* Safety net: if the intro somehow never completes (stalled rAF, a tab opened
     in the background and never focused, a GSAP failure), force everything
     visible. Copy must never be permanently stuck at opacity 0. */
  const failSafe = setTimeout(showAll, 4000);
  window.addEventListener('load', () => {
    setTimeout(() => {
      const stuck = document.querySelector('[data-hero]');
      if (stuck && getComputedStyle(stuck).opacity === '0') showAll();
    }, 2500);
  });

  /* ---------- hero: line-by-line mask reveal ---------- */
  const heroLines = document.querySelectorAll('.line-inner');
  const heroBits = document.querySelectorAll('[data-hero]');

  const intro = gsap.timeline({ defaults: { ease: 'power3.out' } });

  if (heroLines.length) {
    gsap.set(heroLines, { yPercent: 118 });
    intro.to(heroLines, { yPercent: 0, duration: 1.15, stagger: 0.09 }, 0.15);
  }

  if (heroBits.length) {
    gsap.set(heroBits, { opacity: 0, y: 26 });
    intro.to(heroBits, { opacity: 1, y: 0, duration: 0.85, stagger: 0.1 }, 0.45);
  }

  intro.eventCallback('onComplete', () => clearTimeout(failSafe));

  /* ---------- scroll reveals, grouped so grids stagger together ---------- */
  const groups = new Map();
  document.querySelectorAll('.reveal').forEach((el) => {
    const key = el.parentElement;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(el);
  });

  groups.forEach((els) => {
    gsap.set(els, { opacity: 0, y: 38 });
    ScrollTrigger.batch(els, {
      start: 'top 88%',
      once: true,
      onEnter: (batch) =>
        gsap.to(batch, {
          opacity: 1,
          y: 0,
          duration: 0.85,
          stagger: 0.1,
          ease: 'power3.out',
          overwrite: true,
        }),
    });
  });

  /* ---------- counters ---------- */
  document.querySelectorAll('[data-counter]').forEach((el) => {
    const target = parseFloat(el.dataset.counter || '0');
    const suffix = el.dataset.counterSuffix || '';
    const decimals = String(target).includes('.') ? 1 : 0;
    const obj = { v: 0 };

    ScrollTrigger.create({
      trigger: el,
      start: 'top 92%',
      once: true,
      onEnter: () =>
        gsap.to(obj, {
          v: target,
          duration: 1.8,
          ease: 'power2.out',
          onUpdate: () => {
            el.textContent = obj.v.toFixed(decimals) + suffix;
          },
        }),
    });
  });

  /* ---------- ambient orbs drift with scroll (depth) ---------- */
  document.querySelectorAll('[data-parallax]').forEach((el) => {
    const depth = parseFloat(el.dataset.parallax) || 0.2;
    gsap.to(el, {
      yPercent: depth * 100,
      ease: 'none',
      scrollTrigger: {
        trigger: el.closest('section') || el,
        start: 'top bottom',
        end: 'bottom top',
        scrub: true,
      },
    });
  });

  /* ---------- section headings lift slightly on approach ---------- */
  gsap.utils.toArray('.section-head').forEach((head) => {
    gsap.from(head, {
      y: 18,
      opacity: 0,
      duration: 0.9,
      ease: 'power3.out',
      scrollTrigger: { trigger: head, start: 'top 90%', once: true },
    });
  });
}

/* ---------- cursor sheen on glass cards (cheap, CSS-var driven) ---------- */
if (finePointer) {
  document.querySelectorAll('.glass-card, .contact-row').forEach((card) => {
    card.addEventListener(
      'pointermove',
      (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
        card.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
      },
      { passive: true }
    );
  });
}

/* ---------- magnetic tilt, desktop only and only where opted in ---------- */
if (finePointer && !reduced) {
  document.querySelectorAll('[data-tilt]').forEach((el) => {
    const rx = gsap.quickTo(el, 'rotateX', { duration: 0.5, ease: 'power2.out' });
    const ry = gsap.quickTo(el, 'rotateY', { duration: 0.5, ease: 'power2.out' });
    el.style.transformPerspective = '900px';
    el.style.transformStyle = 'preserve-3d';

    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      ry(((e.clientX - r.left) / r.width - 0.5) * 7);
      rx(((e.clientY - r.top) / r.height - 0.5) * -7);
    });

    el.addEventListener('pointerleave', () => {
      rx(0);
      ry(0);
    });
  });
}
