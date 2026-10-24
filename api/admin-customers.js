import { createClient } from '@supabase/supabase-js';

const respond=(res,status,data)=>res.status(status).json(data);
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, private');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return respond(res,405,{error:'Method not allowed.'});
  }
  const url=process.env.SUPABASE_URL;
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publicKey=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!serviceKey||!publicKey)return respond(res,503,{error:'Server configuration incomplete.'});
  const match=/^Bearer\s+(\S+)$/i.exec(req.headers.authorization||'');
  if(!match)return respond(res,401,{error:'Admin sign-in required.'});
  try{
    const auth=createClient(url,publicKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user},error:authError}=await auth.auth.getUser(match[1]);
    if(authError||!user?.id||!user.email_confirmed_at)return respond(res,401,{error:'Verified admin sign-in required.'});
    const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:admin,error:adminError}=await db.from('dashboard_admins').select('user_id').eq('user_id',user.id).maybeSingle();
    if(adminError){console.error('Admin authorization lookup failed:',adminError.code);return respond(res,500,{error:'Unable to verify administrator access.'});}
    if(!admin)return respond(res,403,{error:'Administrator access required.'});
    const pageRaw=Array.isArray(req.query.page)?'':req.query.page;
    const page=pageRaw===undefined?1:Number(pageRaw);
    if(!Number.isSafeInteger(page)||page<1||page>10000)return respond(res,400,{error:'Invalid page.'});
    const pageSize=20;
    const from=(page-1)*pageSize;
    const {data:subs,error:subError,count}=await db.from('mortgage_alert_subscriptions')
      .select('id,email,lenders,mortgage_purposes,status,created_at',{count:'exact'})
      .order('created_at',{ascending:false}).order('id',{ascending:false})
      .range(from,from+pageSize-1);
    if(subError)throw subError;
    const ids=(subs||[]).map(s=>s.id);
    let profiles=[];
    if(ids.length){
      const {data,error}=await db.from('customer_profiles')
        .select('subscription_id,first_name,surname,mortgage_date,mortgage_date_type,property_value_gbp,mortgage_amount_gbp')
        .in('subscription_id',ids);
      if(error)throw error;
      profiles=data||[];
    }
    const bySubscription=new Map(profiles.map(p=>[p.subscription_id,p]));
    const customers=(subs||[]).map(s=>{
      const p=bySubscription.get(s.id);
      const value=p?.property_value_gbp==null?null:Number(p.property_value_gbp);
      const loan=p?.mortgage_amount_gbp==null?null:Number(p.mortgage_amount_gbp);
      const ltv=value>0&&Number.isFinite(loan)?Math.round(loan/value*10000)/100:null;
      return {id:s.id,email:s.email,first_name:p?.first_name||'',surname:p?.surname||'',
        mortgage_purpose:s.mortgage_purposes?.[0]||null,mortgage_date:p?.mortgage_date||null,
        mortgage_date_type:p?.mortgage_date_type||null,property_value_gbp:value,mortgage_amount_gbp:loan,
        ltv_percent:ltv,lenders:s.lenders||[],status:s.status,created_at:s.created_at};
    });
    return respond(res,200,{customers,page,page_size:pageSize,total:count||0,has_more:from+customers.length<(count||0)});
  }catch(error){
    console.error('Admin customer listing failed:',error?.code||error?.name);
    return respond(res,500,{error:'Unable to load registered customers.'});
  }
}
