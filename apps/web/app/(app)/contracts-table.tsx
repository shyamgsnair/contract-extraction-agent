"use client";

import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type Row,
  type ColumnVisibilityState as VisibilityState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ContractRow } from "@/lib/contracts";
import { DOCUMENT_TYPES, NO_RESPONSE } from "@/lib/field-format";

// The contract table: one row per contract, extracted fields as columns. Sorting, filtering and
// column visibility all run in the browser, which is plenty for a PoC-sized list.

type R = ContractRow;

const features = tableFeatures({
  columnFilteringFeature,
  columnVisibilityFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
});
const helper = createColumnHelper<typeof features, R>();

/** Sorts any column with empty values last, whichever direction is chosen. */
function nullsLast(a: Row<typeof features, R>, b: Row<typeof features, R>, columnId: string): number {
  const x = a.getValue(columnId) as string | number | boolean | null;
  const y = b.getValue(columnId) as string | number | boolean | null;
  if (x === y) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return x < y ? -1 : 1;
}

const yesNo = (v: boolean | null) => (v === null ? null : v ? "Yes" : "No");

/**
 * Each column knows which extracted field it shows, so clicking a value opens that field's source quote.
 * `field: null` columns (file, status) just open the contract.
 */
const columns = helper.columns([
  helper.accessor("vendorName", {
    header: "Vendor",
    sortFn: nullsLast,
    filterFn: (row, id, value: string) =>
      String(row.getValue(id) ?? "")
        .toLowerCase()
        .includes(value.toLowerCase()),
    meta: { field: "vendorName" },
  }),
  helper.accessor("customerName", { header: "Customer", sortFn: nullsLast, meta: { field: "customerName" } }),
  helper.accessor("documentType", {
    header: "Type",
    sortFn: nullsLast,
    filterFn: (row, id, value: string) => row.getValue(id) === value,
    cell: (info) => (info.getValue() ? DOCUMENT_TYPES[info.getValue()!] ?? info.getValue() : null),
    meta: { field: "documentType" },
  }),
  helper.accessor("effectiveDate", { header: "Effective", sortFn: nullsLast, meta: { field: "effectiveDate" } }),
  helper.accessor("expirationDate", {
    header: "Expires",
    sortFn: nullsLast,
    // "Expiring before": only contracts with a stated expiration date earlier than the chosen date.
    filterFn: (row, id, before: string) => {
      const date = row.getValue(id) as string | null;
      return date !== null && date < before;
    },
    meta: { field: "expirationDate" },
  }),
  helper.accessor("autoRenews", {
    header: "Auto-renews",
    sortFn: nullsLast,
    filterFn: (row, id, value: string) => String(row.getValue(id)) === value,
    cell: (info) => yesNo(info.getValue()),
    meta: { field: "autoRenews" },
  }),
  helper.accessor("paymentTermsDays", {
    header: "Payment terms",
    sortFn: nullsLast,
    filterFn: (row, id, above: number) => {
      const days = row.getValue(id) as number | null;
      return days !== null && days > above;
    },
    cell: (info) => (info.getValue() === null ? null : `Net ${info.getValue()}`),
    meta: { field: "paymentTermsDays" },
  }),
  helper.accessor("poAcceptanceDays", {
    header: "PO acceptance",
    sortFn: nullsLast,
    cell: ({ row }) => {
      const r = row.original;
      if (r.poAcceptanceDays === null) return null;
      const response = r.poIfNoResponse ? `, ${NO_RESPONSE[r.poIfNoResponse]}` : "";
      return `${r.poAcceptanceDays} ${r.poAcceptanceDayType ?? ""} days${response}`;
    },
    meta: { field: "poAcceptance" },
  }),
  helper.accessor("priceItems", {
    header: "Prices",
    sortFn: nullsLast,
    cell: (info) => (info.getValue() === 0 ? null : `${info.getValue()} item${info.getValue() === 1 ? "" : "s"}`),
    meta: { field: "priceList[0]" },
  }),
  helper.accessor("priceEscalation", { header: "Price escalation", sortFn: nullsLast, meta: { field: "priceEscalation" } }),
  helper.accessor("minimumCommitment", {
    header: "Minimum commitment",
    sortFn: nullsLast,
    meta: { field: "minimumCommitment" },
  }),
  helper.accessor("status", {
    header: "Status",
    sortFn: nullsLast,
    filterFn: (row, id, value: string) => row.getValue(id) === value,
    cell: (info) => {
      const status = info.getValue();
      if (status === "approved") return <Badge>Approved</Badge>;
      if (status === "flagged") return <Badge variant="destructive">Failed verification</Badge>;
      return <Badge variant="secondary">To review</Badge>;
    },
    meta: { field: null },
  }),
  helper.accessor("fileName", { header: "File", sortFn: nullsLast, meta: { field: null } }),
]);

const DEFAULT_VISIBILITY: VisibilityState = {
  customerName: false,
  priceEscalation: false,
  minimumCommitment: false,
  fileName: false,
};
const VISIBILITY_KEY = "cea.contracts.columns";

export function ContractsTable({ rows }: { rows: R[] }) {
  const router = useRouter();
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(DEFAULT_VISIBILITY);

  // Remember the chosen columns in this browser. Storage can be unavailable (private mode), so failures are ignored.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VISIBILITY_KEY);
      if (saved) setColumnVisibility(JSON.parse(saved));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(VISIBILITY_KEY, JSON.stringify(columnVisibility));
    } catch {}
  }, [columnVisibility]);

  const table = useTable({
    features,
    columns,
    data: rows,
    state: { columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
  });

  const filterValue = (id: string) => (table.getColumn(id)?.getFilterValue() as string | number | undefined) ?? "";
  const setFilter = (id: string, value: string | number | undefined) =>
    table.getColumn(id)?.setFilterValue(value === "" ? undefined : value);
  const visibleRows = table.getRowModel().rows;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Filter label="Vendor">
          <Input
            className="h-8 w-44"
            placeholder="Any vendor"
            value={filterValue("vendorName")}
            onChange={(e) => setFilter("vendorName", e.target.value)}
          />
        </Filter>
        <Filter label="Type">
          <Select value={filterValue("documentType")} onChange={(v) => setFilter("documentType", v)}>
            <option value="">Any type</option>
            {Object.entries(DOCUMENT_TYPES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Filter>
        <Filter label="Expiring before">
          <Input
            type="date"
            className="h-8 w-40"
            value={filterValue("expirationDate")}
            onChange={(e) => setFilter("expirationDate", e.target.value)}
          />
        </Filter>
        <Filter label="Auto-renews">
          <Select value={filterValue("autoRenews")} onChange={(v) => setFilter("autoRenews", v)}>
            <option value="">Any</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </Select>
        </Filter>
        <Filter label="Payment terms above (days)">
          <Input
            type="number"
            min={0}
            className="h-8 w-28"
            placeholder="Any"
            value={filterValue("paymentTermsDays")}
            onChange={(e) => setFilter("paymentTermsDays", e.target.value === "" ? undefined : Number(e.target.value))}
          />
        </Filter>
        <Filter label="Status">
          <Select value={filterValue("status")} onChange={(v) => setFilter("status", v)}>
            <option value="">Any</option>
            <option value="to_review">To review</option>
            <option value="flagged">Failed verification</option>
            <option value="approved">Approved</option>
          </Select>
        </Filter>
        <Button variant="ghost" size="sm" onClick={() => table.resetColumnFilters()}>
          Clear filters
        </Button>
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
              <Columns3 /> Columns
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {table.getAllLeafColumns().map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={column.getIsVisible()}
                  onCheckedChange={(checked) => column.toggleVisibility(Boolean(checked))}
                >
                  {String(column.columnDef.header)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const Icon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;
                  return (
                    <TableHead key={header.id}>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <table.FlexRender header={header} />
                        <Icon className={sorted ? "size-3.5" : "size-3.5 opacity-40"} />
                      </button>
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {visibleRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={table.getVisibleLeafColumns().length} className="h-24 text-center text-muted-foreground">
                  {rows.length === 0 ? "No contracts yet." : "No contracts match these filters."}
                </TableCell>
              </TableRow>
            ) : (
              visibleRows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/contracts/${row.original.id}`)}
                >
                  {row.getVisibleCells().map((cell) => {
                    const field = (cell.column.columnDef.meta as { field: string | null } | undefined)?.field;
                    const empty = cell.getValue() === null || (cell.column.id === "priceItems" && cell.getValue() === 0);
                    return (
                      <TableCell key={cell.id} className="max-w-64 truncate">
                        {empty ? (
                          <span className="text-muted-foreground">—</span>
                        ) : field ? (
                          // Clicking a value opens the contract at that field's source quote; the row click opens it plainly.
                          <Link
                            href={`/contracts/${row.original.id}?field=${encodeURIComponent(field)}`}
                            className="hover:underline"
                            title="Show source in the contract"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <table.FlexRender cell={cell} />
                          </Link>
                        ) : (
                          <table.FlexRender cell={cell} />
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-sm text-muted-foreground">
        Showing {visibleRows.length} of {rows.length} contracts. Click a value to see where it came from.
      </p>
    </div>
  );
}

function Filter({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string | number;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <select
      className="h-8 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {children}
    </select>
  );
}
