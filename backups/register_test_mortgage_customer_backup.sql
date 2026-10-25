-- Original Supabase function backup, retrieved 2026-10-24.
-- Restore only after reviewing effects on the shared database.
CREATE OR REPLACE FUNCTION public.register_test_mortgage_customer(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 v_id uuid;
 v_email text;
 v_purpose text;
 v_lenders text[];
 v_value numeric;
 v_amount numeric;
 v_date date;
 v_date_type text;
 v_direction text;
 v_products text[];
begin
 if p_data is null or jsonb_typeof(p_data) <> 'object' then
   raise exception 'Expected registration object';
 end if;
 v_email := lower(btrim(p_data->>'email'));
 v_purpose := p_data->>'mortgage_purpose';
 v_date_type := p_data->>'mortgage_date_type';
 v_direction := coalesce(p_data->>'alert_direction','decrease');
 if v_email is null or length(v_email)>254 or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid email'; end if;
 if v_purpose not in ('purchase','remortgage') or v_purpose is null then raise exception 'Invalid purpose'; end if;
 if coalesce(length(btrim(p_data->>'first_name')),0) not between 1 and 100 then raise exception 'Invalid first name'; end if;
 if p_data ? 'surname' and p_data->>'surname' is not null and length(btrim(p_data->>'surname')) not between 1 and 100 then raise exception 'Invalid surname'; end if;
 if p_data ? 'phone' and p_data->>'phone' is not null and length(p_data->>'phone') not between 7 and 30 then raise exception 'Invalid phone'; end if;
 if jsonb_typeof(p_data->'lenders') <> 'array' then raise exception 'Invalid lenders'; end if;
 select array_agg(distinct x) into v_lenders from jsonb_array_elements_text(p_data->'lenders') x;
 if coalesce(array_length(v_lenders,1),0) not between 1 and 2 or not(v_lenders <@ array['Nationwide','Halifax']::text[]) then raise exception 'Invalid lenders'; end if;
 if v_date_type is distinct from (case when v_purpose='remortgage' then 'deal_expiry' else 'expected_purchase' end) then raise exception 'Invalid date type'; end if;
 if p_data->>'mortgage_date' is null then raise exception 'Mortgage date required'; end if;
 v_date := (p_data->>'mortgage_date')::date;
 v_value := (p_data->>'property_value_gbp')::numeric;
 v_amount := (p_data->>'mortgage_amount_gbp')::numeric;
 if v_value is null or v_amount is null or v_value<=0 or v_amount<=0 or v_amount>v_value then raise exception 'Invalid property or mortgage amount'; end if;
 if v_direction not in ('decrease','increase','both') then raise exception 'Invalid alert direction'; end if;
 if p_data ? 'product_types' then
   if jsonb_typeof(p_data->'product_types') <> 'array' then raise exception 'Invalid product types'; end if;
   select coalesce(array_agg(distinct x),'{}'::text[]) into v_products from jsonb_array_elements_text(p_data->'product_types') x;
   if cardinality(v_products)>10 or exists(select 1 from unnest(v_products) x where length(x) not between 1 and 100) then raise exception 'Invalid product types'; end if;
 else v_products := '{}'::text[];
 end if;
 insert into public.mortgage_alert_subscriptions(email,lenders,mortgage_purposes,status,consent_given_at,consent_source)
 values(v_email,v_lenders,array[v_purpose],'pending',null,'private_registration_test')
 returning id into v_id;
 insert into public.customer_profiles(subscription_id,first_name,surname,phone,mortgage_date,mortgage_date_type,property_value_gbp,mortgage_amount_gbp)
 values(v_id,btrim(p_data->>'first_name'),nullif(btrim(p_data->>'surname'),''),nullif(btrim(p_data->>'phone'),''),v_date,v_date_type,v_value,v_amount);
 insert into public.customer_alert_preferences(subscription_id,product_types,alert_direction,alerts_enabled,adviser_contact_requested,marketing_email_consent,marketing_sms_consent,marketing_phone_consent)
 values(v_id,v_products,v_direction,false,false,false,false,false);
 return v_id;
end;
$function$;
