// ── Shared types & domain constants for the Booking Card List control ─────────

/** Field Service booking-status option values (global choice msdyn_bookingsystemstatus). */
export const FieldServiceStatus = {
  Scheduled: 690970000,
  Traveling: 690970001,
  OnBreak: 690970002,
  InProgress: 690970003,
  Completed: 690970004,
  Canceled: 690970005,
} as const;

/** The status changes offered in the card dropdown (plus the optional "custom"). */
export type StatusActionKey = "traveling" | "inprogress" | "cancelled";
export type StatusChoice = StatusActionKey | "custom";

export interface StatusAction {
  key: StatusActionKey;
  fieldServiceStatus: number;
}

export const STATUS_ACTIONS: StatusAction[] = [
  { key: "traveling", fieldServiceStatus: FieldServiceStatus.Traveling },
  { key: "inprogress", fieldServiceStatus: FieldServiceStatus.InProgress },
  { key: "cancelled", fieldServiceStatus: FieldServiceStatus.Canceled },
];

// A booking with one of these Field Service Statuses is "active" — while any booking is
// active, status changes on the OTHER bookings are locked.
export const ACTIVE_FS_STATUSES = new Set<number>([
  FieldServiceStatus.Traveling,
  FieldServiceStatus.InProgress,
]);

export type BuiltinBucket = "today" | "tomorrow" | "complete";
export const BUILTIN_BUCKETS: BuiltinBucket[] = ["today", "tomorrow", "complete"];

// Hard-coded Bookable Resource Booking view names each tab runs (in tab order).
export const TAB_VIEW_NAMES: (string | undefined)[] = [
  "My Bookings - Today",
  "My Bookings - Tomorrow",
  "My Bookings - Completed",
];

// Terminal statuses: a booking here is finished. Its status can never be changed again,
// but it can still be opened to view the record. (Also drives the "complete" bucket.)
export const TERMINAL_FS_STATUSES = new Set<number>([
  FieldServiceStatus.Completed,
  FieldServiceStatus.Canceled,
]);

/** A "custom" status option configured via the manifest. */
export interface CustomStatus {
  name: string;
  bookingStatusId?: string;
  workOrderSubStatusId?: string;
}

export type MapsProvider = "google" | "bing" | "apple";

/** Why a card's status is locked: it is itself complete, or another job is active. */
export type StatusLockReason = "complete" | "otherOpen";

export interface ProductLine {
  id: string;
  name: string;
  quantity: number | null;
}

/** The fully-resolved view-model rendered on a single booking card. */
export interface BookingCardVM {
  bookingId: string;
  workOrderId?: string;
  workOrderNumber: string;
  serviceAccount: string;
  incidentType: string;
  addressText: string;
  latitude?: number;
  longitude?: number;
  startDate?: Date;
  startText: string;
  travelText: string;
  bookingStatusName: string;
  fieldServiceStatus?: number;
  products: ProductLine[];
  /** Values of the configured custom fields, in manifest order, blanks removed. */
  extras: string[];
}

/** A custom field configured in the manifest to show on the card. */
export interface ExtraFieldSpec {
  table: "booking" | "workorder";
  field: string;
}

const EXTRA_PREFIX = /^(workorder|wo|booking|brb)\.(.+)$/i;

/**
 * Parse a manifest custom-field value into a spec. Accepts an optional table prefix:
 *   "workorder.prx3_foo" / "wo.prx3_foo"  -> work order field
 *   "booking.prx3_bar"   / "prx3_bar"     -> booking field (the default)
 * Returns null when blank. For a lookup column, enter its "_logicalname_value" form.
 */
export function parseExtraField(raw: string | null | undefined): ExtraFieldSpec | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const m = EXTRA_PREFIX.exec(s);
  if (m) {
    const table = /^(workorder|wo)$/i.test(m[1]) ? "workorder" : "booking";
    const field = m[2].trim();
    return field ? { table, field } : null;
  }
  return { table: "booking", field: s };
}

/** Which built-in tab a booking belongs to (Complete wins over date). null if none. */
export function bucketOf(vm: BookingCardVM, today: Date, tomorrow: Date): BuiltinBucket | null {
  if (vm.fieldServiceStatus != null && TERMINAL_FS_STATUSES.has(vm.fieldServiceStatus)) {
    return "complete";
  }
  if (!vm.startDate) return null;
  const d = vm.startDate;
  if (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  ) {
    return "today";
  }
  if (
    d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate()
  ) {
    return "tomorrow";
  }
  return null;
}
