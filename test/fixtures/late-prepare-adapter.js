import * as nativeScroll from '../../src/default-adapter.js';

export async function ready(page) {
  await nativeScroll.ready(page);
  await page.evaluate(() => {
    Object.defineProperty(window, '__cinetracePrepared', { value: true });
    Math.random = () => 0.3141592653589793;
  });
}

export const setProgress = nativeScroll.setProgress;

export async function readState(page) {
  const scroll = await nativeScroll.readState(page);
  return page.evaluate((base) => ({
    ...base,
    preparedAtDocumentStart: document.documentElement.dataset.preparedAtDocumentStart === 'true',
    bootSeed: Number(document.documentElement.dataset.bootSeed),
  }), scroll);
}
