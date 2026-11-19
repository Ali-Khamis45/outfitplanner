import assert from "node:assert/strict";
import { browserSession } from "./browser-session.mjs";
const browser = await browserSession();
const { send, evaluate, waitFor, screenshot } = browser;
const input = value => evaluate(`(() => { const e=document.querySelector('#stylist-message'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); })()`);
const submit = () => evaluate("document.querySelector('.stylist-compose').requestSubmit()");
try {
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.__stylistRequests=[]; window.__stylistActions=[]; const original=window.fetch;
    window.fetch=(input,init={})=>{
      if(typeof input==='string'&&input==='/api/stylist/chat'){
        if(init.method!=='POST'){window.__stylistReady=true; return Promise.resolve(new Response(JSON.stringify({status:'configured'})));}
        window.__stylistRequests.push(JSON.parse(init.body));
        return new Promise((resolve,reject)=>{
          window.__stylistReply=(status,body)=>resolve(new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}}));
          window.__stylistFail=()=>reject(new TypeError('Failed to fetch'));
        });
      }
      if(typeof input==='string'&&['/api/stylist/log_worn','/api/stylist/show_on_avatar'].includes(input)){
        window.__stylistActions.push({url:input,body:JSON.parse(init.body)});
        return Promise.resolve(new Response(JSON.stringify(input.endsWith('log_worn')?{updated:['top','bottom']}:{error:'Preview unavailable for this test'}),{status:input.endsWith('log_worn')?200:400,headers:{'Content-Type':'application/json'}}));
      }
      return original(input,init);
    };
  ` });
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send("Page.navigate", { url: "http://localhost:3100/stylist" });
  await waitFor("document.querySelector('#stylist-message') && window.__stylistReady", "chat hydration");
  await input("Help me pair a tee with pants."); await submit();
  await waitFor("document.querySelector('.stylist-turn[data-state=pending] .stylist-question')", "optimistic user bubble");
  assert.ok(await evaluate("document.querySelector('.stylist-pending').textContent.includes('thinking')"));
  assert.ok(await evaluate("document.querySelector('.stylist-compose button').disabled"));
  await submit();
  assert.equal(await evaluate("window.__stylistRequests.length"), 1, "duplicate submissions are blocked");
  await screenshot("stylist-pending-mobile");
  await evaluate("window.__stylistFail()");
  await waitFor("document.querySelector('[role=alert]') && !document.querySelector('.stylist-pending')", "network error");
  assert.equal(await evaluate("document.querySelector('#stylist-message').value"), "Help me pair a tee with pants.");
  await screenshot("stylist-error-mobile");
  await submit();
  await waitFor("window.__stylistRequests.length===2", "retry");
  assert.equal(await evaluate("document.querySelectorAll('.stylist-question').length"), 1, "retry replaces failed bubble");
  assert.equal(await evaluate("window.__stylistRequests[1].messages.length"), 1, "failed turns do not enter model history");
  await evaluate("window.__stylistReply(503,{status:'not_connected',error:'Stylist model not connected yet',message:null,calls:[],recommendations:[]})");
  await waitFor("document.querySelector('.stylist-turn[data-state=failed]')", "HTTP error state");
  assert.equal(await evaluate("document.querySelector('#stylist-message').value"), "Help me pair a tee with pants.");
  await submit();
  await waitFor("window.__stylistRequests.length===3", "successful retry starts");
  await evaluate("window.__stylistReply(200,{status:'ok',message:'A simple pairing is ready.',calls:[],recommendations:[]})");
  await waitFor("document.querySelector('.stylist-answer') && document.querySelector('#stylist-message').value===''", "success clears draft");
  assert.ok(!(await evaluate("document.querySelector('[role=alert]') || document.querySelector('.stylist-pending')")));
  await input("Choose another look."); await submit();
  await waitFor("window.__stylistRequests.length===4", "structured recommendation request");
  await evaluate(`window.__stylistReply(200,{status:'ok',message:'A comfortable look.',calls:[],structured:{top_id:'top',bottom_id:'bottom',outer_id:null,occasion:'casual',formality:2,reason:'A comfortable look.',weather_note:null,language:'en'},recommendations:[{url:'/try-on?top=top&bottom=bottom',reason:'A comfortable look.',items:[{id:'top',name:'Test top',category:'top',photo:'',template:null,colors:[{name:'white',hex:'#ffffff',share:1}]},{id:'bottom',name:'Test bottom',category:'bottom',photo:'',template:null,colors:[{name:'black',hex:'#000000',share:1}]}]}]})`);
  await waitFor("document.querySelector('.stylist-look-actions')", "explicit action controls");
  assert.equal(await evaluate("window.__stylistActions.length"), 0, "recommendation never triggers an action automatically");
  await evaluate("document.querySelectorAll('.stylist-look-actions button')[1].click()");
  await waitFor("document.querySelector('.stylist-look-actions [role=status]')", "wear logged feedback");
  assert.deepEqual(await evaluate("window.__stylistActions[0].body.outfit_or_item_ids"), ['top','bottom']);
  assert.ok(await evaluate("document.querySelectorAll('.stylist-look-actions button')[1].disabled"));
  await evaluate("document.querySelectorAll('.stylist-look-actions button')[0].click()");
  await waitFor("document.querySelector('.stylist-look-actions [role=alert]')", "preview error feedback");
  assert.deepEqual(await evaluate("window.__stylistActions[1].body.item_ids"), ['top','bottom']);
  assert.deepEqual(browser.errors, []);
  console.log("PASS pending/error/retry UX and explicit-only avatar/wear actions with feedback and duplicate guard.");
} catch (error) { await screenshot("stylist-pending-failure"); console.error(browser.errors); throw error; } finally { await browser.close(); }
