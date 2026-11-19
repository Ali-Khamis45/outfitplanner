import assert from "node:assert/strict";
import { browserSession } from "./browser-session.mjs";

const browser = await browserSession();
const { send, evaluate, waitFor, screenshot } = browser;
const navigate = route => send("Page.navigate", { url: `http://localhost:3100${route}` });
const select = (selector, value) => evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); e.value=${JSON.stringify(value)}; e.dispatchEvent(new Event('change',{bubbles:true})); })()`);
try {
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await navigate("/try-on?texture-fixture=1&gen=v5.3");
  await waitFor("document.querySelector('.try-viewport.ready') && document.querySelectorAll('.fit-sizes button:not(:disabled)').length===8", "candidate neutral sizes");
  assert.ok(await evaluate("document.body.textContent.includes('Synthetic texture fixtures are active.')"));
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Top: Original\"]').getAttribute('aria-pressed')"), "true");
  await screenshot("candidate-neutral-textures");
  // Assert the rendered front logo and blue stripes without fixed screen coordinates.
  const renderedColours = async () => {
    const shot = await send("Page.captureScreenshot", { format: "png" });
    return evaluate(`(async () => { const image=new Image(); image.src='data:image/png;base64,${shot.data}'; await image.decode(); const c=document.createElement('canvas'); c.width=image.width; c.height=image.height; const ctx=c.getContext('2d'); ctx.drawImage(image,0,0); const rect=document.querySelector('.try-viewport').getBoundingClientRect(), pixels=ctx.getImageData(Math.round(rect.x),Math.round(rect.y),Math.round(rect.width),Math.round(rect.height)).data; let red=0,blue=0; for(let i=0;i<pixels.length;i+=4){const [r,g,b]=pixels.slice(i,i+3); if(r>150&&r>g*1.5&&r>b*1.6)red++; if(b>r*1.25&&b>g*1.1)blue++;} return {red,blue}; })()`);
  };
  let colours = await renderedColours();
  assert.ok(colours.red > 5 && colours.blue > 100, "candidate front logo and striped panels render");
  await evaluate("[...document.querySelectorAll('.try-camera button')].find(b=>b.textContent==='Back').click()");
  await new Promise(resolve => setTimeout(resolve, 1500));
  colours = await renderedColours();
  assert.equal(colours.red, 0, "back panels have no front logo");
  assert.ok(colours.blue > 100, "back panels remain striped");
  await evaluate("document.querySelector('.fit-heatmap input').click()");
  assert.ok(await evaluate("document.querySelector('.fit-heatmap input').checked"));
  await evaluate("document.querySelector('[aria-label=\"Top size\"] button:last-child').click()");
  await waitFor("document.querySelector('[aria-label=\"Top size\"] button:last-child').getAttribute('aria-pressed')==='true' && document.querySelector('.try-viewport.ready')", "candidate size switching");
  await evaluate("[...document.querySelectorAll('.try-avatar-options button')].find(b=>b.textContent.includes('My avatar')).click()");
  await waitFor("document.querySelector('.try-avatar-options .selected')?.textContent.includes('My avatar') && document.querySelector('.try-viewport.ready')", "candidate personal avatar");
  assert.equal(await evaluate("document.querySelectorAll('.fit-sizes button:not(:disabled)').length"), 8);
  assert.ok(!(await evaluate("document.body.textContent.includes('could not be fitted')")));
  console.log("PASS candidate neutral/personal sizes, fit card, heatmap, front-only logo and striped back. Personal result: available.");
  await navigate("/lab");
  await waitFor("document.querySelector('#generation-select') && document.body.textContent.includes('corr_L_add20')", "lab ready");
  assert.equal(await evaluate("document.querySelector('#generation-select').value"), "v5.2");
  await select('#generation-select', 'v5.3');
  await waitFor("document.querySelector('#garment-select').value==='v5.3' && document.querySelector('#pants-select').value==='pants-v3'", "lab candidate generation");
  await waitFor("document.body.textContent.includes('corr_L_add20')", "candidate signed correctives");
  await navigate("/try-on");
  await waitFor("document.querySelector('.try-viewport.ready')", "default fitting room");
  assert.ok(!(await evaluate("document.body.textContent.includes('Synthetic texture fixtures are active.')")));
  for (const route of ['/outfits', '/planner', '/stylist']) {
    await navigate(route);
    await waitFor("document.querySelector('main h1')", `${route} ready`);
    assert.equal(await evaluate("document.querySelector('.desktop-nav [aria-current=page]').getAttribute('href')"), route);
  }
  assert.deepEqual(browser.errors, []);
  console.log("PASS lab defaults/candidate selector/correctives, default fitting room, Outfits, Planner and Stylist routes.");
} finally { await browser.close(); }
