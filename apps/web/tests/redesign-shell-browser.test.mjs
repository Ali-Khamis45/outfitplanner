import assert from "node:assert/strict";
import { browserSession } from "./browser-session.mjs";
const browser = await browserSession();
const { send, evaluate, waitFor, screenshot } = browser;
try {
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "http://localhost:3100/wardrobe" });
  await waitFor("document.querySelector('.desktop-nav a[aria-current=page]')?.textContent === 'Wardrobe'", "desktop navigation");
  assert.equal(await evaluate("document.querySelectorAll('.desktop-nav a').length"), 6);
  await waitFor("document.querySelector('.wardrobe-card') || document.querySelector('.wardrobe-error')", "wardrobe hydration");
  await evaluate("document.querySelector('.profile-button').focus(); document.querySelector('.profile-button').click()");
  await waitFor("document.querySelector('dialog[open]')?.textContent.includes('My measurements')", "profile panel");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
  await waitFor("!document.querySelector('dialog[open]')", "Escape dismisses profile");
  assert.ok(await evaluate("document.activeElement === document.querySelector('.profile-button')"), "dialog returns focus");
  await screenshot("phase1-desktop");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth"), "no mobile overflow");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.mobile-nav')).display"), "grid");
  await evaluate("document.querySelector('.mobile-nav a[href=\"/outfits\"]').click()");
  await waitFor("location.pathname === '/outfits' && document.querySelector('.mobile-nav a[aria-current=page]')?.textContent === 'Outfits'", "mobile outfit navigation");
  await screenshot("phase1-mobile");
  assert.deepEqual(browser.errors, []);
  console.log("PASS desktop/mobile navigation, profile focus and Escape, outfits destination and overflow");
} catch (error) { await screenshot("phase1-failure"); console.error(browser.errors); throw error; } finally { await browser.close(); }
