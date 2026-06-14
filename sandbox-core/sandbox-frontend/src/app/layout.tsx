import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { QueryProvider } from '@/components/shared/QueryProvider';
import { NotificationCenter } from '@/components/shared/NotificationCenter';
import './globals.css';

export const metadata: Metadata = {
  title: 'Rentline Sandbox — Real Estate Investment Simulation',
  description: 'Play the real estate simulation. Fed rate cycles, PACE liens, macro events, property grades. Browser, CLI, or AI agent.',
  openGraph: {
    title: 'Rentline Sandbox',
    description: 'Real estate investment simulation. Play in the browser, via CLI, or let an AI agent run your portfolio.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className="h-full antialiased">
        <body className="min-h-full flex flex-col">
          <QueryProvider>
            {children}
            <NotificationCenter />
          </QueryProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
