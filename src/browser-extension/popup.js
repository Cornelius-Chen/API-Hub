const HUB = 'https://msi.tail4dd8cd.ts.net';
const $ = id => document.getElementById(id);
let target, origin, pending, busy = false;
function message(text) { $('status').textContent = text; }
async function broker(body) {
  const tabs = await chrome.tabs.query({url:HUB+'/*'});
  if (!tabs.length) throw new Error('请先在同一浏览器打开并登录 API Hub。');
  const result = await chrome.scripting.executeScript({target:{tabId:tabs[0].id},world:'MAIN',args:[body],func:async body => {
    if (typeof state === 'undefined' || !state.csrf) return {ok:false};
    try {
      const res = await fetch('/api/website-login',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':state.csrf},body:JSON.stringify(body)});
      return {ok:res.ok,data:await res.json()};
    } catch {return {ok:false};}
  }});
  if (!result[0]?.result?.ok) throw new Error('Hub 拒绝操作，请检查登录、网站、账号或密码启用状态。');
  return result[0].result.data;
}
async function inspect(fill) {
  const results = await chrome.scripting.executeScript({target:{tabId:target.id},args:[origin,fill||null],func:(expected, fill) => {
    if(location.origin!==expected || location.protocol!=='https:') return {ok:false};
    const visible = el => el.getClientRects().length && !el.disabled && !el.readOnly;
    const passwords = [...document.querySelectorAll('input[type=password]')].filter(visible);
    if(passwords.length!==1) return {ok:false};
    const password=passwords[0];
    if(password.autocomplete==='new-password') return {ok:false};
    const form=password.form;
    if(form && new URL(form.action||location.href).origin!==expected) return {ok:false};
    const scope=form||document;
    const users=[...scope.querySelectorAll('input[autocomplete=username],input[type=email],input[type=text],input:not([type])')].filter(visible);
    const preferred=users.filter(el=>el.autocomplete==='username'||el.type==='email');
    const user=(preferred.length===1?preferred:users);
    if(user.length!==1) return {ok:false};
    if(!fill) return {ok:true,username:user[0].value||''};
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
    setter.call(user[0],fill.username); user[0].dispatchEvent(new Event('input',{bubbles:true})); user[0].dispatchEvent(new Event('change',{bubbles:true}));
    setter.call(password,fill.password); password.dispatchEvent(new Event('input',{bubbles:true})); password.dispatchEvent(new Event('change',{bubbles:true}));
    return {ok:true}; // Never return the password field or page HTML.
  }});
  if(!results[0]?.result?.ok) throw new Error('无法安全识别单一登录表单：请人工处理（不支持多步骤、跨域表单或 iframe）。');
  return results[0].result;
}
async function remember(value) { pending=value; await chrome.storage.session.set({['attempt-'+target.id]:value}); }
async function fill(manual=false) {
  if(busy) return; busy=true;
  let issued;
  try {
    if(pending && pending.state!=='failed') throw new Error('本次已填入；先确认成功或失败，不能重复尝试。');
    if(pending?.state==='failed' && !manual) throw new Error('此前尝试失败，等待本人填写，不再重试默认密码。');
    if(manual && pending?.state!=='failed') throw new Error('先使用已有记录 / 默认流程，失败后再本人填写。');
    await inspect();
    const username=$('username').value.trim(); if(!username) throw new Error('请先填写网站账号。');
    const keys=await crypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:4096,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},false,['encrypt','decrypt']);
    const pub=await crypto.subtle.exportKey('jwk',keys.publicKey);
    const body={action:'begin',origin,confirmOrigin:origin,username,publicKey:pub};
    if(manual) {body.manualSecret=$('manual').value;if(!body.manualSecret) throw new Error('请本人填写密码。');}
    issued=await broker(body); delete body.manualSecret; $('manual').value='';
    const bytes=Uint8Array.from(atob(issued.sealed),c=>c.charCodeAt(0));
    const plaintext=await crypto.subtle.decrypt({name:'RSA-OAEP'},keys.privateKey,bytes);
    let password=new TextDecoder().decode(plaintext);
    try { await inspect({username,password}); } finally {password='';new Uint8Array(plaintext).fill(0);}
    await remember({attemptId:issued.attemptId,origin,username,state:'filled'});
    $('success').disabled=false; $('failure').disabled=false; $('fill').disabled=true;
    message('已填入一次（'+({saved:'网站记录',default:'默认密码',user:'本人输入'}[issued.source])+ '）。请登录网站；成功后回来确认，5 分钟内有效。');
  } catch(e) {
    if(issued) {try{await broker({action:'finish',attemptId:issued.attemptId,origin,success:false});}catch{}}
    await remember({origin,state:'failed',username:$('username').value});
    message(e.message==='OperationError'?'安全填充失败，请人工处理。':e.message);
  } finally {$('manual').value='';busy=false;}
}
async function finish(success) {
  if(busy||!pending?.attemptId) return;busy=true;
  try {
    const current=await chrome.tabs.get(target.id);
    if(new URL(current.url).origin!==pending.origin) throw new Error('页面已跨域，不能据此确认保存。');
    await broker({action:'finish',attemptId:pending.attemptId,origin:pending.origin,success,confirm:success?'LOGIN_CONFIRMED':undefined});
    await remember({...pending,state:success?'saved':'failed',attemptId:null});
    $('success').disabled=true;$('failure').disabled=true;
    message(success?'已保存此域名和账号的密码。':'已停止，未保存。等待本人填写。');
  }catch{message('无法确认：可能已过期或页面跨域。不会自动保存，请人工处理。');}
  finally{busy=false;}
}
$('fill').onclick=()=>fill();$('manualFill').onclick=()=>fill(true);
$('success').onclick=()=>finish(true);$('failure').onclick=()=>finish(false);
(async()=>{
  [target]=await chrome.tabs.query({active:true,currentWindow:true});
  origin=new URL(target.url).origin;
  if(!origin.startsWith('https://')||origin===HUB) throw new Error('请在要登录的 HTTPS 网站上打开扩展。');
  $('origin').textContent=origin;
  pending=(await chrome.storage.session.get('attempt-'+target.id))['attempt-'+target.id];
  if(pending?.origin!==origin) pending=null;
  if(pending?.state==='saved') { await inspect(); await remember(null); }
  if(pending){$('username').value=pending.username||'';$('fill').disabled=true;$('success').disabled=pending.state!=='filled';$('failure').disabled=pending.state!=='filled';message('上次状态：'+pending.state);}
  else{const view=await inspect();$('username').value=view.username;message('优先查该域名＋账号记录；没有才使用默认密码一次。');}
})().catch(()=>{message('请在支持的 HTTPS 登录页打开扩展，并保持 Hub 登录。');$('fill').disabled=true;$('manualFill').disabled=true;});
