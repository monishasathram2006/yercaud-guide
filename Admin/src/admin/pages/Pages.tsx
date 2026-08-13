import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Plus, Download, Star, Send, RefreshCw, Check, X, Reply, Flag, Calendar as CalIcon, Wallet, Eye } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, StatusBadge, KPICard } from "../components/primitives";
import { MockPageBanner } from "../components/MockBadge";
import { DataTable } from "../components/DataTable";
import { FormDrawer } from "../components/FormDrawer";
// What imports here is what the remaining mock-backed pages (the ADR-0001/0002
// stubs kept by decision, plus Settings/Notifications/Analytics/Availability)
// still read. Everything else moved to per-area files wired to the API.
import {
  BOOKINGS, BUSINESSES, CHANNELS_LIST, CHANNEL_MAPPINGS, LISTINGS, PAYOUTS,
  PROMOTIONS, REPORTED_CONTENT, SYNC_LOG, TRANSACTIONS, ownerBookings,
} from "@/mock/data";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

function useDrawer() {
  const [open, setOpen] = useState(false);
  return { open, setOpen, openIt: () => setOpen(true) };
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-slate-700">{label}</Label>
      {children}
    </div>
  );
}

function GenericAddButton({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={onOpen}>
      <Plus className="w-4 h-4 mr-1" /> {label}
    </Button>
  );
}

/* BusinessesPage moved to Businesses.tsx when it was wired to the API. */

/* Categories/Locations pages moved to Taxonomies.tsx when wired to the API. */

/* ListingsPage moved to Listings.tsx when it was wired to the API. */

/* ReviewsPage moved to Reviews.tsx when it was wired to the API. */

/* --------------------------------- BOOKINGS -------------------------------- */
export function BookingsPage({ ownerScoped = false }: { ownerScoped?: boolean }) {
  const [status, setStatus] = useState("All");
  const [channel, setChannel] = useState("All");
  let data = ownerScoped ? ownerBookings() : BOOKINGS;
  if (status !== "All") data = data.filter((b) => b.status === status);
  if (channel !== "All") data = data.filter((b) => b.channel === channel);

  return (
    <>
      <PageHeader title="Bookings" subtitle={ownerScoped ? "Bookings on your listings." : "All bookings across channels."} />
      <MockPageBanner note="Static demo data — in-platform booking was ruled out by ADR-0001; no backend exists. Row actions only show toasts." />
      <DataTable
        data={data}
        filters={[
          { label: "Status", key: "status", options: ["All", "Confirmed", "Pending", "Cancelled"], value: status, onChange: setStatus },
          { label: "Channel", key: "channel", options: ["All", "Direct", "Booking.com", "Trivago", "MakeMyTrip", "Agoda", "Expedia"], value: channel, onChange: setChannel },
        ]}
        columns={[
          { key: "id", header: "Booking ID", sortable: true, accessor: (r) => r.id },
          { key: "customer", header: "Customer" },
          { key: "listing", header: "Listing" },
          { key: "channel", header: "Channel", render: (r) => (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">{r.channel}</span>
          ) },
          { key: "checkIn", header: "Check-in" },
          { key: "checkOut", header: "Check-out" },
          { key: "guests", header: "Guests" },
          { key: "amount", header: "Amount", render: (r) => `₹${r.amount.toLocaleString()}` },
          { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
        ]}
        onView={(r) => toast(`Viewing ${r.id}`)}
        rowActions={ownerScoped ? (r) => (
          <>
            <button onClick={() => toast.success(`Confirmed ${r.id}`)} className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100">Confirm</button>
            <button onClick={() => toast(`Refund initiated`)} className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100">Refund</button>
            <button onClick={() => toast.error(`Cancelled ${r.id}`)} className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100">Cancel</button>
          </>
        ) : undefined}
      />
    </>
  );
}

/* EnquiriesPage (and the new ContactMessagesPage) live in Enquiries.tsx. */

/* Users/Owners/Admins/Roles pages moved to People.tsx when wired to the API. */

/* ------------------------ MARKETING: generic Add/Edit ---------------------- */
function MarketingTable({ title, subtitle, addLabel, data }: { title: string; subtitle: string; addLabel: string; data: any[] }) {
  const d = useDrawer();
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} actions={<GenericAddButton label={addLabel} onOpen={d.openIt} />} />
      <MockPageBanner note="Static demo data — Add/Edit/Delete only show toasts; nothing is saved." />
      <DataTable data={data} columns={[
        { key: "title", header: "Title", render: (r) => <div className="flex items-center gap-3"><img src={r.img} className="w-9 h-9 rounded-lg object-cover" alt="" /><span className="font-medium">{r.title}</span></div> },
        { key: "target", header: "Target Listing" },
        { key: "discount", header: "Discount %", render: (r) => `${r.discount}%` },
        { key: "start", header: "Start" },
        { key: "end", header: "End" },
        { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
      ]} onEdit={(r) => toast(`Editing ${r.title}`)} onDelete={(r) => toast.error(`Deleted`)} />
      <FormDrawer open={d.open} onOpenChange={d.setOpen} title={addLabel} onSave={() => toast.success(`${addLabel.replace("Add ", "")} saved`)}>
        <FormField label="Title"><Input /></FormField>
        <FormField label="Target Listing"><Input /></FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Start Date"><Input type="date" /></FormField>
          <FormField label="End Date"><Input type="date" /></FormField>
        </div>
        <FormField label="Discount %"><Input type="number" /></FormField>
        <div className="flex items-center gap-2"><Switch defaultChecked /><Label>Active</Label></div>
      </FormDrawer>
    </>
  );
}

export function DealsPage() { return <MarketingTable title="Best Deals" subtitle="Manage best deals and discounts." addLabel="Add Deal" data={PROMOTIONS.slice(0, 10)} />; }

/* Promotions/Featured/Banners pages moved to Marketing.tsx when wired to the API. */

/* Blog/BlogComments/FAQ/StaticPages/Newsletter pages moved to Content.tsx when wired. */

/* -------------------------------- CHANNELS --------------------------------- */
export function ChannelsPage() {
  const d = useDrawer();
  const [sel, setSel] = useState<any>(null);
  return (
    <>
      <PageHeader title="Channels" subtitle="Connect to OTAs and aggregators." />
      <MockPageBanner note="Static demo data — OTA channel integration was deferred by ADR-0002; no backend exists." />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {CHANNELS_LIST.map((c) => (
          <Card key={c.name} className="rounded-2xl border border-slate-200 shadow-sm p-5 bg-white gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ backgroundColor: c.color + "15" }}>{c.logo}</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold">{c.name}</div>
                <div className="text-xs text-slate-500">Last sync {c.lastSync}</div>
              </div>
              <StatusBadge status={c.status as any} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => { setSel(c); d.setOpen(true); }}>Configure</Button>
              <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">{c.status === "Connected" ? "Sync Now" : "Connect"}</Button>
            </div>
          </Card>
        ))}
      </div>
      <FormDrawer open={d.open} onOpenChange={d.setOpen} title={`Configure ${sel?.name || ""}`} onSave={() => toast.success("Saved")}>
        <FormField label="API Key"><Input type="password" placeholder="••••••••" /></FormField>
        <FormField label="Secret"><Input type="password" placeholder="••••••••" /></FormField>
        <FormField label="Sync Frequency"><Input placeholder="Every 15 minutes" /></FormField>
        <div className="flex items-center gap-2"><Switch defaultChecked /><Label>Enable integration</Label></div>
      </FormDrawer>
    </>
  );
}

export function ChannelMappingPage() {
  const d = useDrawer();
  return (
    <>
      <PageHeader title="Channel Mapping" subtitle="Map internal listings to external channel IDs." actions={<GenericAddButton label="Add Mapping" onOpen={d.openIt} />} />
      <MockPageBanner note="Static demo data — channels deferred by ADR-0002; saving a mapping only shows a toast." />
      <DataTable data={CHANNEL_MAPPINGS} columns={[
        { key: "listing", header: "Internal Listing" },
        { key: "channel", header: "Channel" },
        { key: "roomType", header: "Room Type" },
        { key: "externalId", header: "External ID", render: (r) => <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{r.externalId}</code> },
        { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
      ]} onEdit={() => toast("Editing")} onDelete={() => toast.error("Removed")} />
      <FormDrawer open={d.open} onOpenChange={d.setOpen} title="Add Mapping" onSave={() => toast.success("Mapping added")}>
        <FormField label="Internal Listing"><Input /></FormField>
        <FormField label="Channel"><Input placeholder="Booking.com" /></FormField>
        <FormField label="Room Type"><Input placeholder="Deluxe" /></FormField>
        <FormField label="External ID"><Input /></FormField>
      </FormDrawer>
    </>
  );
}

export function SyncStatusPage() {
  return (
    <>
      <PageHeader title="Sync Status" subtitle="Monitor channel sync activity." actions={<Button className="bg-emerald-600 hover:bg-emerald-700 text-white"><RefreshCw className="w-4 h-4 mr-1" /> Sync All</Button>} />
      <MockPageBanner note="Static demo data — channels deferred by ADR-0002; sync buttons do nothing real." />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {CHANNELS_LIST.slice(0, 4).map((c) => (
          <SectionCard key={c.name}>
            <div className="flex items-center gap-2 mb-2"><span className="text-lg">{c.logo}</span><span className="font-semibold">{c.name}</span></div>
            <div className="text-xs text-slate-500">Success: <span className="text-emerald-600 font-semibold">142</span> · Failed: <span className="text-red-600 font-semibold">3</span></div>
            <div className="text-xs text-slate-400 mt-1">Last sync: {c.lastSync}</div>
            <Button size="sm" variant="outline" className="w-full mt-3"><RefreshCw className="w-3 h-3 mr-1" /> Sync Now</Button>
          </SectionCard>
        ))}
      </div>
      <SectionCard title="Activity Log">
        <DataTable data={SYNC_LOG} bulk={false} columns={[
          { key: "time", header: "Time" },
          { key: "channel", header: "Channel" },
          { key: "event", header: "Event" },
          { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
        ]} rowActions={(r) => r.status === "Sync Error" ? (
          <button className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100" onClick={() => toast.success("Retrying...")}>Retry</button>
        ) : null} />
      </SectionCard>
    </>
  );
}

export function RateAvailabilityPage() {
  const rows = LISTINGS.slice(0, 8);
  return (
    <>
      <PageHeader title="Rate & Availability" subtitle="Manage per-channel rates and inventory." />
      <MockPageBanner note="Static demo data — per-channel rates depend on ADR-0002 channels; edits are not saved." />
      <SectionCard>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-200">
                <th className="text-left py-2 pr-4">Listing</th>
                {["Direct", "Booking.com", "Trivago", "MakeMyTrip"].map((c) => (
                  <th key={c} className="text-center px-3">{c}<br /><span className="font-normal text-slate-400 text-[10px]">Rate / Inv / Markup</span></th>
                ))}
                <th className="text-center px-3">Parity</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id} className="border-b border-slate-100">
                  <td className="py-3 pr-4 font-medium">{l.name}</td>
                  {[0,1,2,3].map((i) => (
                    <td key={i} className="text-center px-3">
                      <div className="text-xs">₹{(l.price + i * 100).toLocaleString()}</div>
                      <div className="text-[11px] text-slate-500">Inv: {10 - i}</div>
                      <Input className="h-6 text-xs mt-1 w-16 mx-auto" defaultValue={i === 0 ? "0%" : `+${i * 5}%`} />
                    </td>
                  ))}
                  <td className="text-center px-3"><StatusBadge status={l.price % 2 ? "Synced" : "Sync Error"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </>
  );
}

/* ------------------------------- MODERATION -------------------------------- */
/* ApprovalsPage moved to Moderation.tsx when it was wired to the API. */

export function ReportedContentPage() {
  return (
    <>
      <PageHeader title="Reported Content" subtitle="Review flagged reviews and comments." />
      <MockPageBanner note="Static demo data — no content-reporting backend exists yet." />
      <DataTable data={REPORTED_CONTENT} bulk={false} columns={[
        { key: "type", header: "Type" },
        { key: "author", header: "Author" },
        { key: "target", header: "Target" },
        { key: "reason", header: "Reason" },
        { key: "date", header: "Date" },
      ]} onView={() => toast("Viewing")} onDelete={() => toast.error("Removed")} />
    </>
  );
}

/* --------------------------------- FINANCE --------------------------------- */
export function TransactionsPage() {
  return (
    <>
      <PageHeader title="Transactions" subtitle="All platform transactions." />
      <MockPageBanner note="Static demo data — the platform processes no payments (ADR-0001); no finance backend exists." />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <KPICard icon={<Wallet className="w-5 h-5"/>} value="₹12.4L" label="Total Revenue" change={18.2} />
        <KPICard icon={<Wallet className="w-5 h-5"/>} value="₹1.4L" label="Commission Earned" change={12.1} tint="blue" />
        <SectionCard title="Revenue by Month">
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={[{m:"Feb",v:80},{m:"Mar",v:120},{m:"Apr",v:150},{m:"May",v:110},{m:"Jun",v:180},{m:"Jul",v:220}]}>
              <XAxis dataKey="m" tick={{fontSize:10}} /><Tooltip /><Bar dataKey="v" fill="#16a34a" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>
      <DataTable data={TRANSACTIONS} columns={[
        { key: "id", header: "Txn ID" },
        { key: "business", header: "Business" },
        { key: "amount", header: "Amount", render: (r) => `₹${r.amount.toLocaleString()}` },
        { key: "commission", header: "Commission", render: (r) => `₹${r.commission.toLocaleString()}` },
        { key: "method", header: "Method" },
        { key: "date", header: "Date" },
        { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
      ]} onView={() => toast("Viewing")} />
    </>
  );
}

export function CommissionsPage() {
  const data = BUSINESSES.slice(0, 15).map((b, i) => ({
    id: b.id, business: b.name, channel: ["Direct", "Booking.com", "Trivago", "MakeMyTrip"][i % 4],
    rate: (5 + i % 10) + "%", earned: (2000 + i * 780), status: "Approved" as const,
  }));
  return (
    <>
      <PageHeader title="Commissions" subtitle="Commission structure per channel and business." />
      <MockPageBanner note="Static demo data derived from mock businesses — no commissions backend exists." />
      <DataTable data={data} columns={[
        { key: "business", header: "Business" },
        { key: "channel", header: "Channel" },
        { key: "rate", header: "Rate" },
        { key: "earned", header: "Earned", render: (r) => `₹${r.earned.toLocaleString()}` },
      ]} onEdit={() => toast("Editing rate")} />
    </>
  );
}

export function PayoutsPage({ ownerScoped = false }: { ownerScoped?: boolean }) {
  return (
    <>
      <PageHeader title={ownerScoped ? "Payouts & Invoices" : "Payouts"} subtitle="Payout requests and settlements." />
      <MockPageBanner note="Static demo data — no payments/payouts backend exists (ADR-0001); Approve/Reject only show toasts." />
      {ownerScoped && (
        <SectionCard title="Payout Account" className="mb-6">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Bank Name"><Input defaultValue="HDFC Bank" /></FormField>
            <FormField label="Account Number"><Input defaultValue="XXXX XXXX 4521" /></FormField>
            <FormField label="IFSC"><Input defaultValue="HDFC0001234" /></FormField>
            <FormField label="UPI ID"><Input defaultValue="ravi@upi" /></FormField>
          </div>
          <div className="flex justify-end mt-3"><Button className="bg-emerald-600 hover:bg-emerald-700 text-white">Save</Button></div>
        </SectionCard>
      )}
      <DataTable data={PAYOUTS} columns={[
        { key: "id", header: "Payout ID" },
        { key: "business", header: "Business" },
        { key: "amount", header: "Amount", render: (r) => `₹${r.amount.toLocaleString()}` },
        { key: "requestedOn", header: "Requested" },
        { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
      ]} rowActions={!ownerScoped ? (r) => (
        <>
          <button className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100" onClick={() => toast.success(`Approved ${r.id}`)}>Approve</button>
          <button className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100" onClick={() => toast.error("Rejected")}>Reject</button>
        </>
      ) : undefined} />
    </>
  );
}

/* -------------------------------- SETTINGS --------------------------------- */
export function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" subtitle="Platform-wide configuration." actions={<Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => toast.success("Saved")}>Save Changes</Button>} />
      <MockPageBanner note="Nothing here persists — no settings backend exists; Save only shows a toast." />
      <Tabs defaultValue="general">
        <TabsList><TabsTrigger value="general">General</TabsTrigger><TabsTrigger value="seo">SEO</TabsTrigger><TabsTrigger value="regional">Regional</TabsTrigger></TabsList>
        <TabsContent value="general" className="pt-4 space-y-4">
          <SectionCard title="Site Info">
            <FormField label="Site Name"><Input defaultValue="Yercaud Business Directory" /></FormField>
            <FormField label="Tagline"><Input defaultValue="Discover the best of Yercaud" /></FormField>
            <FormField label="Support Email"><Input defaultValue="hello@yercaud.in" /></FormField>
          </SectionCard>
          <SectionCard title="Feature Toggles">
            <div className="space-y-3">
              {["Enable Reviews", "Enable Bookings", "Enable Newsletter Popup", "Maintenance Mode"].map((f) => (
                <div key={f} className="flex items-center justify-between"><Label>{f}</Label><Switch defaultChecked={!f.includes("Maintenance")} /></div>
              ))}
            </div>
          </SectionCard>
        </TabsContent>
        <TabsContent value="seo" className="pt-4 space-y-4">
          <SectionCard title="Global SEO Defaults">
            <FormField label="Meta Title"><Input /></FormField>
            <FormField label="Meta Description"><Textarea rows={3} /></FormField>
            <FormField label="Keywords"><Input placeholder="yercaud, hotels, tours" /></FormField>
          </SectionCard>
        </TabsContent>
        <TabsContent value="regional" className="pt-4">
          <SectionCard title="Regional">
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Currency"><Input defaultValue="INR (₹)" /></FormField>
              <FormField label="Timezone"><Input defaultValue="Asia/Kolkata" /></FormField>
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </>
  );
}

export function PaymentSettingsPage() {
  return (
    <>
      <PageHeader title="Payment Settings" subtitle="Configure payment gateways." actions={<Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => toast.success("Saved")}>Save</Button>} />
      <MockPageBanner note="Static form — the platform processes no payments (ADR-0001); nothing is saved." />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {["Razorpay", "Stripe", "PayU", "Cashfree"].map((g) => (
          <SectionCard key={g} title={g}>
            <div className="flex items-center justify-between mb-3"><Label>Enabled</Label><Switch defaultChecked={g === "Razorpay"} /></div>
            <FormField label="API Key"><Input type="password" placeholder="••••••••" /></FormField>
            <FormField label="Secret"><Input type="password" placeholder="••••••••" /></FormField>
          </SectionCard>
        ))}
      </div>
    </>
  );
}

export function NotificationsPage() {
  return (
    <>
      <PageHeader title="Notifications" subtitle="Templates and delivery preferences." />
      <MockPageBanner note="Static templates — no notifications backend exists; even password-reset email is a console stub." />
      <Tabs defaultValue="templates">
        <TabsList><TabsTrigger value="templates">Templates</TabsTrigger><TabsTrigger value="prefs">Preferences</TabsTrigger></TabsList>
        <TabsContent value="templates" className="pt-4 space-y-4">
          {["Booking Confirmation", "Booking Cancellation", "Review Submitted", "Payout Processed"].map((t) => (
            <SectionCard key={t} title={t}>
              <FormField label="Subject"><Input defaultValue={t} /></FormField>
              <FormField label="Body"><Textarea rows={4} defaultValue="Dear {customer}, ..." /></FormField>
            </SectionCard>
          ))}
        </TabsContent>
        <TabsContent value="prefs" className="pt-4">
          <SectionCard title="Channels">
            {["Email", "SMS", "WhatsApp", "Push"].map((c) => (
              <div key={c} className="flex items-center justify-between py-2"><Label>{c}</Label><Switch defaultChecked={c !== "SMS"} /></div>
            ))}
          </SectionCard>
        </TabsContent>
      </Tabs>
    </>
  );
}

/* AuditLogPage moved to AuditLog.tsx when it was wired to the API. */

/* ------------------------------- OWNER PAGES ------------------------------- */

export function AvailabilityPage() {
  const days = Array.from({ length: 35 }, (_, i) => i - 2);
  return (
    <>
      <MockPageBanner note="Static calendar for a hardcoded hotel — no availability backend exists (booking ruled out by ADR-0001)." />
      <PageHeader title="Availability & Pricing" subtitle="Set inventory and rates by date." actions={
        <>
          <Button variant="outline">Blackout Dates</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => toast.success("Saved")}>Save</Button>
        </>
      } />
      <SectionCard title="July 2025 — Grand Palace Hotel">
        <div className="grid grid-cols-7 gap-1.5 text-xs">
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => <div key={d} className="text-center font-semibold text-slate-500 py-1">{d}</div>)}
          {days.map((d, i) => {
            const inMonth = d > 0 && d <= 31;
            const price = 2500 + (i % 5) * 200;
            const inv = 10 - (i % 5);
            const blackout = i % 13 === 0;
            return (
              <div key={i} className={`rounded-lg border p-2 min-h-[70px] ${inMonth ? (blackout ? "bg-red-50 border-red-200" : "bg-white border-slate-200") : "bg-slate-50 border-slate-100 text-slate-300"}`}>
                <div className="font-semibold">{inMonth ? d : ""}</div>
                {inMonth && !blackout && <><div className="text-[10px] text-emerald-600 font-semibold mt-1">₹{price}</div><div className="text-[10px] text-slate-500">{inv} left</div></>}
                {inMonth && blackout && <div className="text-[10px] text-red-600 mt-1">Blackout</div>}
              </div>
            );
          })}
        </div>
      </SectionCard>
      <SectionCard title="Rate Plans" className="mt-6">
        <DataTable data={[
          { id: "1", name: "Standard", basePrice: 2500, discount: "0%", cancel: "Free" },
          { id: "2", name: "Non-Refundable", basePrice: 2100, discount: "10%", cancel: "No" },
          { id: "3", name: "Weekend", basePrice: 3200, discount: "0%", cancel: "Free" },
        ]} bulk={false} searchable={false} columns={[
          { key: "name", header: "Plan" },
          { key: "basePrice", header: "Base Price", render: (r) => `₹${r.basePrice}` },
          { key: "discount", header: "Discount" },
          { key: "cancel", header: "Cancellation" },
        ]} onEdit={() => toast("Editing")} />
      </SectionCard>
    </>
  );
}

export function AnalyticsPage() {
  return (
    <>
      <PageHeader title="Analytics" subtitle="Detailed performance for your listings." actions={<Button variant="outline"><Download className="w-4 h-4 mr-1" /> Export</Button>} />
      <MockPageBanner note="Hardcoded KPIs and charts — no analytics backend exists; Export does nothing." />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KPICard icon={<Eye className="w-5 h-5"/>} value="12,842" label="Views" change={14.2} />
        <KPICard icon={<Star className="w-5 h-5"/>} value="4.7" label="Rating" change={0.3} tint="amber" />
        <KPICard icon={<CalIcon className="w-5 h-5"/>} value="142" label="Bookings" change={9.8} tint="blue" />
        <KPICard icon={<Wallet className="w-5 h-5"/>} value="₹4.82L" label="Revenue" change={22.4} tint="purple" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Views vs Bookings">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={[{m:"Jan",v:800,b:22},{m:"Feb",v:1200,b:32},{m:"Mar",v:1800,b:48},{m:"Apr",v:1500,b:40},{m:"May",v:2400,b:60},{m:"Jun",v:2800,b:78}]}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="m" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}}/><Tooltip/>
              <Bar dataKey="v" fill="#16a34a" radius={[4,4,0,0]}/><Bar dataKey="b" fill="#3b82f6" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
        <SectionCard title="Channel Breakdown">
          <DataTable bulk={false} searchable={false} data={[
            { id:"1", channel:"Direct", bookings:82, revenue:245000 },
            { id:"2", channel:"Booking.com", bookings:34, revenue:112000 },
            { id:"3", channel:"Trivago", bookings:14, revenue:52000 },
            { id:"4", channel:"MakeMyTrip", bookings:12, revenue:43000 },
          ]} columns={[
            { key:"channel", header:"Channel" },
            { key:"bookings", header:"Bookings" },
            { key:"revenue", header:"Revenue", render:(r)=>`₹${r.revenue.toLocaleString()}` },
          ]} />
        </SectionCard>
      </div>
    </>
  );
}

/* BusinessProfilePage and TeamPage moved to Business.tsx when wired. */

