import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getContract } from "@/lib/contract-detail";
import { ReviewScreen } from "./review-screen";

// Review screen: the PDF beside the extracted fields. ?field=<name> opens with that field's quote highlighted.
export default function ContractPage({ params, searchParams }: PageProps<"/contracts/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading contract…</p>}>
      <Contract params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Contract({ params, searchParams }: Pick<PageProps<"/contracts/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const { field } = await searchParams;
  const contract = await getContract(id);
  if (!contract) notFound();
  return <ReviewScreen key={contract.id} contract={contract} initialField={typeof field === "string" ? field : null} />;
}
