'use server';

import Stripe from 'stripe';
import { auth } from '@clerk/nextjs/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_placeholder');

export type PlanInterval = 'month' | 'year';

export async function createCheckoutSession(interval: PlanInterval) {
  const { userId } = await auth();
  if (!userId) throw new Error('Not authenticated');

  if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY === 'sk_test_placeholder') {
    return { url: null, error: 'Stripe not configured' };
  }

  const priceId = interval === 'year'
    ? process.env.STRIPE_PRO_YEARLY_PRICE_ID
    : process.env.STRIPE_PRO_MONTHLY_PRICE_ID;

  if (!priceId || priceId === 'price_placeholder') {
    return { url: null, error: 'Stripe price not configured' };
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://sandbox.rentline.xyz'}/lobby?pro=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://sandbox.rentline.xyz'}/lobby`,
    metadata: { clerk_user_id: userId },
    subscription_data: { metadata: { clerk_user_id: userId } },
  });

  return { url: session.url, error: null };
}

export async function createPortalSession() {
  const { userId } = await auth();
  if (!userId) throw new Error('Not authenticated');

  // Look up Stripe customer by clerk_user_id metadata
  const customers = await stripe.customers.search({
    query: `metadata['clerk_user_id']:'${userId}'`,
    limit: 1,
  });

  if (customers.data.length === 0) {
    return { url: null, error: 'No billing account found' };
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customers.data[0].id,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://sandbox.rentline.xyz'}/lobby`,
  });

  return { url: session.url, error: null };
}
