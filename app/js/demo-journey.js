import {html,raw,api,act,go,flushForms,disposeForms,dialog,money,fmtDate,toast,showError} from './core.js';

const one=(d,k)=>(d.records[k]||[])[0];
export function demoNextCard(ctx) {
  const n=ctx.data.summary.next;
  if(!n) return html`<div class="rec-next done"><div><b>${ctx.data.summary.status==='Handover Complete'?'Demo handover complete':ctx.data.summary.status}</b><p>This case is saved in this browser.</p></div><a class="btn" href="#/new-business">Back to New Business</a></div>`;
  return html`<section class="rec-next" aria-label="Next step"><div class="rn-main"><span class="eyebrow">Your next step · ${n.department}</span><b>${n.title}</b><span class="rn-why">${n.why}</span><span class="tiny">Demo workspace · saved in this browser · sample outcomes are not real approvals</span></div><div class="rn-act"><button class="btn primary" id="demoNext">${n.button}</button></div></section>`;
}
export async function wireDemoNext(ctx) {
  const b=ctx.main.querySelector('#demoNext');if(!b)return;
  const n=ctx.data.summary.next;
  b.onclick=async()=>{
    if(b.disabled)return;
    // Viewing a past/future work area is allowed, but its button must not
    // silently advance another area the user has not reviewed.
    if(ctx.step!==n.link.split('/')[3]){go(n.link);return;}
    try {
    if(!(await flushForms()))return;
    if(n.key==='plans_generate') {
      const a=one(ctx.data,'account');const pv=await api('action/planCode.generate',{method:'POST',body:{accountId:a.id,preview:true}});
      const answer=await dialog({title:'Review Plan Codes before creating',wide:true,body:html`<p>One code for each plan and member type. These codes belong only to ${ctx.data.summary.company}.</p><div class="tbl-wrap mt"><table class="tbl"><thead><tr><th>Plan / member</th><th>Room</th><th>MBL</th><th>Fee</th></tr></thead><tbody>${pv.preview.map(x=>html`<tr><td>${x._label}</td><td>${x.roomType}</td><td>${money(x.mbl)}</td><td>${money(x.premium)}</td></tr>`)}</tbody></table></div><p class="tiny mt">Sample commercial terms—not an official quotation.</p>`,actions:[{label:'Cancel'},{label:'Create Plan Codes & continue',kind:'primary',value:'create'}]});
      if(answer?.action!=='create')return;
    }
    const out=await act('demo.advance',{caseId:ctx.id,step:n.key},{button:b,quiet:true});if(!out)return;
    disposeForms();
    toast(n.key==='account_create'?'Account created successfully—demo.':n.key==='activate'&&out.status==='Scheduled'?'Activation scheduled—demo.':(n.key==='activate'||n.key==='scheduled')?'Account activated successfully—demo.':n.key==='handover'?'Handover complete—demo.':'Saved. Continue with the next step.','ok');
    const destination=out.next?.link||`#/case/${ctx.id}/activation/activation`;
    if(location.hash===destination)await ctx.reload();else go(destination);
    window.dispatchEvent(new Event('hms:changed'));
    if(['account_create','activate','scheduled','handover'].includes(n.key)) {
      // Shown only following a successful transition, never on a normal page load.
      await dialog({title:n.key==='account_create'?'Account created successfully':out.status==='Scheduled'?'Activation scheduled':n.key==='handover'?'Handover complete':'Account activated successfully—demo',
        body:html`<div class="demo-success" aria-hidden="true">✓</div><p>${ctx.data.summary.company}</p><p>${n.key==='account_create'?'Next: review the account and prepare Plan Codes.':out.status==='Scheduled'?'The account is ready for its future effective date.':'This result is simulated and saved in this browser.'}</p>`,actions:[{label:out.next?'Continue':'View completed case',value:'ok',kind:'primary'}]});
    }
    } catch(e) {showError(e);}
  };
  if(ctx.step!==n.link.split('/')[3])b.textContent='Go to current step';
}

export async function renderDemoSections(ctx,sections,anchor) {
  const d=ctx.data,fr=one(d,'franchise'),rr=one(d,'rateRequest'),rs=one(d,'rateSheet'),p=one(d,'proposal'),sob=one(d,'sob'),acc=one(d,'account'),ac=one(d,'activation');
  const rows=[['Company',d.company.registeredName],['Business source',d.case.channel],['Principals / dependents',`${fr?.otherInfo.employeeCount||0} / ${fr?.otherInfo.dependentCount||0}`],['Effective date',fmtDate(d.summary.effectivity)||'Use sample date'],['Product',fr?.accountInfo.accountType||'Not set'],['Account',acc?.accountCode||'Created after contracting']];
  const rates=p?.items||rs?.rows||[];
  const current=sections.find(x=>'sec-'+x.id===anchor)||sections.find(x=>d.summary.next?.link.endsWith('/'+x.id))||sections[0];
  // Which detail editors are expanded is remembered per work area, so an action that
  // reloads the case in place (e.g. adding a sample document) no longer collapses the
  // panel you were working in or scrolls you to the top. The first time you enter a
  // work area, the current actionable section is opened for you so its form is ready
  // without an extra click.
  const okey=`hms3:demo-open:${ctx.id}::${ctx.step}`;
  let openPref;try{openPref=JSON.parse(sessionStorage.getItem(okey)||'null');}catch(e){openPref=null;}
  if(!Array.isArray(openPref))openPref=current?[current.id]:[];
  const openSet=new Set(openPref.filter(id=>sections.some(x=>x.id===id)));
  const persistOpen=()=>{try{sessionStorage.setItem(okey,JSON.stringify([...openSet]));}catch(e){}};
  ctx.el.innerHTML=html`<section class="panel"><div class="ph"><h2>Review ${ctx.step==='franchise'?'franchise':ctx.step==='quotation'?'quotation':ctx.step==='offer'?'offer':ctx.step==='account'?'account setup':'activation'} details</h2></div><div class="pb"><dl class="dl">${rows.map(([label,value])=>html`<div><dt>${label}</dt><dd>${value}</dd></div>`)}</dl>
    ${ctx.step==='quotation'?html`<p class="mt"><b>Requirements:</b> ${d.demo.requirementsReady?'Sample quotation package ready—not verified':'Optional real uploads; use the sample package to continue.'}</p><p><b>Rate request:</b> ${rr?.status||'Not started'}</p>`:''}
    ${['quotation','offer'].includes(ctx.step)&&rates.length?html`<div class="tbl-wrap mt"><table class="tbl"><caption class="tiny">Sample commercial terms—not an official quotation</caption><thead><tr><th>Plan</th><th>Member type</th><th>MBL</th><th>Fee</th><th>Frequency</th></tr></thead><tbody>${rates.map(x=>html`<tr><td>${x.plan}</td><td>${x.memberType}</td><td>${money(x.mbl)}</td><td>${money(x.proposedRate??x.rate)}</td><td>${x.paymentMode}</td></tr>`)}</tbody></table></div>`:''}
    ${ctx.step==='offer'?html`<p class="mt"><b>Proposal:</b> ${p?`v${p.version} · ${p.status}`:'Not started'} · <b>SOB:</b> ${sob?`v${sob.version} · ${sob.status}`:'Not started'}</p>${sob?html`<div class="tbl-wrap"><table class="tbl"><caption>Benefits from the standard template</caption><thead><tr><th>Benefit</th><th>Coverage</th><th>Inner limit</th></tr></thead><tbody>${sob.lines.map(l=>html`<tr><td>${l.subcategory||l.service}</td><td>${l.percentage?l.percentage+'% of MBL':l.benefitLimit}</td><td>${money(l.innerLimit)||'—'}</td></tr>`)}</tbody></table></div>`:''}`:''}
    ${ctx.step==='account'?html`<p class="mt"><b>Contract:</b> ${one(d,'contract')?.status||'Not requested'} · <b>KYC:</b> ${one(d,'kyc')?.status||'Not started'}</p><p><b>Account:</b> ${acc?.status||'Not created'} · <b>Plan Codes:</b> ${(d.records.planCode||[]).filter(x=>x.status!=='Superseded').length}</p><p class="tiny">Real onboarding documents: skipped for demo—not verified. Sample reviews remain labelled in History.</p>`:''}
    ${ctx.step==='activation'?html`<ul class="demo-checks">${d.readiness.map(g=>html`<li><span aria-hidden="true">${g.ok?'✓':'○'}</span> ${g.label}: ${g.ok?'sample milestone recorded':'next in the demo'}</li>`)}</ul><p><b>Coverage:</b> ${ac?.status==='Handover Complete'?'Active':ac?.status||'Not activated'} ${ac?.simulatedDate?`· Effective date simulated: ${ac.simulatedDate}`:''}</p><p class="tiny">Billing setup is separate from payment. No real policies, cards or external notifications are issued.</p>`:''}
    </div></section><div class="demo-detail-list">${sections.map(x=>html`<details class="panel demo-detail" data-section="${x.id}" ${openSet.has(x.id)?raw('open'):''}><summary>${x.id===current?.id?'Edit / inspect current details: ':''}${x.label}</summary><div class="pb" id="sec-${x.id}"></div></details>`)}</div><p class="tiny">${d.summary.next?'Use the next-step button above to continue forward. ':''}Expand a detail section only when you need to edit or inspect it.</p>`.s;
  // Detail editors are existing HMS forms, loaded only when deliberately opened.
  // This avoids hidden forms fighting over drafts and jumping to another tab.
  const mountSection=async details=>{
    if(details.dataset.mounted)return;details.dataset.mounted='1';
    const section=sections.find(x=>x.id===details.dataset.section),body=details.querySelector('.pb');
    try {await section.load({...ctx,el:body,body});}
    catch(e){delete details.dataset.mounted;body.innerHTML=html`<div class="note" role="alert">These details could not load. Your saved case is unchanged. ${e.message}</div>`.s;console.error('Demo section',section.id,e);}
  };
  ctx.el.querySelectorAll('[data-section]').forEach(details=>{
    details.addEventListener('toggle',async()=>{
      // Remember what's open so the next in-place reload restores this exact layout.
      if(details.open)openSet.add(details.dataset.section);else openSet.delete(details.dataset.section);
      persistOpen();
      if(details.open)await mountSection(details);
    });
    // Sections that start open (restored or the current actionable one) load now.
    if(details.open)mountSection(details);
  });
  // A URL to a specific editor is still useful, but routine forward navigation
  // keeps the compact view. Users choose to expand, and saving never advances.
}
