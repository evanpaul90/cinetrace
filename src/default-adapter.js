/**
 * The default adapter is intentionally generic. A page may listen for the
 * `cinetrace:progress` event or expose `window.cineTraceSetProgress(progress)`.
 */
export async function ready(page) {
  await page.evaluate(async () => {
    const fontSettle = document.fonts?.ready?.catch(() => undefined) ?? Promise.resolve();
    await Promise.race([
      fontSettle,
      new Promise((resolve) => setTimeout(resolve, 750)),
    ]);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.waitForTimeout(50);
}

export async function setProgress(page, progress) {
  await page.evaluate((value) => {
    document.documentElement.style.setProperty('--cinetrace-progress', String(value));
    window.dispatchEvent(new CustomEvent('cinetrace:progress', { detail: { progress: value } }));
    if (typeof window.cineTraceSetProgress === 'function') {
      window.cineTraceSetProgress(value);
    }
    const root = document.documentElement;
    const previousScrollBehavior = root.style.getPropertyValue('scroll-behavior');
    const previousPriority = root.style.getPropertyPriority('scroll-behavior');
    root.style.setProperty('scroll-behavior', 'auto', 'important');
    const maxScroll = Math.max(0, root.scrollHeight - window.innerHeight);
    window.scrollTo(0, maxScroll * value);
    if (previousScrollBehavior) root.style.setProperty('scroll-behavior', previousScrollBehavior, previousPriority);
    else root.style.removeProperty('scroll-behavior');
  }, progress);
}

export async function readState(page) {
  return page.evaluate(() => {
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    return {
      progress: maxScroll === 0 ? 0 : window.scrollY / maxScroll,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
    };
  });
}
