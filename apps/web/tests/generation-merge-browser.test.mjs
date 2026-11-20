import assert from 'node:assert/strict';
import { browserSession } from './browser-session.mjs';
const b=await browserSession();
try {
  await b.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await b.send('Page.navigate',{url:'http://localhost:3100/try-on'});
  await b.waitFor('document.querySelector(".try-viewport.ready")', 'default studio');
  const status=await b.evaluate(`(async()=>{const [top,bottom]=await Promise.all(['top','bottom'].map(slot=>fetch('/api/size-garment?body=neutral&slot='+slot).then(r=>r.json())));return {top:top.filter(x=>!x.withheld).map(x=>x.fit.garment),bottom:bottom.filter(x=>!x.withheld).map(x=>x.fit.garment),withheld:top.filter(x=>x.withheld).map(x=>x.size)};})()`);
  assert.ok(status.top.length && status.top.every(x=>x==='tshirt-v5.3')); assert.ok(status.bottom.length && status.bottom.every(x=>x==='pants-v3.1'));
  for(const size of status.withheld) assert.equal(await b.evaluate(`document.querySelector('[aria-label="Top fit"] button[aria-label="${size}"]')?.getAttribute('aria-disabled')`),'true');
  await b.send('Page.navigate',{url:'http://localhost:3100/try-on?gen=v5.3'});
  await b.waitFor('document.querySelector(".try-viewport.ready")','explicit default');
  assert.ok(!(await b.evaluate('document.body.innerText.includes("legacy, ungated")')));
  await b.send('Page.navigate',{url:'http://localhost:3100/try-on?gen=v5.2'});
  await b.waitFor('document.querySelector(".try-viewport.ready") && document.body.innerText.includes("legacy, ungated")','legacy notice');
  await b.send('Page.navigate',{url:'http://localhost:3100/lab'});
  await b.waitFor('document.querySelector("#generation-select")?.value === "v5.3"','lab default');
  assert.ok(await b.evaluate('[...document.querySelector("#generation-select").options].some(o=>o.value==="v5.2" && o.textContent.includes("legacy, ungated"))'));
  assert.deepEqual(b.errors,[]);
  console.log('PASS default v5.3/pants-v3.1, real neutral gate states, explicit v5.3, and dev-only legacy labels');
} finally {await b.close();}
