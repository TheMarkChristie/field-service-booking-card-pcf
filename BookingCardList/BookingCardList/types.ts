// Field Service booking-status option values (global choice msdyn_bookingsystemstatus)
export const FieldServiceStatus = {
    Scheduled: 690970000,
    Traveling: 690970001,
    OnBreak: 690970002,
    InProgress: 690970003,
    Completed: 690970004,
    Canceled: 690970005,
} as const;

// The status actions the dropdown exposes (the first three are built-in; "custom" is
// driven by the manifest custom-status configuration).
export type StatusActionKey = "traveling" | "inprogress" | "cancelled" | "custom";

// Optional custom status action configured in the manifest.
export interface CustomStatusConfig {
    name: string;
    bookingStatusId?: string;
    workOrderSubStatusId?: string;
}

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

export interface WorkOrderProductVM {
    id: string;
    name: string;
    quantity: number | null;
}

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
    products: WorkOrderProductVM[];
}

// Tabs
export type TabKey = "today" | "tomorrow" | "complete";

// Per-tab configuration. `name` is the tab label; `viewName` (optional) is the Bookable
// Resource Booking view to run for that tab. When no tab has a viewName, the control uses
// the built-in date/status buckets by position (0=today, 1=tomorrow, 2=complete).
export interface TabConfig {
    name: string;
    viewName?: string;
}

export const BUILTIN_BUCKETS: TabKey[] = ["today", "tomorrow", "complete"];

// Hard-coded Bookable Resource Booking view names each tab runs (in tab order).
export const TAB_VIEW_NAMES = [
    "My Bookings - Today",
    "My Bookings - Tomorrow",
    "My Bookings - Completed",
];

export interface TabInfo {
    key: string;
    label: string;
    count: number;
}

const COMPLETE_STATUSES = new Set<number>([
    FieldServiceStatus.Completed,
    FieldServiceStatus.Canceled,
]);

/** Which tab a booking belongs to (Complete wins over date). Returns null if none. */
export function bucketOf(vm: BookingCardVM, today: Date, tomorrow: Date): TabKey | null {
    if (vm.fieldServiceStatus != null && COMPLETE_STATUSES.has(vm.fieldServiceStatus)) {
        return "complete";
    }
    if (!vm.startDate) return null;
    const d = vm.startDate;
    if (d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()) {
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
