import { BookingCardVM, ProductLine, ExtraFieldSpec, CustomStatus, ACTIVE_FS_STATUSES } from "../types";

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
  private userId: string;
  private dateFmt: Intl.DateTimeFormat;
  private timeFmt: Intl.DateTimeFormat;
  private statusIdCache = new Map<number, string | undefined>();
  private myResourceIds?: string[];
  private activeStatusIds?: string[];

  constructor(context: ComponentFramework.Context<unknown>) {
    this.api = context.webAPI;
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
      const fx =
        `<fetch><entity name="${BOOKING}">` +
        `<attribute name="bookableresourcebookingid" />` +
        `<attribute name="starttime" />` +
        `<attribute name="endtime" />` +
        `<attribute name="msdyn_estimatedtravelduration" />` +
        `<attribute name="msdyn_workorder" />` +
        `<attribute name="bookingstatus" />` +
        `<attribute name="resource" />` +
        `<filter>${inCondition("bookableresourcebookingid", ids)}</filter>` +
        `</entity></fetch>`;
      const entities = await this.fetchXml(BOOKING, fx);
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
      const fx =
        `<fetch><entity name="${WORKORDER}">` +
        `<attribute name="msdyn_workorderid" />` +
        `<attribute name="msdyn_name" />` +
        `<attribute name="msdyn_serviceaccount" />` +
        `<attribute name="msdyn_primaryincidenttype" />` +
        `<attribute name="msdyn_priority" />` +
        `<attribute name="msdyn_address1" />` +
        `<attribute name="msdyn_city" />` +
        `<attribute name="msdyn_postalcode" />` +
        `<attribute name="msdyn_latitude" />` +
        `<attribute name="msdyn_longitude" />` +
        `<filter>${inCondition("msdyn_workorderid", ids)}</filter>` +
        `</entity></fetch>`;
      const entities = await this.fetchXml(WORKORDER, fx);
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
      const entities = await this.fetchXml(WORKORDERPRODUCT, fx);
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
      const entities = await this.fetchXml(BOOKINGSTATUS, fx);
      for (const s of entities) {
        const fs = s.msdyn_fieldservicestatus as number | null;
        if (fs != null) map.set(s.bookingstatusid as string, fs);
      }
    }
    return map;
  }

  /** Bookable resource id(s) for the signed-in user (cached). Flat query — no link-entity. */
  private async getMyResourceIds(): Promise<string[]> {
    if (this.myResourceIds) return this.myResourceIds;
    if (!this.userId) {
      this.myResourceIds = [];
      return this.myResourceIds;
    }
    try {
      const fx =
        `<fetch><entity name="bookableresource">` +
        `<attribute name="bookableresourceid" />` +
        `<filter>${inCondition("userid", [this.userId])}</filter>` +
        `</entity></fetch>`;
      const ents = await this.fetchXml("bookableresource", fx);
      this.myResourceIds = ents.map((e) => e.bookableresourceid as string).filter((id) => !!id);
    } catch (e) {
      console.warn("[BookingCardList] could not resolve the signed-in user's bookable resource", e);
      this.myResourceIds = [];
    }
    return this.myResourceIds;
  }

  /** Booking Status record ids whose Field Service Status is active (Traveling/In Progress). */
  private async getActiveStatusIds(): Promise<string[]> {
    if (this.activeStatusIds) return this.activeStatusIds;
    try {
      const vals = [...ACTIVE_FS_STATUSES].map((v) => `<value>${v}</value>`).join("");
      const fx =
        `<fetch><entity name="${BOOKINGSTATUS}">` +
        `<attribute name="bookingstatusid" />` +
        `<filter><condition attribute="msdyn_fieldservicestatus" operator="in">${vals}</condition></filter>` +
        `</entity></fetch>`;
      const ents = await this.fetchXml(BOOKINGSTATUS, fx);
      this.activeStatusIds = ents.map((e) => e.bookingstatusid as string).filter((id) => !!id);
    } catch (e) {
      console.warn("[BookingCardList] could not resolve active booking statuses", e);
      this.activeStatusIds = [];
    }
    return this.activeStatusIds;
  }

  /**
   * Booking ids for the signed-in user across the Today / Tomorrow / Complete window — built in
   * code, so no system views are needed. The caller buckets them with bucketOf(). The window
   * spans from `completeWindowDays` before today (recent finished jobs) to the end of tomorrow.
   *
   * All FetchXML is FLAT (no link-entity joins): the new mobile **offline-first** engine rejects
   * inner/outer joins ("Specified FetchXML is invalid"). So the user's resource id(s) and the
   * active-status id(s) are resolved with their own flat queries, then bookings are filtered by
   * `resource in (...)` and `bookingstatus in (...)`. Works offline-first, classic offline & online.
   */
  async getMyBookingIds(completeWindowDays: number): Promise<string[]> {
    const resourceIds = await this.getMyResourceIds();
    if (!resourceIds.length) return [];

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const windowStart = new Date(
      startOfToday.getFullYear(), startOfToday.getMonth(),
      startOfToday.getDate() - Math.max(0, completeWindowDays)
    );
    const endOfTomorrow = new Date(
      startOfToday.getFullYear(), startOfToday.getMonth(), startOfToday.getDate() + 2
    );
    const resCond = inCondition("resource", resourceIds);

    // 1) The Today / Tomorrow / Complete window for this user's resource(s).
    const windowFx =
      `<fetch><entity name="${BOOKING}">` +
      `<attribute name="bookableresourcebookingid" />` +
      `<filter type="and">${resCond}` +
      `<condition attribute="starttime" operator="ge" value="${fxDate(windowStart)}" />` +
      `<condition attribute="starttime" operator="lt" value="${fxDate(endOfTomorrow)}" />` +
      `</filter>` +
      `<order attribute="starttime" />` +
      `</entity></fetch>`;

    const tasks: Promise<Entity[]>[] = [this.fetchXml(BOOKING, windowFx)];

    // 2) Any ACTIVE (Traveling / In Progress) booking regardless of date, so a forgotten open job
    //    always shows in the Active tab and locks the board — matching the server-side
    //    one-running-booking rule. Best-effort: skip if statuses/profile don't resolve.
    const activeStatusIds = await this.getActiveStatusIds();
    if (activeStatusIds.length) {
      const activeFx =
        `<fetch><entity name="${BOOKING}">` +
        `<attribute name="bookableresourcebookingid" />` +
        `<filter type="and">${resCond}${inCondition("bookingstatus", activeStatusIds)}</filter>` +
        `</entity></fetch>`;
      tasks.push(
        this.fetchXml(BOOKING, activeFx).catch((e) => {
          console.warn("[BookingCardList] active-booking query failed; using the date window only", e);
          return [] as Entity[];
        })
      );
    }

    const results = await Promise.all(tasks);
    const ids = new Set<string>();
    for (const ents of results) {
      for (const e of ents) {
        const id = e.bookableresourcebookingid as string;
        if (id) ids.add(id);
      }
    }
    return [...ids];
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

  /** Point the booking's Booking Status lookup at the given status record. */
  async setBookingStatus(bookingId: string, statusRecordId: string): Promise<void> {
    await this.api.updateRecord(BOOKING, bookingId, {
      "BookingStatus@odata.bind": `/${BOOKINGSTATUS_SET}(${statusRecordId})`,
    });
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
  async getCustomStatusSettings(): Promise<CustomStatus | undefined> {
    try {
      const fx =
        `<fetch top="1"><entity name="msdyn_fieldservicesetting">` +
        `<attribute name="prx3_customstatuslabel" />` +
        `<attribute name="prx3_custombookingstatus" />` +
        `<attribute name="prx3_customworkordersubstatus" />` +
        `</entity></fetch>`;
      const entities = await this.fetchXml("msdyn_fieldservicesetting", fx);
      if (!entities.length) return undefined;
      const s = entities[0];
      const bookingStatusId = (s._prx3_custombookingstatus_value as string) || undefined;
      if (!bookingStatusId) return undefined; // feature not configured in this environment
      const label = (s.prx3_customstatuslabel as string) || "";
      const statusName = (s[`_prx3_custombookingstatus_value${FV}`] as string) || "";
      return {
        name: label || statusName || "Custom",
        bookingStatusId,
        workOrderSubStatusId: (s._prx3_customworkordersubstatus_value as string) || undefined,
      };
    } catch (e) {
      console.warn("[BookingCardList] could not read custom status from Field Service Settings", e);
      return undefined;
    }
  }

  /** Find an active Booking Status record id by its Field Service Status value. */
  async resolveStatusId(fieldServiceStatus: number): Promise<string | undefined> {
    if (this.statusIdCache.has(fieldServiceStatus)) {
      return this.statusIdCache.get(fieldServiceStatus);
    }
    const fx =
      `<fetch top="1"><entity name="${BOOKINGSTATUS}">` +
      `<attribute name="bookingstatusid" />` +
      `<filter type="and">` +
      `<condition attribute="msdyn_fieldservicestatus" operator="eq" value="${fieldServiceStatus}" />` +
      `<condition attribute="statecode" operator="eq" value="0" />` +
      `</filter></entity></fetch>`;
    const entities = await this.fetchXml(BOOKINGSTATUS, fx);
    const id = entities.length ? (entities[0].bookingstatusid as string) : undefined;
    this.statusIdCache.set(fieldServiceStatus, id);
    return id;
  }

  /** Run a FetchXML query via the Web API (resolves online or against the offline store). */
  private async fetchXml(entity: string, fetchXml: string): Promise<Entity[]> {
    const res = await this.api.retrieveMultipleRecords(
      entity,
      "?fetchXml=" + encodeURIComponent(fetchXml)
    );
    return res.entities;
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
}
