import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
serve(async(req)=>{
  const stripeKey=Deno.env.get('STRIPE_SECRET_KEY'),secret=Deno.env.get('STRIPE_WEBHOOK_SECRET'),url=Deno.env.get('SUPABASE_URL'),serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!stripeKey||!secret||!url||!serviceKey)return new Response('Stripe or Supabase secrets missing',{status:500});
  const stripe=new Stripe(stripeKey,{apiVersion:'2023-10-16',httpClient:Stripe.createFetchHttpClient()});const body=await req.text(),sig=req.headers.get('stripe-signature');if(!sig)return new Response('No signature',{status:400});
  let event:Stripe.Event;try{event=stripe.webhooks.constructEvent(body,sig,secret);}catch{return new Response('Invalid webhook signature',{status:400});}
  const admin=createClient(url,serviceKey);const {data:duplicate,error:lookupError}=await admin.from('stripe_webhook_events').select('event_id').eq('event_id',event.id).maybeSingle();if(lookupError)return new Response('Event lookup failed',{status:500});if(duplicate)return new Response(JSON.stringify({received:true,duplicate:true}),{headers:{'Content-Type':'application/json'}});
  try{
    if(event.type==='checkout.session.completed'){const session=event.data.object as Stripe.Checkout.Session;const userId=session.metadata?.supabase_user_id;if(userId){const {error}=await admin.from('profiles').upsert({id:userId,plan:session.metadata?.plan||'freelance',stripe_customer_id:typeof session.customer==='string'?session.customer:null,subscription_status:'active',updated_at:new Date().toISOString()});if(error)throw error;}}
    if(event.type==='customer.subscription.updated'){const sub=event.data.object as Stripe.Subscription;const userId=sub.metadata?.supabase_user_id;const customer=typeof sub.customer==='string'?sub.customer:null;const active=sub.status==='active'||sub.status==='trialing';const q=admin.from('profiles').update({plan:active?(sub.metadata?.plan||'freelance'):'free',stripe_customer_id:customer,subscription_status:sub.status,updated_at:new Date().toISOString()});const {error}=userId?await q.eq('id',userId):customer?await q.eq('stripe_customer_id',customer):{error:null};if(error)throw error;}
    if(event.type==='customer.subscription.deleted'){const sub=event.data.object as Stripe.Subscription;const userId=sub.metadata?.supabase_user_id;const customer=typeof sub.customer==='string'?sub.customer:null;const q=admin.from('profiles').update({plan:'free',subscription_status:'canceled',updated_at:new Date().toISOString()});const {error}=userId?await q.eq('id',userId):customer?await q.eq('stripe_customer_id',customer):{error:null};if(error)throw error;}
    if(event.type==='invoice.payment_failed'){const invoice=event.data.object as Stripe.Invoice;const customer=typeof invoice.customer==='string'?invoice.customer:null;if(customer){const {error}=await admin.from('profiles').update({subscription_status:'past_due',updated_at:new Date().toISOString()}).eq('stripe_customer_id',customer);if(error)throw error;}}
    const {error}=await admin.from('stripe_webhook_events').insert({event_id:event.id,event_type:event.type,processed_at:new Date().toISOString()});if(error&&error.code!=='23505')throw error;
  }catch{return new Response('Webhook processing failed',{status:500});}
  return new Response(JSON.stringify({received:true}),{headers:{'Content-Type':'application/json'}});
});
