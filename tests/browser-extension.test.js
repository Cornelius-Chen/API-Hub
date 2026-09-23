const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {createWebsiteVault}=require('../src/website-vault'),{createWebsiteLogin}=require('../src/website-login'),{encryptSecret}=require('../src/security');
const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE workspaces(id TEXT PRIMARY KEY);INSERT INTO workspaces VALUES('owner');CREATE TABLE audit_events(workspace_id TEXT,display_time TEXT,actor TEXT,action TEXT,outcome TEXT,detail TEXT);`);
const key=crypto.randomBytes(32),secret='fake-default-only';createWebsiteVault(db).save('owner',encryptSecret(secret,key,'owner:website-default:v1').envelope,'test');const service=createWebsiteLogin(db,key);
class Input {constructor(type){this.type=type;this.autocomplete=type==='text'?'username':'';this.disabled=false;this.readOnly=false;}get value(){return this.v||'';}set value(v){this.v=v;}getClientRects(){return [1];}dispatchEvent(){}}
const user=new Input('text'),password=new Input('password');user.value='fake-user';const form={action:'https://example.test/login',querySelectorAll:()=>[user]};password.form=form;
const page=vm.createContext({URL,location:{origin:'https://example.test',protocol:'https:',href:'https://example.test/login'},HTMLInputElement:Input,Event:class{},document:{querySelectorAll:()=>[password]}});
const nodes=Object.fromEntries(['origin','username','fill','status','success','failure','manual','manualFill'].map(id=>[id,{value:'',textContent:'',disabled:false}]));
const saved={};let fills=0;
const hub=vm.createContext({state:{csrf:'synthetic'},fetch:async(url,opts)=>{const body=JSON.parse(opts.body);try{return {ok:true,json:async()=>service[body.action]('owner','test',body)};}catch{return {ok:false,json:async()=>({ok:false})};}}});
const chrome={tabs:{query:async q=>q.url?[{id:2}]:[{id:1,url:'https://example.test/login'}],get:async()=>({url:'https://example.test/account'})},storage:{session:{get:async k=>({[k]:saved[k]}),set:async values=>Object.assign(saved,values)}},scripting:{executeScript:async opts=>{
  const context=opts.target.tabId===2?hub:page;context.callArgs=opts.args;
  if(opts.target.tabId===1&&opts.args[1]) fills++;
  return [{result:await vm.runInContext('('+opts.func.toString()+')(...callArgs)',context)}];
}}};
const popup=vm.createContext({chrome,document:{getElementById:id=>nodes[id]},crypto:crypto.webcrypto,TextDecoder,Uint8Array,atob,URL});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../src/browser-extension/popup.js'),'utf8'),popup);
(async()=>{
  for(let i=0;i<30&&!nodes.username.value;i++)await new Promise(r=>setTimeout(r,10));
  assert.equal(nodes.username.value,'fake-user');
  await nodes.fill.onclick();assert.equal(password.value,secret);assert.equal(fills,1);assert.equal(service.list('owner').length,0);
  assert.ok(!JSON.stringify(saved).includes(secret));assert.ok(!nodes.status.textContent.includes(secret));
  await nodes.failure.onclick();assert.equal(service.list('owner').length,0);
  nodes.manual.value='fake-manual-password';await nodes.manualFill.onclick();assert.equal(password.value,'fake-manual-password');
  assert.equal(nodes.manual.value,'');await nodes.success.onclick();assert.equal(service.list('owner').length,1);
  assert.ok(!JSON.stringify(saved).includes('fake-manual-password'));
  // Unsafe forms fail closed before any provider password is requested/filled.
  saved['attempt-1']=null;password.form.action='https://evil.test/collect';
  const before=fills;vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../src/browser-extension/popup.js'),'utf8'),vm.createContext({chrome,document:{getElementById:id=>nodes[id]},crypto:crypto.webcrypto,TextDecoder,Uint8Array,atob,URL}));
  await new Promise(r=>setTimeout(r,20));assert.equal(nodes.fill.disabled,true);assert.equal(fills,before);
  console.log('Extension simulation: default fill once, failure stop, manual retry, explicit success/save, no password metadata, cross-origin form blocked');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.close());
