import assert from "node:assert/strict";
import { browserSession } from "./browser-session.mjs";

const browser = await browserSession();
const { send, evaluate, waitFor, screenshot } = browser;
const navigate = route => send("Page.navigate", { url: `http://localhost:3100${route}` });
const select = (selector, value) => evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); e.value=${JSON.stringify(value)}; e.dispatchEvent(new Event('change',{bubbles:true})); })()`);
try {
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await navigate("/try-on?texture-fixture=1");
  await waitFor("document.querySelector('.try-viewport.ready') && document.querySelectorAll('.fit-sizes button[aria-pressed=true]').length===2", "default (v5.3) neutral sizes");
  assert.ok(await evaluate("document.body.textContent.includes('Synthetic texture fixtures are active.')"));
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Top: Original\"]').getAttribute('aria-pressed')"), "true");
  await screenshot("default-neutral-textures");
  // Assert the rendered front logo and blue stripes without fixed screen coordinates.
  const renderedColours = async () => {
    const shot = await send("Page.captureScreenshot", { format: "png" });
    return evaluate(`(async () => { const image=new Image(); image.src='data:image/png;base64,${shot.data}'; await image.decode(); const c=document.createElement('canvas'); c.width=image.width; c.height=image.height; const ctx=c.getContext('2d'); ctx.drawImage(image,0,0); const rect=document.querySelector('.try-viewport').getBoundingClientRect(), pixels=ctx.getImageData(Math.round(rect.x),Math.round(rect.y),Math.round(rect.width),Math.round(rect.height)).data; let red=0,blue=0; for(let i=0;i<pixels.length;i+=4){const [r,g,b]=pixels.slice(i,i+3); if(r>150&&r>g*1.5&&r>b*1.6)red++; if(b>r*1.25&&b>g*1.1)blue++;} return {red,blue}; })()`);
  };
  let colours = await renderedColours();
  assert.ok(colours.red > 5 && colours.blue > 100, "v5.3 front logo and striped panels render");
  await evaluate("[...document.querySelectorAll('.try-camera button')].find(b=>b.textContent==='Back').click()");
  await new Promise(resolve => setTimeout(resolve, 1500));
  colours = await renderedColours();
  assert.equal(colours.red, 0, "back panels have no front logo");
  assert.ok(colours.blue > 100, "back panels remain striped");
  await evaluate("[...document.querySelectorAll('.try-camera button')].find(b=>b.textContent==='Front').click()");
  await evaluate("document.querySelector('[aria-label=\"Top: Ocean\"]').click()");
  await new Promise(resolve => setTimeout(resolve, 1500));
  assert.equal((await renderedColours()).red, 0, "a colour swatch replaces the logo");
  await evaluate("document.querySelector('[aria-label=\"Top: Original\"]').click()");
  await new Promise(resolve => setTimeout(resolve, 1500));
  assert.ok((await renderedColours()).red > 5, "Original restores the front texture");
  await evaluate("document.querySelector('.fit-heatmap input').click()");
  assert.ok(await evaluate("document.querySelector('.fit-heatmap input').checked"));
  await evaluate("window.__nextSize = [...document.querySelectorAll('[aria-label=\"Top size\"] button')].find(b=>!b.disabled && b.getAttribute('aria-disabled')!=='true' && b.getAttribute('aria-pressed')!=='true')?.getAttribute('aria-label'); true");
  assert.ok(await evaluate("window.__nextSize"), "another released top size is available");
  await evaluate("[...document.querySelectorAll('[aria-label=\"Top size\"] button')].find(b=>b.getAttribute('aria-label')===window.__nextSize).click()");
  await waitFor("[...document.querySelectorAll('[aria-label=\"Top size\"] button')].find(b=>b.getAttribute('aria-label')===window.__nextSize)?.getAttribute('aria-pressed')==='true' && document.querySelector('.try-viewport.ready')", "v5.3 size switching");
  await evaluate("[...document.querySelectorAll('.try-avatar-options button')].find(b=>b.textContent.includes('My avatar')).click()");
  await waitFor("document.querySelector('.try-avatar-options .selected')?.textContent.includes('My avatar') && document.querySelector('.try-viewport.ready')", "v5.3 personal avatar");
  assert.equal(await evaluate("document.querySelectorAll('.fit-sizes button[aria-pressed=true]').length"), 2);
  assert.equal(await evaluate("document.querySelectorAll('.fit-sizes button[aria-disabled=true][aria-pressed=true]').length"), 0);
  assert.ok(!(await evaluate("document.body.textContent.includes('could not be fitted')")));
  console.log("PASS v5.3 neutral/personal sizes, fit card, heatmap, front-only logo and striped back. Personal result: available.");
  await navigate("/lab");
  await waitFor("document.querySelector('#generation-select') && document.body.textContent.includes('corr_L_add20')", "lab ready");
  assert.equal(await evaluate("document.querySelector('#generation-select').value"), "v5.3");
  await select('#generation-select', 'v5.2');
  await waitFor("document.querySelector('#garment-select').value==='v5.2' && document.querySelector('#pants-select').value==='pants-v2'", "lab previous generation");
  await waitFor("document.body.textContent.includes('corr_L_add20')", "previous generation signed correctives");
  await navigate("/try-on");
  await waitFor("document.querySelector('.try-viewport.ready')", "default fitting room");
  assert.ok(!(await evaluate("document.body.textContent.includes('Synthetic texture fixtures are active.')")));
  for (const route of ['/outfits', '/planner', '/stylist']) {
    await navigate(route);
    await waitFor("document.querySelector('main h1')", `${route} ready`);
    assert.equal(await evaluate("document.querySelector('.desktop-nav [aria-current=page]').getAttribute('href')"), route);
  }
  assert.deepEqual(browser.errors, []);
  console.log("PASS lab defaults/generation selector/correctives, default fitting room, Outfits, Planner and Stylist routes.");
} finally { await browser.close(); }
