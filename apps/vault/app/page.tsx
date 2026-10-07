"use client";
import { Dashboard } from "@/components/Dashboard";
import { Onboarding } from "@/components/Onboarding";
import { SessionProvider, useSession } from "@/components/SessionProvider";

function Vault() {
  const { status } = useSession();
  if (status === "ready") return <Dashboard />;
  // Stay signed in: a stored session is being opened; don't flash the sign-up screen meanwhile.
  if (status === "restoring") return <main className="grid min-h-dvh place-items-center text-ink-soft">Opening your vault…</main>;
  return <Onboarding locked={status === "locked"} />;
}

export default function Page() {
  return (
    <SessionProvider>
      <Vault />
    </SessionProvider>
  );
}
