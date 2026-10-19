import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
const PRICE_IDS: Record<string,string> = { freelance: 'price_1UKx5m2MY8fbDWVJZkLjrOuw', team: 'price_1UKx5p2MY8fbDWVJSdDKzdKh' };
function safeReturnUrl(value: unknown, fallback: URL, origin: string): string {
  if (value === undefined || value === null || value === '') return fallback.toString();
  if (typeof value !== 'string') throw new Error('Return URL must be a string');
  const parsed = new URL(value);
  if (parsed.origin !== origin || parsed.username || parsed.password) throw new Error('Return URL must use the configured application origin');
  return parsed.toString();
}
serve(async (req) => {
  const configuredOrigin = Deno.env.get('ALLOWED_ORIGIN'); const configuredAppUrl = Deno.env.get('APP_URL');
  if (!configuredOrigin || !configuredAppUrl) return new Response(JSON.stringify({error:'ALLOWED_ORIGIN and APP_URL must be configured'}),{status:500});
  let appUrl: URL; let origin: string;
  try { appUrl = new URL(configuredAppUrl); origin = new URL(configuredOrigin).origin; if (appUrl.origin !== origin) throw new Error(); } catch { return new Response(JSON.stringify({error:'Application URL configuration is invalid'}),{status:500}); }
  const cors = {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
  const reqOrigin = req.headers.get('Origin'); if (reqOrigin && reqOrigin !== origin) return new Response('Origin not allowed',{status:403});
  if (req.method === 'OPTIONS') return new Response('ok',{headers:cors});
  try {
    const key = Deno.env.get('STRIPE_SECRET_KEY'); if (!key) throw new Error('STRIPE_SECRET_KEY not set');
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:req.headers.get('Authorization')||''}}});
    const {data:{user}} = await supabase.auth.getUser(); if (!user) return new Response(JSON.stringify({error:'Unauthorized'}),{status:401,headers:{...cors,'Content-Type':'application/json'}});
    const {plan='freelance',successUrl,cancelUrl} = await req.json(); const price = PRICE_IDS[plan]; if (!price) throw new Error('Unknown plan. Use freelance or team');
    const successFallback = new URL(appUrl); successFallback.searchParams.set('paid','1'); const cancelFallback = new URL(appUrl); cancelFallback.searchParams.set('canceled','1');
    const stripe = new Stripe(key,{apiVersion:'2023-10-16',httpClient:Stripe.createFetchHttpClient()});
    const session = await stripe.checkout.sessions.create({mode:'subscription',customer_email:user.email,line_items:[{price,quantity:1}],success_url:safeReturnUrl(successUrl,successFallback,origin),cancel_url:safeReturnUrl(cancelUrl,cancelFallback,origin),metadata:{supabase_user_id:user.id,plan},subscription_data:{metadata:{supabase_user_id:user.id,plan}}});
    return new Response(JSON.stringify({url:session.url,sessionId:session.id}),{headers:{...cors,'Content-Type':'application/json'}});
  } catch (err) { return new Response(JSON.stringify({error:err instanceof Error?err.message:'Server error'}),{status:400,headers:{...cors,'Content-Type':'application/json'}}); }
});
