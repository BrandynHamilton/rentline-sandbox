import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { clerkClient } from '@clerk/nextjs/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '');

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const clerk = await clerkClient();

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.clerk_user_id;
    if (userId) {
      await clerk.users.updateUserMetadata(userId, {
        publicMetadata: { is_pro: true, pro_since: new Date().toISOString() },
      });
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription;
    const userId = sub.metadata?.clerk_user_id;
    if (userId) {
      await clerk.users.updateUserMetadata(userId, {
        publicMetadata: { is_pro: false },
      });
    }
  }

  if (event.type === 'invoice.payment_failed') {
    // Could send a notification — for now just log
    console.warn('Payment failed:', event.data.object);
  }

  return NextResponse.json({ received: true });
}
