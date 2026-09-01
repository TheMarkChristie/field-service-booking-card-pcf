// ── Shared types & domain constants for the Booking Card List control ─────────

// Shown small in the tab bar so you can see which build is actually loaded on the device
// (mobile caches the control bundle). KEEP IN SYNC with ControlManifest.Input.xml version.
export const CONTROL_VERSION = "1.1.0";

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

export type BuiltinBucket = "active" | "today" | "tomorrow" | "complete";

// This environment requires a Work Order Sub-Status on the booking (bookableresourcebooking.
// prx3_substatus) before it can move to a TERMINAL status (a business rule enforces it). Each
// terminal booking Field Service status maps to a Work Order System Status; the control resolves an
// active msdyn_workordersubstatus for that value and sets it alongside the status change.
export const TERMINAL_WO_SYSTEMSTATUS: Record<number, number> = {
  [FieldServiceStatus.Canceled]: 690970005, // WO System Status: Canceled
  [FieldServiceStatus.Completed]: 690970003, // WO System Status: Completed
};

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
  /** Optional extra header badge value (e.g. Work Order job type), if configured. */
  headerBadge: string;
  addressText: string;
  latitude?: number;
  longitude?: number;
  startDate?: Date;
  startText: string;
  travelText: string;
  bookingStatusName: string;
  fieldServiceStatus?: number;
  /** Booking Status record id — lets online enrichment resolve FS status if the view omits it. */
  bookingStatusId?: string;
  /** Bookable resource (engineer) name — shown on the All Jobs tab. */
  resourceName: string;
  /** Work Order priority name (from msdyn_priority), if any. */
  priorityName: string;
  products: ProductLine[];
  /** Values of the configured custom fields, in manifest order, blanks removed. */
  extras: string[];
}

/** Parse the priorityColours manifest string ("High=#D13438;Medium=#F7A600") into a
 *  lowercased-name → colour map. Accepts ';' or newline separators. */
export function parsePriorityColours(raw: string | null | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  (raw ?? "").split(/[;\n]/).forEach((pair) => {
    const i = pair.indexOf("=");
    if (i > 0) {
      const name = pair.slice(0, i).trim().toLowerCase();
      const colour = pair.slice(i + 1).trim();
      if (name && colour) map[name] = colour;
    }
  });
  return map;
}

/** A custom field configured in the manifest to show on the card. */
export interface ExtraFieldSpec {
  table: "booking" | "workorder" | "asset";
  field: string;
}

const EXTRA_PREFIX = /^(workorder|wo|booking|brb|asset|customerasset|ca)\.(.+)$/i;

/**
 * Parse a manifest custom-field value into a spec. Accepts an optional table prefix:
 *   "workorder.prx3_foo" / "wo.prx3_foo"  -> work order field
 *   "asset.prx3_baz"     / "ca.prx3_baz"  -> customer asset field, resolved through the work
 *                                            order's msdyn_customerasset lookup (two hops)
 *   "booking.prx3_bar"   / "prx3_bar"     -> booking field (the default)
 * Returns null when blank. For a lookup column, enter its "_logicalname_value" form.
 */
export function parseExtraField(raw: string | null | undefined): ExtraFieldSpec | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const m = EXTRA_PREFIX.exec(s);
  if (m) {
    const p = m[1].toLowerCase();
    const table: ExtraFieldSpec["table"] =
      p === "workorder" || p === "wo" ? "workorder"
        : p === "asset" || p === "customerasset" || p === "ca" ? "asset"
          : "booking";
    const field = m[2].trim();
    return field ? { table, field } : null;
  }
  return { table: "booking", field: s };
}

/** Which built-in tab a booking belongs to. Active (Traveling/In Progress, started on/after
 *  activeFloor) wins, then Complete (Completed/Cancelled), otherwise by start date. An active job
 *  that started before activeFloor is ignored (returns null) so a stale open job isn't shown and
 *  doesn't block. null if none. */
export function bucketOf(
  vm: BookingCardVM, today: Date, tomorrow: Date, activeFloor: Date, completeFloor: Date
): BuiltinBucket | null {
  if (vm.fieldServiceStatus != null && ACTIVE_FS_STATUSES.has(vm.fieldServiceStatus)) {
    return vm.startDate && vm.startDate >= activeFloor ? "active" : null;
  }
  if (vm.fieldServiceStatus != null && TERMINAL_FS_STATUSES.has(vm.fieldServiceStatus)) {
    // Completed/cancelled jobs older than the Completed window (prx3_completedbookingdays) drop off.
    return vm.startDate && vm.startDate >= completeFloor ? "complete" : null;
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
