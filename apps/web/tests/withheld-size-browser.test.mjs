import assert from 'node:assert/strict';
import { browserSession } from './browser-session.mjs';
const b = await browserSession();
try {
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    const original = window.fetch.bind(window); window.__sizeAssets = [];
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (url.pathname === '/api/personal-fit') {
        if (!url.searchParams.has('asset')) return Response.json({body:'/api/personal-fit?asset=body',shirt:'/api/personal-fit?asset=shirt',pants:'/api/personal-fit?asset=pants',shirtSidecar:null,pantsSidecar:null,bodyId:'fixture_personal'});
        if (url.searchParams.get('asset') === 'body') return original('/api/demo-avatar', init);
        return original('/api/demo-garment?variant=' + (url.searchParams.get('asset') === 'shirt' ? 'v5.2' : 'pants-v2'), init);
      }
      if (url.pathname === '/api/size-garment' && url.searchParams.has('asset')) window.__sizeAssets.push(url.searchParams.get('size'));
      if (url.pathname === '/api/size-garment' && !url.searchParams.has('asset')) {
        const isPersonal = url.searchParams.get('body') === 'fixture_personal';
        const request = isPersonal || sessionStorage.getItem('withholdAll') === '1' ? '/api/size-garment?body=neutral&slot='+url.searchParams.get('slot')+'&fixtures=1' : input;
        const response = await original(request, init); const options = await response.json();
        const all = sessionStorage.getItem('withholdAll') === '1';
        return Response.json(options.map(option => (all || ['L','XL'].includes(option.size)) ? {size:option.size,withheld:true} : {...option, fit:{...option.fit, recommended:option.size === 'S', ...(isPersonal ? {body:'fixture_personal'} : {})}}));
      }
      return original(input, init);
    };
  ` });
  await b.send('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:false});
  await b.send('Page.navigate', {url:'http://localhost:3100/try-on?fixtures=1'});
  await b.waitFor('document.querySelector(".try-viewport.ready") && document.querySelector("[aria-label=\\"Top fit\\"] button[aria-label=\\"L\\"]")?.getAttribute(\"aria-disabled\") === \"true\"', 'withheld sizes');
  const state = await b.evaluate(`(() => { const root=document.querySelector('[aria-label="Top fit"]'), l=root.querySelector('button[aria-label="L"]'), x=root.querySelector('button[aria-label="XL"]'), wrap=l.closest('.fit-withheld'); l.focus(); return {disabled:l.disabled, aria:l.getAttribute('aria-disabled'), tip:document.getElementById(l.getAttribute('aria-describedby')).textContent, visible:getComputedStyle(wrap.querySelector('[role=tooltip]')).visibility, focus:document.activeElement===l, xl:x.getAttribute("aria-disabled"), selected:root.querySelector('button[aria-pressed=true]')?.textContent, recommended:!!root.querySelector('[aria-label="S, Recommended"]')}; })()`);
  assert.deepEqual(state, {disabled:false,aria:'true',tip:"This size isn't ready yet",visible:'visible',focus:true,xl:'true',selected:'S',recommended:true});
  await b.evaluate('document.querySelector("[aria-label=\\"Top fit\\"] button[aria-label=\\"L\\"]").click()');
  assert.equal(await b.evaluate('document.querySelector("[aria-label=\\"Top fit\\"] button[aria-pressed=true]").textContent'), 'S');
  await b.evaluate('document.querySelector("[aria-label=\\"Top fit\\"] button[aria-label=\\"M\\"]").click()');
  await b.waitFor('document.querySelector("[aria-label=\\"Top fit\\"] button[aria-label=\\"M\\"]").getAttribute("aria-pressed") === "true"', 'available size selection');
  await b.evaluate('[...document.querySelectorAll(".try-avatar-options button")].find(b=>b.textContent.includes("My avatar")).click()');
  await b.waitFor('document.querySelector(".try-avatar-options .selected")?.textContent.includes("My avatar") && document.querySelector(".try-viewport.ready")', 'personal fixture');
  assert.equal(await b.evaluate('document.querySelector("[aria-label=\\"Top fit\\"] button[aria-label=\\"L\\"]").getAttribute("aria-disabled")'), 'true');
  assert.ok(await b.evaluate('window.__sizeAssets.every(size => !["L","XL"].includes(size))'), 'withheld assets are never requested');
  await b.evaluate('sessionStorage.setItem("withholdAll","1")');
  await b.send('Page.navigate', {url:'http://localhost:3100/try-on?gen=v5.3&fixtures=1'});
  await b.waitFor('document.querySelector(".try-viewport.ready") && document.querySelectorAll("[aria-label=\\"Top size\\"] button[aria-disabled=true]").length===4', 'all withheld remains usable');
  assert.equal(await b.evaluate('document.querySelector("[aria-label=\\"Top fit\\"] button[aria-pressed=true]")'), null);
  assert.deepEqual(b.errors, []);
  console.log('PASS withheld size discovery, keyboard tooltip, neutral/personal switching, no asset requests and all-withheld fallback');
} finally { await b.close(); }
