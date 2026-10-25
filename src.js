
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

function shell(){ $('#app').innerHTML=`<header><div class="nav"><div class="brand"><div class="mark">GM</div><div><strong>GOYAL MORTGAGES</strong><small>Making mortgages clearer</small></div></div><nav><button id="publicNav" class="navlink">Compare rates</button><button id="valuationNav" class="navlink">E16 LTV calculator</button><button id="alertsNav" class="navlink">Mortgage alerts</button><button id="adminNav" class="navlink">Admin</button></nav></div></header><main id="main"></main><footer><div><strong>Goyal Mortgages</strong><p>For information only. Rates may change and are not guaranteed. Eligibility, lending criteria, fees and affordability checks apply. APRC and full product terms are not yet available in this comparison.</p><p>Your home may be repossessed if you do not keep up repayments on your mortgage.</p><p>Regulatory status and required firm disclosures must be verified before public launch. This site does not currently provide personalised mortgage advice.</p></div></footer>`;$('#publicNav').onclick=()=>{tab='public';render()};$('#adminNav').onclick=()=>{tab='admin';render()};$('#valuationNav').onclick=()=>{tab='valuation';render()};$('#alertsNav').onclick=()=>{tab='alerts';render()}}

function render(){const ids={public:'publicNav',valuation:'valuationNav',alerts:'alertsNav',admin:'adminNav'};document.querySelectorAll('.navlink').forEach(x=>x.classList.toggle('active',x.id===ids[tab]));tab==='admin'?renderAdmin():tab==='valuation'?renderValuation():tab==='alerts'?renderAlerts():renderPublic()}

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

 <div class="filters compare-filters">

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

async function renderAdmin(){if(!supabase){$('#main').innerHTML='<section class="section"><h2>Admin configuration required</h2><p>Add the Supabase URL and publishable key to your environment settings.</p></section>';return}if(!session){$('#main').innerHTML=`<section class="login"><div class="eyebrow">PRIVATE ACCESS</div><h2>Admin sign in</h2><p>Only authorised administrators can manage mortgage-rate records.</p><form id="login"><label>Email<input type="email" id="email" required/></label><label>Password<input type="password" id="password" required/></label><button class="primary" type="submit">Sign in</button><p id="loginError" role="alert"></p></form></section>`;$('#login').onsubmit=async e=>{e.preventDefault();let {error}=await supabase.auth.signInWithPassword({email:$('#email').value,password:$('#password').value});if(error)$('#loginError').textContent=error.message;else{session=(await supabase.auth.getSession()).data.session;renderAdmin()}};return}let {data:{user}}=await supabase.auth.getUser();let {data:admin}=await supabase.from('dashboard_admins').select('user_id').eq('user_id',user?.id||'').maybeSingle();if(!admin){$('#main').innerHTML='<section class="section"><h2>Access restricted</h2><p>Your account is authenticated but has not been granted dashboard administrator access.</p><button id="logout" class="secondary">Sign out</button></section>';$('#logout').onclick=logout;return}$('#main').innerHTML=`<section class="section"><div class="adminhead"><div><div class="eyebrow">ADMIN CONSOLE</div><h2>Rate management</h2><p>Signed in as ${esc(user.email)}</p></div><button id="logout" class="secondary">Sign out</button></div><div class="stats adminstats"><div class="stat"><span>Current products</span><b>${rates.length}</b></div><div class="stat"><span>History records</span><b>${history.length}</b></div></div><h3>Add a mortgage rate</h3><form id="add" class="adminform"><label>Lender<input name="lender" required/></label><label>Product name<input name="product_name" required/></label><label>Scenario key<input name="scenario_key" value="purchase_400000_30y_repayment" required/></label><label>LTV %<input name="ltv_percent" type="number" min="1" max="100" step="0.01" required/></label><label>Rate %<input name="rate_percent" type="number" min="0" step="0.0001" required/></label><label>Product fee £<input name="product_fee_gbp" type="number" min="0" step="0.01"/></label><button class="primary" type="submit">Add rate</button><p id="addStatus" role="status"></p></form><h3>Stored products</h3><div class="adminrows">${rates.map(x=>`<div class="adminrow"><span>${esc(x.lender)} · ${esc(x.product_name)} · ${Number(x.ltv_percent)}% LTV</span><strong>${Number(x.rate_percent).toFixed(2)}%</strong></div>`).join('')}</div></section>`;await showRenewalDashboard();await showAdminCustomers();$('#logout').onclick=logout;$('#add').onsubmit=async e=>{e.preventDefault();let f=new FormData(e.target),payload=Object.fromEntries(f);for(let k of ['ltv_percent','rate_percent','product_fee_gbp'])payload[k]=payload[k]===''?null:Number(payload[k]);let {error}=await supabase.from('mortgage_rates').insert(payload);$('#addStatus').textContent=error?'Could not save: '+error.message:'Rate saved';if(!error){await load();renderAdmin()}}}

async function logout(){await supabase.auth.signOut();session=null;renderAdmin()}

async function load(){if(!supabase)return;let [r,h]=await Promise.all([supabase.from('mortgage_rates').select('*').order('rate_percent'),supabase.from('mortgage_rate_history').select('id',{count:'exact',head:true})]);if(r.error){$('#main').innerHTML=`<section class="section"><h2>Unable to load mortgage rates</h2><p>${esc(r.error.message)}</p></section>`;return}rates=r.data||[];history=Array.from({length:h.count||0});}

async function init(){shell();if(supabase){session=(await supabase.auth.getSession()).data.session;await load()}render();if(!supabase){$('#main').insertAdjacentHTML('afterbegin','<div class="config">Connect Supabase by setting VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.</div>')}}init();



function renderValuation(){

  $('#main').innerHTML=`<section class="section"><div class="eyebrow">E16 PILOT</div><h2>Property value & LTV calculator</h2>

  <p>For E16 properties only. Enter your own estimated property value and outstanding mortgage balance. Select your address to retrieve an indicative automated valuation, or enter your own estimate.</p>

    <div class="filters ltv-fields">
    <div class="valuation-address-row">
      <label for="e16postcode">Postcode<input id="e16postcode" placeholder="E16 2AL" maxlength="10" autocomplete="postal-code" /></label>
      <button id="findE16Address" class="primary" type="button">Find my address</button>
    </div>
    <p id="e16addressStatus" class="valuation-status" role="status" aria-live="polite">Enter your postcode and find your address.</p>
    <label class="valuation-property">Select your property<select id="e16address" disabled><option value="">Find addresses first</option></select></label>
    <p id="e16selected" class="muted valuation-status" aria-live="polite"></p>
    <p id="e16valuationStatus" class="muted valuation-status" role="status" aria-live="polite">Select an address to request a valuation.</p>
    <div class="valuation-financial-fields">
      <label>Estimated property value (£)<input id="e16value" type="number" min="1" value="500000" /></label>
      <label>Mortgage outstanding (£)<input id="e16balance" type="number" min="0" value="320000" /></label>
      <label>Remaining term (years)<input id="e16term" type="number" min="1" max="40" value="25" /></label>
    </div>
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



function renderCustomerEdit(user,customer){
  const p=customer.profile,s=customer.subscription,a=customer.preferences;
  const purpose=(s.mortgage_purposes||[])[0]||'remortgage';
  const lenders=s.lenders||[];
  const products=a?.product_types||[];
  $('#main').innerHTML=`<section class="section alerts-page">
    <div class="eyebrow">YOUR MORTGAGE DETAILS · PRE-LAUNCH</div>
    <h2>Edit mortgage details</h2>
    <p>Signed in as <strong>${esc(user.email)}</strong>. Changes are saved to your existing registration. Alerts remain inactive.</p>
    <form id="customerEditForm" class="alerts-form">
      <fieldset><legend>Mortgage information</legend><div class="alerts-grid">
        <label>Mortgage purpose <select name="mortgage_purpose" id="editPurpose"><option value="remortgage">Remortgage</option><option value="purchase">Purchase</option></select></label>
        <label id="editDateLabel">Current deal expiry date <input name="mortgage_date" type="date" required></label>
        <label>Property value (£) <input name="property_value_gbp" type="number" min="1" step="0.01" required></label>
        <label>Mortgage amount (£) <input name="mortgage_amount_gbp" type="number" min="1" step="0.01" required></label>
      </div><div class="alerts-choice"><span>Preferred lenders</span>
        <label><input type="checkbox" name="lenders" value="Halifax"> Halifax</label>
        <label><input type="checkbox" name="lenders" value="Nationwide"> Nationwide</label>
      </div></fieldset>
      <fieldset><legend>Alert preferences (saved only — alerts inactive)</legend>
        <label>Rate movement <select name="alert_direction"><option value="decrease">Rate decreases</option><option value="increase">Rate increases</option><option value="both">Both</option></select></label>
        <div class="alerts-choice"><span>Product types (optional)</span>
          <label><input type="checkbox" name="product_types" value="Fixed"> Fixed</label>
          <label><input type="checkbox" name="product_types" value="Tracker"> Tracker</label>
        </div>
      </fieldset>
      <button type="submit" class="primary">Save changes</button>
      <button type="button" id="cancelCustomerEdit" class="secondary">Cancel</button>
      <p id="customerEditStatus" role="status" aria-live="polite"></p>
    </form></section>`;
  const f=$('#customerEditForm');
  f.elements.mortgage_purpose.value=purpose;
  f.elements.mortgage_date.value=p.mortgage_date||'';
  f.elements.property_value_gbp.value=p.property_value_gbp??'';
  f.elements.mortgage_amount_gbp.value=p.mortgage_amount_gbp??'';
  f.elements.alert_direction.value=a?.alert_direction||'decrease';
  for(const x of f.querySelectorAll('input[name="lenders"]'))x.checked=lenders.includes(x.value);
  for(const x of f.querySelectorAll('input[name="product_types"]'))x.checked=products.includes(x.value);
  const updateDateLabel=()=>{$('#editDateLabel').firstChild.textContent=f.elements.mortgage_purpose.value==='remortgage'?'Current deal expiry date ':'Expected purchase date ';};
  $('#editPurpose').onchange=updateDateLabel;updateDateLabel();
  $('#cancelCustomerEdit').onclick=()=>renderCustomerDashboard(user,customer);
  f.onsubmit=async e=>{
    e.preventDefault();
    const status=$('#customerEditStatus'),button=f.querySelector('button[type="submit"]');
    if(!f.reportValidity())return;
    const lenders=[...f.querySelectorAll('input[name="lenders"]:checked')].map(x=>x.value);
    const value=Number(f.elements.property_value_gbp.value),loan=Number(f.elements.mortgage_amount_gbp.value);
    if(!lenders.length){status.textContent='Select at least one lender.';return;}
    if(!(value>0&&loan>0&&loan<=value)){status.textContent='Mortgage amount must not exceed property value.';return;}
    const payload={mortgage_purpose:f.elements.mortgage_purpose.value,mortgage_date:f.elements.mortgage_date.value,
      property_value_gbp:value,mortgage_amount_gbp:loan,lenders,
      alert_direction:f.elements.alert_direction.value,
      product_types:[...f.querySelectorAll('input[name="product_types"]:checked')].map(x=>x.value)};
    button.disabled=true;status.textContent='Saving changes…';
    try{
      const {data:{session:currentSession},error:sessionError}=await supabase.auth.getSession();
      if(sessionError||!currentSession)throw new Error('Your session expired. Please sign in again.');
      const response=await fetch('/api/customer-update',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+currentSession.access_token},body:JSON.stringify(payload)});
      const result=await response.json().catch(()=>({}));
      if(!response.ok||!result.success)throw new Error(result.error||'Could not save changes.');
      await renderAlerts();
    }catch(error){status.textContent=error.message||'Could not save changes.';}
    finally{button.disabled=false;}
  };
}

// Passwordless email-first registration. No secrets are included in browser code.

async function getCustomerRegistration(){
  const {data:{session:currentSession},error:sessionError}=await supabase.auth.getSession();
  if(sessionError || !currentSession)throw new Error('Your session expired. Please sign in again.');
  const response=await fetch('/api/customer-dashboard',{
    method:'GET',headers:{Authorization:'Bearer '+currentSession.access_token,Accept:'application/json'},
    cache:'no-store'
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'Unable to load your registration.');
  return data;
}

function renderCustomerDashboard(user,customer){
  const profile=customer.profile, subscription=customer.subscription, preferences=customer.preferences;
  const date=profile.mortgage_date?new Date(profile.mortgage_date+'T12:00:00Z').toLocaleDateString('en-GB'):'Not provided';
  const purpose=(subscription.mortgage_purposes||[]).join(', ')||'Not provided';
  const lenders=(subscription.lenders||[]).join(', ')||'Not provided';
  const products=(preferences?.product_types||[]).join(', ')||'Any';
  const safeMoney=n=>n==null?'Not provided':money(Number(n));
  const row=(label,value)=>`<div class="stat"><span>${esc(label)}</span><b style="font-size:1.1rem">${esc(value)}</b></div>`;
  $('#main').innerHTML=`<section class="section alerts-page">
    <div class="eyebrow">YOUR MORTGAGE DETAILS · PRE-LAUNCH</div>
    <h2>Welcome back, ${esc(profile.first_name)}</h2>
    <p>Signed in as <strong>${esc(user.email)}</strong>. Your registration is saved. Mortgage alerts are not active yet.</p>
    <div class="stats" style="margin:20px 0">
      ${row('Registration status',subscription.status||'Pending')}
      ${row('Mortgage purpose',purpose)}
      ${row('Property value',safeMoney(profile.property_value_gbp))}
      ${row('Mortgage amount',safeMoney(profile.mortgage_amount_gbp))}
    </div>
    <h3>Saved mortgage information</h3>
    <div class="stats" style="margin:16px 0">
      ${row('Name',[profile.first_name,profile.surname].filter(Boolean).join(' '))}
      ${row(profile.mortgage_date_type==='deal_expiry'?'Current deal expiry':'Expected purchase date',date)}
      ${row('Preferred lenders',lenders)}
      ${row('Loan to value',Number(profile.property_value_gbp)>0?(100*Number(profile.mortgage_amount_gbp)/Number(profile.property_value_gbp)).toFixed(1)+'%':'Unavailable')}
    </div>
    <h3>Alert preferences</h3>
    <div class="stats" style="margin:16px 0">
      ${row('Rate movement',preferences?.alert_direction||'Not specified')}
      ${row('Product types',products)}
      ${row('Mortgage alerts','Inactive')}
      ${row('Marketing','Not enabled')}
    </div>
    <p class="alerts-info">Your mortgage alerts and marketing remain inactive. You can update your mortgage details below.</p>
    <button id="editCustomerMortgage" class="primary" type="button">Edit mortgage details</button>
    <button id="customerSignOut" class="secondary" type="button">Sign out</button>
    <p id="customerDashboardStatus" role="status" aria-live="polite"></p>
  </section>`;
  $('#editCustomerMortgage').onclick=()=>renderCustomerEdit(user,customer);
  $('#customerSignOut').onclick=async()=>{
    const status=$('#customerDashboardStatus');status.textContent='Signing out…';
    const {error}=await supabase.auth.signOut();
    if(error){status.textContent='Unable to sign out. Please try again.';return;}
    session=null;await renderAlerts();
  };
}

// Passwordless email-first registration. No secrets are included in browser code.
async function renderAlerts(){
  if(!supabase){$('#main').innerHTML='<section class="section"><h2>Supabase configuration required</h2></section>';return;}
  const {data:{user},error:userError}=await supabase.auth.getUser();
  const verified=Boolean(!userError && user?.email && user.email_confirmed_at);
  if(verified){
    $('#main').innerHTML='<section class="section alerts-page"><h2>Loading your mortgage details…</h2></section>';
    try{
      const result=await getCustomerRegistration();
      if(result.registered){renderCustomerDashboard(user,result);return;}
    }catch(error){
      $('#main').innerHTML=`<section class="section alerts-page"><h2>Unable to load registration</h2><p role="alert">${esc(error.message)}</p><p>Your saved registration has not been changed. Please retry.</p><button id="retryCustomerDashboard" class="secondary" type="button">Retry</button></section>`;
      $('#retryCustomerDashboard').onclick=()=>renderAlerts();
      return; // Fail closed: do not offer duplicate registration on lookup errors.
    }
  }
  $('#main').innerHTML=`<section class="section alerts-page">
    <div class="eyebrow">MORTGAGE RATE ALERTS · PRE-LAUNCH TESTING</div>
    <h2>Stay informed about mortgage rates</h2>
    <p>Verify your email before submitting your mortgage details. Alerts are not active yet.</p>
    ${!verified ? `<form id="verifyEmailForm" class="alerts-form"><fieldset><legend>Verify your email</legend>
      <label>Email address <input name="email" type="email" autocomplete="email" maxlength="254" required></label>
      <button class="primary" type="submit">Send verification link</button>
      <p id="verifyStatus" role="status" aria-live="polite"></p>
      </fieldset></form>` : `<p class="alerts-info">Verified email: <strong>${esc(user.email)}</strong></p>
    <form id="alertsForm" class="alerts-form">
      <fieldset><legend>Your details</legend><div class="alerts-grid">
        <label>First name <input name="first_name" autocomplete="given-name" maxlength="100" required></label>
        <label>Surname <input name="surname" autocomplete="family-name" maxlength="100" required></label>
        <label>Phone (optional) <input name="phone" type="tel" autocomplete="tel"></label>
      </div></fieldset>
      <fieldset><legend>Your mortgage</legend><div class="alerts-grid">
        <label>Mortgage purpose <select name="mortgage_purpose" id="alertsPurpose"><option value="remortgage">Remortgage</option><option value="purchase">Purchase</option></select></label>
        <label id="alertsDateLabel">Current deal expiry date <input name="mortgage_date" type="date" required></label>
        <label>Property value (£) <input name="property_value_gbp" type="number" min="1" step="0.01" required></label>
        <label>Mortgage amount (£) <input name="mortgage_amount_gbp" type="number" min="1" step="0.01" required></label>
      </div><div class="alerts-choice"><span>Preferred lenders</span>
        <label><input type="checkbox" name="lenders" value="Halifax" checked> Halifax</label>
        <label><input type="checkbox" name="lenders" value="Nationwide"> Nationwide</label>
      </div></fieldset>
      <fieldset><legend>Alert preferences</legend>
        <label>Notify me about <select name="alert_direction"><option value="decrease">Rate decreases</option><option value="increase">Rate increases</option><option value="both">Both increases and decreases</option></select></label>
        <div class="alerts-choice"><span>Product types (optional)</span>
          <label><input type="checkbox" name="product_types" value="Fixed"> Fixed</label>
          <label><input type="checkbox" name="product_types" value="Tracker"> Tracker</label>
        </div></fieldset>
      <div class="alerts-info">Before launch, provide a complete privacy notice explaining how mortgage and contact details are used, stored and deleted. Regulatory disclosures also require approval.</div>
      <label class="alerts-privacy"><input name="privacy_acknowledged" type="checkbox" required> I acknowledge the privacy information and understand that mortgage alerts are not yet active.</label>
      <button class="primary" type="submit">Register mortgage details</button>
      <p id="alertsStatus" role="status" aria-live="polite"></p>
    </form>`}
  </section>`;
  if(!verified){
    $('#verifyEmailForm').onsubmit=async e=>{
      e.preventDefault();const button=e.currentTarget.querySelector('button');const status=$('#verifyStatus');
      button.disabled=true;status.textContent='Requesting verification link…';
      const email=e.currentTarget.elements.email.value.trim().toLowerCase();
      const {error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:window.location.origin+'/',shouldCreateUser:true}});
      status.textContent=error?'Unable to send verification link. Please try again later.':'If this address is eligible, check your email for a verification link. Return to this page after verification.';
      button.disabled=false;
    };return;
  }
  $('#alertsPurpose').onchange=()=>{
    $('#alertsDateLabel').firstChild.textContent=$('#alertsPurpose').value==='remortgage'?'Current deal expiry date ':'Expected purchase date ';
  };
  $('#alertsForm').onsubmit=async e=>{
    e.preventDefault();const f=e.currentTarget,status=$('#alertsStatus'),button=f.querySelector('button[type="submit"]');
    if(!f.reportValidity())return;
    const value=Number(f.elements.property_value_gbp.value),loan=Number(f.elements.mortgage_amount_gbp.value);
    const lenders=[...f.querySelectorAll('input[name="lenders"]:checked')].map(x=>x.value);
    if(!lenders.length){status.textContent='Select at least one lender.';return;}
    if(!(value>0&&loan>0&&loan<=value)){status.textContent='Mortgage amount must not exceed property value.';return;}
    const {data:{session:currentSession}}=await supabase.auth.getSession();
    if(!currentSession){status.textContent='Your verification session expired. Please verify your email again.';return;}
    const payload={first_name:f.elements.first_name.value.trim(),surname:f.elements.surname.value.trim(),
      phone:f.elements.phone.value.trim(),mortgage_purpose:f.elements.mortgage_purpose.value,
      mortgage_date:f.elements.mortgage_date.value,property_value_gbp:value,mortgage_amount_gbp:loan,
      lenders,alert_direction:f.elements.alert_direction.value,
      product_types:[...f.querySelectorAll('input[name="product_types"]:checked')].map(x=>x.value),
      privacy_acknowledged:f.elements.privacy_acknowledged.checked};
    button.disabled=true;status.textContent='Saving registration…';
    try{
      const response=await fetch('/api/customer-register-verified',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+currentSession.access_token},body:JSON.stringify(payload)});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'Registration could not be saved.');
      status.textContent='Registration received. Your mortgage alerts are not active yet.';
      await renderAlerts();
    }catch(error){status.textContent=error.message||'Registration failed. Please try again.';}
    finally{button.disabled=false;}
  };
}


// Admin-only, read-only customer overview. Customer records are fetched through
// the server endpoint, never directly from privileged tables in the browser.
async function showAdminCustomers(page=1){
  const host=$('#main .section');
  if(!host)return;
  let panel=$('#adminCustomersPanel');
  if(!panel){
    panel=document.createElement('section');
    panel.id='adminCustomersPanel';
    panel.className='renewal-panel';
    panel.innerHTML=`<h3>Registered mortgage customers</h3>
      <p>Private administrator view · read-only · mortgage alerts remain inactive.</p>
      <p id="adminCustomersStatus" role="status" aria-live="polite">Loading customers…</p>
      <div id="adminCustomersList"></div>
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:16px">
        <button id="adminCustomersPrev" class="secondary" type="button">Previous</button>
        <span id="adminCustomersPage"></span>
        <button id="adminCustomersNext" class="secondary" type="button">Next</button>
      </div>`;
    host.appendChild(panel);
  }
  const status=$('#adminCustomersStatus');
  const list=$('#adminCustomersList');
  const previous=$('#adminCustomersPrev');
  const next=$('#adminCustomersNext');
  previous.disabled=true;
  next.disabled=true;
  status.textContent='Loading customers…';
  list.replaceChildren();
  try{
    const {data:{session:activeSession}}=await supabase.auth.getSession();
    if(!activeSession)throw new Error('Your admin session expired. Please sign in again.');
    const response=await fetch('/api/admin-customers?page='+encodeURIComponent(page),{
      headers:{Authorization:'Bearer '+activeSession.access_token,Accept:'application/json'},
      cache:'no-store'
    });
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'Unable to load customers.');
    if(!document.contains(panel))return;
    const customers=Array.isArray(data.customers)?data.customers:[];
    status.textContent=`${Number(data.total)||0} registered customer(s) · showing ${customers.length} on this page`;
    $('#adminCustomersPage').textContent='Page '+page;
    if(!customers.length){list.innerHTML='<p>No customers on this page.</p>';}
    else{
      list.innerHTML=customers.map(c=>{
        const value=c.property_value_gbp==null?'—':money(Number(c.property_value_gbp));
        const loan=c.mortgage_amount_gbp==null?'—':money(Number(c.mortgage_amount_gbp));
        const ltv=c.ltv_percent==null?'—':Number(c.ltv_percent).toFixed(1)+'%';
        const name=[c.first_name,c.surname].filter(Boolean).join(' ')||'Profile not completed';
        return `<article class="product" style="margin:12px 0">
          <div><strong>${esc(name)}</strong><p class="muted">${esc(c.email)}</p>
            <small>Registered ${c.created_at?esc(new Date(c.created_at).toLocaleDateString('en-GB')):'—'}</small></div>
          <div><span class="muted">Mortgage</span><p>${esc(c.mortgage_purpose||'—')}</p>
            <small>${esc(c.mortgage_date_type||'Date')}: ${esc(c.mortgage_date||'—')}</small></div>
          <div><span class="muted">Property / loan</span><p>${value} / ${loan}</p><small>${ltv} LTV</small></div>
          <div><span class="muted">Lenders</span><p>${esc((c.lenders||[]).join(', ')||'—')}</p></div>
          <div><span class="muted">Registration</span><p>${esc(c.status||'—')}</p></div>
        </article>`;
      }).join('');
    }
    previous.disabled=page<=1;
    next.disabled=!data.has_more;
    previous.onclick=()=>showAdminCustomers(page-1);
    next.onclick=()=>showAdminCustomers(page+1);
  }catch(error){
    if(document.contains(panel))status.textContent=error.message||'Unable to load customers.';
  }
}
