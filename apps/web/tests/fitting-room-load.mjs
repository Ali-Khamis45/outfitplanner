import { browserSession } from './browser-session.mjs';
const b=await browserSession(), rounds=[];
try {
  await b.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  for (const phase of ['first','reload']) {
    if(phase==='first') await b.send('Page.navigate',{url:'http://localhost:3100/try-on'}); else await b.send('Page.reload',{ignoreCache:false});
    await b.waitFor('document.querySelector(".try-viewport.ready canvas") && Number(getComputedStyle(document.querySelector(".try-viewport")).opacity) > 0.98','stage visible');
    const timing=await b.evaluate(`(() => {const nav=performance.getEntriesByType('navigation')[0]; const resources=performance.getEntriesByType('resource').filter(e=>/\\/api\\/(demo-avatar|demo-garment|size-garment)/.test(e.name)).map(e=>({kind:new URL(e.name).pathname.split('/').pop(),asset:new URL(e.name).searchParams.get('asset') || (new URL(e.name).searchParams.has('sidecar') ? 'sidecar' : 'base'),slot:new URL(e.name).searchParams.get('slot'),start:Math.round(e.startTime),end:Math.round(e.responseEnd),bytes:e.transferSize}));return {stage_ms:Math.round(performance.now()),dom_content_loaded_ms:Math.round(nav.domContentLoadedEventEnd),resources};})()`);
    rounds.push({phase,...timing});
  }
  console.log(JSON.stringify(rounds,null,2));
} finally {await b.close();}
