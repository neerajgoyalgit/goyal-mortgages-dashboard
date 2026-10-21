import { createClient } from '@supabase/supabase-js';
import './style.css';
const url=import.meta.env.VITE_SUPABASE_URL;
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase=url&&key?createClient(url,key):null;
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:0}).format(n);
let rates=[],history=[],session=null,tab='public',sort='rate';
function repayment(principal,annual,years){let r=annual/1200,n=years*12;return r?principal*r/(1-Math.pow(1+r,-n)):principal/n}
function kind(p){return /tracker/i.test(p)?'Tracker':/fixed/i.test(p)?'Fixed':'Other'}
function shell(){ $('#app').innerHTML=`<header><div class="nav"><div class="brand"><div class="mark">GM</div><div><strong>GOYAL MORTGAGES</strong><small>Making mortgages clearer</small></div></div><nav><button id="publicNav" class="navlink">Compare rates</button><button id="valuationNav" class="navlink">E16 LTV calculator</button><button id="adminNav" class="navlink">Admin</button></nav></div></header><main id="main"></main><footer><div><strong>Goyal Mortgages</strong><p>For information only. Rates may change and are not guaranteed. Eligibility, lending criteria, fees and affordability checks apply. APRC and full product terms are not yet available in this comparison.</p><p>Your home may be repossessed if you do not keep up repayments on your mortgage.</p><p>Regulatory status and required firm disclosures must be verified before public launch. This site does not currently provide personalised mortgage advice.</p></div></footer>`;$('#publicNav').onclick=()=>{tab='public';render()};$('#adminNav').onclick=()=>{tab='admin';render()};$('#valuationNav').onclick=()=>{tab='valuation';render()}}
function render(){document.querySelectorAll('.navlink').forEach(x=>x.classList.toggle('active',(x.id==='adminNav')===(tab==='admin')));tab==='admin'?renderAdmin():tab==='valuation'?renderValuation():renderPublic()}
function mortgagePurpose(x){return x.mortgage_purpose==='remortgage'?'remortgage':x.mortgage_purpose==='purchase'||(x.mortgage_purpose==null&&String(x.scenario_key||'').startsWith('purchase_'))?'purchase':'unknown'}
function eligibleRates(purpose,ltv,type='All'){
  const candidates=rates.filter(x=>mortgagePurpose(x)===purpose&&(type==='All'||kind(x.product_name)===type)&&Number(x.ltv_percent)>=ltv);
  // One observation per lender/product at the smallest sampled LTV ceiling that covers this case.
  const best=new Map();
  for(const x of candidates){const k=[x.lender,x.product_name,x.scenario_key].join('|');if(!best.has(k)||Number(x.ltv_percent)<Number(best.get(k).ltv_percent))best.set(k,x)}
  return [...best.values()];
}
function initialCost(loan,rate,term,months,fee,cashback){
  if(!Number.isFinite(months)||months<=0||months>term*12)return null;
  const payment=repayment(loan,rate,term);let balance=loan,interest=0;
  for(let i=0;i<months;i++){const charged=balance*(rate/1200);interest+=charged;balance=Math.max(0,balance+charged-payment)}
  return {payment,interest,remaining:balance,net:interest+fee-cashback};
}
function renderPublic(){
 const newest=rates.reduce((v,x)=>x.observed_at>v?x.observed_at:v,'');
 $('#main').innerHTML=`<section class="hero"><div class="eyebrow">UK MORTGAGE RATE COMPARISON</div><h1>Find clarity in your<br><em>mortgage options.</em></h1><p>Compare stored purchase and remortgage observations, fees and indicative repayment costs.</p><div class="hero-actions"><a href="#compare" class="primary">Explore mortgage rates →</a><span>Illustrative data · Not verified live lender quotations</span></div></section>
 <section class="stats"><div class="stat"><span>Purchase observations</span><b>${rates.filter(x=>mortgagePurpose(x)==='purchase').length}</b></div><div class="stat"><span>Remortgage observations</span><b>${rates.filter(x=>mortgagePurpose(x)==='remortgage').length}</b></div><div class="stat"><span>Products in database</span><b>${rates.length}</b><small>${new Set(rates.map(x=>x.lender)).size} lender(s) represented</small></div><div class="stat"><span>Last observed</span><b class="date">${newest?new Date(newest).toLocaleDateString('en-GB'):'—'}</b><small>Not a live quote</small></div></section>
 <section id="compare" class="section"><div class="section-top"><div><div class="eyebrow">EXPLORE YOUR OPTIONS</div><h2>Compare mortgage rates</h2><p>Choose your purpose and mortgage details. Results use recorded illustrative lender scenarios, not a new quote.</p></div></div>
 <div class="filters">
 <label>Mortgage purpose<select id="purpose"><option value="remortgage">Remortgage</option><option value="purchase">Purchase</option></select></label>
 <label>Property value (£)<input id="value" type="number" min="1" value="400000"/></label>
 <label id="amountLabel"><span id="amountTitle">Outstanding mortgage (£)</span><input id="deposit" type="number" min="0" value="240000"/></label>
 <label>Mortgage term (years)<input id="term" type="number" min="1" max="40" value="30"/></label>
 <label>Rate type<select id="type"><option value="All">All types</option><option value="Fixed">Fixed</option><option value="Tracker">Tracker</option></select></label></div>
 <div class="resultbar"><span id="summary" role="status"></span><label>Sort by <select id="sort"><option value="rate">Lowest rate</option><option value="payment">Lowest monthly payment</option><option value="fee">Lowest fee</option><option value="cost">Lowest estimated initial-period cost*</option></select></label></div>
 <div id="results" class="products"></div></section>
 <section class="notice"><h3>Important information</h3><p>These are unverified, historic, illustrative Nationwide observations sampled using a £400,000 property and 30-year repayment scenario. LTV bands are sampled and do not establish exact lender eligibility thresholds. Calculations for other values and terms are estimates only, not new lender quotations. Tracker rates and payments can change. APRC, eligibility, early repayment charges, incentives and complete lender fees have not been verified. *Initial-period cost is interest paid plus known product fee minus recorded cashback, excluding principal repaid, and assumes a constant initial rate; compare different deal lengths with care. This is not a whole-of-market comparison or personalised advice.</p></section>`;
 const changePurpose=()=>{const isRemortgage=$('#purpose').value==='remortgage';$('#amountTitle').textContent=isRemortgage?'Outstanding mortgage (£)':'Deposit (£)';$('#deposit').value=isRemortgage?'240000':'100000';showResults()};
 $('#purpose').addEventListener('change',changePurpose);
 ['value','deposit','term','type','sort'].forEach(id=>$('#'+id).addEventListener('input',showResults));
 showResults();
}
function showResults(){
 const value=Number($('#value').value),amount=Number($('#deposit').value),term=Number($('#term').value),purpose=$('#purpose').value,type=$('#type').value;
 const loan=purpose==='remortgage'?amount:value-amount;
 if(!(value>0&&amount>=0&&amount<value&&loan>0&&term>=1&&term<=40)){
   $('#summary').textContent='Enter a valid property value, mortgage amount/deposit and term.';$('#results').innerHTML='';return;
 }
 const ltv=100*loan/value;
 const rows=eligibleRates(purpose,ltv,type);
 const metrics=x=>initialCost(loan,Number(x.rate_percent),term,Number(x.initial_period_months),Number(x.product_fee_gbp||0),Number(x.cashback_gbp||0));
 const sorter=$('#sort').value;
 rows.sort((a,b)=>{
   const v=x=>sorter==='fee'?Number(x.product_fee_gbp??Infinity):sorter==='payment'?repayment(loan,Number(x.rate_percent),term):sorter==='cost'?(metrics(x)?.net??Infinity):Number(x.rate_percent);
   return v(a)-v(b);
 });
 $('#summary').textContent=`${rows.length} illustrative product categories · ${ltv.toFixed(1)}% LTV · ${money(loan)} loan · ${purpose==='purchase'?'Purchase':'Remortgage'}`;
 $('#results').innerHTML=rows.length?rows.map(x=>{
   const rate=Number(x.rate_percent),fee=x.product_fee_gbp==null?null:Number(x.product_fee_gbp),months=Number(x.initial_period_months);
   const cost=fee==null?null:metrics(x);
   const tracker=kind(x.product_name)==='Tracker';
   return `<article class="product"><div><div class="lender">${esc(x.lender)}</div><h3>${esc(x.product_name)}</h3><span class="pill">${kind(x.product_name)}</span> <span class="muted">Sampled ${Number(x.ltv_percent)}% LTV · ${esc(purpose)} · ${esc(x.product_status||'unverified')}</span></div>
   <div><span class="muted">Recorded initial rate</span><div class="rate">${rate.toFixed(2)}%</div><small>${tracker?'Variable tracker':'Fixed initial rate'}</small></div>
   <div><span class="muted">Estimated monthly</span><div class="payment">${money(repayment(loan,rate,term))}</div><small>Assumes constant initial rate</small></div>
   <div><span class="muted">Recorded product fee</span><div class="payment">${fee===null?'Unknown':money(fee)}</div><small>${months?months+'-month initial period':'Deal duration unknown'}</small></div>
   <div><span class="muted">Estimated initial-period cost*</span><div class="payment">${cost?money(cost.net):'Unavailable'}</div><small>${cost?money(cost.interest)+' interest + fee − recorded cashback':'Insufficient data'} · Observed ${x.observed_at?new Date(x.observed_at).toLocaleDateString('en-GB'):'unknown'}</small></div></article>`;
 }).join(''):'<div class="empty">No stored observations match this purpose and sampled LTV. This is not a whole-of-market search.</div>';
}
async function renderAdmin(){if(!supabase){$('#main').innerHTML='<section class="section"><h2>Admin configuration required</h2><p>Add the Supabase URL and publishable key to your environment settings.</p></section>';return}if(!session){$('#main').innerHTML=`<section class="login"><div class="eyebrow">PRIVATE ACCESS</div><h2>Admin sign in</h2><p>Only authorised administrators can manage mortgage-rate records.</p><form id="login"><label>Email<input type="email" id="email" required/></label><label>Password<input type="password" id="password" required/></label><button class="primary" type="submit">Sign in</button><p id="loginError" role="alert"></p></form></section>`;$('#login').onsubmit=async e=>{e.preventDefault();let {error}=await supabase.auth.signInWithPassword({email:$('#email').value,password:$('#password').value});if(error)$('#loginError').textContent=error.message;else{session=(await supabase.auth.getSession()).data.session;renderAdmin()}};return}let {data:{user}}=await supabase.auth.getUser();let {data:admin}=await supabase.from('dashboard_admins').select('user_id').eq('user_id',user?.id||'').maybeSingle();if(!admin){$('#main').innerHTML='<section class="section"><h2>Access restricted</h2><p>Your account is authenticated but has not been granted dashboard administrator access.</p><button id="logout" class="secondary">Sign out</button></section>';$('#logout').onclick=logout;return}$('#main').innerHTML=`<section class="section"><div class="adminhead"><div><div class="eyebrow">ADMIN CONSOLE</div><h2>Rate management</h2><p>Signed in as ${esc(user.email)}</p></div><button id="logout" class="secondary">Sign out</button></div><div class="stats adminstats"><div class="stat"><span>Current products</span><b>${rates.length}</b></div><div class="stat"><span>History records</span><b>${history.length}</b></div></div><h3>Add a mortgage rate</h3><form id="add" class="adminform"><label>Lender<input name="lender" required/></label><label>Product name<input name="product_name" required/></label><label>Scenario key<input name="scenario_key" value="purchase_400000_30y_repayment" required/></label><label>LTV %<input name="ltv_percent" type="number" min="1" max="100" step="0.01" required/></label><label>Rate %<input name="rate_percent" type="number" min="0" step="0.0001" required/></label><label>Product fee £<input name="product_fee_gbp" type="number" min="0" step="0.01"/></label><button class="primary" type="submit">Add rate</button><p id="addStatus" role="status"></p></form><h3>Stored products</h3><div class="adminrows">${rates.map(x=>`<div class="adminrow"><span>${esc(x.lender)} · ${esc(x.product_name)} · ${Number(x.ltv_percent)}% LTV</span><strong>${Number(x.rate_percent).toFixed(2)}%</strong></div>`).join('')}</div></section>`;await showRenewalDashboard();$('#logout').onclick=logout;$('#add').onsubmit=async e=>{e.preventDefault();let f=new FormData(e.target),payload=Object.fromEntries(f);for(let k of ['ltv_percent','rate_percent','product_fee_gbp'])payload[k]=payload[k]===''?null:Number(payload[k]);let {error}=await supabase.from('mortgage_rates').insert(payload);$('#addStatus').textContent=error?'Could not save: '+error.message:'Rate saved';if(!error){await load();renderAdmin()}}}
async function logout(){await supabase.auth.signOut();session=null;renderAdmin()}
async function load(){if(!supabase)return;let [r,h]=await Promise.all([supabase.from('mortgage_rates').select('*').order('rate_percent'),supabase.from('mortgage_rate_history').select('id',{count:'exact',head:true})]);if(r.error){$('#main').innerHTML=`<section class="section"><h2>Unable to load mortgage rates</h2><p>${esc(r.error.message)}</p></section>`;return}rates=r.data||[];history=Array.from({length:h.count||0});}
async function init(){shell();if(supabase){session=(await supabase.auth.getSession()).data.session;await load()}render();if(!supabase){$('#main').insertAdjacentHTML('afterbegin','<div class="config">Connect Supabase by setting VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.</div>')}}init();

function renderValuation(){
  $('#main').innerHTML=`<section class="section"><div class="eyebrow">E16 PILOT</div><h2>Property value & LTV calculator</h2>
  <p>For E16 properties only. Enter your own estimated property value and outstanding mortgage balance. Select your address to retrieve an indicative automated valuation, or enter your own estimate.</p>
  <div class="filters ltv-fields">
  <label>Postcode<input id="e16postcode" placeholder="E16 2AL" maxlength="10" autocomplete="postal-code" /></label>
  <div class="address-lookup" style="grid-column:1/-1;display:flex;gap:12px;align-items:end;flex-wrap:wrap">
    <button id="findE16Address" class="primary" type="button">Find my address</button>
    <span id="e16addressStatus" role="status" aria-live="polite">Enter your postcode and find your address.</span>
  </div>
  <label style="grid-column:1/-1">Select your property<select id="e16address" disabled><option value="">Find addresses first</option></select></label>
  <p id="e16selected" class="muted" style="grid-column:1/-1" aria-live="polite"></p><p id="e16valuationStatus" class="muted" style="grid-column:1/-1" role="status" aria-live="polite">Select an address to request a valuation.</p>
  <label>Estimated property value (£)<input id="e16value" type="number" min="1" value="500000" /></label>
  <label>Mortgage outstanding (£)<input id="e16balance" type="number" min="0" value="320000" /></label>
  <label>Remaining term (years)<input id="e16term" type="number" min="1" max="40" value="25" /></label>
  </div><div id="e16output" class="notice" aria-live="polite"></div>
  <h3>Matching recorded mortgage products</h3><div id="e16matches" class="products"></div>
  <p class="muted">Indicative only. Matching rates are unverified illustrative remortgage observations, not personalised lender quotations. Lender valuations, fees, eligibility and early repayment charges may differ. No customer details are stored by this calculator.</p></section>`;
  ['e16postcode','e16value','e16balance','e16term'].forEach(id=>$('#'+id).addEventListener('input',updateValuation));
  $('#findE16Address').addEventListener('click',findE16Addresses);
  $('#e16address').addEventListener('change',async()=>{
    const selected=$('#e16address').selectedOptions[0];
    const uprn=selected?.value||'';
    $('#e16selected').textContent=uprn ? `Selected: ${selected.textContent} · UPRN: ${uprn}` : '';
    const request=++e16ValuationRequest;
    const status=$('#e16valuationStatus');
    if(!uprn){status.textContent='Select an address to request a valuation.';return;}
    status.textContent='Retrieving indicative property valuation…';
    try{
      const response=await fetch(`/api/valuation?uprn=${encodeURIComponent(uprn)}`,{headers:{Accept:'application/json'}});
      const data=await response.json();
      if(request!==e16ValuationRequest)return;
      if(!response.ok)throw new Error(data.error||'Valuation unavailable.');
      const value=Number(data?.property?.value?.sale?.property_value);
      if(!Number.isFinite(value)||value<=0)throw new Error('No valuation available for this property.');
      $('#e16value').value=String(value);
      status.textContent=`Chimnie indicative valuation: ${money(value)}. You can adjust this estimate manually.`;
      updateValuation();
    }catch(error){
      if(request===e16ValuationRequest)status.textContent=`${error.message||'Valuation unavailable.'} Enter your own estimated value below.`;
    }
  });
  $('#e16postcode').addEventListener('input',()=>{
    e16LookupRequest++;
    e16ValuationRequest++;
    const select=$('#e16address');
    select.replaceChildren(new Option('Find addresses first',''));
    select.disabled=true;
    $('#e16selected').textContent='';
    $('#e16valuationStatus').textContent='Select an address to request a valuation.';
    $('#e16addressStatus').textContent='Click Find my address to search.';
    $('#findE16Address').disabled=false;
  });
  updateValuation();
}
let e16LookupRequest=0;
let e16ValuationRequest=0;
async function findE16Addresses(){
  const postcode=$('#e16postcode').value.trim().toUpperCase().replace(/\s+/g,'');
  const status=$('#e16addressStatus');
  const select=$('#e16address');
  const button=$('#findE16Address');
  select.replaceChildren(new Option('Select your property',''));
  select.disabled=true;
  $('#e16selected').textContent='';
  e16ValuationRequest++;
  $('#e16valuationStatus').textContent='Select an address to request a valuation.';
  if(!/^E16[0-9][A-Z]{2}$/.test(postcode)){
    status.textContent='Please enter a complete E16 postcode, for example E16 2AL.';
    return;
  }
  const request=++e16LookupRequest;
  button.disabled=true;
  status.textContent='Looking up addresses…';
  try{
    const response=await fetch(`/api/addresses?postcode=${encodeURIComponent(postcode)}`,{headers:{Accept:'application/json'}});
    const data=await response.json();
    if(request!==e16LookupRequest)return;
    if(!response.ok)throw new Error(data.error||'Address lookup unavailable.');
    const addresses=Array.isArray(data.addresses)?data.addresses:[];
    for(const item of addresses){
      if(!item.address)continue;
      select.add(new Option(item.address,String(item.uprn||'')));
    }
    select.disabled=select.options.length<=1;
    status.textContent=`${select.options.length-1} addresses found. Please select your exact property.`;
  }catch(error){
    if(request===e16LookupRequest)status.textContent=error.message||'Address lookup failed. Please try again.';
  }finally{
    if(request===e16LookupRequest)button.disabled=false;
  }
}

function updateValuation(){
  const postcode=$('#e16postcode').value.trim().toUpperCase().replace(/\s+/g,'');
  const value=Number($('#e16value').value), balance=Number($('#e16balance').value), term=Number($('#e16term').value);
  const out=$('#e16output'), matches=$('#e16matches');
  if(!/^E16[0-9][A-Z0-9]{2}$/.test(postcode)){
    out.textContent='Enter a complete E16 postcode (for example E16 1AA).';
    matches.innerHTML=''; return;
  }
  if(!(value>0 && balance>0 && balance<=value && term>=1 && term<=40)){
    out.textContent='Enter a valid property value, outstanding balance and mortgage term.';
    matches.innerHTML=''; return;
  }
  const ltv=100*balance/value;
  const band=[60,65,70,75,80,85,90,95,100].find(n=>ltv<=n);
  out.innerHTML=`<h3>Your indicative LTV: ${ltv.toFixed(1)}%</h3><p>Mortgage balance: ${money(balance)} · Estimated property value: ${money(value)} · Next standard LTV ceiling: ${band||'over 100'}%</p>`;
  const rows=eligibleRates('remortgage',ltv).sort((a,b)=>Number(a.rate_percent)-Number(b.rate_percent)).slice(0,8);
  matches.innerHTML=rows.length?rows.map(x=>`<article class="product"><div><div class="lender">${esc(x.lender)}</div><h3>${esc(x.product_name)}</h3><span class="muted">Illustrative remortgage observation · sampled ${Number(x.ltv_percent)}% LTV</span></div><div><span class="muted">Recorded rate</span><div class="rate">${Number(x.rate_percent).toFixed(2)}%</div></div><div><span class="muted">Illustrative monthly repayment</span><div class="payment">${money(repayment(balance,Number(x.rate_percent),term))}</div></div><div><span class="muted">Product fee</span><div class="payment">${money(Number(x.product_fee_gbp||0))}</div></div></article>`).join(''):'<div class="empty">No recorded products match this LTV. This is not a whole-of-market comparison.</div>';
}

async function showRenewalDashboard(){
  const section=document.createElement('section');
  section.className='renewal-panel';
  section.innerHTML=`<h3>E16 renewal opportunity finder</h3><p>Hypothetical renewal dates derived from Land Registry purchase dates. Not verified mortgages, customers or expiry dates.</p><label>Assumed fixed term <select id="renewalTerm"><option value="2">2 years</option><option value="5">5 years</option></select></label><p id="renewalStatus" role="status">Loading private E16 data…</p><div id="renewalChart"></div>`;
  $('#main .section').appendChild(section);
  async function refresh(){
    const years=Number($('#renewalTerm').value);
    const {data,error}=await supabase.from('e16_property_sales').select('transfer_date');
    if(error){$('#renewalStatus').textContent='Unable to load E16 data: '+error.message;return;}
    if(!data?.length){$('#renewalStatus').textContent='No accessible E16 sales found. Check the admin RLS policy.';return;}
    const months=new Map();
    for(const sale of data){const d=new Date(sale.transfer_date+'T12:00:00Z');d.setUTCFullYear(d.getUTCFullYear()+years);const key=d.toISOString().slice(0,7);months.set(key,(months.get(key)||0)+1)}
    const rows=[...months].sort(([a],[b])=>a.localeCompare(b));
    $('#renewalStatus').textContent=`${data.length} recorded purchases · assumed ${years}-year fixed term`;
    const max=Math.max(...rows.map(([,n])=>n));
    $('#renewalChart').innerHTML=rows.map(([m,n])=>`<div class="renewal-row"><span>${esc(m)}</span><div class="renewal-track"><div class="renewal-fill" style="width:${100*n/max}%"></div></div><strong>${n}</strong></div>`).join('');
  }
  $('#renewalTerm').onchange=refresh;
  await refresh();
}
