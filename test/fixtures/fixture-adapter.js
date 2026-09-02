export async function ready(page) {
  await page.waitForFunction(() => Boolean(window.cineTraceFixture));
}

export async function setProgress(page, progress) {
  await page.evaluate((value) => window.cineTraceFixture.setProgress(value), progress);
}

export async function readState(page) {
  return page.evaluate(() => window.cineTraceFixture.readState());
}
