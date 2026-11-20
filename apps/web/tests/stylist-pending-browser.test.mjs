import assert from "node:assert/strict";
import { browserSession } from "./browser-session.mjs";
const browser = await browserSession();
const { send, evaluate, waitFor, screenshot } = browser;
const input = value => evaluate(`(() => { const e=document.querySelector('#stylist-message'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); })()`);
const submit = () => evaluate("document.querySelector('.stylist-compose').requestSubmit()");
try {
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.__stylistRequests=[]; window.__stylistActions=[]; window.__plans=[]; const original=window.fetch;
    window.fetch=(input,init={})=>{
      if(input==='/api/stylist/chat?warmup=1') {window.__warmed=true; return Promise.resolve(new Response(JSON.stringify({status:'ready'})));}
      if(input==='/api/planner'){ if(init.method==='PUT') window.__plans.push(JSON.parse(init.body)); return Promise.resolve(new Response(JSON.stringify({plans:[]}),{headers:{'X-Planner-Version':'test-version'}}));}
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
  assert.ok(await evaluate("window.__warmed"));
  await input("Help me pair a tee with pants.");
  await evaluate("document.querySelector('#stylist-message').focus()");
  await send("Input.dispatchKeyEvent", {type:"keyDown",key:"Enter",code:"Enter",windowsVirtualKeyCode:13,modifiers:8,text:"\n"});
  await send("Input.dispatchKeyEvent", {type:"char",key:"Enter",modifiers:8,text:"\r"});
  await send("Input.dispatchKeyEvent", {type:"keyUp",key:"Enter",code:"Enter",windowsVirtualKeyCode:13,modifiers:8});
  assert.equal(await evaluate("window.__stylistRequests.length"),0,"Shift+Enter does not send");
  assert.ok((await evaluate("document.querySelector('#stylist-message').value")).includes("\n"));
  await input("Help me pair a tee with pants.");
  await send("Input.dispatchKeyEvent", {type:"keyDown",key:"Enter",code:"Enter",windowsVirtualKeyCode:13});
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
  await evaluate(`window.__stylistReply(200,{status:'ok',message:'A comfortable look.',calls:[],intent:{intent_kind:'recommend',occasion_type:'casual',formality_min:1,formality_max:2,date:'2030-01-01',indoor_outdoor:'unknown',language:'en'},structured:{top_id:'top',bottom_id:'bottom',outer_id:null,occasion:'casual',formality:2,reason:'A comfortable look.',weather_note:null,language:'en'},recommendations:[{url:'/try-on?top=top&bottom=bottom',reason:'A comfortable look.',items:[{id:'top',name:'Test top',category:'top',photo:'',template:null,colors:[{name:'white',hex:'#ffffff',share:1}]},{id:'bottom',name:'Test bottom',category:'bottom',photo:'',template:null,colors:[{name:'black',hex:'#000000',share:1}]}]}]})`);
  await waitFor("document.querySelector('.stylist-look-actions')", "explicit action controls");
  assert.ok(await evaluate("[...document.querySelectorAll('.stylist-look-actions button')].every(b => b.type === 'button' && b.tabIndex === 0 && parseFloat(getComputedStyle(b).minHeight) >= 40 && parseFloat(getComputedStyle(b).borderRadius) >= 20)"), "actions are focusable pill buttons");
  assert.equal(await evaluate("window.__stylistActions.length"), 0, "recommendation never triggers an action automatically");
  await evaluate("document.querySelectorAll('.stylist-look-actions button')[1].click()");
  await waitFor("document.querySelector('.stylist-look-actions [role=status]')", "wear logged feedback");
  assert.deepEqual(await evaluate("window.__stylistActions[0].body.outfit_or_item_ids"), ['top','bottom']);
  assert.ok(await evaluate("document.querySelectorAll('.stylist-look-actions button')[1].disabled"));
  await evaluate("document.querySelectorAll('.stylist-look-actions button')[0].click()");
  await waitFor("document.querySelector('.stylist-look-actions [role=alert]')", "preview error feedback");
  assert.deepEqual(await evaluate("window.__stylistActions[1].body.item_ids"), ['top','bottom']);
  assert.ok(await evaluate("[...document.querySelectorAll('.stylist-question,.stylist-answer,#stylist-message')].every(e=>e.getAttribute('dir')==='auto')"));
  await input("A presentation tomorrow."); await submit();
  await waitFor("window.__stylistRequests.length===5", "future request");
  assert.deepEqual(await evaluate("window.__stylistRequests[4].previous.ids"), ['top','bottom'], "follow-up context carries the last shown IDs");
  assert.equal(await evaluate("window.__stylistRequests[4].previous.intent.occasion_type"), 'casual');
  await evaluate(`(() => {
    const d=new Date();d.setDate(d.getDate()+1);window.__future=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
    window.__stylistReply(200,{status:'ok',message:'The closest available look.',calls:[],structured:{top_id:'top',bottom_id:'bottom',outer_id:null,occasion:'business',formality:2,reason:'The closest available look.',gap_note:'You have no formal shirt.',date:window.__future,weather_note:null,language:'en'},recommendations:[{url:'/try-on?top=top&bottom=bottom',reason:'The closest available look.',items:[{id:'top',name:'Top',category:'top',photo:'',template:null,colors:[{name:'white',hex:'#ffffff',share:1}]},{id:'bottom',name:'Bottom',category:'bottom',photo:'',template:null,colors:[{name:'white',hex:'#ffffff',share:1}]}]}]});
  })()`);
  await waitFor("[...document.querySelectorAll('button')].some(e=>e.textContent.startsWith('Save to plan for'))", "future plan control");
  assert.ok(await evaluate("document.body.textContent.includes('You have no formal shirt.')"));
  await evaluate("[...document.querySelectorAll('button')].find(e=>e.textContent.startsWith('Save to plan for')).click()");
  await waitFor("window.__plans.length===1", "planner write");
  assert.equal(await evaluate("window.__plans[0].date===window.__future"), true);
  assert.deepEqual(await evaluate("window.__plans[0].item_ids"),['top','bottom']);
  assert.equal(await evaluate("window.__stylistActions.filter(a=>a.url.endsWith('log_worn')).length"),1,"future plan never logs wear");
  assert.deepEqual(browser.errors, []);
  console.log("PASS pending/error/retry UX and explicit-only avatar/wear actions with feedback and duplicate guard.");
} catch (error) { await screenshot("stylist-pending-failure"); console.error(browser.errors); throw error; } finally { await browser.close(); }
