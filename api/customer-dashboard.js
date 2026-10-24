import { createClient } from '@supabase/supabase-js';

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, private');
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({error:'Method not allowed'});
  }
  const url=process.env.SUPABASE_URL;
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publishableKey=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!serviceKey||!publishableKey)return res.status(503).json({error:'Server configuration incomplete.'});
  const authHeader=req.headers.authorization||'';
  const match=/^Bearer\s+(.+)$/i.exec(authHeader);
  if(!match)return res.status(401).json({error:'Sign in to view your mortgage details.'});
  try{
    const authClient=createClient(url,publishableKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user},error:authError}=await authClient.auth.getUser(match[1]);
    if(authError||!user?.id||!user.email||!user.email_confirmed_at)
      return res.status(401).json({error:'A verified sign-in is required.'});
    const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:profile,error:profileError}=await db.from('customer_profiles')
      .select('subscription_id,first_name,surname,mortgage_date,mortgage_date_type,property_value_gbp,mortgage_amount_gbp')
      .eq('auth_user_id',user.id).maybeSingle();
    if(profileError)throw profileError;
    if(!profile)return res.status(200).json({registered:false});
    const [{data:subscription,error:subscriptionError},{data:preferences,error:preferencesError}]=await Promise.all([
      db.from('mortgage_alert_subscriptions').select('id,email,lenders,mortgage_purposes,status').eq('id',profile.subscription_id).maybeSingle(),
      db.from('customer_alert_preferences').select('subscription_id,product_types,alert_direction,alerts_enabled').eq('subscription_id',profile.subscription_id).maybeSingle()
    ]);
    if(subscriptionError)throw subscriptionError;
    if(preferencesError)throw preferencesError;
    if(!subscription||subscription.email?.trim().toLowerCase()!==user.email.trim().toLowerCase())
      return res.status(409).json({error:'Registration identity mismatch. Contact support.'});
    return res.status(200).json({registered:true,profile,subscription:{
      status:subscription.status,lenders:subscription.lenders,mortgage_purposes:subscription.mortgage_purposes
    },preferences:{product_types:preferences?.product_types||[],alert_direction:preferences?.alert_direction||null,
      alerts_enabled:false}});
  }catch(error){
    console.error('Customer dashboard retrieval failed:', error?.code || error?.name || 'unknown');
    return res.status(500).json({error:'Could not load your saved registration.'});
  }
}
