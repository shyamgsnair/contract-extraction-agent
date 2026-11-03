import { Suspense } from "react";
import { PageTitle } from "@/components/brand";
import { listContracts } from "@/lib/contracts";
import { ContractsTable } from "./contracts-table";

export default function ContractsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageTitle>Contracts</PageTitle>
      <Suspense fallback={<p className="text-muted-foreground">Loading contracts…</p>}>
        <Contracts />
      </Suspense>
    </div>
  );
}

async function Contracts() {
  const rows = await listContracts();
  return <ContractsTable rows={rows} />;
}
