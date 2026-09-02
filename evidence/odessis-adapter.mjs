// Public application adapter used for the 2 September 2026 Odessis production control.
// It relies only on the public window.__ODESSIS capture and navigation surfaces.
export async function prepare(page) {
  await page.addInitScript(() => {
    localStorage.setItem('odessis.analytics-consent.v1', 'denied');
    let seed = 0x6f646573;
    Math.random = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 4294967296;
    };
  });
}

export async function ready(page) {
  await page.waitForFunction(
    () => Boolean(window.__ODESSIS)
      && document.body.classList.contains('is-ready')
      && !document.getElementById('boot'),
    null,
    { timeout: 60_000 },
  );
  await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
  await page.evaluate(async () => {
    if (window.__ODESSIS.capture?.freezeAt) await window.__ODESSIS.capture.freezeAt(12.5);
  });
}

export async function setProgress(page, progress) {
  await page.evaluate(async (value) => {
    await window.__ODESSIS.goTo(value * 7, { settle: false });
    await window.__ODESSIS.capture.freezeAt(12.5);
  }, progress);
}

export async function readState(page) {
  return page.evaluate(() => {
    const state = window.__ODESSIS.state();
    const round = (value, places = 5) => Number(Number(value).toFixed(places));
    return {
      target: round(state.target, 6),
      chapter: state.chapter,
      chapterId: state.chapterId,
      foreground: state.foreground,
      portraitFactor: round(state.portraitFactor, 4),
      camera: {
        position: state.camera.position.map((value) => round(value, 4)),
        fov: round(state.camera.fov, 4),
        aspect: round(state.camera.aspect, 4),
      },
    };
  });
}
