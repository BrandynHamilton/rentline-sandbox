import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { SandboxApiClientProvider } from "@/lib/sandbox-client-context"

export default async function GameLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth()
  if (!userId) redirect("/sign-in")

  return (
    <SandboxApiClientProvider>
      {children}
    </SandboxApiClientProvider>
  )
}
