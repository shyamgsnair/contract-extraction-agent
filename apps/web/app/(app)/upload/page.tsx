import { Suspense } from "react";
import { PageTitle } from "@/components/brand";
import { listRecentUploads } from "@/lib/uploads";
import { RecentUploads } from "./recent-uploads";
import { UploadPanel } from "./upload-panel";

export default function UploadPage() {
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageTitle>Upload contracts</PageTitle>
      <UploadPanel />
      <h2 className="text-lg font-semibold">Recent uploads</h2>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <Uploads />
      </Suspense>
    </div>
  );
}

async function Uploads() {
  return <RecentUploads rows={await listRecentUploads()} />;
}
