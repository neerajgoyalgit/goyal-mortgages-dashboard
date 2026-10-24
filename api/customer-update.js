import { createClient } from '@supabase/supabase-js';
const send=(res,code,body)=>res.status(code).setHeader('Cache-Control','no-store, private').json(body);
const validDate=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const amount=x=>typeof x==='number'&&Number.isFinite(x)&&x>0&&x<=999999999999.99&&Math.abs(x*100-Math.round(x*100))<0.00001;
const allowed=(arr,values,max,required=false)=>Array.isArray(arr)&&arr.length<=max&&(!required||arr.length>0)&&arr.every(x=>typeof x==='string'&&values.includes(x));
export default async function handler(req,res){
  res.setHeader('Allow','POST');
  if(req.method!=='POST')return send(res,405,{error:'Method not allowed'});
  if(process.env.ENABLE_VERIFIED_REGISTRATIONS!=='true')return send(res,503,{error:'Customer editing is not enabled.'});
  const url=process.env.SUPABASE_URL,serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publishable=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!serviceKey||!publishable)return send(res,503,{error:'Server configuration incomplete.'});
  const match=/^Bearer\s+(\S+)$/i.exec(req.headers.authorization||'');
  if(!match)return send(res,401,{error:'Sign in to edit your mortgage details.'});
  const b=req.body;
  if(!b||typeof b!=='object'||Array.isArray(b)||
    !['remortgage','purchase'].includes(b.mortgage_purpose)||!validDate(b.mortgage_date)||
    !amount(b.property_value_gbp)||!amount(b.mortgage_amount_gbp)||b.mortgage_amount_gbp>b.property_value_gbp||
    !allowed(b.lenders,['Halifax','Nationwide'],2,true)||
    !allowed(b.product_types,['Fixed','Tracker'],2)||
    !['decrease','increase','both'].includes(b.alert_direction))
    return send(res,400,{error:'Please check your mortgage details and preferences.'});
  try{
    const auth=createClient(url,publishable,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user},error}=await auth.auth.getUser(match[1]);
    if(error||!user?.id||!user.email||!user.email_confirmed_at)return send(res,401,{error:'Verified sign-in required.'});
    const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data,error:dbError}=await db.rpc('update_customer_mortgage_v1',{p_data:{
      auth_user_id:user.id,email:user.email.trim().toLowerCase(),
      mortgage_purpose:b.mortgage_purpose,mortgage_date:b.mortgage_date,
      property_value_gbp:b.property_value_gbp,mortgage_amount_gbp:b.mortgage_amount_gbp,
      lenders:[...new Set(b.lenders)],product_types:[...new Set(b.product_types)],alert_direction:b.alert_direction
    }});
    if(dbError){console.error('Customer update RPC failed:',dbError.code);return send(res,dbError.code==='P0002'?404:500,{error:'Unable to save mortgage changes.'});}
    return send(res,200,{success:!!data?.success,message:'Mortgage details updated. Alerts remain inactive.'});
  }catch(error){console.error('Customer update exception:',error?.name);return send(res,500,{error:'Unable to save mortgage changes.'});}
}
