/**
 * Reveal-on-scroll observer — extracted from BaseLayout.astro.
 *
 * One pass over the page, no framework. It only starts when the page has
 * `.reveal` targets, and the hidden initial state lives behind `.js`, so this
 * script only ever adds a class, never removes content.
 *
 * Two thresholds, because a single percentage threshold cannot serve both a
 * card and a full-page section. `threshold: 0.15` means "15% of the element
 * must be visible", but an element taller than roughly 6.7 viewports can never
 * reach that ratio — the evolution timeline is about 7800px tall in a 720px
 * viewport, so its ceiling is ~9% and it would stay permanently at opacity 0
 * with JavaScript enabled. Targets taller than the viewport are therefore
 * revealed as soon as any part of them intersects; shorter ones keep 15% so a
 * single sliver of a card is not enough to reveal it.
 */
(() => {
  const targets = document.querySelectorAll('.reveal');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!targets.length || reduced || !('IntersectionObserver' in window)) {
    targets.forEach((target) => target.classList.add('is-visible'));
    return;
  }

  const short = [];
  const tall = [];
  for (const target of targets) {
    const group = target.getBoundingClientRect().height > window.innerHeight ? tall : short;
    group.push(target);
  }

  for (const [group, threshold] of [[short, 0.15], [tall, 0]]) {
    if (!group.length) continue;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      },
      { threshold, rootMargin: '0px 0px -12% 0px' },
    );
    group.forEach((target) => observer.observe(target));
  }
})();
