import { BookingCardVM, ProductLine } from "../types";

/**
 * Build booking cards from the control's BOUND DATASET (the "bookings" data-set, e.g. the
 * "Active Bookable Resource Bookings" view) instead of querying the Web API.
 *
 * Why: the Field Service **offline-first** mobile app serves a bound view/dataset from the
 * device's local store, but rejects most `context.webAPI` FetchXML (it can't resolve the
 * signed-in user's Bookable Resource offline — see services/dataverse.ts). The native views work
 * offline for exactly this reason. So we read the same way they do: straight from the dataset.
 *
 * Every field the card shows must therefore be a COLUMN IN THE VIEW:
 *  - Booking columns (start/end/travel/status/work order/resource) are read directly.
 *  - Related Work Order columns (customer, address, priority, incident type, geo) show offline only
 *    when added to the view as related-record columns. Missing ones simply render blank.
 *  - The work order NUMBER and resource NAME come free from the lookup columns' formatted values.
 *  - Products (a child list) can't come from a view — enriched via Web API when online only.
 */

type DataSet = ComponentFramework.PropertyTypes.DataSet;
type EntityRecord = DataSet["records"][string];

/** A column read helper: matches by exact logical name, else any column whose name/alias ends with it. */
function makeReader(ds: DataSet, record: EntityRecord) {
  const cols = ds.columns ?? [];
  const findCol = (candidates: string[]): string | undefined => {
    for (const c of candidates) {
      if (cols.some((col) => col.name === c)) return c;
    }
    const lower = candidates.map((c) => c.toLowerCase());
    const hit = cols.find((col) => {
      const n = (col.name || "").toLowerCase();
      const a = ((col as unknown as { alias?: string }).alias || "").toLowerCase();
      return lower.some((c) => n === c || a === c || n.endsWith("." + c) || a.endsWith("." + c) || n.endsWith(c) || a.endsWith(c));
    });
    return hit?.name;
  };
  return {
    text(candidates: string[]): string {
      const name = findCol(candidates);
      if (!name) return "";
      try {
        const f = record.getFormattedValue(name);
        if (f != null && f !== "") return String(f);
        const v = record.getValue(name);
        return v == null ? "" : String(v);
      } catch {
        return "";
      }
    },
    raw(candidates: string[]): unknown {
      const name = findCol(candidates);
      if (!name) return undefined;
      try {
        return record.getValue(name);
      } catch {
        return undefined;
      }
    },
  };
}

/** Value of an FS status option set can arrive as a number or numeric string. */
function toNum(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) return Number(v);
  return undefined;
}

/** Lookup columns can surface as an id, an EntityReference, or an array of them. Pull the guid. */
function lookupId(v: unknown): string | undefined {
  if (!v) return undefined;
  if (typeof v === "string") return v.replace(/[{}]/g, "") || undefined;
  const one = Array.isArray(v) ? v[0] : v;
  const ref = one as { id?: { guid?: string } | string };
  if (ref && typeof ref.id === "object" && ref.id?.guid) return ref.id.guid.replace(/[{}]/g, "");
  if (ref && typeof ref.id === "string") return (ref.id as string).replace(/[{}]/g, "");
  return undefined;
}

export interface DatasetMapOptions {
  formatStart: (d: Date) => string;
  formatDuration: (mins: number | undefined) => string;
  parseDate: (iso: string) => Date | undefined;
}

/** Map one dataset record to a card view-model (products left empty for Web-API enrichment). */
function mapRecord(ds: DataSet, record: EntityRecord, opts: DatasetMapOptions): BookingCardVM {
  const r = makeReader(ds, record);
  const startRaw = r.raw(["starttime"]);
  const startIso = startRaw instanceof Date ? startRaw.toISOString() : (typeof startRaw === "string" ? startRaw : "");
  const startDate = startIso ? opts.parseDate(startIso) : undefined;
  const travelRaw = r.raw(["msdyn_estimatedtravelduration"]);
  const travelMinutes = toNum(travelRaw);
  const fsStatus = toNum(r.raw(["msdyn_fieldservicestatus", "bookingstatus.msdyn_fieldservicestatus"]));

  const woNumber = r.text(["msdyn_workorder", "msdyn_name", "msdyn_workorder.msdyn_name"]);

  return {
    bookingId: record.getRecordId(),
    workOrderId: lookupId(r.raw(["msdyn_workorder"])),
    workOrderNumber: woNumber || "(no work order)",
    serviceAccount: r.text(["msdyn_serviceaccount", "msdyn_workorder.msdyn_serviceaccount"]),
    incidentType: r.text(["msdyn_primaryincidenttype", "msdyn_workorder.msdyn_primaryincidenttype"]),
    headerBadge: "",
    addressText: [
      r.text(["msdyn_address1", "msdyn_workorder.msdyn_address1"]),
      r.text(["msdyn_city", "msdyn_workorder.msdyn_city"]),
      r.text(["msdyn_postalcode", "msdyn_workorder.msdyn_postalcode"]),
    ].filter(Boolean).join(", "),
    latitude: toNum(r.raw(["msdyn_latitude", "msdyn_workorder.msdyn_latitude"])),
    longitude: toNum(r.raw(["msdyn_longitude", "msdyn_workorder.msdyn_longitude"])),
    startDate,
    startText: startDate ? opts.formatStart(startDate) : "",
    travelText: opts.formatDuration(travelMinutes),
    bookingStatusName: r.text(["bookingstatus"]),
    fieldServiceStatus: fsStatus,
    bookingStatusId: lookupId(r.raw(["bookingstatus"])),
    resourceName: r.text(["resource"]),
    priorityName: r.text(["msdyn_priority", "msdyn_workorder.msdyn_priority"]),
    products: [] as ProductLine[],
    extras: [],
  };
}

/** Build all booking cards from the bound dataset, in the view's sort order. */
export function buildCardsFromDataset(ds: DataSet, opts: DatasetMapOptions): BookingCardVM[] {
  if (!ds || ds.loading || ds.error) return [];
  const ids = ds.sortedRecordIds ?? Object.keys(ds.records ?? {});
  const out: BookingCardVM[] = [];
  for (const id of ids) {
    const rec = ds.records?.[id];
    if (rec) out.push(mapRecord(ds, rec, opts));
  }
  return out;
}
