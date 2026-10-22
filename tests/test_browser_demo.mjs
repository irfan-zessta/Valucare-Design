import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const values=new Map();let failSave=false;
globalThis.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>{if(failSave){const e=new Error('Full');e.name='QuotaExceededError';throw e;}values.set(k,v);},removeItem:k=>values.delete(k)};
globalThis.fetch=async url=>{try{const text=await fs.readFile(url,'utf8');return {ok:true,json:async()=>JSON.parse(text)};}catch{return {ok:false};}};
let {demoApi:api}=await import('../app/js/demo-store.js');
const post=(name,body)=>api('action/'+name,'POST',body);
const payload=name=>({newCompany:{registeredName:name,address:'100 Sample Avenue',province:'Metro Manila',city:'Makati',region:'NCR',industry:'IND-17'},lead:{channel:'Direct',estHeadcount:120,estDependents:25,contactName:'Demo Contact',contactEmail:'qa@example.com',targetEffectiveDate:'2099-11-01'}});
const baseline=(await api('cases/NB-2026-0022')).records.franchise[0].status;
const a=await post('case.create',{...payload('QA Forward Journey'),idempotencyKey:'create-qa'});
const repeat=await post('case.create',{...payload('QA Forward Journey'),idempotencyKey:'create-qa'});
assert.equal(a.caseId,repeat.caseId);
assert.match(a.caseId,/^DEMO-NB-/);
let d=await api('cases/'+a.caseId);
assert.equal(d.summary.company,'QA Forward Journey');assert.equal(d.records.franchise[0].accountInfo.name,'QA Forward Journey');assert.equal(d.summary.blocker,null);
const b=await post('case.create',payload('QA Isolation'));
assert.notEqual(a.caseId,b.caseId);
const found=await api('companies/search?q=QA%20Forward');assert.equal(found.items[0].links.cases[0].id,a.caseId);
const fr=d.records.franchise[0];
await post('record.save',{recordId:fr.id,changes:{accountInfo:{...fr.accountInfo,contactPerson:'Saved Contact'}}});
assert.equal((await api('cases/'+a.caseId)).records.franchise[0].accountInfo.contactPerson,'Saved Contact');
const steps=[];let lastStage=0;
for(let n=0;n<30;n++) {
  d=await api('cases/'+a.caseId);const next=d.summary.next;if(!next)break;
  assert.ok(next.stage>=lastStage,'Happy path must not move backwards');lastStage=next.stage;
  assert.equal(d.summary.blocker,null);
  if(next.key==='plans_generate') {
    const p=await post('planCode.generate',{accountId:d.records.account[0].id,preview:true});assert.equal(p.preview.length,2);assert.equal((await api('cases/'+a.caseId)).records.planCode,undefined);
  }
  steps.push(next.key);
  await post('demo.advance',{caseId:a.caseId,step:next.key,idempotencyKey:'step-'+next.key});
  // A second click/retry must return the same result, not advance another step.
  await post('demo.advance',{caseId:a.caseId,step:next.key,idempotencyKey:'step-'+next.key});
  if(next.key==='requirements'){d=await api('cases/'+a.caseId);assert.equal(d.records.memberBatch[0].counts.total,145);assert.equal(d.documents.filter(x=>x.slot.startsWith('req:')).length,5);assert.equal(d.records.franchise[0].requirements.masterlist.note,'Sample document—not verified');}
  if(next.key==='activate'){d=await api('cases/'+a.caseId);assert.equal(d.records.activation[0].status,'Scheduled');assert.equal(d.records.account[0].status,'Scheduled');}
}
d=await api('cases/'+a.caseId);
assert.equal(d.summary.status,'Handover Complete');assert.equal(d.records.account[0].status,'Active');assert.equal(d.summary.closed,true);
assert.equal(d.records.planCode.length,2);assert.equal(d.records.account.length,1);assert.equal(d.records.billing[0].firstPaymentPosted,false);
assert.equal((await api('cases/'+b.caseId)).records.franchise[0].status,'Draft');
assert.equal((await api('cases/NB-2026-0022')).records.franchise[0].status,baseline);
// Fresh module instance represents a browser reload.
({demoApi:api}=await import('../app/js/demo-store.js?reload-test'));
assert.equal((await api('cases/'+a.caseId)).summary.status,'Handover Complete');
assert.equal((await api('cases/'+a.caseId)).records.franchise[0].accountInfo.contactPerson,'Saved Contact');
// No success and no lasting state changes if durable storage fails.
failSave=true;await assert.rejects(()=>post('demo.advance',{caseId:b.caseId,step:'franchise_submit'}),/could not save/);failSave=false;
assert.equal((await api('cases/'+b.caseId)).records.franchise[0].status,'Draft');
await assert.rejects(()=>post('unimplemented.action',{caseId:b.caseId}),/not available/);
assert.equal((await api('cases/'+b.caseId)).records.franchise[0].status,'Draft');
console.log('PASS: '+steps.length+' forward milestones; case identity, search, persistence, idempotency, plan preview, future activation, isolation, storage rollback and unsupported-action handling.');
