import React, { useState } from "react";
import {
  ArrowUpRight,
  Building2,
  CircleDollarSign,
  ClipboardCheck,
  Download,
  FileText,
  LayoutDashboard,
  Monitor,
  Moon,
  MoreHorizontal,
  Pencil,
  Plus,
  ReceiptText,
  Search,
  Sun,
  Trash2,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CommandDialog,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Amount } from "@/components/amount";
import { STATUS_MAP, StatusBadge } from "@/components/status-badge";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { useTheme } from "@/components/theme-provider";
import {
  formatCurrency,
  formatCurrencyCompact,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import { cn } from "@/lib/utils";

/*
 * Design-system review page (ADMIN only, /styleguide). Renders every component in
 * src/components/ui with fictional sample data. Not linked from production workflows.
 */

const SECTIONS = [
  ["foundations", "Foundations"],
  ["formatting", "Formatting"],
  ["buttons", "Buttons"],
  ["forms", "Form controls"],
  ["badges", "Badges & status"],
  ["cards", "Cards"],
  ["table", "Table"],
  ["overlays", "Dialog & Sheet"],
  ["menus", "Menu, Tabs & Tooltip"],
  ["feedback", "Toast & states"],
  ["command", "Command"],
];

const COLOR_GROUPS = [
  {
    title: "Surfaces",
    tokens: ["background", "card", "popover", "muted", "accent", "border", "border-strong", "input"],
  },
  {
    title: "Text",
    tokens: ["foreground", "subtle-foreground", "muted-foreground"],
  },
  {
    title: "Accent",
    tokens: ["primary", "primary-hover", "primary-subtle", "primary-border", "ring"],
  },
  {
    title: "Semantic",
    tokens: [
      "success", "success-subtle", "success-border",
      "warning", "warning-subtle", "warning-border",
      "danger", "danger-subtle", "danger-border",
      "info", "info-subtle", "info-border",
    ],
  },
  {
    title: "Charts",
    tokens: ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"],
  },
];

const TYPE_SCALE = [
  ["text-2xl font-semibold tracking-tight", "Page title", "24 / semibold"],
  ["text-lg font-semibold tracking-tight", "Section title", "18 / semibold"],
  ["text-base font-semibold", "Card title", "16 / semibold"],
  ["text-sm", "Body and table text", "14 / regular"],
  ["text-sm text-muted-foreground", "Secondary text", "14 / muted"],
  ["text-xs font-medium text-muted-foreground", "Label and table header", "12 / medium"],
];

const SPACING = [1, 2, 3, 4, 6, 8];

const SAMPLE_INVOICES = [
  { id: 1, number: "INV-2026-0142", vendor: "Acme Supplies", due: "2026-11-28", amount: "123456.00", status: "PENDING_APPROVAL" },
  { id: 2, number: "INV-2026-0139", vendor: "Northwind Logistics", due: "2026-11-12", amount: "8450.50", status: "EXCEPTION" },
  { id: 3, number: "INV-2026-0131", vendor: "Globex Components", due: "2026-10-30", amount: "1245000.00", status: "APPROVED" },
  { id: 4, number: "INV-2026-0127", vendor: "Initech Services", due: "2026-10-21", amount: "56000.00", status: "PAID" },
  { id: 5, number: null, vendor: "Umbrella Paper Co.", due: null, amount: "990.00", status: "VALIDATION_FAILED" },
];

const KIND_LABELS = {
  invoice: "Invoice",
  payment: "Payment",
  vendor: "Vendor",
  onboarding: "Vendor onboarding",
  approval: "Approval",
  purchaseOrder: "Purchase order",
  verification: "GST / bank verification",
  delivery: "Integration delivery",
  inboundEmail: "Inbound email",
  employee: "Employee",
};

export default function Styleguide() {
  const [commandOpen, setCommandOpen] = useState(false);

  return (
    <div
      data-ui=""
      className="min-h-[calc(100dvh-3.5rem)] bg-background text-foreground"
    >
      <StyleguideHeader />

      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-6 py-8 lg:px-8">
        <FoundationsSection />
        <FormattingSection />
        <ButtonsSection />
        <FormsSection />
        <BadgesSection />
        <CardsSection />
        <TableSection />
        <OverlaysSection />
        <MenusSection />
        <FeedbackSection />
        <CommandSection onOpenPalette={() => setCommandOpen(true)} />
      </div>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </div>
  );
}

function StyleguideHeader() {
  return (
    <header className="sticky top-14 z-20 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4 lg:px-8">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-semibold tracking-tight">Design system</h1>
          <p className="text-sm text-muted-foreground">
            Components in <code className="font-mono text-xs">src/components/ui</code>. Review in both themes.
          </p>
        </div>
        <ThemeSwitcher />
      </div>
      <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-6 pb-2 lg:px-8">
        {SECTIONS.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="whitespace-nowrap rounded-md px-2.5 py-1 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {label}
          </a>
        ))}
      </nav>
    </header>
  );
}

function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const options = [
    ["light", "Light", Sun],
    ["dark", "Dark", Moon],
    ["system", "System", Monitor],
  ];
  return (
    <Tabs value={theme} onValueChange={setTheme}>
      <TabsList aria-label="Theme">
        {options.map(([value, label, Icon]) => (
          <TabsTrigger key={value} value={value}>
            <Icon aria-hidden="true" />
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

function Section({ id, title, description, children }) {
  return (
    <section id={id} className="flex scroll-mt-48 flex-col gap-6">
      <div className="flex flex-col gap-1 border-b border-border pb-4">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Specimen({ title, children, className }) {
  return (
    <div className="flex flex-col gap-3">
      {title && <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>}
      <div className={cn("flex flex-wrap items-center gap-3", className)}>{children}</div>
    </div>
  );
}

function FoundationsSection() {
  return (
    <Section
      id="foundations"
      title="Foundations"
      description="Every value is a CSS variable in src/styles/theme.css with a light and a dark definition."
    >
      <div className="grid gap-8">
        {COLOR_GROUPS.map((group) => (
          <Specimen key={group.title} title={group.title} className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {group.tokens.map((token) => (
              <ColorSwatch key={token} token={token} />
            ))}
          </Specimen>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Type scale</CardTitle>
            <CardDescription>Inter Variable. Numbers in amounts and tables use tabular figures.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {TYPE_SCALE.map(([classes, sample, meta]) => (
              <div key={sample} className="flex items-baseline justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0">
                <span className={classes}>{sample}</span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{meta}</span>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-4 rounded-md bg-muted p-4 text-sm">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Proportional</p>
                <p>₹1,11,111.11</p>
                <p>₹8,88,888.88</p>
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Tabular (used)</p>
                <p className="tabular-nums">₹1,11,111.11</p>
                <p className="tabular-nums">₹8,88,888.88</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Spacing & radius</CardTitle>
            <CardDescription>8px grid; 4px half-steps only inside controls.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {SPACING.map((step) => (
              <div key={step} className="flex items-center gap-3">
                <span className="w-12 font-mono text-xs text-muted-foreground">{step * 4}px</span>
                <span className="h-3 rounded-sm bg-primary" style={{ width: `${step * 4}px` }} />
              </div>
            ))}
            <div className="mt-2 flex gap-3">
              {["rounded-sm", "rounded-md", "rounded-lg", "rounded-xl"].map((radius) => (
                <div key={radius} className="flex flex-col items-center gap-1">
                  <div className={cn("size-12 border border-border-strong bg-muted", radius)} />
                  <span className="font-mono text-[11px] text-muted-foreground">{radius.replace("rounded-", "")}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </Section>
  );
}

function ColorSwatch({ token }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="h-12 rounded-md border border-border"
        style={{ background: `var(--${token})` }}
      />
      <span className="truncate font-mono text-[11px] text-muted-foreground">--{token}</span>
    </div>
  );
}

function FormattingSection() {
  const rows = [
    ["formatCurrency(123456)", formatCurrency(123456)],
    ["formatCurrency(\"12345678.9\")", formatCurrency("12345678.9")],
    ["formatCurrency(-1250.5)", formatCurrency(-1250.5)],
    ["formatCurrency(null)", formatCurrency(null)],
    ["formatCurrencyCompact(2500000)", formatCurrencyCompact(2500000)],
    ["formatNumber(\"1500.250\")", formatNumber("1500.250")],
    ["formatPercent(92.456)", formatPercent(92.456)],
    ["formatDate(\"2026-11-19\")", formatDate("2026-11-19")],
    ["formatDateTime(\"2026-11-19T10:15:00Z\")", formatDateTime("2026-11-19T10:15:00Z")],
    ["formatDate(\"not a date\")", formatDate("not a date")],
  ];
  return (
    <Section
      id="formatting"
      title="Formatting"
      description="src/lib/format.js: INR with Indian digit grouping; empty or invalid input renders an em dash."
    >
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Call</TableHead>
              <TableHead numeric>Output</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(([call, output]) => (
              <TableRow key={call}>
                <TableCell className="font-mono text-xs text-muted-foreground">{call}</TableCell>
                <TableCell numeric className="font-medium">{output}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </Section>
  );
}

function ButtonsSection() {
  const [saving, setSaving] = useState(false);
  const save = () => {
    setSaving(true);
    window.setTimeout(() => setSaving(false), 1500);
  };
  return (
    <Section id="buttons" title="Buttons" description="One primary action per view; outline for secondary; ghost inside toolbars and rows.">
      <Specimen title="Variants">
        <Button>
          <Plus />
          New invoice
        </Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">
          <Download />
          Export CSV
        </Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">
          <Trash2 />
          Delete rule
        </Button>
        <Button variant="link">View all</Button>
      </Specimen>
      <Specimen title="Sizes">
        <Button size="sm">Small</Button>
        <Button>Default</Button>
        <Button size="lg">Large</Button>
        <Button size="icon" variant="outline" aria-label="Edit">
          <Pencil />
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label="More actions">
          <MoreHorizontal />
        </Button>
      </Specimen>
      <Specimen title="States">
        <Button loading={saving} onClick={save}>
          {saving ? "Saving…" : "Click to load"}
        </Button>
        <Button disabled>Disabled</Button>
        <Button variant="outline" disabled>Disabled outline</Button>
      </Specimen>
    </Section>
  );
}

function FormsSection() {
  const [vendor, setVendor] = useState("");
  return (
    <Section id="forms" title="Form controls" description="Labels above fields; helper and error text below. Invalid state comes from aria-invalid.">
      <Card>
        <CardContent className="grid gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="sg-invoice-number">Invoice number</Label>
            <Input id="sg-invoice-number" placeholder="e.g. INV-2026-0142" />
            <p className="text-xs text-muted-foreground">As printed on the vendor's invoice.</p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="sg-vendor">Vendor</Label>
            <Select value={vendor} onValueChange={setVendor}>
              <SelectTrigger id="sg-vendor">
                <SelectValue placeholder="Select vendor" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Active vendors</SelectLabel>
                  <SelectItem value="acme">Acme Supplies</SelectItem>
                  <SelectItem value="globex">Globex Components</SelectItem>
                  <SelectItem value="northwind">Northwind Logistics</SelectItem>
                </SelectGroup>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>Pending onboarding</SelectLabel>
                  <SelectItem value="umbrella" disabled>Umbrella Paper Co.</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="sg-total">Total amount</Label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">₹</span>
              <Input id="sg-total" inputMode="decimal" className="pl-7 text-right tabular-nums" defaultValue="1,23,456.00" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="sg-gstin">GSTIN</Label>
            <Input id="sg-gstin" aria-invalid="true" defaultValue="29ABCDE1234" aria-describedby="sg-gstin-error" />
            <p id="sg-gstin-error" className="text-xs text-danger">Enter a valid 15-character GSTIN.</p>
          </div>

          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="sg-comments">Rejection reason</Label>
            <Textarea id="sg-comments" placeholder="Explain why this invoice is being rejected" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="sg-search">With icon</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="sg-search" className="pl-9" placeholder="Search invoices" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="sg-disabled">Disabled</Label>
            <Input id="sg-disabled" disabled defaultValue="Read-only for auditors" />
          </div>
        </CardContent>
      </Card>
    </Section>
  );
}

function BadgesSection() {
  return (
    <Section
      id="badges"
      title="Badges & status"
      description="StatusBadge covers every status value in backend/ap_app/models.py. Green = done, amber = waiting on a person, blue = in progress, red = needs attention, grey = inactive."
    >
      <Specimen title="Badge variants">
        {["neutral", "primary", "success", "warning", "danger", "info", "outline"].map((variant) => (
          <Badge key={variant} variant={variant}>
            {variant}
          </Badge>
        ))}
      </Specimen>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(STATUS_MAP).map(([kind, statuses]) => (
          <Card key={kind}>
            <CardHeader className="pt-4">
              <CardTitle className="text-sm">{KIND_LABELS[kind]}</CardTitle>
              <CardDescription className="font-mono text-[11px]">kind="{kind}"</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2 py-4">
              {Object.keys(statuses).map((value) => (
                <StatusBadge key={value} kind={kind} status={value} />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Specimen title="Unknown value fallback">
        <StatusBadge status="SOMETHING_NEW" />
      </Specimen>
    </Section>
  );
}

function CardsSection() {
  const metrics = [
    ["Outstanding payables", <Amount key="a" value="2547300.5" />, "+4.2% vs last month", ReceiptText],
    ["Pending approvals", "14", "3 due in the next 24h", ClipboardCheck],
    ["Paid this month", <Amount key="b" value="1890000" />, "62 payments", CircleDollarSign],
    ["Active vendors", "128", "5 awaiting onboarding", Building2],
  ];
  return (
    <Section id="cards" title="Cards" description="Borders, not shadows, separate surfaces. Metric values use tabular numbers.">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map(([label, value, hint, Icon]) => (
          <Card key={label}>
            <CardContent className="flex flex-col gap-3 p-5">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium">{label}</span>
                <Icon className="size-4" aria-hidden="true" />
              </div>
              <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
              <span className="text-xs text-muted-foreground">{hint}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Invoice INV-2026-0142</CardTitle>
          <CardDescription>Acme Supplies · due {formatDate("2026-11-28")}</CardDescription>
          <CardAction>
            <StatusBadge kind="invoice" status="PENDING_APPROVAL" />
          </CardAction>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="text-right"><Amount value="104624" /></dd>
            <dt className="text-muted-foreground">GST (18%)</dt>
            <dd className="text-right"><Amount value="18832" /></dd>
            <dt className="font-medium">Total</dt>
            <dd className="text-right font-semibold"><Amount value="123456" /></dd>
          </dl>
        </CardContent>
        <CardFooter className="justify-end">
          <Button variant="outline" size="sm">Reject</Button>
          <Button size="sm">Approve</Button>
        </CardFooter>
      </Card>
    </Section>
  );
}

function TableSection() {
  const total = SAMPLE_INVOICES.reduce((sum, row) => sum + Number(row.amount), 0);
  return (
    <Section id="table" title="Table" description="Numeric columns are right-aligned with tabular digits. Row actions live in a menu.">
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Due date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead numeric>Amount</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {SAMPLE_INVOICES.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">
                  {row.number || <span className="text-muted-foreground">Needs review</span>}
                </TableCell>
                <TableCell>{row.vendor}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(row.due)}</TableCell>
                <TableCell>
                  <StatusBadge kind="invoice" status={row.status} />
                </TableCell>
                <TableCell numeric className="font-medium">{formatCurrency(row.amount)}</TableCell>
                <TableCell>
                  <RowActions />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={4}>Total ({SAMPLE_INVOICES.length} invoices)</TableCell>
              <TableCell numeric>{formatCurrency(total)}</TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </Card>
    </Section>
  );
}

function RowActions() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Invoice actions">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>
          <FileText />
          Open invoice
        </DropdownMenuItem>
        <DropdownMenuItem>
          <ArrowUpRight />
          Submit for approval
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">
          <Trash2 />
          Reject
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OverlaysSection() {
  return (
    <Section id="overlays" title="Dialog & Sheet" description="Dialogs for short decisions and confirmations; sheets for record details and long forms.">
      <Specimen>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">Open dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject invoice INV-2026-0142?</DialogTitle>
              <DialogDescription>
                The AP clerk is notified and the invoice returns to review. A reason is required.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Label htmlFor="sg-dialog-reason">Reason</Label>
              <Textarea id="sg-dialog-reason" placeholder="Quantity on invoice exceeds goods received" />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button variant="destructive">Reject invoice</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline">Open sheet</Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>INV-2026-0142</SheetTitle>
              <SheetDescription>Acme Supplies · captured by upload</SheetDescription>
            </SheetHeader>
            <SheetBody className="flex flex-col gap-6">
              <StatusBadge kind="invoice" status="PENDING_APPROVAL" />
              <dl className="grid grid-cols-2 gap-y-3 text-sm">
                <dt className="text-muted-foreground">Invoice date</dt>
                <dd>{formatDate("2026-11-14")}</dd>
                <dt className="text-muted-foreground">Due date</dt>
                <dd>{formatDate("2026-11-28")}</dd>
                <dt className="text-muted-foreground">Total</dt>
                <dd className="font-semibold"><Amount value="123456" /></dd>
              </dl>
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">Line items</h3>
                <Skeleton className="h-24 w-full" />
              </div>
            </SheetBody>
            <SheetFooter>
              <SheetClose asChild>
                <Button variant="outline">Close</Button>
              </SheetClose>
              <Button>Approve</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </Specimen>
    </Section>
  );
}

function MenusSection() {
  const [columns, setColumns] = useState({ vendor: true, due: true, ocr: false });
  return (
    <Section id="menus" title="Menu, Tabs & Tooltip">
      <Specimen title="Dropdown menu">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              Actions
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Invoice</DropdownMenuLabel>
            <DropdownMenuItem>
              <Pencil />
              Edit fields
              <DropdownMenuShortcut>E</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Upload />
              Replace document
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              <ArrowUpRight />
              Sync to ERP (not configured)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Columns</DropdownMenuLabel>
            {Object.entries(columns).map(([key, checked]) => (
              <DropdownMenuCheckboxItem
                key={key}
                checked={checked}
                onCheckedChange={(value) => setColumns({ ...columns, [key]: value })}
                onSelect={(event) => event.preventDefault()}
              >
                {{ vendor: "Vendor", due: "Due date", ocr: "OCR confidence" }[key]}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">
              <Trash2 />
              Delete draft
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Specimen>

      <Specimen title="Tabs" className="block">
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="review">Needs review</TabsTrigger>
            <TabsTrigger value="exceptions">Exceptions</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
          </TabsList>
          <TabsContent value="all" className="text-sm text-muted-foreground">All invoices, newest first.</TabsContent>
          <TabsContent value="review" className="text-sm text-muted-foreground">Captured invoices waiting for field review.</TabsContent>
          <TabsContent value="exceptions" className="text-sm text-muted-foreground">Invoices with validation or matching exceptions.</TabsContent>
          <TabsContent value="approved" className="text-sm text-muted-foreground">Approved and ready for payment.</TabsContent>
        </Tabs>
      </Specimen>

      <Specimen title="Tooltip">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Export">
              <Download />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Export as CSV</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help text-sm underline decoration-dotted underline-offset-4">OCR confidence 92%</span>
          </TooltipTrigger>
          <TooltipContent>
            Tesseract word confidence. Not the same as extraction accuracy.
          </TooltipContent>
        </Tooltip>
      </Specimen>
    </Section>
  );
}

function FeedbackSection() {
  return (
    <Section id="feedback" title="Toast & states" description="Every data view handles loading, error and empty. Toasts confirm actions that close a dialog.">
      <Specimen title="Toast (sonner)">
        <Button variant="outline" onClick={() => toast.success("Invoice submitted for approval", { description: "Routed to 2 approvers." })}>
          Success
        </Button>
        <Button variant="outline" onClick={() => toast.error("Could not save payment", { description: "Bank reference is required." })}>
          Error
        </Button>
        <Button variant="outline" onClick={() => toast.warning("Approval due in 3 hours")}>
          Warning
        </Button>
        <Button variant="outline" onClick={() => toast.info("Bank transfer is not configured")}>
          Info
        </Button>
        <Button variant="outline" onClick={() => toast("Report downloaded")}>
          Default
        </Button>
      </Specimen>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pt-4">
            <CardTitle className="text-sm">Loading</CardTitle>
          </CardHeader>
          <LoadingState rows={4} />
        </Card>
        <Card>
          <CardHeader className="pt-4">
            <CardTitle className="text-sm">Empty</CardTitle>
          </CardHeader>
          <EmptyState
            title="No invoices yet"
            description="Upload a PDF or image to capture your first invoice."
            action={(
              <Button size="sm">
                <Upload />
                Upload invoice
              </Button>
            )}
          />
        </Card>
        <Card>
          <CardHeader className="pt-4">
            <CardTitle className="text-sm">Error</CardTitle>
          </CardHeader>
          <ErrorState
            title="Couldn't load invoices"
            description="Cannot reach the API. Check that the backend is running."
            onRetry={() => toast("Retrying…")}
          />
        </Card>
      </div>

      <Specimen title="Skeleton">
        <div className="flex w-full max-w-md items-center gap-4">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      </Specimen>
    </Section>
  );
}

function CommandSection({ onOpenPalette }) {
  return (
    <Section id="command" title="Command" description="cmdk. Inline for pickers, or as a dialog. The app-wide palette (Ctrl/⌘ + K) lives in the shell.">
      <Specimen>
        <Button variant="outline" onClick={onOpenPalette}>
          <Search />
          Open demo palette
        </Button>
      </Specimen>
      <Card className="max-w-md overflow-hidden">
        <Command>
          <CommandInput placeholder="Find a vendor…" />
          <CommandList>
            <CommandEmpty>No vendors found.</CommandEmpty>
            <CommandGroup heading="Vendors">
              {["Acme Supplies", "Globex Components", "Initech Services", "Northwind Logistics"].map((name) => (
                <CommandItem key={name}>
                  <Building2 />
                  {name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </Card>
    </Section>
  );
}

function CommandPalette({ open, onOpenChange }) {
  const pages = [
    ["Dashboard", LayoutDashboard],
    ["Invoices", ReceiptText],
    ["Vendors", Building2],
    ["Approvals", ClipboardCheck],
    ["Payments", CircleDollarSign],
  ];
  const close = (label) => {
    onOpenChange(false);
    toast(`Would open ${label}`);
  };
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search pages, invoices, vendors…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Pages">
          {pages.map(([label, Icon]) => (
            <CommandItem key={label} onSelect={() => close(label)}>
              <Icon />
              {label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => close("New invoice")}>
            <Plus />
            New invoice
            <CommandShortcut>N</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => close("Reports")}>
            <Download />
            Download AP aging report
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
