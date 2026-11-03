import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Debits & Deploy brand pieces, following the Substack cover: orange uppercase section label,
// bold title with a short orange bar under it, and the "Debits & Deploy" wordmark.

export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return <Image src="/logo.png" alt="" width={size} height={size} className={className} priority />;
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-bold tracking-tight", className)}>
      Debits <span className="text-brand-deep">&amp;</span> Deploy
    </span>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("text-xs font-semibold tracking-[0.18em] text-brand-deep uppercase", className)}>{children}</span>
  );
}

export function PageTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <h1 className="text-2xl font-bold tracking-tight">{children}</h1>
      <span className="h-1 w-12 rounded-full bg-brand" aria-hidden />
    </div>
  );
}
