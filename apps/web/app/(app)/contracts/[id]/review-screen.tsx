"use client";

import { ArrowLeft, Check, CircleAlert, Pencil } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DOCUMENT_TYPES,
  NO_RESPONSE,
  fieldInfo,
  formatValue,
  type PoAcceptanceValue,
  type PriceRowValue,
} from "@/lib/field-format";
import type { ContractDetail, ReviewField } from "@/lib/review-types";
import { cn } from "@/lib/utils";
import { approveField, approveRemaining, correctField, type ActionResult } from "./actions";

// PDF.js only runs in the browser, so the viewer is loaded on the client only.
const PdfViewer = dynamic(() => import("@/components/pdf-viewer"), {
  ssr: false,
  loading: () => <p className="text-sm text-muted-foreground">Loading viewer…</p>,
});

export function ReviewScreen({ contract, initialField }: { contract: ContractDetail; initialField: string | null }) {
  const router = useRouter();
  const initial = contract.fields.find((f) => f.field === initialField) ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(initial?.id ?? null);
  const [page, setPage] = useState(initial?.page ?? 1);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const selected = contract.fields.find((f) => f.id === selectedId) ?? null;
  const toReview = contract.fields.filter((f) => f.reviewStatus === "pending").length;

  function select(field: ReviewField) {
    setSelectedId(field.id);
    if (field.page) setPage(field.page);
    // Keep the URL shareable: /contracts/<id>?field=<name> reopens this field.
    window.history.replaceState(null, "", `?field=${encodeURIComponent(field.field)}`);
  }

  function run(action: () => Promise<ActionResult>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
      else {
        after?.();
        router.refresh();
      }
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Contracts
        </Link>
        <h1 className="text-lg font-semibold">{contract.fileName}</h1>
        {contract.needsReview && <Badge variant="destructive">Failed verification</Badge>}
        {contract.reviewStatus === "approved" ? (
          <Badge>Approved</Badge>
        ) : (
          <Badge variant="secondary">{toReview} to review</Badge>
        )}
        {contract.run && (
          <span className="text-xs text-muted-foreground">
            Extracted {new Date(contract.run.startedAt).toLocaleDateString()} · {contract.run.model} · prompt{" "}
            {contract.run.promptVersion} · {contract.run.repairRounds ?? 0} repair round(s)
          </span>
        )}
        <Button
          className="ml-auto"
          size="sm"
          disabled={pending || toReview === 0}
          title="Approves every field not yet reviewed. Corrections you made are kept."
          onClick={() => run(() => approveRemaining(contract.id))}
        >
          <Check /> {toReview === 0 ? "All approved" : "Approve all"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="h-[80vh] min-h-0">
          <PdfViewer url={contract.pdfUrl} page={page} onPageChange={setPage} quote={selected?.page === page ? selected.quote : null} />
        </div>
        <div className="flex h-[80vh] min-h-0 flex-col gap-2 overflow-auto pr-1">
          {contract.fields.length === 0 && <p className="text-sm text-muted-foreground">No extracted fields.</p>}
          {contract.fields.map((field) => (
            <FieldCard
              key={field.id}
              field={field}
              selected={field.id === selectedId}
              busy={pending}
              onSelect={() => select(field)}
              onApprove={() => run(() => approveField(contract.id, field.id))}
              onCorrect={(value, done) => run(() => correctField(contract.id, field.id, value), done)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FieldCard({
  field,
  selected,
  busy,
  onSelect,
  onApprove,
  onCorrect,
}: {
  field: ReviewField;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onApprove: () => void;
  onCorrect: (value: unknown, done: () => void) => void;
}) {
  const [editing, setEditing] = useState(false);
  const { label } = fieldInfo(field.field);

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3 text-sm",
        selected ? "border-primary ring-1 ring-primary" : "hover:bg-muted/40",
      )}
    >
      <button type="button" className="flex flex-col gap-1 text-left" onClick={onSelect}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{label}</span>
          <QuoteBadge status={field.quoteStatus} />
          {field.confidence && <Badge variant="outline">{field.confidence} confidence</Badge>}
          <ReviewBadge field={field} />
          {field.page && <span className="ml-auto text-xs text-muted-foreground">p. {field.page}</span>}
        </div>
        <span className={field.currentValue === null ? "text-muted-foreground" : ""}>
          {formatValue(field.field, field.currentValue)}
        </span>
        {field.reviewStatus === "corrected" && (
          <span className="text-xs text-muted-foreground line-through">Extracted: {formatValue(field.field, field.value)}</span>
        )}
      </button>

      {selected && (
        <div className="flex flex-col gap-2">
          {field.quote && <blockquote className="border-l-2 pl-2 text-xs text-muted-foreground italic">“{field.quote}”</blockquote>}
          {field.note && <p className="text-xs text-muted-foreground">Note: {field.note}</p>}
          {field.issues.map((issue) => (
            <p key={issue} className="flex items-start gap-1 text-xs text-destructive">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" /> {issue}
            </p>
          ))}
          {editing ? (
            <CorrectionForm
              field={field}
              busy={busy}
              onCancel={() => setEditing(false)}
              onSave={(value) => onCorrect(value, () => setEditing(false))}
            />
          ) : (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={busy || field.reviewStatus === "approved"} onClick={onApprove}>
                <Check /> Approve
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing(true)}>
                <Pencil /> Correct
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QuoteBadge({ status }: { status: ReviewField["quoteStatus"] }) {
  if (status === "verified") return <Badge variant="secondary">Quote verified</Badge>;
  if (status === "not_found") return <Badge variant="destructive">Quote not found</Badge>;
  return null;
}

function ReviewBadge({ field }: { field: ReviewField }) {
  if (field.reviewStatus === "pending") return null;
  const who = field.reviewedByEmail ? ` by ${field.reviewedByEmail}` : "";
  return (
    <Badge variant={field.reviewStatus === "corrected" ? "default" : "outline"} title={`${field.reviewStatus}${who}`}>
      {field.reviewStatus === "corrected" ? "Corrected" : "Approved"}
    </Badge>
  );
}

/** An input matching the field's type. Empty inputs mean "the contract does not state this" (null). */
function CorrectionForm({
  field,
  busy,
  onSave,
  onCancel,
}: {
  field: ReviewField;
  busy: boolean;
  onSave: (value: unknown) => void;
  onCancel: () => void;
}) {
  const { kind } = fieldInfo(field.field);
  const current = field.currentValue;
  const [text, setText] = useState(current === null || typeof current === "object" ? "" : String(current));
  const po = (current as PoAcceptanceValue | null) ?? null;
  const [poDays, setPoDays] = useState(po ? String(po.days) : "");
  const [poDayType, setPoDayType] = useState<string>(po?.dayType ?? "business");
  const [poIfNoResponse, setPoIfNoResponse] = useState<string>(po?.ifNoResponse ?? "not_stated");
  const row = (current as PriceRowValue | null) ?? { item: "", unitPrice: 0, currency: "USD", unitOfMeasure: "" };
  const [item, setItem] = useState(row.item);
  const [unitPrice, setUnitPrice] = useState(String(row.unitPrice || ""));
  const [currency, setCurrency] = useState(row.currency);
  const [unit, setUnit] = useState(row.unitOfMeasure);

  function value(): unknown {
    const blankToNull = (s: string) => (s.trim() === "" ? null : s.trim());
    switch (kind) {
      case "boolean":
        return text === "" ? null : text === "true";
      case "days":
        return text === "" ? null : Number(text);
      case "poAcceptance":
        return poDays === "" ? null : { days: Number(poDays), dayType: poDayType, ifNoResponse: poIfNoResponse };
      case "priceRow":
        return { item: item.trim(), unitPrice: Number(unitPrice), currency: currency.trim().toUpperCase(), unitOfMeasure: unit.trim() };
      default:
        return blankToNull(text);
    }
  }

  let input: ReactNode;
  switch (kind) {
    case "documentType":
      input = (
        <NativeSelect value={text} onChange={setText}>
          <option value="">Not stated</option>
          {Object.entries(DOCUMENT_TYPES).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </NativeSelect>
      );
      break;
    case "boolean":
      input = (
        <NativeSelect value={text} onChange={setText}>
          <option value="">Not stated</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </NativeSelect>
      );
      break;
    case "date":
      input = <Input type="date" value={text} onChange={(e) => setText(e.target.value)} />;
      break;
    case "days":
      input = <Input type="number" min={1} value={text} onChange={(e) => setText(e.target.value)} placeholder="Not stated" />;
      break;
    case "longText":
      input = (
        <textarea
          className="min-h-20 rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='Leave empty if not stated; "None" if the contract says there is none'
        />
      );
      break;
    case "poAcceptance":
      input = (
        <div className="flex flex-wrap gap-2">
          <Input type="number" min={1} className="w-20" value={poDays} onChange={(e) => setPoDays(e.target.value)} placeholder="Days" />
          <NativeSelect value={poDayType} onChange={setPoDayType}>
            <option value="business">business days</option>
            <option value="calendar">calendar days</option>
          </NativeSelect>
          <NativeSelect value={poIfNoResponse} onChange={setPoIfNoResponse}>
            {Object.entries(NO_RESPONSE).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </div>
      );
      break;
    case "priceRow":
      input = (
        <div className="grid grid-cols-2 gap-2">
          <Input className="col-span-2" value={item} onChange={(e) => setItem(e.target.value)} placeholder="Item" />
          <Input type="number" step="0.01" min={0} value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="Unit price" />
          <Input value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="Currency (USD)" maxLength={3} />
          <Input className="col-span-2" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unit (kilogram, bottle…)" />
        </div>
      );
      break;
    default:
      input = <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Not stated" />;
  }

  return (
    <div className="flex flex-col gap-2">
      {input}
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={() => onSave(value())}>
          Save correction
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function NativeSelect({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <select
      className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {children}
    </select>
  );
}
