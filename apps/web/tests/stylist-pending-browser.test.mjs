import assert from "node:assert/strict";
import { browserSession } from "./browser-session.mjs";
const browser = await browserSession();
const { send, evaluate, waitFor, screenshot } = browser;
const input = value => evaluate(`(() => { const e=document.querySelector('#stylist-message'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); })()`);
const submit = () => evaluate("document.querySelector('.stylist-compose').requestSubmit()");
try {
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.__stylistRequests=[]; const original=window.fetch;
    window.fetch=(input,init={})=>{
      if(typeof input==='string'&&input==='/api/stylist/chat'){
        if(init.method!=='POST'){window.__stylistReady=true; return Promise.resolve(new Response(JSON.stringify({status:'configured'})));}
        window.__stylistRequests.push(JSON.parse(init.body));
        return new Promise((resolve,reject)=>{
          window.__stylistReply=(status,body)=>resolve(new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}}));
          window.__stylistFail=()=>reject(new TypeError('Failed to fetch'));
        });
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
  assert.deepEqual(browser.errors, []);
  console.log("PASS optimistic bubble, thinking indicator, disabled Send, duplicate guard, network/HTTP errors, retained draft and successful retry.");
} catch (error) { await screenshot("stylist-pending-failure"); console.error(browser.errors); throw error; } finally { await browser.close(); }
