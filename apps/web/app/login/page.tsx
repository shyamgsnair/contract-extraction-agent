import { Logo, SectionLabel, Wordmark } from "@/components/brand";
import { LoginForm } from "./login-form";

// Laid out like the Debits & Deploy cover: label, big title and orange bar on the left, logo on the right.
export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col px-8 py-10 md:px-16">
      <div className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-12 md:grid-cols-2">
        <div className="flex flex-col gap-6">
          <SectionLabel>Contract extraction</SectionLabel>
          <h1 className="text-5xl leading-tight font-bold tracking-tight">
            Read the contract.
            <br />
            Trust the numbers.
          </h1>
          <span className="h-1.5 w-16 rounded-full bg-brand" aria-hidden />
          <p className="max-w-sm text-muted-foreground">
            Key terms extracted by Claude, every value traced to its source quote, checked in code and reviewed by a
            person.
          </p>
          <div className="max-w-sm rounded-xl border bg-card p-5 shadow-sm">
            <LoginForm />
            <p className="mt-3 text-xs text-muted-foreground">Accounts are created by an administrator.</p>
          </div>
        </div>
        <div className="hidden justify-center md:flex">
          <Logo size={340} />
        </div>
      </div>
      <Wordmark className="mx-auto w-full max-w-5xl text-lg" />
    </main>
  );
}
