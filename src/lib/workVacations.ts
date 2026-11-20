import { supabase } from "@/integrations/supabase/app-client";

/**
 * Work and vacations: an organisation's working time, national holidays,
 * its own days off, everyone's absences and a demo vacation accrual.
 *
 * - National holidays come from the date-holidays library (loaded only on
 *   this page), for the organisation's countries; the first is everyone's
 *   default and a person may follow another. Public holidays and "bank"
 *   days (in Finland Midsummer Eve, Christmas Eve, New Year's Eve) are days
 *   off; observances (Mother's Day) are shown only.
 * - The organisation adds its own days off (once or every year) and can
 *   mark any national holiday as a working day (work_days_off).
 * - Absences have a kind from the lists below: general ones for everyone,
 *   and statutory ones for the person's country.
 * - Vacation accrual is a demo: a set number of days per full month of the
 *   vacation year (Finland: 2.5 days, the year starting 1 April). Used days
 *   are annual-leave working days that year. A person's earned and used
 *   days can also be set by hand.
 * Every member may read and edit everything for now (row-level security).
 * Dates are "YYYY-MM-DD" strings throughout, so time zones never shift them.
 */

// The tables live in the external database; Lovable regenerates types.ts without them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// ---------------------------------------------------------------- settings

export type WorkSettings = {
  countries: string[];
  /** ISO weekdays worked: 1 = Monday ... 7 = Sunday. */
  work_days: number[];
  hours_per_day: number;
  accrual_per_month: number;
  /** The month the vacation year starts (1-12). */
  accrual_year_start: number;
};

export const DEFAULT_SETTINGS: WorkSettings = {
  countries: ["FI"],
  work_days: [1, 2, 3, 4, 5],
  hours_per_day: 7.5,
  accrual_per_month: 2.5,
  accrual_year_start: 4,
};

export const workSettingsKey = (orgId: string | null) => ["work-settings", orgId];

export async function fetchWorkSettings(orgId: string): Promise<WorkSettings> {
  const { data, error } = await db
    .from("work_settings")
    .select("countries, work_days, hours_per_day, accrual_per_month, accrual_year_start")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return DEFAULT_SETTINGS;
  return {
    countries: data.countries?.length ? data.countries : DEFAULT_SETTINGS.countries,
    work_days: data.work_days ?? DEFAULT_SETTINGS.work_days,
    hours_per_day: Number(data.hours_per_day),
    accrual_per_month: Number(data.accrual_per_month),
    accrual_year_start: data.accrual_year_start,
  };
}

export async function saveWorkSettings(orgId: string, s: WorkSettings) {
  const { error } = await db.from("work_settings").upsert({
    org_id: orgId,
    countries: s.countries,
    work_days: [...s.work_days].sort(),
    hours_per_day: s.hours_per_day,
    accrual_per_month: s.accrual_per_month,
    accrual_year_start: s.accrual_year_start,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

// ---------------------------------------------------------------- days off

export type DayOff = {
  id: string;
  day: string;
  name: string;
  /** day_off: a day off for everyone; working_day: a national holiday worked here. */
  kind: "day_off" | "working_day";
  every_year: boolean;
};

export const daysOffKey = (orgId: string | null) => ["work-days-off", orgId];

export async function fetchDaysOff(orgId: string): Promise<DayOff[]> {
  const { data, error } = await db
    .from("work_days_off")
    .select("id, day, name, kind, every_year")
    .eq("org_id", orgId)
    .order("day", { ascending: true });
  if (error) throw error;
  return (data ?? []) as DayOff[];
}

export async function addDayOff(orgId: string, d: Omit<DayOff, "id">) {
  const { error } = await db.from("work_days_off").insert({
    org_id: orgId,
    day: d.day,
    name: d.name.trim().slice(0, 100),
    kind: d.kind,
    every_year: d.every_year,
  });
  if (error) throw error;
}

export async function deleteDayOff(id: string) {
  const { error } = await db.from("work_days_off").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------- people

/** A person's exceptions; null means the organisation's default or the calculated value. */
export type PersonSettings = {
  person_id: string;
  country: string | null;
  work_days: number[] | null;
  hours_per_day: number | null;
  accrual_per_month: number | null;
  accrued_override: number | null;
  used_override: number | null;
};

export const personSettingsKey = (orgId: string | null) => ["work-person-settings", orgId];

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function fetchPersonSettings(orgId: string): Promise<PersonSettings[]> {
  const { data, error } = await db
    .from("work_person_settings")
    .select(
      "person_id, country, work_days, hours_per_day, accrual_per_month, accrued_override, used_override",
    )
    .eq("org_id", orgId);
  if (error) throw error;
  return ((data ?? []) as PersonSettings[]).map((p) => ({
    ...p,
    hours_per_day: num(p.hours_per_day),
    accrual_per_month: num(p.accrual_per_month),
    accrued_override: num(p.accrued_override),
    used_override: num(p.used_override),
  }));
}

export async function savePersonSettings(orgId: string, p: PersonSettings) {
  const { error } = await db.from("work_person_settings").upsert({
    org_id: orgId,
    ...p,
    work_days: p.work_days ? [...p.work_days].sort() : null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

// ---------------------------------------------------------------- absences

export type Absence = {
  id: string;
  person_id: string;
  kind: string;
  start_date: string;
  end_date: string;
  note: string | null;
};

export const absencesKey = (orgId: string | null) => ["work-absences", orgId];

export async function fetchAbsences(orgId: string): Promise<Absence[]> {
  const { data, error } = await db
    .from("work_absences")
    .select("id, person_id, kind, start_date, end_date, note")
    .eq("org_id", orgId)
    .order("start_date", { ascending: true })
    .limit(5000);
  if (error) throw error;
  return (data ?? []) as Absence[];
}

export const MAX_ABSENCE_NOTE = 500;

export async function saveAbsence(orgId: string, a: Omit<Absence, "id"> & { id?: string }) {
  const row = {
    person_id: a.person_id,
    kind: a.kind,
    start_date: a.start_date,
    end_date: a.end_date,
    note: a.note?.trim().slice(0, MAX_ABSENCE_NOTE) || null,
  };
  if (a.id) {
    const { data, error } = await db.from("work_absences").update(row).eq("id", a.id).select("id");
    if (error) throw error;
    if (!data?.length) throw new Error("The absence was not found");
  } else {
    const { error } = await db.from("work_absences").insert({ org_id: orgId, ...row });
    if (error) throw error;
  }
}

export async function deleteAbsence(id: string) {
  const { error } = await db.from("work_absences").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------- kinds of absence

export type LeaveKind = {
  key: string;
  label: string;
  /** Counts against the vacation balance. */
  vacation?: boolean;
  /** Tailwind classes for its chip. */
  tone: string;
  /** The organisation's own kind: its id and colour name, and whether it was removed. */
  custom?: { id: string; toneName: ToneName; archived: boolean };
};

/** Chip colours by name; the organisation's own kinds pick one. */
export const TONE_CLASSES = {
  green:
    "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-100 dark:border-emerald-800",
  amber:
    "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-800",
  rose: "bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950 dark:text-rose-100 dark:border-rose-800",
  sky: "bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950 dark:text-sky-100 dark:border-sky-800",
  violet:
    "bg-violet-100 text-violet-900 border-violet-300 dark:bg-violet-950 dark:text-violet-100 dark:border-violet-800",
  teal: "bg-teal-100 text-teal-900 border-teal-300 dark:bg-teal-950 dark:text-teal-100 dark:border-teal-800",
  orange:
    "bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-950 dark:text-orange-100 dark:border-orange-800",
  slate:
    "bg-slate-100 text-slate-900 border-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600",
} as const;
export type ToneName = keyof typeof TONE_CLASSES;
export const TONE_NAMES = Object.keys(TONE_CLASSES) as ToneName[];

const TONES = {
  vacation: TONE_CLASSES.green,
  unpaid: TONE_CLASSES.amber,
  sick: TONE_CLASSES.rose,
  family: TONE_CLASSES.sky,
  other: TONE_CLASSES.violet,
};

// ---------------------------------------------------------------- own kinds

export const customKindsKey = (orgId: string | null) => ["work-leave-kinds", orgId];

export const MAX_KIND_LABEL = 80;

/** The organisation's own kinds of absence, removed ones included (absences keep their name). */
export async function fetchCustomKinds(orgId: string): Promise<LeaveKind[]> {
  const { data, error } = await db
    .from("work_leave_kinds")
    .select("id, key, label, vacation, tone, archived")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (
    (data ?? []) as {
      id: string;
      key: string;
      label: string;
      vacation: boolean;
      tone: ToneName;
      archived: boolean;
    }[]
  ).map((k) => ({
    key: k.key,
    label: k.label,
    vacation: k.vacation,
    tone: TONE_CLASSES[k.tone] ?? TONE_CLASSES.teal,
    custom: { id: k.id, toneName: k.tone, archived: k.archived },
  }));
}

export type KindFields = { label: string; vacation: boolean; tone: ToneName };

export async function addCustomKind(orgId: string, k: KindFields) {
  const { error } = await db.from("work_leave_kinds").insert({
    org_id: orgId,
    label: k.label.trim().slice(0, MAX_KIND_LABEL),
    vacation: k.vacation,
    tone: k.tone,
  });
  if (error) throw error;
}

export async function updateCustomKind(
  id: string,
  change: Partial<KindFields> & { archived?: boolean },
) {
  const row: Record<string, unknown> = { ...change };
  if (change.label !== undefined) row.label = change.label.trim().slice(0, MAX_KIND_LABEL);
  const { data, error } = await db.from("work_leave_kinds").update(row).eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("That kind of absence was not found");
}

/** For everyone, whatever their country. */
export const GENERAL_LEAVE: LeaveKind[] = [
  { key: "annual", label: "Annual leave", vacation: true, tone: TONES.vacation },
  { key: "unpaid", label: "Unpaid leave", tone: TONES.unpaid },
  { key: "sick", label: "Sick leave", tone: TONES.sick },
  { key: "other", label: "Other absence", tone: TONES.other },
];

/** Statutory leave by country; a country not listed gets GENERIC_STATUTORY. */
export const STATUTORY_LEAVE: Record<string, LeaveKind[]> = {
  FI: [
    { key: "fi_pregnancy", label: "Pregnancy leave (raskausvapaa)", tone: TONES.family },
    { key: "fi_parental", label: "Parental leave (vanhempainvapaa)", tone: TONES.family },
    { key: "fi_childcare", label: "Child-care leave (hoitovapaa)", tone: TONES.family },
    {
      key: "fi_temp_childcare",
      label: "Temporary child-care leave (tilapäinen hoitovapaa)",
      tone: TONES.family,
    },
    { key: "fi_carer", label: "Carer's leave (omaishoitovapaa)", tone: TONES.family },
    {
      key: "fi_family_reasons",
      label: "Absence for compelling family reasons (pakottava perhesyy)",
      tone: TONES.family,
    },
    { key: "fi_study", label: "Study leave (opintovapaa)", tone: TONES.other },
  ],
  SE: [
    { key: "se_parental", label: "Parental leave (föräldraledighet)", tone: TONES.family },
    {
      key: "se_temp_parental",
      label: "Care of a sick child (vård av barn, VAB)",
      tone: TONES.family,
    },
    { key: "se_carer", label: "Care leave (närståendeledighet)", tone: TONES.family },
    { key: "se_study", label: "Study leave (studieledighet)", tone: TONES.other },
  ],
};

export const GENERIC_STATUTORY: LeaveKind[] = [
  { key: "maternity", label: "Maternity leave", tone: TONES.family },
  { key: "paternity", label: "Paternity leave", tone: TONES.family },
  { key: "parental", label: "Parental leave", tone: TONES.family },
  { key: "carer", label: "Carer's leave", tone: TONES.family },
];

export const statutoryLeaveFor = (country: string) => STATUTORY_LEAVE[country] ?? GENERIC_STATUTORY;

const ALL_LEAVE = [
  ...GENERAL_LEAVE,
  ...Object.values(STATUTORY_LEAVE).flat(),
  ...GENERIC_STATUTORY,
];
const OTHER = GENERAL_LEAVE.find((k) => k.key === "other")!;

/** A kind of absence by its key; unknown keys read as "Other absence". */
export const leaveKind = (key: string, own: LeaveKind[] = []): LeaveKind =>
  ALL_LEAVE.find((k) => k.key === key) ??
  own.find((k) => k.key === key) ?? { ...OTHER, key, label: "Other absence" };

// ---------------------------------------------------------------- dates

const pad = (n: number) => String(n).padStart(2, "0");

/** A Date's UTC day as "YYYY-MM-DD". */
export const isoOf = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export const dateOf = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
};

/** Today in the viewer's own time zone. */
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const addDays = (iso: string, days: number) => {
  const d = dateOf(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return isoOf(d);
};

/** 1 = Monday ... 7 = Sunday. */
export const isoWeekday = (iso: string) => {
  const d = dateOf(iso).getUTCDay();
  return d === 0 ? 7 : d;
};

export const monthStart = (year: number, month: number) => `${year}-${pad(month)}-01`;

/** The 6 weeks that show a month, each starting on `firstDay` (1 = Monday ... 7 = Sunday). */
export function monthGrid(year: number, month: number, firstDay = 1): string[] {
  const first = monthStart(year, month);
  const back = (isoWeekday(first) - firstDay + 7) % 7;
  const start = addDays(first, -back);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/** Every day from start to end, inclusive. */
export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start, i = 0; d <= end && i < 4000; d = addDays(d, 1), i++) out.push(d);
  return out;
}

// ---------------------------------------------------------------- holidays

export type NationalHoliday = {
  date: string;
  name: string;
  country: string;
  /** public and bank count as days off; observance and others are shown only. */
  type: string;
};

/** National holidays of the given countries and years, from date-holidays. */
export async function loadHolidays(countries: string[], years: number[]) {
  const { default: Holidays } = await import("date-holidays");
  const out: NationalHoliday[] = [];
  for (const country of countries) {
    const hd = new Holidays(country);
    for (const year of years) {
      for (const h of hd.getHolidays(year, "en") || []) {
        out.push({ date: h.date.slice(0, 10), name: h.name, country, type: h.type });
      }
    }
  }
  return out;
}

/** Every country the library knows, by code, with its English name. */
export async function loadCountries(): Promise<Record<string, string>> {
  const { default: Holidays } = await import("date-holidays");
  return new Holidays().getCountries("en");
}

const offByDefault = (type: string) => type === "public" || type === "bank";

/**
 * Answers which days are off for whom: national holidays of a country (as
 * the organisation has adjusted them), its own days off and weekends.
 */
export function makeCalendar(holidays: NationalHoliday[], daysOff: DayOff[]) {
  const byDate = new Map<string, NationalHoliday[]>();
  for (const h of holidays) byDate.set(h.date, [...(byDate.get(h.date) ?? []), h]);
  const matches = (d: DayOff, iso: string) =>
    d.every_year ? d.day.slice(5) === iso.slice(5) && d.day <= iso : d.day === iso;
  /** Days marked by the organisation on a date. */
  const marks = (iso: string) => daysOff.filter((d) => matches(d, iso));
  /** A country's holidays on a date, each with whether it is a day off here. */
  const holidaysOn = (iso: string, country: string) =>
    (byDate.get(iso) ?? [])
      .filter((h) => h.country === country)
      .map((h) => {
        const worked = marks(iso).some((m) => m.kind === "working_day");
        return { ...h, off: offByDefault(h.type) && !worked };
      });
  /** The organisation's own days off on a date. */
  const ownDaysOff = (iso: string) => marks(iso).filter((m) => m.kind === "day_off");
  const isWorkingDay = (iso: string, country: string, workDays: number[]) =>
    workDays.includes(isoWeekday(iso)) &&
    ownDaysOff(iso).length === 0 &&
    !holidaysOn(iso, country).some((h) => h.off);
  const workingDays = (start: string, end: string, country: string, workDays: number[]) =>
    eachDay(start, end).filter((d) => isWorkingDay(d, country, workDays)).length;
  return { holidaysOn, ownDaysOff, marks, isWorkingDay, workingDays, offByDefault };
}
export type WorkCalendar = ReturnType<typeof makeCalendar>;

// ---------------------------------------------------------------- vacation (demo)

/** The vacation year that contains `today`, starting on the 1st of `startMonth`. */
export function vacationYear(today: string, startMonth: number) {
  const y = Number(today.slice(0, 4));
  const thisYears = monthStart(y, startMonth);
  const start = today >= thisYears ? thisYears : monthStart(y - 1, startMonth);
  const end = addDays(monthStart(Number(start.slice(0, 4)) + 1, startMonth), -1);
  return { start, end };
}

/** Full calendar months from `start` that have ended by `today`. */
export function fullMonths(start: string, today: string) {
  let months = 0;
  let y = Number(start.slice(0, 4));
  let m = Number(start.slice(5, 7));
  for (let i = 0; i < 240; i++) {
    const nextY = m === 12 ? y + 1 : y;
    const nextM = m === 12 ? 1 : m + 1;
    // A month counts once the day after its last day has come.
    if (monthStart(nextY, nextM) > addDays(today, 1)) break;
    months++;
    y = nextY;
    m = nextM;
  }
  return months;
}

export type VacationBalance = {
  period: { start: string; end: string };
  months: number;
  rate: number;
  earnedCalculated: number;
  earned: number;
  usedCalculated: number;
  used: number;
  left: number;
};

/** Earned, used and left vacation days this vacation year, by hand where set. */
export function vacationBalance(args: {
  today: string;
  settings: WorkSettings;
  person: PersonSettings | undefined;
  absences: Absence[];
  calendar: WorkCalendar;
  country: string;
  workDays: number[];
  /** The organisation's own kinds, some of which may use vacation days. */
  ownKinds?: LeaveKind[];
}): VacationBalance {
  const { today, settings, person, absences, calendar, country, workDays, ownKinds } = args;
  const period = vacationYear(today, settings.accrual_year_start);
  const months = fullMonths(period.start, today);
  const rate = person?.accrual_per_month ?? settings.accrual_per_month;
  const earnedCalculated = Math.round(months * rate * 10) / 10;
  const usedCalculated = absences
    .filter((a) => leaveKind(a.kind, ownKinds).vacation)
    .reduce((sum, a) => {
      const from = a.start_date > period.start ? a.start_date : period.start;
      const to = a.end_date < period.end ? a.end_date : period.end;
      return from > to ? sum : sum + calendar.workingDays(from, to, country, workDays);
    }, 0);
  const earned = person?.accrued_override ?? earnedCalculated;
  const used = person?.used_override ?? usedCalculated;
  return {
    period,
    months,
    rate,
    earnedCalculated,
    earned,
    usedCalculated,
    used,
    left: Math.round((earned - used) * 10) / 10,
  };
}

/** The first day of the week where `locale` is used: 1 = Monday ... 7 = Sunday. */
export function firstDayOfWeek(locale?: string): number {
  try {
    const l = new Intl.Locale(
      locale ?? Intl.DateTimeFormat().resolvedOptions().locale,
    ) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const day = l.getWeekInfo?.().firstDay ?? l.weekInfo?.firstDay;
    if (day && day >= 1 && day <= 7) return day;
  } catch {
    /* an unknown locale: Monday */
  }
  return 1;
}

/**
 * Dates, months and weekdays the way the viewer's locale writes them
 * ("20.11.2026" in Finland, "11/20/2026" in the US), and the week starting
 * on its usual first day. Dates are "YYYY-MM-DD" and shown as UTC days, so
 * they never shift with the time zone.
 */
export function dateFormat(locale?: string) {
  const f = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...o });
  const full = f({ day: "numeric", month: "numeric", year: "numeric" });
  const dayMonth = f({ day: "numeric", month: "numeric" });
  const monthYear = f({ month: "long", year: "numeric" });
  const dayMonthLong = f({ day: "numeric", month: "long" });
  const weekdayShort = f({ weekday: "short" });
  const firstDay = firstDayOfWeek(locale);
  /** 2024-01-01 was a Monday. */
  const weekdayDate = (isoDay: number) => dateOf(addDays("2024-01-01", isoDay - 1));
  return {
    firstDay,
    /** The ISO weekdays in the order the locale's week runs. */
    weekOrder: Array.from({ length: 7 }, (_, i) => ((firstDay - 1 + i) % 7) + 1),
    /** "20.11.2026" */
    date: (iso: string) => full.format(dateOf(iso)),
    /** "20.11." — for something every year, or within a year shown elsewhere. */
    dayMonth: (iso: string) => dayMonth.format(dateOf(iso)),
    /** "20.11.2026–31.12.2026", or one date when they are the same. */
    range: (from: string, to: string) =>
      from === to
        ? full.format(dateOf(from))
        : `${full.format(dateOf(from))}–${full.format(dateOf(to))}`,
    /** "November 2026" */
    monthYear: (year: number, month: number) => monthYear.format(dateOf(monthStart(year, month))),
    /** "1 April": the first day of a month. */
    firstOfMonth: (month: number) => dayMonthLong.format(dateOf(monthStart(2026, month))),
    /** "Mon": 1 = Monday ... 7 = Sunday. */
    weekday: (isoDay: number) => weekdayShort.format(weekdayDate(isoDay)),
  };
}
export type DateFormat = ReturnType<typeof dateFormat>;

export const fmtDays = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
