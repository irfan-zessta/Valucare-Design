// A durable, browser-local demo, scoped to the static host only. Every mutation
// commits before success, is isolated by case, and records simulated evidence.
const BASE = new URL('../preview/', import.meta.url);
const KEY = 'hms3:corporate-demo:v2';
const copy = x => structuredClone(x);
const uid = p => `DEMO-${p}-${crypto.randomUUID().slice(0,8).toUpperCase()}`;
const stamp = () => new Date().toISOString();
const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Manila', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date());
const days = (d,n) => new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const cached = new Map();
let db, actor = 'u-ad1', queue = Promise.resolve();
export class DemoError extends Error {
  constructor(message, status=409) { super(message); this.code='preview'; this.status=status; }
}
const need = (ok, message) => { if(!ok) throw new DemoError(message); };
async function fixture(slug) {
  if(!cached.has(slug)) { const r=await fetch(new URL(slug+'.json',BASE)); cached.set(slug,r.ok?await r.json():null); }
  return copy(cached.get(slug));
}
function storage() {
  if(db) return db;
  try { db=JSON.parse(localStorage.getItem(KEY)||'null')||{version:2,cases:{},deleted:[],receipts:{}}; }
  catch { throw new DemoError('Saved demo data could not be read. Your data was kept. Try a fresh browser for a new demo.'); }
  need(db.version===2 && db.cases,'Saved demo data uses a different format. Your records were kept.'); return db;
}
const one=(d,k)=>(d.records[k]||[])[0];
const records=d=>[d.case,d.company,...Object.values(d.records).flat()];
function record(d,type,fields={}) {
  const r={id:uid(type.toUpperCase()),type,caseId:d.case.id,v:1,createdAt:stamp(),updatedAt:stamp(),updatedBy:actor,...fields};
  (d.records[type]||=[]).push(r); return r;
}
function change(r,fields) { Object.assign(r,fields,{v:(r.v||0)+1,updatedAt:stamp(),updatedBy:actor}); return r; }
function log(d,action,reason='Simulated demonstration; no external action performed.') {
  (d.demoHistory||=[]).push({id:uid('EVENT'),action,reason,detail:reason,userName:'Demo workspace',role:'admin',at:stamp(),recordType:'case',recordId:d.case.id,changes:[],simulated:true});
}
async function getCase(id) {
  if(storage().cases[id]) return db.cases[id];
  need(!db.deleted.includes(id),'This case was removed from this browser.');
  const d=await fixture('cases__'+id);
  if(!d?.case) throw new DemoError('Case not found in this browser. Open New Business to create or continue your demo.',404);
  db.cases[id]=d; return d;
}
async function allCases() {
  const seeds=(await fixture('cases'))?.items||[];
  return Promise.all([...new Set([...seeds.map(c=>c.id),...Object.keys(storage().cases)])].filter(id=>!db.deleted.includes(id)).map(getCase));
}
async function locate(b) {
  if(b.caseId) return {d:await getCase(b.caseId),r:null};
  const id=b.recordId||b.franchiseId||b.contractId||b.rateRequestId||b.torId||b.accountId||b.batchId||b.id||b.ids?.[0];
  for(const d of await allCases()) { const r=records(d).find(r=>r.id===id); if(r) return {d,r}; }
  throw new DemoError('Record not found. Nothing was changed.',404);
}
function doc(d,r,slot,name) {
  const prev=d.documents.find(x=>x.linked?.id===r.id&&x.slot===slot&&!x.supersededBy);
  const x=record(d,'document',{slot,docType:slot,linked:{id:r.id,type:r.type},filename:name||slot+'-sample.pdf',version:(prev?.version||0)+1,
    mime:'application/pdf',validation:'Sample—not verified',status:'Sample',generated:true,simulated:true,uploaderName:'Demo workspace',uploaderId:actor,uploadedAt:stamp(),size:0});
  if(prev) prev.supersededBy=x.id; d.documents.push(x); return x;
}
function franchise(d) {
  if(one(d,'franchise')) return one(d,'franchise');
  const c=d.case,co=d.company;
  return record(d,'franchise',{code:uid('FR'),status:'Draft',requirements:{},decisions:[],extensions:[],affiliates:[],
    accountInfo:{name:co.registeredName,shortName:co.tradeName,tin:co.tin,natureOfBusiness:co.industry,companyAddress:co.address,companyProvince:co.province,companyCity:co.city,companyRegion:co.region,
      sameAsCompany:true,billingAddress:co.address,billingProvince:co.province,billingCity:co.city,billingRegion:co.region,email:c.contactEmail,contactPerson:c.contactName,contactNumber:c.contactPhone,telephone:c.contactPhone,accountType:'CORPORATE/HMO'},
    otherInfo:{employeeCount:c.estHeadcount,dependentCount:c.estDependents??25,businessSource:c.channel,businessSourceName:c.intermediaryId||'',requestedBy:'Sales',createdBy:'Sales',department:'Corporate Sales',accountManager:actor,salesManager:null,
      targetEffectiveDate:c.targetEffectiveDate,mannerOfEnrollment:'Compulsory',mannerOfPayment:'Subsidized',vatStatus:'',currentCoverage:'',commissionType:c.channel==='Direct'?'None':'',salesRemarks:''}});
}
function sampleMembers(d,purpose) {
  const prev=(d.records.memberBatch||[]).find(x=>x.purpose===purpose&&x.status!=='Superseded'); if(prev) return prev;
  const oi=one(d,'franchise').otherInfo,total=Number(oi.employeeCount||0)+Number(oi.dependentCount||0);
  const batch=record(d,'memberBatch',{purpose,version:1,filename:'Member-Data-sample.csv',status:purpose==='enrollment'?'MDA Completed':'Accepted',headers:[],mapping:{},approvedExceptions:{},
    counts:{total,valid:total,errors:0,duplicates:0,exceptions:0},simulated:true,mda:purpose==='enrollment'?{status:'Completed',byName:'Sample MDA',at:stamp(),notes:'Sample acknowledgement—no policies or cards issued',enrolled:total}:null});
  batch.docId=doc(d,batch,'member-data','Member-Data-sample.csv').id;return batch;
}
// Captures a ready structured TOR and quotation Member Data from the uploaded
// requirements, so neither has to be built by hand before the rate request (#6).
function captureQuotationData(d) {
  if(!one(d,'tor')) record(d,'tor',{lines:copy(d.template.lines.filter(l=>['IP-RB','OP-CONS','ER-ACC','DEN-PREV','APE-STD'].includes(l.code)).map((l,i)=>({...l,id:'B'+(i+1)})))});
  sampleMembers(d,'quotation');
}
// Attaches the already-captured Member Data and TOR to the rate request by default,
// so the user does not re-upload data the case already holds (#7).
function attachQuotationData(d,rr) {
  if(d.documents.some(x=>x.linked?.id===rr.id&&x.slot==='rr_attach'&&!x.supersededBy)) return;
  if((d.records.memberBatch||[]).some(b=>b.purpose==='quotation')||one(d,'tor')) doc(d,rr,'rr_attach','Quotation-package (Member Data + Structured TOR)-sample.pdf');
}
function makeRates(d) {
  const rr=one(d,'rateRequest'); need(rr,'Request rates first.');
  if(one(d,'rateSheet')&&rr.status==='Rate Sheet Issued') return one(d,'rateSheet');
  const rs=record(d,'rateSheet',{requestId:rr.id,code:rr.code+'-v'+((rr.latestVersion||0)+1),version:(rr.latestVersion||0)+1,status:'Issued',quoteStatus:'Released',
    rows:[['Principal',18000],['Dependent',14000]].map(([memberType,rate])=>({plan:'Corporate Standard',memberType,rate,roomBoard:'Semi-private',mbl:150000,ageBand:'',paymentMode:'Annual'})),
    assumptions:{},approvals:[],approvalLog:[],issuedAt:stamp(),issuedByName:'Actuarial / ACCUSA—sample',notes:'Sample commercial terms—not an official quotation.'});
  d.records.rateSheet=[rs,...d.records.rateSheet.filter(x=>x!==rs).map(x=>({...x,status:'Superseded'}))]; change(rr,{status:'Rate Sheet Issued',latestVersion:rs.version}); return rs;
}
function makeOffer(d) {
  const rs=one(d,'rateSheet'); need(rs,'Load the rate sheet first.');
  let sob=one(d,'sob');
  if(!sob) sob=record(d,'sob',{name:'Main SOB',scope:'parent',version:1,status:'Draft',source:'template',templateVersion:d.template.v,preparedBy:actor,lines:copy(d.template.lines),
    exclusions:[],customExclusions:[],specialInstructions:[],approvals:[],history:[],addOns:{lifeInsurance:{enabled:false,partner:'Full Life',coverage:''},teleconsultation:{enabled:false,partner:'Consulta MD',terms:''}},legacy:{}});
  if(!one(d,'proposal')) record(d,'proposal',{code:uid('PR'),version:1,status:'Draft',rateSheetId:rs.id,rateSheetVersion:rs.version,sobId:sob.id,sobVersion:sob.version,
    items:rs.rows.map(({rate,...r})=>({...r,actuarialRate:rate,proposedRate:rate})),commissionPct:0,commissionNote:'',justification:'',recommendation:'',approvals:[],rounds:[],history:[]});
  return one(d,'proposal');
}
function makeContract(d,b={}) {
  const p=one(d,'proposal'),fr=one(d,'franchise'); need(p?.status==='Accepted','Record client acceptance first.');
  if(one(d,'contract')) return one(d,'contract');
  const date=b.effectiveDate||fr.otherInfo.targetEffectiveDate||today();
  for(const kind of ['Contract','DSA']) record(d,'contract',{kind,status:'Requested',number:uid(kind),parties:[d.company.registeredName,'ValuCare (demo)'],signatories:[d.case.contactName||'Sample signatory'],
    effectiveDate:date,expiryDate:days(date,364),product:fr.accountInfo.accountType,paymentMode:b.paymentMode||p.items[0]?.paymentMode||'Annual',paymentTerms:'T+30',proposalVersion:p.version,events:[],notes:''});
  record(d,'kyc',{status:'Pending',flags:[],simulated:true}); record(d,'onboarding',{items:{}}); return one(d,'contract');
}
function makeAccount(d,b={}) {
  const existing=one(d,'account'); if(existing&&!b.parentId) return existing;
  const p=one(d,'proposal'),fr=one(d,'franchise'),con=one(d,'contract');
  need(p?.status==='Accepted'&&con?.status==='Completed','Finish the accepted offer and sample signed contract before account creation.');
  const ai=fr.accountInfo,oi=fr.otherInfo,code=uid('MA');
  const a=record(d,'account',{status:'Draft',parentId:b.parentId||null,accountCode:code,maCode:code,makerId:actor,
    accountInfo:{accountName:b.name||ai.name,mainName:ai.name,shortName:ai.shortName,maCode:code,accountCode:code,tin:ai.tin,address:b.address||ai.companyAddress,province:ai.companyProvince,city:ai.companyCity,region:ai.companyRegion,
      billingAddress:ai.billingAddress,contactPerson:ai.contactPerson,contactEmail:ai.email,mobile:ai.contactNumber,telNo:ai.telephone,vatStatus:oi.vatStatus,currentCoverage:oi.currentCoverage,noOfEnrolees:oi.employeeCount,noOfDependents:oi.dependentCount},
    contractInfo:{product:ai.accountType,specialStandard:'Standard',legacyAccountType:'',effectivityDate:con.effectiveDate,expiryDate:con.expiryDate,paymentMode:con.paymentMode,paymentTerms:con.paymentTerms,mannerOfEnrollment:oi.mannerOfEnrollment,mannerOfPayment:oi.mannerOfPayment},
    agentInfo:{businessSource:d.case.channel,agent:d.case.intermediaryId||''},otherInfo:{accountManager:d.case.ownerId,vip:false,jumbo:false},vcAppExclusions:[],sources:{franchise:fr.code,contract:con.number}});
  change(fr,{status:'Converted to Account',accountId:a.id}); return a;
}
function planPreview(d,a) {
  const sob=one(d,'sob'),p=one(d,'proposal'); need(a&&['Approved','Scheduled','Active'].includes(a.status),'Approve the account before generating Plan Codes.'); need(sob?.status==='Codified','Finish the accepted SOB first.');
  return p.items.map(r=>{ const label=`${r.plan} / ${r.memberType}`; return {_label:label,exists:(d.records.planCode||[]).some(x=>x.accountId===a.id&&x.entitlementKey===label&&x.status!=='Superseded'),
    accountId:a.id,accountCode:a.accountCode,accountName:a.accountInfo.accountName,entitlementKey:label,planType:r.plan,memberType:r.memberType,roomType:r.roomBoard,mbl:r.mbl,premium:r.proposedRate,modeOfPayment:r.paymentMode,
    sobVersion:sob.version,sobId:sob.id,effectiveFrom:a.contractInfo.effectivityDate,effectiveTo:a.contractInfo.expiryDate,hospitalCodes:[],clinicCodes:[],contractYear:Number(a.contractInfo.effectivityDate?.slice(0,4)),businessSource:d.case.channel,corporIfg:'Corporate'}; });
}
function generate(d,a,select) {
  return planPreview(d,a).filter(x=>!x.exists&&(!select||select.includes(x._label))).map(x=>record(d,'planCode',{...x,planCode:uid('PC'),seriesId:uid('SERIES'),pcVersion:1,status:'Draft',makerId:actor}));
}
function compareBenefits(tor=[],sob=[]) {
  const t=new Map(tor.filter(x=>x.code).map(x=>[x.code,x])),s=new Map(sob.filter(x=>x.code).map(x=>[x.code,x]));
  return [...new Set([...t.keys(),...s.keys()])].map(code=>{
    const a=t.get(code),b=s.get(code),flags=[];
    if(!b)flags.push('Missing in SOB');else if(!a)flags.push('New benefit');else {
      const pairs=['innerLimit','percentage','mbl'].filter(k=>a[k]!=null&&a[k]!==''&&b[k]!=null&&b[k]!=='').map(k=>[Number(a[k]),Number(b[k])]);
      if(pairs.some(([x,y])=>y<x))flags.push('Lower than TOR');else if(pairs.some(([x,y])=>y>x))flags.push('Higher than TOR');
      if((a.exclusions||'').trim().toLowerCase()!==(b.exclusions||'').trim().toLowerCase())flags.push('Exclusion difference');
      if(!flags.length)flags.push('Same');
    }
    return {code,benefit:(a||b).subcategory||(a||b).service||code,category:(a||b).category,tor:a||null,sob:b||null,flags};
  });
}
function approvePlan(d,pc) {
  // The live approved version remains valid while its amendment is a draft.
  if(pc.amendsId){const previous=d.records.planCode.find(x=>x.id===pc.amendsId);if(previous)change(previous,{status:'Superseded',supersededBy:pc.id});}
  change(pc,{status:'Approved',checkerId:'demo-review'});
}
export function nextDemoTask(d) {
  const c=d.case,fr=one(d,'franchise'),rr=one(d,'rateRequest'),p=one(d,'proposal'),sob=one(d,'sob'),con=one(d,'contract'),a=one(d,'account'),ac=one(d,'activation');
  const t=(key,stage,route,title,button,why,department='Sales')=>({key,stage,link:`#/case/${c.id}/${route}`,title,button,why,department,role:'admin',roleLabel:department,assigneeId:actor,assigneeName:'Demo workspace',caseId:c.id,kind:'action',waiting:null,blocker:null,due:null});
  if(['Closed Lost','Routed to IFG'].includes(c.status)||ac?.status==='Handover Complete') return null;
  if(!fr||['Draft','Returned'].includes(fr.status)) return t('franchise_submit',2,'franchise/franchise','Review the franchise details','Submit franchise & continue','Your company details are filled in below. Extra fields and real documents may be skipped for this demo.');
  if(!['Approved','Converted to Account'].includes(fr.status)) return t('franchise_approve',2,'franchise/franchise','Franchise submitted for review','Load sample approval & continue','Records a simulated Account Services approval. No role change is needed.','Account Services');
  if(!(d.demo?.requirementsReady||Object.keys(fr.requirements||{}).length>=5&&Object.values(fr.requirements).every(x=>x.status!=='Requested'))) return t('requirements',3,'quotation/requirements','Prepare the quotation package','Use sample quotation package & continue','Adds sample Member Data, TOR, utilization, target rates and GIS to this case.');
  if(!rr||['Draft','Needs Information','Revised'].includes(rr.status)) return t('rate_request',3,'quotation/rates','Request Actuarial rates','Request rates & continue','Reuses the franchise, Member Data and benefits in a simulated request.');
  if(!one(d,'rateSheet')||rr.status!=='Rate Sheet Issued') return t('rates_receive',3,'quotation/rates','Receive the rate sheet','Load sample rates & continue','Illustrative rates from Actuarial / ACCUSA; not an official quotation.','Actuarial / ACCUSA');
  if(!p||!sob) return t('offer_build',4,'offer/sob','Build the proposal and SOB','Build proposal and SOB & continue','Reuse the rate sheet and benefit baseline without retyping.');
  if(!['Approved','Sent','Under Negotiation','Accepted'].includes(p.status)||!['Approved','Client Signed','Codified'].includes(sob.status)) return t('offer_review',4,'offer/sob','Review the offer and benefits','Load sample reviews & continue','Records separate sample Sales, Management pricing and independent SOB review outcomes. Edit the draft below if needed.');
  if(p.status==='Approved') return t('proposal_send',4,'offer/proposal','Present the approved offer','Send proposal—demo & continue',`Records the offer to the ${c.channel==='Direct'?'client':'intermediary'}. No email is sent.`);
  if(p.status!=='Accepted') return t('proposal_accept',4,'offer/negotiation',"Record the client's decision",'Use sample acceptance & continue','Links sample acceptance to this proposal and SOB version. Changes requested is available below.');
  if(!con) return t('contract_request',5,'account/contract','Prepare the contract and KYC','Request sample contract & continue','Reuse accepted terms in the Contract and Data Sharing Agreement.');
  if(con.status!=='Completed'||one(d,'kyc')?.status!=='Cleared') return t('contract_complete',5,'account/contract','Complete the sample contracting milestones','Load sample contract and KYC & continue','Records simulated signed, notarized and sent copies plus sample KYC. Real evidence remains unverified.','Legal / Account Services');
  if(!a) return t('account_create',6,'account/account','Create the account','Create account & continue','Creates one fictional account number using the accepted details. Activation comes later.','Account Services');
  if(!['Approved','Scheduled','Active'].includes(a.status)) return t('account_approve',6,'account/account','Review the account setup','Load sample account approval & continue','Review the carried-forward details and record a sample account review.','Account Services');
  if(!(d.records.planCode||[]).some(x=>x.status!=='Superseded')) return t('plans_generate',7,'account/plans','Create Plan Codes from the SOB','Preview Plan Codes','Preview the codes before creating them. Add or customize codes below.','Account Services');
  if((d.records.planCode||[]).some(x=>!['Approved','Superseded'].includes(x.status))) return t('plans_approve',7,'account/plans','Review the Plan Codes','Load sample Plan Code approval & continue',"Records a sample review of this case's current Plan Codes.",'Account Services');
  if(!one(d,'coc')||!one(d,'commission')) return t('supporting',7,'account/coc','Prepare supporting account documents','Prepare sample COC and commission & continue','Reuse the agreed terms. Direct business has no intermediary commission.','Account Services');
  if(!(d.records.memberBatch||[]).some(b=>b.purpose==='enrollment'&&b.status==='MDA Completed')) return t('mda',8,'activation/members-enrollment','Hand over final Member Data','Load sample MDA handover & continue','Reuses Member Data with account and Plan Code references; a simulated acknowledgement only.','MDA');
  if(one(d,'billing')?.status!=='Completed') return t('billing',8,'activation/billing','Complete Billing setup','Load sample Billing handover & continue','Corporate consolidated billing reuses fees, frequency and T+30 terms. Payment is separate.','Billing');
  if(!ac) return t('activate',8,'activation/activation','Review activation',a.contractInfo.effectivityDate>today()?'Schedule activation—demo':'Activate account—demo','Only this case changes. Future effectivity is scheduled, not reported as active.');
  if(ac.status==='Scheduled') return t('scheduled',8,'activation/activation','Activation scheduled','Simulate effective date & continue',`Ready for ${ac.scheduledFor}. Simulate reaching that date without changing contract dates.`);
  return t('handover',9,'activation/activation','Finish the handover','Load sample acknowledgements & finish','Records sample MDA, Billing and CCD acknowledgements and completes this case.');
}
function derive(d) {
  d.demo||={}; d.demo.browserLocal=true; d.documents||=[];
  const c=d.case,fr=one(d,'franchise'),a=one(d,'account'),ac=one(d,'activation'),n=nextDemoTask(d),done=ac?.status==='Handover Complete',stopped=['Closed Lost','Routed to IFG'].includes(c.status);
  const s=d.summary||={};
  Object.assign(s,{id:c.id,company:d.company.registeredName,tradeName:d.company.tradeName,companyId:c.companyId,channel:c.channel,intermediaryId:c.intermediaryId,ownerId:c.ownerId,ownerName:'Sales',salesManagerId:c.salesManagerId,
    estHeadcount:c.estHeadcount,leadRef:c.leadRef,vip:!!c.vip,jumbo:!!c.jumbo,stage:n?.stage||9,stageLabel:n?({2:'Franchise',3:'Quotation',4:'Proposal',5:'Contract',6:'Account setup',7:'Plan Codes',8:'Activation',9:'Handover'}[n.stage]):'Handover',
    status:stopped?c.status:done?'Handover Complete':ac?.status||(n?.stage===2?fr?.status||'Draft':'In progress'),statusTone:done||ac?.status==='Active'?'ok':'info',closed:done||stopped,next:n,tasks:n?[n]:[],myTasks:n?[n]:[],blocker:null,nextDue:null,
    franchiseCode:fr?.code,franchiseStatus:fr?.status,franchiseValidUntil:fr?.validUntil,maCode:a?.maCode,accountStatus:a?.status,effectivity:a?.contractInfo.effectivityDate||fr?.otherInfo.targetEffectiveDate||c.targetEffectiveDate,activationStatus:ac?.status||'Pending',signedUnpaid:false});
  c.pipelineStage=done?'Closed Won':s.stageLabel;
  const gate=(key,label,ok,route)=>({key,label,ok:!!ok,satisfied:!!ok,demoSkipped:false,ownerLabel:'Demo workspace',owner:'admin',link:`#/case/${c.id}/${route}`,detail:ok?'Recorded in the demo':'Continue the next step',blocker:null});
  d.gates=[gate('accepted','Accepted offer',one(d,'proposal')?.status==='Accepted','offer'),gate('contract','Sample contracting complete',one(d,'contract')?.status==='Completed','account/contract')];
  d.onboarding=['KYC form','GIS','SEC / DTI registration','Signatory ID'].map(label=>({key:label,label,mandatory:true,status:'Skipped for demo—not verified'}));
  d.readiness=[gate('account','Account setup',a&&['Approved','Scheduled','Active'].includes(a.status),'account/account'),gate('plans','Plan Codes reviewed',(d.records.planCode||[]).some(x=>x.status==='Approved'),'account/plans'),
    gate('mda','Sample MDA acknowledgement',(d.records.memberBatch||[]).some(b=>b.purpose==='enrollment'&&b.status==='MDA Completed'),'activation/members-enrollment'),gate('billing','Sample Billing setup',one(d,'billing')?.status==='Completed','activation/billing')];
  d.aor||=[]; d.comparisons={}; d.planStats={};
  for(const sob of d.records.sob||[]) {const cmp=compareBenefits(one(d,'tor')?.lines,sob.lines);d.comparisons[sob.id]=cmp;sob.reducedCount=cmp.filter(x=>x.flags.some(f=>f==='Missing in SOB'||f==='Lower than TOR')).length;}
  for(const pc of d.records.planCode||[]) d.planStats[pc.status]=(d.planStats[pc.status]||0)+1;
  return d;
}
function review(r,stage) { (r.approvals||=[]).push({stage,decision:'approve',by:'demo-review',byName:'Sample '+stage+' review',at:stamp(),version:r.version||1,simulated:true,remarks:'Simulated review—not an independent real-world approval.'}); }
async function advance(d,key,meta) {
  const t=nextDemoTask(d); need(t?.key===key,'This step has changed. Refresh and continue from the current step.');
  const fr=one(d,'franchise'),p=one(d,'proposal'),sob=one(d,'sob'),a=one(d,'account');
  switch(key) {
    case 'franchise_submit':change(franchise(d),{status:'Submitted',submittedBy:actor,submittedAt:stamp()});break;
    case 'franchise_approve':change(fr,{status:'Approved',approvedAt:stamp(),approvedBy:'demo-review',validFrom:today(),validUntil:d.case.channel==='Direct'?today().slice(0,4)+'-12-31':days(today(),60)});fr.decisions.push({decision:'approve',byName:'Sample Account Services',at:stamp(),remarks:'Simulated',version:fr.v});break;
    case 'requirements':
      for(const x of meta.requirements) { const f=doc(d,fr,'req:'+x.key);fr.requirements[x.key]={status:'Received',simulated:true,note:'Sample document—not verified',docId:f.id,at:stamp(),by:actor}; }
      captureQuotationData(d);d.demo.requirementsReady=true;break;
    case 'rate_request': { const rr=one(d,'rateRequest')||record(d,'rateRequest',{code:uid('RR'),franchiseCode:fr.code,franchiseId:fr.id,requestedPlans:'Corporate Standard',roomBoard:'Semi-private',mblOptions:'150000',targetRates:'Sample only',paymentModes:['Annual'],dependentCoverage:'Yes',clarifications:[]});attachQuotationData(d,rr);change(rr,{status:'Submitted'});break; }
    case 'rates_receive':makeRates(d);break;
    case 'offer_build':makeOffer(d);break;
    case 'offer_review':change(p,{status:'Approved',sobVersion:sob.version});change(sob,{status:'Approved'});review(p,'Sales');review(p,'Senior Management pricing');review(sob,'Independent SOB');break;
    case 'proposal_send':change(p,{status:'Sent',sentAt:stamp(),docVersion:p.version,docId:doc(d,p,'proposal').id,sentTo:[d.case.channel==='Direct'?'Client—simulated':'Intermediary—simulated']});break;
    case 'proposal_accept':change(p,{status:'Accepted',acceptance:{version:p.version,date:today(),recordedBy:actor,simulated:true,docId:doc(d,p,'acceptance').id}});change(sob,{status:'Codified',signedDocId:doc(d,sob,'sob_signed').id});break;
    case 'contract_request':makeContract(d);break;
    case 'contract_complete':for(const con of d.records.contract) { change(con,{status:'Completed'});for(const step of ['Draft','Signed','Notarized','Sent to client','Completed'])con.events.push({step,at:stamp(),eventDate:today(),byName:'Sample Legal / Account Services',notes:'Simulated'});for(const slot of ['draft','signed','notarized'])doc(d,con,slot); }change(one(d,'kyc'),{status:'Cleared',externalRef:uid('KYC'),checkDate:today(),checkerName:'Sample result—not screened'});break;
    case 'account_create':makeAccount(d);break;
    case 'account_approve':change(a,{status:'Approved',checkerId:'demo-review',approvedAt:stamp()});break;
    case 'plans_generate':generate(d,a);break;
    case 'plans_approve':for(const pc of d.records.planCode||[])if(!['Approved','Superseded'].includes(pc.status))approvePlan(d,pc);break;
    case 'supporting': { const coc=one(d,'coc')||record(d,'coc',{status:'Released',basis:{sobVersion:sob.version},simulated:true});coc.docId||=doc(d,coc,'coc').id;if(!one(d,'commission'))record(d,'commission',{status:'Approved',intermediaryId:d.case.intermediaryId,percentage:d.case.channel==='Direct'?0:null,basis:'Sample—not calculated',source:'Accepted proposal',accountId:a.id,effectiveFrom:a.contractInfo.effectivityDate,effectiveTo:a.contractInfo.expiryDate,simulated:true});break; }
    case 'mda': { const b=sampleMembers(d,'enrollment');change(b,{status:'MDA Completed',mda:{status:'Completed',byName:'Sample MDA',at:stamp(),notes:'Sample acknowledgement—no policies or cards issued',enrolled:b.counts.total}});break; }
    case 'billing': { const b=one(d,'billing')||record(d,'billing',{entity:d.company.registeredName,address:a.accountInfo.billingAddress,contact:a.accountInfo.contactPerson,contactEmail:a.accountInfo.contactEmail,frequency:a.contractInfo.paymentMode,terms:a.contractInfo.paymentTerms,vatTreatment:a.accountInfo.vatStatus,billingType:'Corporate - one consolidated bill',firstPaymentPosted:false,exceptions:[],makerId:actor});change(b,{status:'Completed',simulated:true});break; }
    case 'activate': { const date=a.contractInfo.effectivityDate||today(),status=date>today()?'Scheduled':'Active';record(d,'activation',{status,scheduledFor:date,activeFrom:status==='Active'?date:null,acks:{},readinessSnapshot:copy(derive(d).readiness),simulated:true});change(a,{status});break; }
    case 'scheduled':change(one(d,'activation'),{status:'Active',activeFrom:a.contractInfo.effectivityDate,simulatedDate:a.contractInfo.effectivityDate});change(a,{status:'Active'});break;
    case 'handover':change(one(d,'activation'),{status:'Handover Complete',acks:Object.fromEntries(['mda','bc','ccd'].map(x=>[x,{status:'Acknowledged',byName:'Sample '+x,at:stamp(),simulated:true}])),handoverAt:stamp()});break;
    default:throw new DemoError('Unsupported step. Nothing was changed.');
  }
  log(d,t.title);
}
async function action(name,b,meta) {
  if(name==='case.create') {
    const nc=b.newCompany||(await allCases()).find(d=>d.company.id===b.companyId)?.company;need(nc,'Choose or enter a company first.');
    const existing=(await allCases()).find(d=>d.case.status==='Open'&&(b.companyId?d.company.id===b.companyId:d.company.registeredName.trim().toLowerCase()===(nc.registeredName||'').trim().toLowerCase()));
    need(!existing,`This company already has a case (${existing?.case.id}). Search and continue it; your entered details are still here.`);
    const cid=uid('NB'),lead=b.lead||{},company={...copy(nc),id:b.companyId||uid('CO'),type:'company',registeredName:nc.registeredName||'Demo Company',v:1};
    const c={...copy(lead),id:cid,type:'case',caseId:cid,v:1,companyId:company.id,leadRef:uid('LD'),ownerId:lead.ownerId||actor,channel:lead.channel||'Direct',status:'Open',pipelineStage:'New',businessLine:'Corporate',activities:[],notes:'',createdAt:stamp(),contactName:lead.contactName||'',contactEmail:lead.contactEmail||'',contactPhone:lead.contactPhone||''};
    const d={case:c,company,records:{},documents:[],summary:{},demo:{createdLocally:true},demoHistory:[],template:(await fixture('cases__NB-2026-0022')).template};
    storage().cases[cid]=d;franchise(d);log(d,'Case created',company.registeredName);derive(d);return {caseId:cid};
  }
  const {d,r}=await locate(b);d.demo||={};let out={ok:true};
  if(name==='demo.advance') { await advance(d,b.step,meta);derive(d);return {caseId:d.case.id,next:d.summary.next,status:d.summary.status}; }
  if(name==='record.save') {
    need(r,'Record not found.');need(b.baseVersion==null||b.baseVersion===r.v,'This record changed in another view. Refresh before saving; your current edits have not been applied.');const fields=copy(b.changes||{});delete fields.id;delete fields.caseId;delete fields.type;change(r,fields);
    if(r.type==='franchise') { Object.assign(d.company,{registeredName:r.accountInfo.name,address:r.accountInfo.companyAddress,city:r.accountInfo.companyCity,province:r.accountInfo.companyProvince,region:r.accountInfo.companyRegion});Object.assign(d.case,{channel:r.otherInfo.businessSource,estHeadcount:r.otherInfo.employeeCount,targetEffectiveDate:r.otherInfo.targetEffectiveDate}); }
    log(d,'Saved '+r.type);derive(d);return {record:copy(r),warnings:[]};
  }
  const transitions={'franchise.submit':'Submitted','franchise.startReview':'Under Review','rateRequest.submit':'Submitted','rateRequest.startReview':'In Review','proposal.submit':'Sales Review','proposal.send':'Sent','sob.submitReview':'Sales Review','sob.codify':'Codified','account.submit':'For Approval','billing.submit':'For Approval','billing.complete':'Completed','commission.submit':'For Approval','coc.release':'Released'};
  if(transitions[name]) { need(r,'Record not found.');change(r,{status:transitions[name]}); }
  else if(name==='franchise.start') out.franchiseId=franchise(d).id;
  else if(name==='franchise.decide') { if(b.decision==='approve')await advance(d,'franchise_approve',meta);else change(r,{status:b.decision==='return'?'Returned':'Rejected',returnReason:b.remarks}); }
  else if(name==='franchise.setRequirement')r.requirements[b.key]={status:b.status,note:b.note,at:stamp(),by:actor};
  else if(name==='tor.create')out.id=(one(d,'tor')||record(d,'tor',{lines:[]})).id;
  else if(name==='rateRequest.create'){const rr=one(d,'rateRequest')||record(d,'rateRequest',{code:uid('RR'),status:'Draft',requestedPlans:'',paymentModes:[],clarifications:[],franchiseCode:one(d,'franchise').code});attachQuotationData(d,rr);out.id=rr.id;}
  else if(name==='rateSheet.issue')out.id=makeRates(d).id;
  else if(name==='proposal.create'||name==='sob.create') {makeOffer(d);out.id=one(d,name.split('.')[0]).id;}
  else if(['proposal.smDecision','proposal.seniorDecision','sob.salesReview','sob.validate'].includes(name)) {change(r,{status:b.decision==='approve'?(name==='proposal.smDecision'?'Senior Review':name==='sob.salesReview'?'Independent Validation':'Approved'):'Draft'});review(r,name);}
  else if(name==='proposal.accept')await advance(d,'proposal_accept',meta);
  else if(name==='proposal.revise'||name==='sob.amend') { const old=copy(r);(r.history||=[]).push({...old,history:[]});change(r,{status:'Draft',version:r.version+1,approvals:[],amendmentReason:b.reason}); }
  else if(name==='proposal.logRound')(r.rounds||=[]).push({...b,n:r.rounds.length+1,proposalVersion:r.version,byName:'Demo workspace',at:stamp()});
  else if(name==='proposal.reloadRates') {const rs=one(d,'rateSheet');change(r,{rateSheetId:rs.id,rateSheetVersion:rs.version,items:rs.rows.map(({rate,...x})=>({...x,actuarialRate:rate,proposedRate:rate}))});}
  else if(['proposal.generate','sob.generatePdf'].includes(name)) {const f=doc(d,r,name.startsWith('sob')?'sob_pdf':'proposal');change(r,{docId:f.id,docVersion:r.version});out.docId=f.id;}
  else if(name==='sob.recordSigned')change(r,{status:'Client Signed',signedDocId:b.docId});
  else if(name==='contract.request')out.id=makeContract(d,b).id;
  else if(name==='contract.advance'){change(r,{status:b.toStep});r.events.push({step:b.toStep,eventDate:b.eventDate||today(),byName:'Demo workspace (simulated)',at:stamp(),notes:b.notes||''});}
  else if(name==='kyc.recordResult')change(r,{status:b.status,externalRef:b.externalRef,checkDate:b.checkDate,checkerName:'Demo workspace—sample',simulated:true});
  else if(name==='account.create'){const a=makeAccount(d);out={accountId:a.id,accountCode:a.accountCode,maCode:a.maCode};}
  else if(['account.decide','billing.decide','commission.decide','coc.decide'].includes(name))change(r,{status:b.decision==='approve'?'Approved':'Returned',checkerId:'demo-review',returnReason:b.remarks||''});
  else if(name==='affiliate.add')out.id=makeAccount(d,{...b,parentId:one(d,'account').id}).id;
  else if(name==='affiliate.setSob')change(r,{sobMode:b.mode});
  else if(name==='planCode.generate')out=b.preview?{preview:planPreview(d,r),sobVersion:one(d,'sob').version}:{created:generate(d,r,b.select),failed:[]};
  else if(name==='planCode.sample')out={created:generate(d,one(d,'account')),failed:[]};
  else if(name==='planCode.create') {const a=(d.records.account||[]).find(x=>x.id===(b.fields.accountId||r?.id));need(a,'Choose an account in this case.');out.id=record(d,'planCode',{...b.fields,accountId:a.id,accountCode:a.accountCode,accountName:a.accountInfo.accountName,planCode:b.fields.planCode||uid('PC'),seriesId:uid('SERIES'),status:'Draft',pcVersion:1,makerId:actor,hospitalCodes:b.fields.hospitalCodes||[],clinicCodes:b.fields.clinicCodes||[]}).id;}
  else if(['planCode.clone','planCode.amend'].includes(name)) {
    const amendment=name.endsWith('amend'),target=(d.records.account||[]).find(x=>x.id===(b.targetAccountId||r.accountId));need(target,'Choose an account in this case.');
    if(amendment){need(r.status==='Approved','Only an approved Plan Code can be amended.');need(!(d.records.planCode||[]).some(x=>x.amendsId===r.id&&['Draft','Returned','For Approval'].includes(x.status)),'An amendment draft already exists for this code.');}
    const row=copy(r);delete row.id;delete row.createdAt;delete row.supersededBy;
    out.id=record(d,'planCode',{...row,status:'Draft',accountId:target.id,accountCode:target.accountCode,accountName:target.accountInfo.accountName,planCode:amendment?r.planCode:uid('PC'),seriesId:amendment?(r.seriesId||r.id):uid('SERIES'),amendsId:amendment?r.id:null,pcVersion:amendment?r.pcVersion+1:1,amendmentReason:b.reason||'',effectiveFrom:b.effectiveFrom||r.effectiveFrom,makerId:actor,checkerId:null}).id;
  }
  else if(['planCode.submit','planCode.decide','planCode.bulkUpdate'].includes(name)) {out={succeeded:[],failed:[]};for(const id of b.ids){const pc=(d.records.planCode||[]).find(x=>x.id===id);if(!pc){out.failed.push({id,message:'Code not in this case'});continue;}if(name==='planCode.decide'&&b.decision==='approve')approvePlan(d,pc);else change(pc,name.endsWith('bulkUpdate')?{[b.field]:b.value}:{status:name.endsWith('submit')?'For Approval':'Returned',returnReason:b.remarks});out.succeeded.push(id);}}
  else if(name==='planCode.delete')d.records.planCode=d.records.planCode.filter(x=>x.id!==r.id);
  else if(name==='case.closeLost'||name==='proposal.decline')change(d.case,{status:'Closed Lost',lostReason:b.reason||'Not proceeding'});
  else if(name==='case.routeIfg')change(d.case,{status:'Routed to IFG'});
  else if(name==='case.reopen')change(d.case,{status:'Open'});
  else if(name==='case.logActivity')d.case.activities.push({...b,at:stamp(),byName:'Demo workspace'});
  else if(name==='case.reassign')change(d.case,{ownerId:b.ownerId});
  else if(name==='case.delete'){db.deleted.push(d.case.id);delete db.cases[d.case.id];}
  else if(name==='activation.activate'){await advance(d,'activate',meta);out.status=one(d,'activation').status;}
  else if(name==='activation.completeHandover')await advance(d,'handover',meta);
  else if(name==='activation.ack')(r.acks||={})[b.team||'ccd']={status:'Acknowledged',byName:'Sample result',at:stamp()};
  else if(name==='onboarding.waive')r.items[b.key]={status:'Skipped for demo—not verified',note:b.reason};
  else if(name==='onboarding.revokeWaiver')delete r.items[b.key];
  else if(name==='billing.start')out.id=(one(d,'billing')||record(d,'billing',{status:'Draft',exceptions:[],makerId:actor,entity:d.company.registeredName,terms:'T+30',frequency:'Annual',billingType:'Corporate - one consolidated bill'})).id;
  else if(name==='billing.recordFirstPayment')change(r,{firstPaymentPosted:true,firstPayment:{...b,simulated:true}});
  else if(name==='coc.generate'){const x=one(d,'coc')||record(d,'coc',{status:'For Approval',basis:{},makerId:actor});x.docId=doc(d,x,'coc').id;}
  else if(name==='commission.create')out.id=(one(d,'commission')||record(d,'commission',{status:'Draft',percentage:0,basis:'Sample',makerId:actor})).id;
  else throw new DemoError('Use the next-step sample action for this demo. This detailed action is not available here; nothing was changed.');
  log(d,name);derive(d);return out;
}
async function mutate(p,b,q,raw) {
  db=null;storage();const before=copy(db),key=b?.idempotencyKey;
  if(key&&db.receipts[key])return copy(db.receipts[key]);
  try {
    let out;const meta=await fixture('meta');
    if(p.startsWith('action/'))out=await action(p.slice(7),b||{},meta);
    else if(p==='upload'){const d=await getCase(q.get('caseId')),r=records(d).find(x=>x.id===q.get('linkedId'));need(r,'Document record not found.');out={document:doc(d,r,q.get('slot'),raw?.name)};
      // #6 — uploading a quotation requirement (or the TOR file) auto-captures a ready
      // structured TOR and Member Data so the rate request can be created without the
      // user building either by hand.
      const slot=q.get('slot')||'';
      if((r.type==='franchise'&&slot.startsWith('req:'))||(r.type==='tor'&&slot==='tor_original')) captureQuotationData(d);
      log(d,'Sample document recorded','No real file stored in the demo.');}
    else if(p==='import/members'){const d=await getCase(q.get('caseId'));out={batch:sampleMembers(d,q.get('purpose')||'quotation'),autoMapped:true,elapsedMs:0};}
    else throw new DemoError('Use the sample package action in this hosted demo. Nothing was changed.');
    if(key){db.receipts[key]=copy(out);const ks=Object.keys(db.receipts);if(ks.length>150)delete db.receipts[ks[0]];}
    localStorage.setItem(KEY,JSON.stringify(db));return copy(out);
  }catch(e){db=before;if(e.name==='QuotaExceededError'||e.name==='SecurityError')throw new DemoError('The browser could not save this demo. Your form is still here. Allow site storage or free some space, then retry.');throw e;}
}
export async function demoApi(path,method='GET',body,raw) {
  const [p,qs='']=path.replace(/\/$/,'').split('?'),q=new URLSearchParams(qs);
  if(p==='login'){actor=body?.userId||'u-ad1';return {ok:true};}if(p==='logout'){actor='u-ad1';return {ok:true};}if(p==='me')return fixture('me__'+actor);
  if(p==='companies/search'||p==='companies/duplicates'){
    await queue;db=null;storage();
    const term=(q.get('q')||body?.newCompany?.registeredName||'').toLowerCase().trim(),rows=await allCases();
    const items=rows.filter(d=>[d.company.registeredName,d.company.tin,d.company.tradeName,d.case.id,one(d,'franchise')?.code,one(d,'account')?.accountCode].some(x=>String(x||'').toLowerCase().includes(term)))
      .map(d=>({company:copy(d.company),links:{cases:[{...copy(d.case),ownerName:'Sales'}],accounts:copy(d.records.account||[]),franchises:copy(d.records.franchise||[])},reasons:['Matching company']}));
    return p.endsWith('duplicates')?{matches:items}:{items};
  }
  if(method.toUpperCase()!=='GET'){const job=queue.then(()=>mutate(p,body,q,raw));queue=job.catch(()=>{});return job;}
  await queue;db=null;storage();
  if(p==='cases')return {items:(await allCases()).map(d=>copy(derive(d).summary))};
  if(p.startsWith('cases/')){const [,cid,sub]=p.split('/'),d=derive(await getCase(cid));if(!sub)return copy(d);
    if(sub==='history')return {history:copy(d.demoHistory||[]),items:copy(d.demoHistory||[])};if(sub==='notifications')return {notifications:copy(d.records.notification||[]),items:copy(d.records.notification||[])};
    if(sub==='plancodes'){const all=d.records.planCode||[],counts={};all.forEach(r=>counts[r.status]=(counts[r.status]||0)+1);const rows=all.filter(r=>(!q.get('status')?r.status!=='Superseded':r.status===q.get('status'))&&(!q.get('account')||r.accountId===q.get('account'))&&(!q.get('q')||JSON.stringify(r).toLowerCase().includes(q.get('q').toLowerCase())));return {items:copy(rows.slice(Number(q.get('offset')||0),Number(q.get('offset')||0)+Number(q.get('limit')||50))),total:rows.length,counts};}}
  if(p.startsWith('documents/')){const id=decodeURIComponent(p.split('/')[1]);for(const d of await allCases()){const doc=(d.documents||[]).find(x=>x.id===id);if(doc)return {document:copy(doc),company:d.company.registeredName,caseId:d.case.id};}throw new DemoError('This sample has no stored file. Use the case summary to review its details.',404);}
  if(p.startsWith('records/')){const id=decodeURIComponent(p.slice(8));for(const d of await allCases()){const r=records(d).find(r=>r.id===id);if(r)return {record:copy(r),history:copy(d.demoHistory||[])};}}
  if(p==='tasks'){const items=(await allCases()).flatMap(d=>derive(d).summary.tasks);return {items,groups:[],total:items.length};}
  if(p==='accounts')return {items:(await allCases()).flatMap(d=>copy(d.records.account||[]))};
  if(p.startsWith('members/'))return {items:[],rows:[],total:0,errors:[],columns:[],groups:[]};
  return (await fixture(p.replace(/\//g,'__')))||{items:[],rows:[],history:[],notifications:[],groups:[],cols:[],results:[],total:0};
}
