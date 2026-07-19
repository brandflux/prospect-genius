import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import Stripe from "https://esm.sh/stripe@14.22.0?target=deno";

serve(async (req) => {
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  const stripeWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2023-10-16",
  });

  const signature = req.headers.get("Stripe-Signature");
  if (!signature) {
    return new Response("Missing Stripe-Signature header", { status: 400 });
  }

  try {
    const body = await req.text();
    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      stripeWebhookSecret
    );

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    console.log(`Processing event: ${event.type}`);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id;
      const subscriptionId = session.subscription as string;

      if (!userId) {
        console.error("Missing client_reference_id in checkout session");
        return new Response("Missing client_reference_id", { status: 400 });
      }

      // Buscar detalhes da assinatura no Stripe
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const priceId = subscription.items.data[0].price.id;
      const currentPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString();

      const { error } = await supabase
        .from("subscriptions")
        .upsert({
          user_id: userId,
          status: "active",
          price_id: priceId,
          stripe_subscription_id: subscriptionId,
          current_period_end: currentPeriodEnd,
          updated_at: new Date().toISOString()
        }, { onConflict: "user_id" });

      if (error) {
        console.error(`Error updating subscription for user ${userId}:`, error);
        throw error;
      }

      console.log(`Subscription activated successfully for user: ${userId}`);

    } else if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      const subscriptionId = subscription.id;

      const { error } = await supabase
        .from("subscriptions")
        .update({
          status: "inactive",
          updated_at: new Date().toISOString()
        })
        .eq("stripe_subscription_id", subscriptionId);

      if (error) {
        console.error(`Error cancelling subscription ${subscriptionId}:`, error);
        throw error;
      }

      console.log(`Subscription cancelled successfully: ${subscriptionId}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error(`Error processing webhook: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
