import Link from "next/link";
import { Suspense } from "react";
import { Logo, SectionLabel, Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { signOut } from "../login/actions";

// Shell for every signed-in page. The header renders immediately; the part that reads the session
// streams in behind a Suspense boundary (required with Cache Components).
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center gap-6 border-b bg-card/60 px-6 py-3">
        <Link href="/" className="flex items-center gap-3">
          <Logo size={30} />
          <span className="flex flex-col leading-tight">
            <Wordmark className="text-base" />
            <SectionLabel className="text-[0.65rem]">Contract extraction</SectionLabel>
          </span>
        </Link>
        <nav className="flex gap-4 text-sm font-medium text-muted-foreground">
          <Link href="/" className="hover:text-brand-deep">
            Contracts
          </Link>
          <Link href="/upload" className="hover:text-brand-deep">
            Upload
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <Suspense fallback={null}>
            <SignedInUser />
          </Suspense>
        </div>
      </header>
      <main className="flex flex-1 flex-col p-6">{children}</main>
    </div>
  );
}

async function SignedInUser() {
  const user = await requireUser();
  return (
    <>
      <span className="text-muted-foreground">{user.email}</span>
      <form action={signOut}>
        <Button type="submit" variant="outline" size="sm">
          Sign out
        </Button>
      </form>
    </>
  );
}
