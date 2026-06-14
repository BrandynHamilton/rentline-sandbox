# Sandbox Frontend

Next.js 16 web app for the Rentline Sandbox game — **sandbox.rentline.xyz**

## Stack

- **Framework:** Next.js 16 (App Router)
- **Auth:** Clerk (`@clerk/nextjs`)
- **UI:** shadcn/ui + Base UI + Tailwind CSS 4
- **State:** Zustand
- **Data:** TanStack React Query
- **Animations:** Framer Motion + GSAP + Lenis smooth scroll
- **Package manager:** pnpm

## Structure

```
src/
├── app/
│   ├── (game)/         Game board + lobby routes
│   ├── actions/        Server actions
│   ├── api/            Route handlers
│   ├── sign-in/        Clerk sign-in page
│   ├── sign-up/        Clerk sign-up page
│   ├── superuser/      Admin dashboard
│   └── u/              User profile / settings
├── components/
│   ├── board/          Game board UI components
│   ├── lobby/          Lobby UI components
│   └── shared/         Shared/layout components
├── lib/                Utilities, API client, helpers
├── store/              Zustand stores
├── styles/             Global styles
└── proxy.ts            Dev proxy for API requests
```

## Development

```bash
pnpm install
pnpm dev
```

Runs on `http://localhost:3000` by default.

## Environment

Copy `.env.example` or set these in `.env.local`:

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
NEXT_PUBLIC_SANDBOX_API_URL=http://localhost:6532
CLERK_SECRET_KEY=sk_...
```

## Deployment

Deployed to Vercel. Point the Vercel project root at `sandbox-core/sandbox-frontend/`.
