import { createClient } from '@supabase/supabase-js';

const send=(res,code,body)=>res.status(code).json(body);
const fields='id,client_name,client_email,client_phone,lender,booked_product_name,booked_rate_percent,booked_product_fee_gbp,mortgage_amount_gbp,property_value_gbp,mortgage_purpose,repayment_type,rate_type,initial_period_months,application_status,application_reference,offer_expiry_date,expected_completion_date,booked_at,monitoring_enabled,notes,created_at,updated_at';
const allowed=new Set(['client_name','client_email','client_phone','lender','booked_product_name','booked_rate_percent','booked_product_fee_gbp','mortgage_amount_gbp','property_value_gbp','mortgage_purpose','repayment_type','rate_type','initial_period_months','application_status','application_reference','offer_expiry_date','expected_completion_date','booked_at','monitoring_enabled','notes']);
const enums={mortgage_purpose:['purchase','remortgage','product_transfer','buy_to_let','other'],repayment_type:['repayment','interest_only','part_and_part'],rate_type:['fixed','tracker','variable','other'],application_status:['submitted','offered','exchange','completed','cancelled']};
const optional=['client_email','client_phone','booked_product_fee_gbp','repayment_type','rate_type','initial_period_months','application_reference','offer_expiry_date','expected_completion_date','notes'];
const dates=['offer_expiry_date','expected_completion_date'];
const textFields=['client_name','client_email','client_phone','lender','booked_product_name','application_reference','notes'];
function validate(raw,partial=false){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid client details.');
 const keys=Object.keys(raw);if(!keys.length||keys.some(k=>!allowed.has(k)))throw Error('Unsupported field.');
 const x={};
 for(const k of keys){let v=raw[k];if(v===''&&optional.includes(k))v=null;
  if(v===null){if(!optional.includes(k))throw Error(k+' is required.');x[k]=null;continue;}
  if(textFields.includes(k)){if(typeof v!=='string'||v.length>2000)throw Error('Invalid '+k);v=v.trim();if(['client_name','lender','booked_product_name'].includes(k)&&(!v||v.length>200))throw Error('Invalid '+k);if(k==='client_email'&&v&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))throw Error('Invalid email');x[k]=v||null;continue;}
  if(enums[k]){if(typeof v!=='string'||!enums[k].includes(v))throw Error('Invalid '+k);x[k]=v;continue;}
  if(dates.includes(k)){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(Date.parse(v)))throw Error('Invalid '+k);x[k]=v;continue;}
  if(k==='booked_at'){if(typeof v!=='string'||Number.isNaN(Date.parse(v)))throw Error('Invalid booking date');x[k]=v;continue;}
  if(k==='monitoring_enabled'){if(typeof v!=='boolean')throw Error('Invalid monitoring setting');x[k]=v;continue;}
  if(typeof v!=='number'||!Number.isFinite(v)||v<0)throw Error('Invalid '+k);
  if(k==='booked_rate_percent'&&v>30)throw Error('Invalid rate');
  if(['mortgage_amount_gbp','property_value_gbp'].includes(k)&&v<=0)throw Error('Mortgage amount and property value must be positive');
  if(k==='initial_period_months'&&(!Number.isInteger(v)||v<=0))throw Error('Invalid period');
  x[k]=v;
 }
 if(!partial){for(const k of ['client_name','lender','booked_product_name','booked_rate_percent','mortgage_amount_gbp','property_value_gbp','mortgage_purpose'])if(x[k]===undefined||x[k]===null)throw Error('Missing '+k);}
 if(x.mortgage_amount_gbp!==undefined&&x.property_value_gbp!==undefined&&x.mortgage_amount_gbp>x.property_value_gbp*1.5)throw Error('Check mortgage amount and property value.');
 return x;
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(!['GET','POST','PATCH'].includes(req.method)){res.setHeader('Allow','GET, POST, PATCH');return send(res,405,{error:'Method not allowed.'});}
 const url=process.env.SUPABASE_URL,secret=process.env.SUPABASE_SERVICE_ROLE_KEY,pub=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!secret||!pub)return send(res,503,{error:'Server configuration incomplete.'});
 const token=/^Bearer\s+(\S+)$/i.exec(req.headers.authorization||'')?.[1];if(!token)return send(res,401,{error:'Admin sign-in required.'});
 try{
  const auth=createClient(url,pub,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:authError}=await auth.auth.getUser(token);
  if(authError||!user?.id||!user.email_confirmed_at)return send(res,401,{error:'Verified sign-in required.'});
  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:admin,error:adminError}=await db.from('dashboard_admins').select('user_id').eq('user_id',user.id).maybeSingle();
  if(adminError)throw adminError;if(!admin)return send(res,403,{error:'Administrator access required.'});
  if(req.method==='GET'){
   const page=Number(req.query.page||1);if(!Number.isSafeInteger(page)||page<1||page>10000)return send(res,400,{error:'Invalid page.'});
   const from=(page-1)*20;
   const {data,error,count}=await db.from('broker_clients').select(fields,{count:'exact'}).order('created_at',{ascending:false}).range(from,from+19);
   if(error)throw error;return send(res,200,{clients:data||[],page,total:count||0,has_more:from+(data||[]).length<(count||0)});
  }
  if(JSON.stringify(req.body||{}).length>12000)return send(res,413,{error:'Payload too large.'});
  let payload;try{payload=validate(req.body?.client||req.body,req.method==='PATCH');}catch(e){return send(res,400,{error:e.message});}
  if(req.method==='POST'){
   const {data,error}=await db.from('broker_clients').insert(payload).select(fields).single();if(error)throw error;return send(res,201,{client:data});
  }
  const id=req.body?.id;if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return send(res,400,{error:'Invalid client ID.'});
  const {data,error}=await db.from('broker_clients').update({...payload,updated_at:new Date().toISOString()}).eq('id',id).select(fields).maybeSingle();
  if(error)throw error;if(!data)return send(res,404,{error:'Client not found.'});return send(res,200,{client:data});
 }catch(e){console.error('Broker client API error:',e?.code||e?.name);return send(res,500,{error:'Unable to process booked client details.'});}
}
