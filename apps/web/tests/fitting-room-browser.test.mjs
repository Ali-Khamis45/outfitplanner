import assert from 'node:assert/strict';
import { exampleWardrobe } from '../lib/wardrobe/schema.ts';
import { browserSession } from './browser-session.mjs';

const b = await browserSession();
const click = selector => b.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const wait = (source, label) => b.waitFor(source, label);
const resize = async (width, height) => { await b.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); await new Promise(r => setTimeout(r, 700)); };
try {
  // Isolated wardrobe and planner; no user data is changed by this browser check.
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    const fixture = ${JSON.stringify(exampleWardrobe())};
    const original = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (url.pathname === '/api/wardrobe' && !url.search) {
        if (init.method === 'PUT') { window.__savedWardrobe = JSON.parse(init.body); return Response.json(window.__savedWardrobe, { headers: { 'X-Wardrobe-Version': '"fixture"' } }); }
        return Response.json(fixture, { headers: { 'X-Wardrobe-Version': '"fixture"' } });
      }
      return original(input, init);
    };` });
  await resize(1440, 900);
  await b.send('Page.navigate', { url: 'http://localhost:3100/try-on?gen=v5.3' });
  await wait('document.querySelector(".try-viewport.ready") && document.querySelectorAll(".try-piece").length === 4', 'candidate fitting room');
  assert.equal(await b.evaluate('document.querySelector(".fit-heatmap input").checked'), false, 'heatmap default stays off');
  assert.equal(await b.evaluate('document.querySelector(".try-avatar-options [aria-pressed=true]").textContent'), 'Demo body');
  await b.evaluate('window.__originalCanvas = document.querySelector(".try-stage canvas"); true');
  await click('.try-piece');
  assert.ok(await b.evaluate('!document.querySelector(".try-stage-loading")'), 'reselecting a piece must not leave a loading state');
  await click('.try-piece-list li:nth-child(2) button');
  await wait('document.querySelector(".try-item-heading h2").textContent === "Navy everyday tee" && document.querySelector(".try-viewport.ready")', 'real top selection');
  await click('.try-wearing .try-categories button:last-child');
  await click('.try-piece-list li:nth-child(2) button');
  await wait('document.querySelector(".try-item-heading h2").textContent === "Moss straight pants"', 'real bottom selection');
  assert.match(await b.evaluate('document.querySelector(".try-outfit-actions a").getAttribute("href")'), /top=example-1&bottom=example-3/);
  await click('.fit-heatmap input');
  assert.equal(await b.evaluate('document.querySelector(".try-fit-legend").textContent'), 'TightGoodLoose');
  await click('.try-pose-group button:last-child');
  await click('.try-camera button:last-child');
  await click('.try-camera button:nth-child(2)');
  assert.equal(await b.evaluate('document.querySelector(".try-camera button:last-child").getAttribute("aria-pressed")'), 'false', 'camera view stops turntable');
  await click('.try-camera button:first-child');
  await click('.try-pose-group button:first-child');
  await click('.fit-heatmap input');
  await click('.try-wearing .try-categories button:first-child');
  await click('.try-piece');
  await b.screenshot('fitting-room-desktop');
  for (const [width, height] of [[390,844], [320,740], [1024,844], [844,390], [1440,900]]) {
    await resize(width, height);
    assert.ok(await b.evaluate('document.documentElement.scrollWidth <= innerWidth'), `no overflow at ${width}`);
    assert.ok(await b.evaluate('document.querySelector(".try-stage canvas") === window.__originalCanvas'), 'resize keeps the same canvas');
    if (width === 390) {
      await b.screenshot('fitting-room-mobile');
      await click('.try-sheet-toggle');
      assert.ok(await b.evaluate('document.querySelector(".try-wearing").getBoundingClientRect().height > 0'));
      await click('.try-avatar-details summary');
      assert.ok(await b.evaluate('document.querySelector("#try-avatar-file").getBoundingClientRect().height > 0'), 'upload remains accessible');
      await click('.try-avatar-details summary');
      await click('.try-sheet-toggle');
    }
  }
  // Select both real entries again and carry them into the unchanged outfit builder.
  await click('.try-piece-list li:nth-child(2) button');
  await click('.try-outfit-actions a');
  await wait('document.querySelector("#outfit-top")?.value === "example-1" && document.querySelector("#outfit-bottom")?.value === "example-3"', 'outfit builder prefilled');
  assert.deepEqual(b.errors, []);
  console.log('PASS fitting room: real pieces, defaults, heatmap, pose/camera controls, persistent canvas, five viewports, mobile expansion/upload, outfit-builder handoff.');
} finally { await b.close(); }
