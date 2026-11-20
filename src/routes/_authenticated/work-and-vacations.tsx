import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useOrg } from "@/lib/org";
import { useSession } from "@/lib/auth";
import { useRememberedTab } from "@/hooks/useRememberedTab";
import { RecordHistory, WorkHistory } from "@/components/work/WorkHistory";
import { cn } from "@/lib/utils";
import { fetchOrgPeople, orgPeopleKey, type OrgPerson } from "@/lib/orgCharts";
import {
  DEFAULT_SETTINGS,
  GENERAL_LEAVE,
  MAX_ABSENCE_NOTE,
  WEEKDAYS,
  absencesKey,
  addCustomKind,
  addDayOff,
  customKindsKey,
  daysOffKey,
  deleteAbsence,
  deleteDayOff,
  fetchAbsences,
  fetchCustomKinds,
  fetchDaysOff,
  fetchPersonSettings,
  fetchWorkSettings,
  fiDate,
  fmtDays,
  isoWeekday,
  leaveKind,
  loadCountries,
  loadHolidays,
  makeCalendar,
  monthGrid,
  personSettingsKey,
  saveAbsence,
  savePersonSettings,
  saveWorkSettings,
  statutoryLeaveFor,
  todayIso,
  TONE_CLASSES,
  TONE_NAMES,
  MAX_KIND_LABEL,
  updateCustomKind,
  vacationBalance,
  vacationYear,
  workSettingsKey,
  type Absence,
  type DayOff,
  type KindFields,
  type LeaveKind,
  type NationalHoliday,
  type PersonSettings,
  type ToneName,
  type WorkCalendar,
  type WorkSettings,
} from "@/lib/workVacations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/work-and-vacations")({
  head: () => ({ meta: [{ title: "Work and vacations — Talentloom" }] }),
  component: WorkPage,
});

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type Editing = {
  id?: string;
  person_id: string;
  kind: string;
  start_date: string;
  end_date: string;
  note: string;
} | null;

/** What the tabs share. */
type Ctx = {
  today: string;
  settings: WorkSettings;
  calendar: WorkCalendar;
  people: OrgPerson[];
  nameOf: (personId: string) => string;
  countryOf: (personId: string) => string;
  workDaysOf: (personId: string) => number[];
  countryName: (code: string) => string;
  balanceOf: (personId: string, leaving?: string) => ReturnType<typeof vacationBalance>;
  /** The organisation's own kinds of absence, removed ones included. */
  ownKinds: LeaveKind[];
  kindOf: (key: string) => LeaveKind;
};

/** "2,5" or "2.5" as a number; empty as null. */
const parseNum = (s: string) => {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

function WorkPage() {
  const qc = useQueryClient();
  const { orgId, orgs } = useOrg();
  const { user } = useSession();
  const orgName = orgs.find((o) => o.org_id === orgId)?.name ?? "your organisation";
  const [tab, chooseTab] = useRememberedTab(
    "work-and-vacations",
    ["calendar", "vacations", "holidays", "kinds", "time", "history"] as const,
    "calendar",
  );
  const today = todayIso();
  const [cursor, setCursor] = useState(() => ({
    y: Number(today.slice(0, 4)),
    m: Number(today.slice(5, 7)),
  }));
  const [holidayYear, setHolidayYear] = useState(Number(today.slice(0, 4)));

  const settingsQ = useQuery({
    queryKey: workSettingsKey(orgId),
    enabled: !!orgId,
    queryFn: () => fetchWorkSettings(orgId!),
  });
  const settings = settingsQ.data ?? DEFAULT_SETTINGS;
  const daysOffQ = useQuery({
    queryKey: daysOffKey(orgId),
    enabled: !!orgId,
    queryFn: () => fetchDaysOff(orgId!),
  });
  const personQ = useQuery({
    queryKey: personSettingsKey(orgId),
    enabled: !!orgId,
    queryFn: () => fetchPersonSettings(orgId!),
  });
  const absencesQ = useQuery({
    queryKey: absencesKey(orgId),
    enabled: !!orgId,
    queryFn: () => fetchAbsences(orgId!),
  });
  const kindsQ = useQuery({
    queryKey: customKindsKey(orgId),
    enabled: !!orgId,
    queryFn: () => fetchCustomKinds(orgId!),
  });
  const ownKinds = kindsQ.data ?? [];
  const kindOf = (key: string) => leaveKind(key, ownKinds);
  const peopleQ = useQuery({
    queryKey: orgPeopleKey(orgId),
    enabled: !!orgId,
    queryFn: () => fetchOrgPeople(orgId!),
  });
  const people = peopleQ.data ?? [];
  const personSettings = personQ.data ?? [];
  const psById = new Map(personSettings.map((p) => [p.person_id, p]));
  const memberIds = new Set(people.map((p) => p.id));
  // Only people still in the organisation.
  const absences = (absencesQ.data ?? []).filter((a) => memberIds.has(a.person_id));

  const countryOf = (pid: string) => psById.get(pid)?.country ?? settings.countries[0]!;
  const workDaysOf = (pid: string) => psById.get(pid)?.work_days ?? settings.work_days;
  const nameOf = (pid: string) => people.find((p) => p.id === pid)?.name ?? "Someone";

  // National holidays for every country in use, for the years on screen.
  const period = vacationYear(today, settings.accrual_year_start);
  const countries = [
    ...new Set([
      ...settings.countries,
      ...personSettings.flatMap((p) => (p.country ? [p.country] : [])),
    ]),
  ].sort();
  const years = [
    ...new Set([
      cursor.y - 1,
      cursor.y,
      cursor.y + 1,
      holidayYear,
      Number(period.start.slice(0, 4)),
      Number(period.end.slice(0, 4)),
    ]),
  ].sort();
  const holidaysQ = useQuery({
    queryKey: ["work-holidays", countries.join(","), years.join(",")],
    queryFn: () => loadHolidays(countries, years),
    staleTime: Infinity,
    placeholderData: (prev) => prev,
  });
  const countriesQ = useQuery({
    queryKey: ["work-countries"],
    queryFn: loadCountries,
    staleTime: Infinity,
  });
  const countryName = (c: string) => countriesQ.data?.[c] ?? c;
  const calendar = useMemo(
    () => makeCalendar(holidaysQ.data ?? [], daysOffQ.data ?? []),
    [holidaysQ.data, daysOffQ.data],
  );

  const balanceOf = (pid: string, leaving?: string) =>
    vacationBalance({
      today,
      settings,
      person: psById.get(pid),
      absences: absences.filter((a) => a.person_id === pid && a.id !== leaving),
      calendar,
      country: countryOf(pid),
      workDays: workDaysOf(pid),
      ownKinds,
    });

  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [editingPerson, setEditingPerson] = useState<string | null>(null);

  const run = async (action: () => Promise<void>, ok?: string) => {
    setBusy(true);
    try {
      await action();
      if (ok) toast.success(ok);
      return true;
    } catch (e) {
      const message =
        e && typeof e === "object" && "message" in e ? String(e.message) : "Something went wrong";
      toast.error(message);
      return false;
    } finally {
      await Promise.all(
        [workSettingsKey, daysOffKey, personSettingsKey, absencesKey, customKindsKey].map((k) =>
          qc.invalidateQueries({ queryKey: k(orgId) }),
        ),
      );
      // Every change lands in the history (work_audit_log, written by the database).
      void qc.invalidateQueries({ queryKey: ["work-audit", orgId] });
      setBusy(false);
    }
  };

  if (!orgId) return null;

  const ctx: Ctx = {
    today,
    settings,
    calendar,
    people,
    nameOf,
    countryOf,
    workDaysOf,
    countryName,
    balanceOf,
    ownKinds,
    kindOf,
  };

  const addAbsence = (date?: string) =>
    setEditing({
      person_id: user?.id && memberIds.has(user.id) ? user.id : "",
      kind: "annual",
      start_date: date ?? today,
      end_date: date ?? today,
      note: "",
    });

  const saveSettings = (next: WorkSettings, ok?: string) =>
    run(() => saveWorkSettings(orgId, next), ok);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Work and vacations</h1>
          <p className="text-sm text-muted-foreground">
            Working time, national holidays and days off, and everyone's absences and vacation days
            in {orgName}. Everyone in the organisation can see and edit them.
          </p>
        </div>
        <Button onClick={() => addAbsence()}>
          <Plus className="mr-1 h-4 w-4" /> Add an absence
        </Button>
      </div>

      <Tabs value={tab} onValueChange={chooseTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="vacations">Vacation days</TabsTrigger>
          <TabsTrigger value="holidays">Holidays and days off</TabsTrigger>
          <TabsTrigger value="kinds">Kinds of absence</TabsTrigger>
          <TabsTrigger value="time">Working time</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="calendar">
          <CalendarTab
            ctx={ctx}
            cursor={cursor}
            setCursor={setCursor}
            absences={absences}
            loading={absencesQ.isLoading || peopleQ.isLoading}
            onAdd={addAbsence}
            onEdit={(a) => setEditing({ ...a, note: a.note ?? "" })}
          />
        </TabsContent>

        <TabsContent value="vacations">
          <VacationsTab ctx={ctx} period={period} psById={psById} onEdit={setEditingPerson} />
        </TabsContent>

        <TabsContent value="holidays">
          <HolidaysTab
            ctx={ctx}
            year={holidayYear}
            setYear={setHolidayYear}
            holidays={(holidaysQ.data ?? []).filter((h) => h.date.startsWith(String(holidayYear)))}
            daysOff={daysOffQ.data ?? []}
            allCountries={countriesQ.data ?? {}}
            busy={busy}
            onCountries={(next, ok) => saveSettings({ ...settings, countries: next }, ok)}
            onAdd={(d, ok) => run(() => addDayOff(orgId, d), ok)}
            onDelete={(ids, ok) =>
              run(async () => {
                for (const id of ids) await deleteDayOff(id);
              }, ok)
            }
          />
        </TabsContent>

        <TabsContent value="kinds">
          <KindsTab
            ctx={ctx}
            busy={busy}
            onAdd={(k) => run(() => addCustomKind(orgId, k), `Added ${k.label.trim()}`)}
            onChange={(id, change, ok) => run(() => updateCustomKind(id, change), ok)}
          />
        </TabsContent>

        <TabsContent value="time">
          <WorkTimeTab
            settings={settings}
            busy={busy}
            onSave={(next) => saveSettings(next, "Saved the working time")}
          />
        </TabsContent>

        <TabsContent value="history">
          <WorkHistory
            orgId={orgId}
            people={people}
            kindLabel={(k) => kindOf(k).label}
            countryName={countryName}
          />
        </TabsContent>
      </Tabs>

      <AbsenceDialog
        orgId={orgId}
        ctx={ctx}
        editing={editing}
        setEditing={setEditing}
        busy={busy}
        onSave={async (e) => {
          if (
            await run(() => saveAbsence(orgId, e), e.id ? "Saved the absence" : "Added the absence")
          )
            setEditing(null);
        }}
        onDelete={async (id) => {
          if (await run(() => deleteAbsence(id), "Deleted the absence")) setEditing(null);
        }}
      />

      <PersonDialog
        ctx={ctx}
        personId={editingPerson}
        current={editingPerson ? psById.get(editingPerson) : undefined}
        busy={busy}
        onClose={() => setEditingPerson(null)}
        onSave={async (p) => {
          if (await run(() => savePersonSettings(orgId, p), `Saved ${nameOf(p.person_id)}`))
            setEditingPerson(null);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------- calendar

function CalendarTab({
  ctx,
  cursor,
  setCursor,
  absences,
  loading,
  onAdd,
  onEdit,
}: {
  ctx: Ctx;
  cursor: { y: number; m: number };
  setCursor: (c: { y: number; m: number }) => void;
  absences: Absence[];
  loading: boolean;
  onAdd: (date: string) => void;
  onEdit: (a: Absence) => void;
}) {
  const [query, setQuery] = useState("");
  const { y, m } = cursor;
  const grid = monthGrid(y, m);
  const monthKey = `${y}-${String(m).padStart(2, "0")}`;
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = absences.filter((a) => {
    const text = `${ctx.nameOf(a.person_id)} ${ctx.kindOf(a.kind).label}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
  const on = (iso: string) => shown.filter((a) => a.start_date <= iso && a.end_date >= iso);
  const step = (by: number) => {
    const n = m + by;
    setCursor({ y: n < 1 ? y - 1 : n > 12 ? y + 1 : y, m: n < 1 ? 12 : n > 12 ? 1 : n });
  };
  const multi = ctx.settings.countries.length > 1;
  const home = ctx.settings.countries[0]!;
  const dayInfo = (iso: string) => {
    const holidays = ctx.settings.countries.flatMap((c) => ctx.calendar.holidaysOn(iso, c));
    const own = ctx.calendar.ownDaysOff(iso);
    const weekend = !ctx.settings.work_days.includes(isoWeekday(iso));
    const off = weekend || own.length > 0 || holidays.some((h) => h.off && h.country === home);
    return { holidays, own, off };
  };
  const inMonth = grid.filter((d) => d.startsWith(monthKey));
  const kindsShown = [
    ...new Map(
      inMonth.flatMap(on).map((a) => [ctx.kindOf(a.kind).key, ctx.kindOf(a.kind)] as const),
    ).values(),
  ];

  return (
    <div className="space-y-3 rounded-2xl border-2 border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="outline"
            onClick={() => step(-1)}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="outline" onClick={() => step(1)} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <h2 className="min-w-40 text-lg font-semibold">
          {MONTHS[m - 1]} {y}
        </h2>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setCursor({ y: Number(ctx.today.slice(0, 4)), m: Number(ctx.today.slice(5, 7)) })
          }
        >
          Today
        </Button>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a person or kind of absence"
          aria-label="Find a person or kind of absence"
          className="sm:ml-auto sm:max-w-xs"
        />
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {/* A month grid on wider screens. */}
      <div className="hidden overflow-hidden rounded-xl border-l border-t border-border sm:grid sm:grid-cols-7">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="border-b border-r border-border bg-muted/50 px-2 py-1 text-xs font-semibold"
          >
            {w}
          </div>
        ))}
        {grid.map((iso) => {
          const { holidays, own, off } = dayInfo(iso);
          const list = on(iso);
          const isToday = iso === ctx.today;
          return (
            <div
              key={iso}
              onClick={() => onAdd(iso)}
              className={cn(
                "group min-h-28 cursor-pointer border-b border-r border-border p-1.5 transition hover:bg-primary/5",
                !iso.startsWith(monthKey) && "opacity-45",
                off && "bg-muted/40",
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "text-xs font-semibold",
                    isToday && "rounded-full bg-primary px-1.5 py-0.5 text-primary-foreground",
                  )}
                >
                  {Number(iso.slice(8))}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAdd(iso);
                  }}
                  aria-label={`Add an absence on ${fiDate(iso)}`}
                  className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-muted focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              {holidays.map((h) => (
                <div
                  key={`${h.country}${h.name}`}
                  title={`${h.name} (${ctx.countryName(h.country)})${h.off ? "" : ", not a day off"}`}
                  className={cn(
                    "truncate text-[11px] leading-tight",
                    h.off
                      ? "font-semibold text-rose-700 dark:text-rose-300"
                      : "text-muted-foreground",
                  )}
                >
                  {multi ? `${h.country} · ` : ""}
                  {h.name}
                </div>
              ))}
              {own.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center gap-0.5 truncate text-[11px] font-semibold leading-tight text-primary"
                  title={`${d.name}: a day off for everyone`}
                >
                  <Star className="h-2.5 w-2.5 shrink-0" />
                  <span className="truncate">{d.name}</span>
                </div>
              ))}
              {list.slice(0, 3).map((a) => (
                <AbsenceChip key={a.id} a={a} ctx={ctx} onEdit={onEdit} />
              ))}
              {list.length > 3 && (
                <div
                  className="mt-0.5 text-[11px] text-muted-foreground"
                  title={list
                    .slice(3)
                    .map((a) => ctx.nameOf(a.person_id))
                    .join(", ")}
                >
                  +{list.length - 3} more
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* A list of the month's days with something on, on phones. */}
      <ul className="space-y-2 sm:hidden">
        {inMonth
          .filter((iso) => {
            const { holidays, own } = dayInfo(iso);
            return holidays.length || own.length || on(iso).length;
          })
          .map((iso) => {
            const { holidays, own } = dayInfo(iso);
            return (
              <li key={iso} className="rounded-xl border border-border p-2">
                <div className="text-sm font-semibold">
                  {WEEKDAYS[isoWeekday(iso) - 1]} {fiDate(iso)}
                </div>
                {holidays.map((h) => (
                  <div
                    key={`${h.country}${h.name}`}
                    className={cn("text-xs", h.off ? "text-rose-700" : "text-muted-foreground")}
                  >
                    {multi ? `${h.country} · ` : ""}
                    {h.name}
                  </div>
                ))}
                {own.map((d) => (
                  <div key={d.id} className="text-xs font-semibold text-primary">
                    {d.name}
                  </div>
                ))}
                <div className="mt-1 flex flex-wrap gap-1">
                  {on(iso).map((a) => (
                    <AbsenceChip key={a.id} a={a} ctx={ctx} onEdit={onEdit} />
                  ))}
                </div>
              </li>
            );
          })}
        {!loading && inMonth.every((iso) => !on(iso).length && !dayInfo(iso).holidays.length) && (
          <li className="text-sm text-muted-foreground">Nothing on this month.</li>
        )}
      </ul>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-semibold text-rose-700 dark:text-rose-300">Holiday</span>
        <span className="flex items-center gap-0.5 font-semibold text-primary">
          <Star className="h-3 w-3" /> Our own day off
        </span>
        {kindsShown.map((k) => (
          <span key={k.key} className={cn("rounded border px-1.5", k.tone)}>
            {k.label}
          </span>
        ))}
        <span className="sm:ml-auto">
          Click a day to add an absence; click an absence to edit it.
        </span>
      </div>
    </div>
  );
}

function AbsenceChip({ a, ctx, onEdit }: { a: Absence; ctx: Ctx; onEdit: (a: Absence) => void }) {
  const k = ctx.kindOf(a.kind);
  const name = ctx.nameOf(a.person_id);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onEdit(a);
      }}
      title={`${name}: ${k.label}, ${fiDate(a.start_date)}–${fiDate(a.end_date)}${a.note ? `\n${a.note}` : ""}`}
      className={cn(
        "mt-0.5 block w-full truncate rounded border px-1 text-left text-[11px] leading-snug",
        k.tone,
      )}
    >
      {name}
    </button>
  );
}

// ---------------------------------------------------------------- absences

function AbsenceDialog({
  orgId,
  ctx,
  editing,
  setEditing,
  busy,
  onSave,
  onDelete,
}: {
  orgId: string;
  ctx: Ctx;
  editing: Editing;
  setEditing: (e: Editing | ((e: Editing) => Editing)) => void;
  busy: boolean;
  onSave: (e: NonNullable<Editing>) => void;
  onDelete: (id: string) => void;
}) {
  const e = editing;
  const country = e?.person_id ? ctx.countryOf(e.person_id) : ctx.settings.countries[0]!;
  const statutory = statutoryLeaveFor(country);
  const own = ctx.ownKinds.filter((k) => !k.custom?.archived);
  const listed = [...GENERAL_LEAVE, ...own, ...statutory].some((k) => k.key === e?.kind);
  const set = (patch: Partial<NonNullable<Editing>>) =>
    setEditing((d) => (d ? { ...d, ...patch } : d));
  const valid =
    !!e && !!e.person_id && !!e.start_date && !!e.end_date && e.end_date >= e.start_date;
  const days =
    valid && e
      ? ctx.calendar.workingDays(e.start_date, e.end_date, country, ctx.workDaysOf(e.person_id))
      : 0;
  const vacation = !!e && !!ctx.kindOf(e.kind).vacation;
  const balance = valid && e && vacation ? ctx.balanceOf(e.person_id, e.id) : null;

  return (
    <Dialog open={!!e} onOpenChange={(o) => !o && setEditing(null)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{e?.id ? "Edit the absence" : "Add an absence"}</DialogTitle>
          <DialogDescription>
            Anyone in the organisation can add and change absences.
          </DialogDescription>
        </DialogHeader>
        {e && (
          <form
            className="space-y-4"
            onSubmit={(ev) => {
              ev.preventDefault();
              if (valid) onSave(e);
            }}
          >
            <div className="space-y-1.5">
              <Label>Person</Label>
              <Select value={e.person_id} onValueChange={(v) => set({ person_id: v })}>
                <SelectTrigger aria-label="Person">
                  <SelectValue placeholder="Pick someone from People" />
                </SelectTrigger>
                <SelectContent>
                  {ctx.people.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Kind of absence</Label>
              <Select value={e.kind} onValueChange={(v) => set({ kind: v })}>
                <SelectTrigger aria-label="Kind of absence">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>General</SelectLabel>
                    {GENERAL_LEAVE.map((k) => (
                      <SelectItem key={k.key} value={k.key}>
                        {k.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  {own.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Our own</SelectLabel>
                      {own.map((k) => (
                        <SelectItem key={k.key} value={k.key}>
                          {k.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  <SelectGroup>
                    <SelectLabel>Statutory leave — {ctx.countryName(country)}</SelectLabel>
                    {statutory.map((k) => (
                      <SelectItem key={k.key} value={k.key}>
                        {k.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  {!listed && <SelectItem value={e.kind}>{ctx.kindOf(e.kind).label}</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="absence-start">From</Label>
                <Input
                  id="absence-start"
                  type="date"
                  value={e.start_date}
                  onChange={(ev) =>
                    set({
                      start_date: ev.target.value,
                      end_date: e.end_date < ev.target.value ? ev.target.value : e.end_date,
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="absence-end">To</Label>
                <Input
                  id="absence-end"
                  type="date"
                  value={e.end_date}
                  min={e.start_date}
                  onChange={(ev) => set({ end_date: ev.target.value })}
                />
              </div>
            </div>
            {valid && (
              <p className="rounded-xl bg-muted/60 px-3 py-2 text-sm">
                {days} working {days === 1 ? "day" : "days"} for {ctx.nameOf(e.person_id)}, by their
                working week and the {ctx.countryName(country)} holidays.
                {balance && (
                  <>
                    {" "}
                    Vacation days left this year: {fmtDays(balance.left)} →{" "}
                    <strong className={balance.left - days < 0 ? "text-destructive" : ""}>
                      {fmtDays(Math.round((balance.left - days) * 10) / 10)}
                    </strong>
                    .
                  </>
                )}
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="absence-note">Note (optional)</Label>
              <Textarea
                id="absence-note"
                rows={2}
                className="min-h-[3.25rem]"
                value={e.note}
                maxLength={MAX_ABSENCE_NOTE}
                onChange={(ev) => set({ note: ev.target.value })}
              />
            </div>
            {e.id && (
              <RecordHistory
                orgId={orgId}
                table="work_absences"
                rowKey={e.id}
                people={ctx.people}
                kindLabel={(k) => ctx.kindOf(k).label}
                countryName={ctx.countryName}
              />
            )}
            <DialogFooter className="sticky -bottom-6 z-10 -mx-6 -mb-6 gap-2 border-t border-border bg-background px-6 py-3">
              {e.id && (
                <Button
                  type="button"
                  variant="outline"
                  className="sm:mr-auto"
                  disabled={busy}
                  onClick={() => onDelete(e.id!)}
                >
                  <Trash2 className="mr-1 h-4 w-4" /> Delete
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !valid}>
                {e.id ? "Save" : "Add"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- vacation days

function VacationsTab({
  ctx,
  period,
  psById,
  onEdit,
}: {
  ctx: Ctx;
  period: { start: string; end: string };
  psById: Map<string, PersonSettings>;
  onEdit: (personId: string) => void;
}) {
  const sample = ctx.people[0] ? ctx.balanceOf(ctx.people[0].id) : null;
  const dayNames = (days: number[]) =>
    days.length === 0
      ? "No days"
      : [...days]
          .sort()
          .map((d) => WEEKDAYS[d - 1])
          .join(" ");
  return (
    <div className="space-y-3 rounded-2xl border-2 border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">
        Vacation year {fiDate(period.start)}–{fiDate(period.end)}
        {sample ? `, ${sample.months} full ${sample.months === 1 ? "month" : "months"} so far` : ""}
        . This is a demo accrual: {fmtDays(ctx.settings.accrual_per_month)} vacation days for each
        full month, and annual leave uses one day for each working day. Each person's rate, earned
        days and used days can be changed by hand.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-semibold">Person</th>
              <th className="py-2 pr-3 font-semibold">Holidays of</th>
              <th className="py-2 pr-3 font-semibold">Working week</th>
              <th className="py-2 pr-3 text-right font-semibold">Per month</th>
              <th className="py-2 pr-3 text-right font-semibold">Earned</th>
              <th className="py-2 pr-3 text-right font-semibold">Used</th>
              <th className="py-2 pr-3 text-right font-semibold">Left</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {ctx.people.map((p) => {
              const b = ctx.balanceOf(p.id);
              const ps = psById.get(p.id);
              return (
                <tr key={p.id} className="border-b border-border/60">
                  <td className="py-2 pr-3 font-medium">{p.name}</td>
                  <td className="py-2 pr-3">{ctx.countryName(ctx.countryOf(p.id))}</td>
                  <td className="py-2 pr-3 text-xs">
                    {dayNames(ctx.workDaysOf(p.id))} ·{" "}
                    {fmtDays(ps?.hours_per_day ?? ctx.settings.hours_per_day)} h
                  </td>
                  <td className="py-2 pr-3 text-right">{fmtDays(b.rate)}</td>
                  <td className="py-2 pr-3 text-right">
                    {fmtDays(b.earned)}
                    {ps?.accrued_override != null && <ByHand />}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    {fmtDays(b.used)}
                    {ps?.used_override != null && <ByHand />}
                  </td>
                  <td
                    className={cn(
                      "py-2 pr-3 text-right font-semibold",
                      b.left < 0 && "text-destructive",
                    )}
                  >
                    {fmtDays(b.left)}
                  </td>
                  <td className="py-2 text-right">
                    <Button size="sm" variant="outline" onClick={() => onEdit(p.id)}>
                      <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {ctx.people.length === 0 && (
          <p className="py-4 text-sm text-muted-foreground">No one in People yet.</p>
        )}
      </div>
    </div>
  );
}

function ByHand() {
  return (
    <span
      className="ml-1 rounded bg-muted px-1 text-[10px] text-muted-foreground"
      title="Set by hand"
    >
      by hand
    </span>
  );
}

function PersonDialog({
  ctx,
  personId,
  current,
  busy,
  onClose,
  onSave,
}: {
  ctx: Ctx;
  personId: string | null;
  current: PersonSettings | undefined;
  busy: boolean;
  onClose: () => void;
  onSave: (p: PersonSettings) => void;
}) {
  const DEFAULT = "__default__";
  const [country, setCountry] = useState(DEFAULT);
  const [ownWeek, setOwnWeek] = useState(false);
  const [days, setDays] = useState<number[]>([]);
  const [hours, setHours] = useState("");
  const [rate, setRate] = useState("");
  const [earned, setEarned] = useState("");
  const [used, setUsed] = useState("");

  useEffect(() => {
    if (!personId) return;
    setCountry(current?.country ?? DEFAULT);
    setOwnWeek(!!current?.work_days);
    setDays(current?.work_days ?? ctx.settings.work_days);
    setHours(current?.hours_per_day != null ? String(current.hours_per_day) : "");
    setRate(current?.accrual_per_month != null ? String(current.accrual_per_month) : "");
    setEarned(current?.accrued_override != null ? String(current.accrued_override) : "");
    setUsed(current?.used_override != null ? String(current.used_override) : "");
    // Filled once each time the dialog opens for someone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId]);

  if (!personId) return null;
  const calc = ctx.balanceOf(personId);
  // What the balance would be without hand-set figures, at the rate typed here.
  const typedRate = parseNum(rate);
  const earnedCalc =
    typedRate != null && !Number.isNaN(typedRate)
      ? Math.round(calc.months * typedRate * 10) / 10
      : Math.round(calc.months * ctx.settings.accrual_per_month * 10) / 10;
  const numbers = [hours, rate, earned, used].map(parseNum);
  const bad = numbers.some((n) => n !== null && Number.isNaN(n));

  return (
    <Dialog open={!!personId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{ctx.nameOf(personId)}</DialogTitle>
          <DialogDescription>
            Leave a field empty to use the organisation's setting or the calculated figure.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (bad) return;
            onSave({
              person_id: personId,
              country: country === DEFAULT ? null : country,
              work_days: ownWeek ? days : null,
              hours_per_day: numbers[0]!,
              accrual_per_month: numbers[1]!,
              accrued_override: numbers[2]!,
              used_override: numbers[3]!,
            });
          }}
        >
          <div className="space-y-1.5">
            <Label>Holidays of</Label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger aria-label="Holidays of">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT}>
                  The organisation's default ({ctx.countryName(ctx.settings.countries[0]!)})
                </SelectItem>
                {ctx.settings.countries.map((c) => (
                  <SelectItem key={c} value={c}>
                    {ctx.countryName(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The national holidays and statutory leave that apply. Add countries on the Holidays
              and days off tab.
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox checked={ownWeek} onCheckedChange={(v) => setOwnWeek(v === true)} />
              Their own working week
            </label>
            {ownWeek && <WeekPicker value={days} onChange={setDays} />}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              id="p-hours"
              label="Hours a day"
              value={hours}
              onChange={setHours}
              placeholder={fmtDays(ctx.settings.hours_per_day)}
            />
            <NumberField
              id="p-rate"
              label="Vacation days a month"
              value={rate}
              onChange={setRate}
              placeholder={fmtDays(ctx.settings.accrual_per_month)}
            />
            <NumberField
              id="p-earned"
              label="Earned this year"
              value={earned}
              onChange={setEarned}
              placeholder={`${fmtDays(earnedCalc)} (calculated)`}
            />
            <NumberField
              id="p-used"
              label="Used this year"
              value={used}
              onChange={setUsed}
              placeholder={`${fmtDays(calc.usedCalculated)} (calculated)`}
            />
          </div>
          {bad && <p className="text-sm text-destructive">Use numbers, such as 2.5.</p>}
          <DialogFooter className="sticky -bottom-6 z-10 -mx-6 -mb-6 gap-2 border-t border-border bg-background px-6 py-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || bad}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function WeekPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Working days">
      {WEEKDAYS.map((w, i) => {
        const d = i + 1;
        const on = value.includes(d);
        return (
          <button
            key={w}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== d) : [...value, d].sort())}
            className={cn(
              "w-12 rounded-lg border-2 py-1 text-sm font-medium transition",
              on
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {w}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- holidays

function HolidaysTab({
  ctx,
  year,
  setYear,
  holidays,
  daysOff,
  allCountries,
  busy,
  onCountries,
  onAdd,
  onDelete,
}: {
  ctx: Ctx;
  year: number;
  setYear: (y: number) => void;
  holidays: NationalHoliday[];
  daysOff: DayOff[];
  allCountries: Record<string, string>;
  busy: boolean;
  onCountries: (next: string[], ok: string) => void;
  onAdd: (d: Omit<DayOff, "id">, ok: string) => void;
  onDelete: (ids: string[], ok: string) => void;
}) {
  const countries = ctx.settings.countries;
  const [newDay, setNewDay] = useState("");
  const [newName, setNewName] = useState("");
  const [everyYear, setEveryYear] = useState(false);
  const own = daysOff
    .filter((d) => d.kind === "day_off")
    .filter((d) => d.every_year || d.day.startsWith(String(year)));
  const pickable = Object.entries(allCountries)
    .filter(([code]) => !countries.includes(code))
    .sort((a, b) => a[1].localeCompare(b[1]));

  /** Turns a national holiday into a working day, or back, for the organisation. */
  const toggle = (h: NationalHoliday & { off: boolean }, off: boolean) => {
    const marks = ctx.calendar.marks(h.date);
    if (ctx.calendar.offByDefault(h.type)) {
      const worked = marks.filter((m) => m.kind === "working_day");
      if (off)
        onDelete(
          worked.map((m) => m.id),
          `${h.name} is a day off again`,
        );
      else
        onAdd(
          { day: h.date, name: h.name, kind: "working_day", every_year: false },
          `${h.name} is a working day`,
        );
    } else {
      const added = marks.filter((m) => m.kind === "day_off" && m.name === h.name);
      if (off)
        onAdd(
          { day: h.date, name: h.name, kind: "day_off", every_year: false },
          `${h.name} is a day off`,
        );
      else
        onDelete(
          added.map((m) => m.id),
          `${h.name} is a working day again`,
        );
    }
  };

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl border-2 border-border bg-card p-4">
        <h2 className="font-semibold">Countries</h2>
        <p className="text-sm text-muted-foreground">
          Whose national holidays and statutory leave apply. The first is everyone's default; a
          person can follow another one on the Vacation days tab.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {countries.map((c, i) => (
            <span
              key={c}
              className="flex items-center gap-1 rounded-full border-2 border-border bg-background py-0.5 pl-3 pr-1 text-sm"
            >
              {ctx.countryName(c)}
              {i === 0 ? (
                <span className="ml-1 rounded-full bg-primary/15 px-2 text-xs text-primary">
                  default
                </span>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    onCountries(
                      [c, ...countries.filter((x) => x !== c)],
                      `${ctx.countryName(c)} is the default`,
                    )
                  }
                  className="ml-1 rounded-full px-2 text-xs text-muted-foreground hover:bg-muted"
                >
                  Make default
                </button>
              )}
              {countries.length > 1 && (
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Remove ${ctx.countryName(c)}`}
                  onClick={() =>
                    onCountries(
                      countries.filter((x) => x !== c),
                      `Removed ${ctx.countryName(c)}`,
                    )
                  }
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          ))}
          <Select
            value=""
            onValueChange={(c) =>
              c && onCountries([...countries, c], `Added ${allCountries[c] ?? c}`)
            }
          >
            <SelectTrigger className="w-56" aria-label="Add a country">
              <SelectValue placeholder="Add a country" />
            </SelectTrigger>
            <SelectContent>
              {pickable.map(([code, name]) => (
                <SelectItem key={code} value={code}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="outline"
          onClick={() => setYear(year - 1)}
          aria-label="Previous year"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          onClick={() => setYear(year + 1)}
          aria-label="Next year"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <h2 className="ml-2 text-lg font-semibold">{year}</h2>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-3 rounded-2xl border-2 border-border bg-card p-4">
          <h2 className="font-semibold">National holidays</h2>
          <p className="text-sm text-muted-foreground">
            Switch a holiday off if the organisation works that day, or on to make a day off of one
            that isn't.
          </p>
          {countries.map((c) => {
            const list = holidays
              .filter((h) => h.country === c)
              .map((h) => ctx.calendar.holidaysOn(h.date, c).find((x) => x.name === h.name)!)
              .filter(Boolean);
            return (
              <div key={c}>
                {countries.length > 1 && (
                  <h3 className="mb-1 mt-2 text-sm font-semibold">{ctx.countryName(c)}</h3>
                )}
                <ul className="divide-y divide-border/60">
                  {list.map((h) => (
                    <li
                      key={`${h.date}${h.name}`}
                      className="flex items-center gap-3 py-1.5 text-sm"
                    >
                      <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
                        {WEEKDAYS[isoWeekday(h.date) - 1]} {fiDate(h.date).replace(/\.\d{4}$/, "")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn(h.off && "font-medium")}>{h.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {h.type === "public"
                            ? "Public holiday"
                            : h.type === "bank"
                              ? "Usually a day off"
                              : "Observance"}
                        </span>
                      </span>
                      <Switch
                        checked={h.off}
                        disabled={busy}
                        onCheckedChange={(v) => toggle(h, v)}
                        aria-label={`${h.name}: a day off`}
                      />
                    </li>
                  ))}
                  {list.length === 0 && (
                    <li className="py-2 text-sm text-muted-foreground">Loading…</li>
                  )}
                </ul>
              </div>
            );
          })}
        </section>

        <section className="space-y-3 rounded-2xl border-2 border-border bg-card p-4">
          <h2 className="font-semibold">Our own days off</h2>
          <p className="text-sm text-muted-foreground">
            Days off for the whole organisation, such as a company day or a day between holidays.
          </p>
          <form
            className="space-y-2 rounded-xl border border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newDay || !newName.trim()) return;
              onAdd(
                { day: newDay, name: newName, kind: "day_off", every_year: everyYear },
                `Added ${newName.trim()}`,
              );
              setNewName("");
              setNewDay("");
              setEveryYear(false);
            }}
          >
            <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
              <Input
                type="date"
                value={newDay}
                onChange={(e) => setNewDay(e.target.value)}
                aria-label="Date"
              />
              <Input
                value={newName}
                maxLength={100}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Company day"
                aria-label="Name"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={everyYear} onCheckedChange={(v) => setEveryYear(v === true)} />
                Every year on this date
              </label>
              <Button type="submit" size="sm" disabled={busy || !newDay || !newName.trim()}>
                <Plus className="mr-1 h-4 w-4" /> Add
              </Button>
            </div>
          </form>
          <ul className="divide-y divide-border/60">
            {own.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-1.5 text-sm">
                <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
                <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
                  {d.every_year ? fiDate(d.day).replace(/\.\d{4}$/, ".") : fiDate(d.day)}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {d.name}
                  {d.every_year && (
                    <span className="ml-2 text-xs text-muted-foreground">every year</span>
                  )}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={busy}
                  aria-label={`Delete ${d.name}`}
                  onClick={() => onDelete([d.id], `Deleted ${d.name}`)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
            {own.length === 0 && (
              <li className="py-2 text-sm text-muted-foreground">None in {year}.</li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- working time

function WorkTimeTab({
  settings,
  busy,
  onSave,
}: {
  settings: WorkSettings;
  busy: boolean;
  onSave: (next: WorkSettings) => void;
}) {
  const [days, setDays] = useState(settings.work_days);
  const [hours, setHours] = useState(String(settings.hours_per_day));
  const [rate, setRate] = useState(String(settings.accrual_per_month));
  const [start, setStart] = useState(String(settings.accrual_year_start));
  useEffect(() => {
    setDays(settings.work_days);
    setHours(String(settings.hours_per_day));
    setRate(String(settings.accrual_per_month));
    setStart(String(settings.accrual_year_start));
  }, [settings]);
  const h = parseNum(hours);
  const r = parseNum(rate);
  const bad =
    h === null ||
    Number.isNaN(h) ||
    h <= 0 ||
    h > 24 ||
    r === null ||
    Number.isNaN(r) ||
    r < 0 ||
    r > 10;

  return (
    <form
      className="max-w-xl space-y-4 rounded-2xl border-2 border-border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!bad)
          onSave({
            ...settings,
            work_days: days,
            hours_per_day: h!,
            accrual_per_month: r!,
            accrual_year_start: Number(start),
          });
      }}
    >
      <p className="text-sm text-muted-foreground">
        The organisation's defaults. A person can have their own working week, hours and vacation
        rate on the Vacation days tab.
      </p>
      <div className="space-y-1.5">
        <Label>Working days</Label>
        <WeekPicker value={days} onChange={setDays} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          id="w-hours"
          label="Hours a day"
          value={hours}
          onChange={setHours}
          placeholder="7.5"
        />
        <NumberField
          id="w-rate"
          label="Vacation days a month"
          value={rate}
          onChange={setRate}
          placeholder="2.5"
        />
      </div>
      <div className="space-y-1.5">
        <Label>The vacation year starts</Label>
        <Select value={start} onValueChange={setStart}>
          <SelectTrigger className="w-56" aria-label="The vacation year starts">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((name, i) => (
              <SelectItem key={name} value={String(i + 1)}>
                1 {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          In Finland the vacation year runs from 1 April to 31 March.
        </p>
      </div>
      {bad && (
        <p className="text-sm text-destructive">
          Hours a day must be between 0 and 24, and vacation days a month between 0 and 10.
        </p>
      )}
      <Button type="submit" disabled={busy || bad}>
        Save
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------- kinds of absence

function ToneSwatches({ value, onChange }: { value: ToneName; onChange: (t: ToneName) => void }) {
  return (
    <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Colour">
      {TONE_NAMES.map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={value === t}
          aria-label={t}
          title={t}
          onClick={() => onChange(t)}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full border-2",
            TONE_CLASSES[t],
            value === t && "ring-2 ring-primary ring-offset-1 ring-offset-card",
          )}
        >
          {value === t && <Check className="h-3 w-3" />}
        </button>
      ))}
    </div>
  );
}

function KindsTab({
  ctx,
  busy,
  onAdd,
  onChange,
}: {
  ctx: Ctx;
  busy: boolean;
  onAdd: (k: KindFields) => Promise<boolean>;
  onChange: (
    id: string,
    change: Partial<KindFields> & { archived?: boolean },
    ok: string,
  ) => Promise<boolean>;
}) {
  const [label, setLabel] = useState("");
  const [vacation, setVacation] = useState(false);
  const [tone, setTone] = useState<ToneName>("teal");
  const [editing, setEditing] = useState<({ id: string } & KindFields) | null>(null);
  const own = ctx.ownKinds.filter((k) => !k.custom?.archived);
  const removed = ctx.ownKinds.filter((k) => k.custom?.archived);
  const taken = (name: string, except?: string) =>
    [...GENERAL_LEAVE, ...own].some(
      (k) => k.label.toLowerCase() === name.trim().toLowerCase() && k.custom?.id !== except,
    );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-3 rounded-2xl border-2 border-border bg-card p-4">
        <h2 className="font-semibold">Our own kinds</h2>
        <p className="text-sm text-muted-foreground">
          Kinds of absence of the organisation's own, such as pekkasvapaa or a company sabbatical.
          They are offered for everyone, whatever their country.
        </p>
        <form
          className="space-y-2 rounded-xl border border-border p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!label.trim() || taken(label)) return;
            if (await onAdd({ label, vacation, tone })) {
              setLabel("");
              setVacation(false);
            }
          }}
        >
          <Input
            value={label}
            maxLength={MAX_KIND_LABEL}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Pekkasvapaa"
            aria-label="Name"
          />
          {taken(label) && label.trim() && (
            <p className="text-xs text-destructive">There's already a kind with that name.</p>
          )}
          <ToneSwatches value={tone} onChange={setTone} />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={vacation} onCheckedChange={(v) => setVacation(v === true)} />
              Uses vacation days, like annual leave
            </label>
            <Button type="submit" size="sm" disabled={busy || !label.trim() || taken(label)}>
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
        </form>
        <ul className="divide-y divide-border/60">
          {own.map((k) =>
            editing && editing.id === k.custom!.id ? (
              <li key={k.key} className="space-y-2 py-2">
                <Input
                  value={editing.label}
                  maxLength={MAX_KIND_LABEL}
                  autoFocus
                  onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                  aria-label="Name"
                />
                <ToneSwatches
                  value={editing.tone}
                  onChange={(t) => setEditing({ ...editing, tone: t })}
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={editing.vacation}
                      onCheckedChange={(v) => setEditing({ ...editing, vacation: v === true })}
                    />
                    Uses vacation days
                  </label>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy || !editing.label.trim() || taken(editing.label, editing.id)}
                      onClick={async () => {
                        const { id, ...change } = editing;
                        if (await onChange(id, change, `Saved ${change.label.trim()}`))
                          setEditing(null);
                      }}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              </li>
            ) : (
              <li key={k.key} className="flex items-center gap-2 py-1.5 text-sm">
                <span className={cn("min-w-0 truncate rounded border px-1.5", k.tone)}>
                  {k.label}
                </span>
                {k.vacation && (
                  <span className="text-xs text-muted-foreground">uses vacation days</span>
                )}
                <span className="ml-auto flex shrink-0 gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Edit ${k.label}`}
                    onClick={() =>
                      setEditing({
                        id: k.custom!.id,
                        label: k.label,
                        vacation: !!k.vacation,
                        tone: k.custom!.toneName,
                      })
                    }
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={busy}
                    aria-label={`Remove ${k.label}`}
                    onClick={() => onChange(k.custom!.id, { archived: true }, `Removed ${k.label}`)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </span>
              </li>
            ),
          )}
          {own.length === 0 && <li className="py-2 text-sm text-muted-foreground">None yet.</li>}
        </ul>
        {removed.length > 0 && (
          <div className="space-y-1 border-t border-border pt-2">
            <p className="text-xs text-muted-foreground">
              Removed: no longer offered, but absences already marked with them keep their name.
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {removed.map((k) => (
                <li
                  key={k.key}
                  className="flex items-center gap-1 rounded-full border border-dashed border-border py-0.5 pl-2 pr-1 text-xs text-muted-foreground"
                >
                  {k.label}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      onChange(k.custom!.id, { archived: false }, `${k.label} is back`)
                    }
                    className="rounded-full px-1.5 hover:bg-muted hover:text-foreground"
                  >
                    Bring back
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border-2 border-border bg-card p-4">
        <h2 className="font-semibold">Built in</h2>
        <div>
          <h3 className="mb-1 text-sm font-semibold">General, for everyone</h3>
          <KindList kinds={GENERAL_LEAVE} />
        </div>
        {ctx.settings.countries.map((c) => (
          <div key={c}>
            <h3 className="mb-1 text-sm font-semibold">Statutory leave — {ctx.countryName(c)}</h3>
            <KindList kinds={statutoryLeaveFor(c)} />
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          Statutory leave is listed by name for Finland and Sweden, and as a general set for other
          countries. Add any other leave you need as your own kind.
        </p>
      </section>
    </div>
  );
}

function KindList({ kinds }: { kinds: LeaveKind[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {kinds.map((k) => (
        <li key={k.key} className={cn("rounded border px-1.5 text-xs", k.tone)}>
          {k.label}
          {k.vacation && <span className="ml-1 opacity-70">· uses vacation days</span>}
        </li>
      ))}
    </ul>
  );
}
