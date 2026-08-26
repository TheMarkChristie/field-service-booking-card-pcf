import { BookingCardVM, ProductLine, ExtraFieldSpec, CustomStatus } from "../types";

type WebApi = ComponentFramework.WebApi;
type Entity = ComponentFramework.WebApi.Entity;

const FV = "@OData.Community.Display.V1.FormattedValue";

// Entity logical / set names (verified against the Dataverse schema)
const BOOKING = "bookableresourcebooking";
const WORKORDER = "msdyn_workorder";
const WORKORDERPRODUCT = "msdyn_workorderproduct";
const BOOKINGSTATUS = "bookingstatus";
const BOOKINGSTATUS_SET = "bookingstatuses";

// Keep FetchXML "in" value lists a sensible length per request.
const FETCH_CHUNK = 50;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function xmlEscape(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** FetchXML "in" condition over a list of ids/values. */
function inCondition(attribute: string, values: string[]): string {
  const vals = values.map((v) => `<value>${xmlEscape(v)}</value>`).join("");
  return `<condition attribute="${attribute}" operator="in">${vals}</condition>`;
}

/** FetchXML datetime literal (UTC, no milliseconds — the offline parser is strict). */
function fxDate(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * For a custom-field name, the FetchXML attribute to request. Lookups entered as the OData
 * "_logicalname_value" form map back to the lookup's logical name for FetchXML; the result
 * still carries the "_logicalname_value" / FormattedValue keys that readExtra() reads.
 */
function fxAttrName(field: string): string {
  const m = /^_(.+)_value$/.exec(field);
  return m ? m[1] : field;
}

interface WorkOrderInfo {
  name: string;
  serviceAccount: string;
  incidentType: string;
  addressText: string;
  priority: string;
  lat?: number;
  lng?: number;
}

interface BookingRow {
  bookingId: string;
  workOrderId?: string;
  statusId?: string;
  statusName: string;
  resourceName: string;
  startIso?: string;
  travelMinutes?: number;
}

/**
 * All Dataverse access for the control. Uses context.webAPI, which also resolves against the
 * Field Service mobile offline store when the app is offline (provided the tables are in the
 * offline profile). Every query uses FLAT FetchXML — no OData "_lookup_value" filters (unsupported
 * in classic offline) and no link-entity joins (the new offline-first engine rejects inner/outer
 * joins as "invalid FetchXML"). Filtering is done with flat "in" / date conditions on lookups
 * (resolving related ids in separate flat queries first). Works offline-first, classic offline & online.
 */
export class BookingDataService {
  private api: WebApi;
  private client: unknown;
  private userId: string;
  private dateFmt: Intl.DateTimeFormat;
  private timeFmt: Intl.DateTimeFormat;
  private statusIdCache = new Map<number, string | undefined>();
  private allStatusesCache?: { id: string; fs: number | null; active: boolean }[];
  private allSubStatusesCache?: { id: string; sys: number | null; active: boolean }[];
  // First good Field Service Settings read is cached for the control's lifetime, so a later offline
  // dataset refresh (which can't re-read the settings) doesn't lose the Active window / Next-days tab.
  private settingsCache?: { customStatus?: CustomStatus; activeDays?: number; completedDays?: number; nextDays?: number };

  constructor(context: ComponentFramework.Context<unknown>) {
    this.api = context.webAPI;
    this.client = context.client;
    // Signed-in user id (to resolve "my" resource via a flat userid filter). Strip any braces.
    this.userId = (context.userSettings?.userId ?? "").replace(/[{}]/g, "");
    this.dateFmt = new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    this.timeFmt = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  /**
   * True when the Field Service mobile app is running against its LOCAL OFFLINE STORE. Offline-first
   * reads/writes the local store even when the device has a signal, and that store's FetchXML engine
   * is stricter (rejects conditions/attributes on columns not in the offline profile, link-entities,
   * etc.). Queries that can be richer online branch on this. Defensive: any failure = treat as online.
   */
  isOffline(): boolean {
    try {
      const c = this.client as { isOffline?: () => boolean } | undefined;
      return typeof c?.isOffline === "function" ? !!c.isOffline() : false;
    } catch {
      return false;
    }
  }

  /**
   * True when the DEVICE genuinely has no connectivity — used ONLY for the "Working offline"
   * banner/icon. Distinct from isOffline(): the platform's isOffline() reports the offline-first
   * app MODE, which is true even on a live connection, so the banner fired while the technician was
   * actually online. Prefer navigator.onLine (real connectivity); fall back to the platform flag
   * only when the host doesn't expose it. Query branching still uses isOffline(), not this.
   */
  isDeviceOffline(): boolean {
    try {
      if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") {
        return !navigator.onLine;
      }
      return this.isOffline();
    } catch {
      return false;
    }
  }

  /** Fetch full card detail for a set of booking ids, returned in the input order. */
  async getBookingDetails(
    bookingIds: string[],
    extraSpecs: ExtraFieldSpec[] = [],
    headerSpec?: ExtraFieldSpec
  ): Promise<BookingCardVM[]> {
    if (bookingIds.length === 0) return [];

    const bookingExtraFields = extraSpecs.filter((x) => x.table === "booking").map((x) => x.field);
    const woExtraFields = extraSpecs.filter((x) => x.table === "workorder").map((x) => x.field);
    // The header badge field is fetched alongside the body extras, then rendered separately.
    if (headerSpec) {
      (headerSpec.table === "workorder" ? woExtraFields : bookingExtraFields).push(headerSpec.field);
    }
    const uniqBooking = [...new Set(bookingExtraFields)];
    const uniqWo = [...new Set(woExtraFields)];

    const rows = new Map<string, BookingRow>();
    const workOrderIds = new Set<string>();
    const statusIds = new Set<string>();

    for (const ids of chunk(bookingIds, FETCH_CHUNK)) {
      const build = (attrs: string[]): string =>
        `<fetch><entity name="${BOOKING}">` +
        attrs.map((a) => `<attribute name="${a}" />`).join("") +
        `<filter>${inCondition("bookableresourcebookingid", ids)}</filter>` +
        `</entity></fetch>`;
      // Drop the optional travel-duration field first — if it isn't in the offline profile the
      // whole booking-detail query would otherwise be rejected and no cards would load at all.
      const entities = await this.fetchTiered(BOOKING, build, [
        [
          "bookableresourcebookingid", "starttime", "endtime", "msdyn_estimatedtravelduration",
          "msdyn_workorder", "bookingstatus", "resource",
        ],
        ["bookableresourcebookingid", "starttime", "endtime", "msdyn_workorder", "bookingstatus", "resource"],
        ["bookableresourcebookingid", "starttime", "msdyn_workorder", "bookingstatus", "resource"],
      ]);
      for (const e of entities) {
        const workOrderId = (e._msdyn_workorder_value as string) || undefined;
        const statusId = (e._bookingstatus_value as string) || undefined;
        if (workOrderId) workOrderIds.add(workOrderId);
        if (statusId) statusIds.add(statusId);
        rows.set(e.bookableresourcebookingid as string, {
          bookingId: e.bookableresourcebookingid as string,
          workOrderId,
          statusId,
          statusName: (e[`_bookingstatus_value${FV}`] as string) || "",
          resourceName: (e[`_resource_value${FV}`] as string) || "",
          startIso: (e.starttime as string) ?? undefined,
          travelMinutes: (e.msdyn_estimatedtravelduration as number) ?? undefined,
        });
      }
    }

    const [workOrders, productsByWo, statusFs, bookingExtras, woExtras] = await Promise.all([
      this.getWorkOrders([...workOrderIds]),
      this.getWorkOrderProducts([...workOrderIds]),
      this.getStatusFsValues([...statusIds]),
      this.getExtras(BOOKING, "bookableresourcebookingid", bookingIds, uniqBooking),
      this.getExtras(WORKORDER, "msdyn_workorderid", [...workOrderIds], uniqWo),
    ]);

    return bookingIds
      .map((id): BookingCardVM | undefined => {
        const b = rows.get(id);
        if (!b) return undefined;
        const wo = b.workOrderId ? workOrders.get(b.workOrderId) : undefined;
        const startDate = b.startIso ? this.parseDate(b.startIso) : undefined;
        // Custom fields, in manifest order, pulling each from its source table; blanks dropped.
        const extras = extraSpecs
          .map((spec) => {
            const rec =
              spec.table === "workorder"
                ? b.workOrderId
                  ? woExtras.get(b.workOrderId)
                  : undefined
                : bookingExtras.get(id);
            return rec?.[spec.field] ?? "";
          })
          .filter((v) => v !== "");
        const headerRec = headerSpec
          ? headerSpec.table === "workorder"
            ? b.workOrderId
              ? woExtras.get(b.workOrderId)
              : undefined
            : bookingExtras.get(id)
          : undefined;
        const headerBadge = headerSpec ? headerRec?.[headerSpec.field] ?? "" : "";
        return {
          bookingId: id,
          workOrderId: b.workOrderId,
          workOrderNumber: wo?.name ?? "(no work order)",
          serviceAccount: wo?.serviceAccount ?? "",
          incidentType: wo?.incidentType ?? "",
          headerBadge,
          addressText: wo?.addressText ?? "",
          latitude: wo?.lat,
          longitude: wo?.lng,
          startDate,
          startText: startDate ? this.formatStart(startDate) : "",
          travelText: this.formatDuration(b.travelMinutes),
          bookingStatusName: b.statusName,
          fieldServiceStatus: b.statusId ? statusFs.get(b.statusId) : undefined,
          resourceName: b.resourceName,
          priorityName: wo?.priority ?? "",
          products: b.workOrderId ? productsByWo.get(b.workOrderId) ?? [] : [],
          extras,
        };
      })
      .filter((v): v is BookingCardVM => !!v);
  }

  /**
   * Read arbitrary "extra" columns for a set of records, keyed by record id then field name.
   * Prefers the field's FormattedValue annotation (so choices / dates / money / lookups entered
   * as "_x_value" display nicely), falling back to the raw value. Isolated from the core card
   * load: a bad/typo'd field name degrades gracefully (combined query falls back to per-field,
   * and a still-failing field is simply skipped) rather than breaking the whole card.
   */
  private async getExtras(
    entity: string,
    idAttr: string,
    ids: string[],
    fields: string[]
  ): Promise<Map<string, Record<string, string>>> {
    const map = new Map<string, Record<string, string>>();
    if (ids.length === 0 || fields.length === 0) return map;

    const put = (recId: string, field: string, value: string) => {
      if (!value) return;
      const rec = map.get(recId) ?? {};
      rec[field] = value;
      map.set(recId, rec);
    };

    const buildFetch = (attrFields: string[], chunkIds: string[]): string => {
      const attrs = [idAttr, ...attrFields.map(fxAttrName)]
        .map((a) => `<attribute name="${a}" />`)
        .join("");
      return (
        `<fetch><entity name="${entity}">${attrs}` +
        `<filter>${inCondition(idAttr, chunkIds)}</filter>` +
        `</entity></fetch>`
      );
    };

    for (const chunkIds of chunk(ids, FETCH_CHUNK)) {
      try {
        const entities = await this.fetchXml(entity, buildFetch(fields, chunkIds));
        for (const e of entities) {
          for (const f of fields) put(e[idAttr] as string, f, this.readExtra(e, f));
        }
      } catch (err) {
        // One bad field name would fail the combined query — retry each field on its own.
        console.warn("[BookingCardList] combined extras query failed; retrying per field", err);
        for (const f of fields) {
          try {
            const entities = await this.fetchXml(entity, buildFetch([f], chunkIds));
            for (const e of entities) put(e[idAttr] as string, f, this.readExtra(e, f));
          } catch (e2) {
            console.warn(`[BookingCardList] extra field '${f}' on ${entity} could not be read`, e2);
          }
        }
      }
    }
    return map;
  }

  private readExtra(e: Record<string, unknown>, field: string): string {
    // Prefer the field's FormattedValue, then a lookup's FormattedValue, then the raw value.
    return (
      this.toText(e[`${field}${FV}`]) ||
      this.toText(e[`_${field}_value${FV}`]) ||
      this.toText(e[field])
    );
  }

  /** Stringify a primitive Dataverse value; ignore objects/arrays (no "[object Object]"). */
  private toText(v: unknown): string {
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    return "";
  }

  private async getWorkOrders(workOrderIds: string[]): Promise<Map<string, WorkOrderInfo>> {
    const map = new Map<string, WorkOrderInfo>();
    if (workOrderIds.length === 0) return map;
    for (const ids of chunk(workOrderIds, FETCH_CHUNK)) {
      const build = (attrs: string[]): string =>
        `<fetch><entity name="${WORKORDER}">` +
        attrs.map((a) => `<attribute name="${a}" />`).join("") +
        `<filter>${inCondition("msdyn_workorderid", ids)}</filter>` +
        `</entity></fetch>`;
      // Widest first; drop the fields most likely to be absent from an offline profile (geo, then
      // incident type / priority) so a single missing field can't lose the whole work order.
      const entities = await this.fetchTiered(WORKORDER, build, [
        [
          "msdyn_workorderid", "msdyn_name", "msdyn_serviceaccount", "msdyn_primaryincidenttype",
          "msdyn_priority", "msdyn_address1", "msdyn_city", "msdyn_postalcode",
          "msdyn_latitude", "msdyn_longitude",
        ],
        [
          "msdyn_workorderid", "msdyn_name", "msdyn_serviceaccount", "msdyn_primaryincidenttype",
          "msdyn_priority", "msdyn_address1", "msdyn_city", "msdyn_postalcode",
        ],
        ["msdyn_workorderid", "msdyn_name", "msdyn_serviceaccount", "msdyn_address1", "msdyn_city", "msdyn_postalcode"],
        ["msdyn_workorderid", "msdyn_name"],
      ]);
      for (const w of entities) {
        const lat = w.msdyn_latitude as number | null;
        const lng = w.msdyn_longitude as number | null;
        const addressText = [w.msdyn_address1, w.msdyn_city, w.msdyn_postalcode]
          .filter((p) => !!p)
          .join(", ");
        map.set(w.msdyn_workorderid as string, {
          name: (w.msdyn_name as string) || "",
          serviceAccount: (w[`_msdyn_serviceaccount_value${FV}`] as string) || "",
          incidentType: (w[`_msdyn_primaryincidenttype_value${FV}`] as string) || "",
          priority: (w[`_msdyn_priority_value${FV}`] as string) || "",
          addressText,
          lat: typeof lat === "number" ? lat : undefined,
          lng: typeof lng === "number" ? lng : undefined,
        });
      }
    }
    return map;
  }

  private async getWorkOrderProducts(workOrderIds: string[]): Promise<Map<string, ProductLine[]>> {
    const map = new Map<string, ProductLine[]>();
    if (workOrderIds.length === 0) return map;
    for (const ids of chunk(workOrderIds, FETCH_CHUNK)) {
      const fx =
        `<fetch><entity name="${WORKORDERPRODUCT}">` +
        `<attribute name="msdyn_workorderproductid" />` +
        `<attribute name="msdyn_name" />` +
        `<attribute name="msdyn_estimatequantity" />` +
        `<attribute name="msdyn_quantity" />` +
        `<attribute name="msdyn_workorder" />` +
        `<filter type="and">${inCondition("msdyn_workorder", ids)}` +
        `<condition attribute="statecode" operator="eq" value="0" /></filter>` +
        `</entity></fetch>`;
      let entities: Entity[];
      try {
        entities = await this.fetchXml(WORKORDERPRODUCT, fx);
      } catch (e) {
        // Products are an enrichment: if the table/attribute isn't in the offline profile the
        // card still loads without a product list, instead of failing the whole load.
        console.warn("[BookingCardList] work order products skipped (offline profile?)", e);
        continue;
      }
      for (const e of entities) {
        const woId = e._msdyn_workorder_value as string;
        if (!woId) continue;
        const qty = (e.msdyn_estimatequantity ?? e.msdyn_quantity ?? null) as number | null;
        const list = map.get(woId) ?? [];
        list.push({
          id: e.msdyn_workorderproductid as string,
          name: (e.msdyn_name as string) || "Product",
          quantity: qty,
        });
        map.set(woId, list);
      }
    }
    return map;
  }

  /** Map Booking Status record id -> its Field Service Status option value. */
  private async getStatusFsValues(statusIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (statusIds.length === 0) return map;
    for (const ids of chunk(statusIds, FETCH_CHUNK)) {
      const fx =
        `<fetch><entity name="${BOOKINGSTATUS}">` +
        `<attribute name="bookingstatusid" />` +
        `<attribute name="msdyn_fieldservicestatus" />` +
        `<filter>${inCondition("bookingstatusid", ids)}</filter>` +
        `</entity></fetch>`;
      let entities: Entity[];
      try {
        entities = await this.fetchXml(BOOKINGSTATUS, fx);
      } catch (e) {
        // The Field Service Status mapping is an enrichment (drives the status pill colour); if
        // Booking Status isn't in the offline profile the card still loads without it.
        console.warn("[BookingCardList] booking-status FS mapping skipped (offline profile?)", e);
        continue;
      }
      for (const s of entities) {
        const fs = s.msdyn_fieldservicestatus as number | null;
        if (fs != null) map.set(s.bookingstatusid as string, fs);
      }
    }
    return map;
  }

  /**
   * Booking ids for ALL engineers (every resource) from today up to `days` ahead, ordered by
   * start time — for the optional read-only "All Jobs" tab. Note: offline this returns only what
   * the mobile offline profile holds (usually just the signed-in user's own bookings).
   */
  async getAllBookingIds(days: number): Promise<string[]> {
    const span = Math.max(1, Math.floor(days));
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + span);
    const fx =
      `<fetch><entity name="${BOOKING}">` +
      `<attribute name="bookableresourcebookingid" />` +
      `<filter type="and">` +
      `<condition attribute="starttime" operator="ge" value="${fxDate(start)}" />` +
      `<condition attribute="starttime" operator="lt" value="${fxDate(end)}" />` +
      `</filter>` +
      `<order attribute="starttime" />` +
      `</entity></fetch>`;
    const entities = await this.fetchXml(BOOKING, fx);
    return entities.map((e) => e.bookableresourcebookingid as string).filter((id) => !!id);
  }

  /**
   * Point the booking's Booking Status lookup at the given status record. When a sub-status id is
   * supplied it also sets the booking's Work Order Sub-Status (prx3_substatus) IN THE SAME UPDATE —
   * this environment's business rule requires it for terminal moves, and the offline sync-back
   * enforces it too, so both must be in one write.
   */
  async setBookingStatus(bookingId: string, statusRecordId: string, subStatusId?: string): Promise<void> {
    const body: Record<string, unknown> = {
      "BookingStatus@odata.bind": `/${BOOKINGSTATUS_SET}(${statusRecordId})`,
    };
    if (subStatusId) {
      body["prx3_Substatus@odata.bind"] = `/msdyn_workordersubstatuses(${subStatusId})`;
    }
    await this.api.updateRecord(BOOKING, bookingId, body);
  }

  /**
   * Active Work Order Sub-Status id mapped to a Work Order System Status value — for prx3_substatus
   * on the booking, which this environment requires on terminal moves. Reads the whole (small)
   * msdyn_workordersubstatus table once and matches in JS (option-set filters fail offline, and the
   * value can come back as a string), same pattern as the Booking Status resolver.
   */
  async resolveSubStatusId(woSystemStatus: number): Promise<string | undefined> {
    const all = await this.loadAllSubStatuses();
    const matches = all.filter((s) => s.sys === woSystemStatus);
    const chosen = matches.find((s) => s.active) ?? matches[0];
    return chosen?.id;
  }

  private async loadAllSubStatuses(): Promise<{ id: string; sys: number | null; active: boolean }[]> {
    if (this.allSubStatusesCache) return this.allSubStatusesCache;
    const rows = await this.readSmallTable("msdyn_workordersubstatus", [
      "msdyn_workordersubstatusid",
      "msdyn_systemstatus",
      "statecode",
    ]);
    this.allSubStatusesCache = rows.map((e) => {
      const raw = e.msdyn_systemstatus;
      return {
        id: e.msdyn_workordersubstatusid as string,
        sys: raw == null || raw === "" ? null : Number(raw),
        active: e.statecode == null || Number(e.statecode) === 0,
      };
    });
    return this.allSubStatusesCache;
  }

  /** Point the work order's Sub-Status lookup at the given Work Order Substatus record. */
  async setWorkOrderSubStatus(workOrderId: string, subStatusId: string): Promise<void> {
    await this.api.updateRecord(WORKORDER, workOrderId, {
      "msdyn_substatus@odata.bind": `/msdyn_workordersubstatuses(${subStatusId})`,
    });
  }

  /**
   * Read the custom-status configuration from the Field Service Settings record
   * (msdyn_fieldservicesetting), so the booking status / sub-status GUIDs live with the
   * environment (like the plugin's paused sub-status) instead of being baked into the
   * control config per environment. Returns undefined when not configured.
   */
  async getFieldServiceSettings(): Promise<{ customStatus?: CustomStatus; activeDays?: number; completedDays?: number; nextDays?: number }> {
    // Reuse the first good read for the control's lifetime. This is what stops the online->offline
    // switch from wiping the Active window and the "Next N Days" tab: once read (typically on the
    // first online render), the values survive every later offline dataset refresh.
    if (this.settingsCache) return this.settingsCache;

    // Read order matters offline. A FetchXML query for the settings row is REJECTED by the mobile
    // offline store after the local sync, which returned {} and blanked the windows. A plain OData
    // $select (no filter) is the most offline-store-compatible read, so try it first and keep
    // FetchXML only as an online fallback.
    const cols =
      "prx3_customstatuslabel,_prx3_custombookingstatus_value,_prx3_customworkordersubstatus_value," +
      "prx3_activebookingdays,prx3_completedbookingdays,prx3_nextbookingdays";
    let s: Entity | undefined;
    try {
      const res = await this.api.retrieveMultipleRecords("msdyn_fieldservicesetting", `?$select=${cols}&$top=1`);
      s = res.entities[0];
    } catch (e1) {
      console.warn("[BookingCardList] settings OData read failed; trying FetchXML", e1);
      try {
        const fx =
          `<fetch top="1"><entity name="msdyn_fieldservicesetting">` +
          `<attribute name="prx3_customstatuslabel" />` +
          `<attribute name="prx3_custombookingstatus" />` +
          `<attribute name="prx3_customworkordersubstatus" />` +
          `<attribute name="prx3_activebookingdays" />` +
          `<attribute name="prx3_completedbookingdays" />` +
          `<attribute name="prx3_nextbookingdays" />` +
          `</entity></fetch>`;
        s = (await this.fetchXml("msdyn_fieldservicesetting", fx))[0];
      } catch (e2) {
        console.warn("[BookingCardList] could not read Field Service Settings", e2);
      }
    }
    if (!s) return {};

    // The mobile offline store can hand back whole numbers as strings, so coerce rather than
    // type-check (a string "1" would otherwise be dropped, collapsing the window to "no limit").
    const days = (v: unknown): number | undefined => {
      const n = typeof v === "number" ? v : v == null || v === "" ? NaN : Number(v);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    };
    const activeDays = days(s.prx3_activebookingdays);
    const completedDays = days(s.prx3_completedbookingdays);
    const nextDays = days(s.prx3_nextbookingdays);

    // Custom "Start Job" status (only when a booking status is configured).
    const bookingStatusId = (s._prx3_custombookingstatus_value as string) || undefined;
    let customStatus: CustomStatus | undefined;
    if (bookingStatusId) {
      const label = (s.prx3_customstatuslabel as string) || "";
      const statusName = (s[`_prx3_custombookingstatus_value${FV}`] as string) || "";
      customStatus = {
        name: label || statusName || "Custom",
        bookingStatusId,
        workOrderSubStatusId: (s._prx3_customworkordersubstatus_value as string) || undefined,
      };
    }
    const result = { customStatus, activeDays, completedDays, nextDays };
    this.settingsCache = result;
    return result;
  }

  /**
   * Find an active Booking Status record id by its Field Service Status value. ONE path for online
   * AND offline (no isOffline() branch): read the whole (tiny) Booking Status table and match the
   * target value in JS. This is deliberately NOT a server-style filtered query — the mobile offline
   * store won't apply a filter condition on the msdyn_fieldservicestatus option-set (returns nothing)
   * and can return the value as a numeric string. Fetch-all + coerced JS match works in every mode.
   */
  async resolveStatusId(fieldServiceStatus: number): Promise<string | undefined> {
    if (this.statusIdCache.has(fieldServiceStatus)) {
      return this.statusIdCache.get(fieldServiceStatus);
    }
    const all = await this.loadAllStatuses();
    const matches = all.filter((s) => s.fs === fieldServiceStatus);
    const chosen = matches.find((s) => s.active) ?? matches[0];
    const id = chosen?.id;
    if (id) this.statusIdCache.set(fieldServiceStatus, id);
    return id;
  }

  /**
   * Seed the FS-status -> Booking Status id cache from cards already loaded on the board. That data
   * is guaranteed to be on the device (it's rendered), so a status change to any status currently
   * visible resolves with NO query at all — the most reliable path offline. The table fetch-all
   * (resolveStatusId) remains the fallback for statuses not present on screen.
   */
  seedStatusCache(vms: BookingCardVM[]): void {
    for (const v of vms) {
      if (v.fieldServiceStatus != null && v.bookingStatusId) {
        this.statusIdCache.set(v.fieldServiceStatus, v.bookingStatusId);
      }
    }
  }

  /**
   * Every Booking Status record (id + Field Service status value + active flag), read once and cached.
   * No filter is applied — the offline store can't filter on the option-set, but it returns the full
   * synced table, and we match in JS. Online it's an equally cheap full read.
   */
  private async loadAllStatuses(): Promise<{ id: string; fs: number | null; active: boolean }[]> {
    if (this.allStatusesCache) return this.allStatusesCache;
    const rows = await this.readSmallTable(BOOKINGSTATUS, [
      "bookingstatusid",
      "msdyn_fieldservicestatus",
      "statecode",
    ]);
    // The offline store can return an option-set value as a numeric STRING ("690970003"), so coerce
    // to a number — a strict === against the numeric FS value would otherwise never match (this was
    // the "No active Booking Status found" cause even after the records synced).
    this.allStatusesCache = rows.map((e) => {
      const raw = e.msdyn_fieldservicestatus;
      return {
        id: e.bookingstatusid as string,
        fs: raw == null || raw === "" ? null : Number(raw),
        active: e.statecode == null || Number(e.statecode) === 0,
      };
    });
    return this.allStatusesCache;
  }

  /**
   * Read every row of a small reference table (Booking Status, WO Sub-Status), offline-first. An
   * OData $select with NO filter is the most reliable form against the mobile offline store — a
   * FetchXML query can be rejected offline ("Specified FetchXML is invalid"), returning zero rows,
   * which caused "No active Booking Status" for any status not already on the board (e.g. Cancelled).
   * FetchXML is kept as a fallback. Returns [] only if neither works (table not in the offline profile).
   */
  private async readSmallTable(entity: string, attrs: string[]): Promise<Entity[]> {
    try {
      const res = await this.api.retrieveMultipleRecords(entity, "?$select=" + attrs.join(","));
      if (res.entities.length) return res.entities;
    } catch (e) {
      console.warn(`[BookingCardList] ${entity} OData read failed; trying FetchXML`, e);
    }
    const build = (a: string[]): string =>
      `<fetch><entity name="${entity}">` + a.map((n) => `<attribute name="${n}" />`).join("") + `</entity></fetch>`;
    return this.fetchTiered(entity, build, [attrs, attrs.slice(0, Math.max(1, attrs.length - 1))]);
  }

  /**
   * Warm the full Booking Status + WO Sub-Status caches up front (best-effort). A change to a status
   * that ISN'T on the board (e.g. Cancelled when nothing is cancelled) then resolves from cache with
   * no query at click-time — the reliable path offline.
   */
  async preloadStatuses(): Promise<void> {
    try { await this.loadAllStatuses(); } catch { /* best-effort */ }
    try { await this.loadAllSubStatuses(); } catch { /* best-effort */ }
  }

  /** Run a FetchXML query via the Web API (resolves online or against the offline store). */
  private async fetchXml(entity: string, fetchXml: string): Promise<Entity[]> {
    const res = await this.api.retrieveMultipleRecords(
      entity,
      "?fetchXml=" + encodeURIComponent(fetchXml)
    );
    return res.entities;
  }

  /**
   * Run an ENRICHMENT fetch whose attribute list may include a field that isn't in the mobile
   * offline profile. Offline-first rejects the whole query ("Specified FetchXML is invalid") when
   * ANY requested attribute (or the entity) isn't synced — which would otherwise take the entire
   * card load down. So we try each attribute set in turn (widest first) and return the first that
   * succeeds; if all fail we return [] and the card simply renders without that enrichment, rather
   * than failing to load. `build` receives an attribute list and returns the full FetchXML.
   */
  private async fetchTiered(
    entity: string,
    build: (attrs: string[]) => string,
    attrSets: string[][]
  ): Promise<Entity[]> {
    for (let i = 0; i < attrSets.length; i++) {
      try {
        return await this.fetchXml(entity, build(attrSets[i]));
      } catch (e) {
        const last = i === attrSets.length - 1;
        console.warn(
          `[BookingCardList] ${entity} query failed${last ? " on every attribute set (offline profile?)" : "; retrying with fewer fields"}`,
          e
        );
      }
    }
    return [];
  }

  private parseDate(iso: string): Date | undefined {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? undefined : d;
  }

  private formatStart(d: Date): string {
    return `${this.dateFmt.format(d)}, ${this.timeFmt.format(d)}`;
  }

  private formatDuration(mins?: number): string {
    if (mins == null || mins <= 0) return "";
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    if (h && m) return `${h} h ${m} min`;
    if (h) return `${h} h`;
    return `${m} min`;
  }

  // --- Public helpers for the offline dataset path (services/datasetMap.ts) ---
  public fmtStart(d: Date): string {
    return this.formatStart(d);
  }
  public fmtDuration(mins?: number): string {
    return this.formatDuration(mins);
  }
  public parseIso(iso: string): Date | undefined {
    return this.parseDate(iso);
  }

  /**
   * ONLINE enrichment for cards built from the offline dataset. Fills any blank Work Order fields,
   * adds the Products Needed list, custom extras / header badge, and backfills the FS status if the
   * view didn't carry it. Best-effort: offline (Web API rejected) it returns the cards unchanged, so
   * the offline card still renders from whatever the bound view provided.
   */
  public async enrichCards(
    vms: BookingCardVM[],
    extraSpecs: ExtraFieldSpec[] = [],
    headerSpec?: ExtraFieldSpec
  ): Promise<BookingCardVM[]> {
    if (vms.length === 0) return vms;
    const woIds = [...new Set(vms.map((v) => v.workOrderId).filter((x): x is string => !!x))];
    const bookingIds = vms.map((v) => v.bookingId);
    const statusIds = [...new Set(vms.map((v) => v.bookingStatusId).filter((x): x is string => !!x))];
    const bookingExtraFields = extraSpecs.filter((x) => x.table === "booking").map((x) => x.field);
    const woExtraFields = extraSpecs.filter((x) => x.table === "workorder").map((x) => x.field);
    if (headerSpec) {
      (headerSpec.table === "workorder" ? woExtraFields : bookingExtraFields).push(headerSpec.field);
    }
    try {
      const [workOrders, productsByWo, statusFs, bookingExtras, woExtras] = await Promise.all([
        this.getWorkOrders(woIds),
        this.getWorkOrderProducts(woIds),
        this.getStatusFsValues(statusIds),
        this.getExtras(BOOKING, "bookableresourcebookingid", bookingIds, [...new Set(bookingExtraFields)]),
        this.getExtras(WORKORDER, "msdyn_workorderid", woIds, [...new Set(woExtraFields)]),
      ]);
      return vms.map((v): BookingCardVM => {
        const wo = v.workOrderId ? workOrders.get(v.workOrderId) : undefined;
        const extras = extraSpecs
          .map((spec) => {
            const rec =
              spec.table === "workorder"
                ? v.workOrderId
                  ? woExtras.get(v.workOrderId)
                  : undefined
                : bookingExtras.get(v.bookingId);
            return rec?.[spec.field] ?? "";
          })
          .filter((x) => x !== "");
        const headerRec = headerSpec
          ? headerSpec.table === "workorder"
            ? v.workOrderId
              ? woExtras.get(v.workOrderId)
              : undefined
            : bookingExtras.get(v.bookingId)
          : undefined;
        const headerBadge = headerSpec ? headerRec?.[headerSpec.field] ?? "" : "";
        const fs = v.bookingStatusId ? statusFs.get(v.bookingStatusId) : undefined;
        return {
          ...v,
          workOrderNumber: wo?.name || v.workOrderNumber,
          serviceAccount: v.serviceAccount || wo?.serviceAccount || "",
          incidentType: v.incidentType || wo?.incidentType || "",
          addressText: v.addressText || wo?.addressText || "",
          latitude: v.latitude ?? wo?.lat,
          longitude: v.longitude ?? wo?.lng,
          priorityName: v.priorityName || wo?.priority || "",
          fieldServiceStatus: v.fieldServiceStatus ?? fs,
          products: productsByWo.get(v.workOrderId ?? "") ?? v.products,
          headerBadge: headerBadge || v.headerBadge,
          extras: extras.length ? extras : v.extras,
        };
      });
    } catch (e) {
      console.warn("[BookingCardList] online enrichment unavailable (offline?)", e);
      return vms;
    }
  }
}
