'use server';

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export type WaitlistSegment = 'landlord' | 'tenant' | 'dev' | 'player';

export async function joinWaitlist(email: string, segment: WaitlistSegment = 'player') {
  if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 're_placeholder') {
    // Dev mode — just return success without calling Resend
    return { success: true };
  }

  try {
    // Add to Resend audience (contacts list)
    if (process.env.RESEND_AUDIENCE_ID && process.env.RESEND_AUDIENCE_ID !== 'audience_placeholder') {
      await resend.contacts.create({
        email,
        audienceId: process.env.RESEND_AUDIENCE_ID,
        unsubscribed: false,
      });
    }

    // Send a welcome email
    await resend.emails.send({
      from: 'Rentline Sandbox <noreply@rentline.xyz>',
      to: email,
      subject: "You're on the Rentline waitlist",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
          <h2 style="color: #1D1E2C; font-size: 22px; margin-bottom: 8px;">You're in.</h2>
          <p style="color: #8B8C89; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
            You're on the Rentline waitlist. When we launch automated rent collection, you'll be among the first to know.
          </p>
          <p style="color: #1D1E2C; font-size: 15px; line-height: 1.6;">
            In the meantime — <a href="https://sandbox.rentline.xyz/lobby" style="color: #004E89;">play the simulation</a>.
            It's the real mechanics: Fed rate cycles, PACE liens, property grades. Free to play.
          </p>
          <hr style="border: none; border-top: 1px solid #E7ECEF; margin: 24px 0;" />
          <p style="color: #AFB4B7; font-size: 12px;">Rentline · sandbox.rentline.xyz</p>
        </div>
      `,
    });

    return { success: true };
  } catch (err) {
    console.error('Waitlist error:', err);
    return { success: false, error: 'Failed to join waitlist' };
  }
}
