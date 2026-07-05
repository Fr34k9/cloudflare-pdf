import puppeteer, { Browser } from "puppeteer";

const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
];

let browserPromise: Promise<Browser> | null = null;
let shuttingDown = false;

async function launchBrowser(): Promise<Browser> {
  const browser = await puppeteer.launch({
    headless: true,
    args: LAUNCH_ARGS,
  });

  browser.on("disconnected", () => {
    if (shuttingDown) return;
    console.error("Chromium disconnected unexpectedly, will relaunch on next request");
    browserPromise = null;
  });

  return browser;
}

export async function getBrowser(): Promise<Browser> {
  if (shuttingDown) {
    throw new Error("Server is shutting down");
  }
  if (!browserPromise) {
    browserPromise = launchBrowser().catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

export async function isBrowserHealthy(): Promise<boolean> {
  if (!browserPromise) return false;
  try {
    const browser = await browserPromise;
    return browser.connected;
  } catch {
    return false;
  }
}

export async function closeBrowser(): Promise<void> {
  shuttingDown = true;
  if (!browserPromise) return;
  try {
    const browser = await browserPromise;
    await browser.close();
  } catch (err) {
    console.error("Error while closing browser", err);
  } finally {
    browserPromise = null;
  }
}
