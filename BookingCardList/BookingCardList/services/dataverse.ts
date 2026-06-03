import { IInputs } from "../generated/ManifestTypes";
import { BookingCardVM, WorkOrderProductVM } from "../types";

const FV = "@OData.Community.Display.V1.FormattedValue";

// Entity logical / set names (verified against the Dataverse schema)
const BOOKING = "bookableresourcebooking";
const WORKORDER = "msdyn_workorder";
const WORKORDERPRODUCT = "msdyn_workorderproduct";
const BOOKINGSTATUS = "bookingstatus";
const BOOKINGSTATUS_SET = "bookingstatuses";

// Keep OData $filter "or" chains a sensible length.
const FILTER_CHUNK = 20;

function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

interface BookingRow {
    bookingId: string;
    workOrderId?: string;
    statusId?: string;
    statusName: string;
    startIso?: string;
    travelMinutes?: number;
}

interface WorkOrderInfo {
    name: string;
    serviceAccount: string;
    incidentType: string;
    addressText: string;
    lat?: number;
    lng?: number;
}

/**
 * All Dataverse access for the control. Uses context.webAPI, which also resolves
 * against the Field Service mobile offline store when the app is offline (provided
 * the tables are in the offline profile). Uses flat retrieveMultiple calls (no $expand)
 * for reliability.
 */
export class BookingDataService {
    private readonly api: ComponentFramework.WebApi;
    private readonly dateFmt: Intl.DateTimeFormat;
    private readonly timeFmt: Intl.DateTimeFormat;
    private readonly statusIdCache = new Map<number, string | undefined>();
    private readonly viewFetchCache = new Map<string, string | null>();

    constructor(context: ComponentFramework.Context<IInputs>) {
        this.api = context.webAPI;
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
    public async getBookingDetails(bookingIds: string[]): Promise<BookingCardVM[]> {
        if (bookingIds.length === 0) return [];

        const rows = new Map<string, BookingRow>();
        const workOrderIds = new Set<string>();
        const statusIds = new Set<string>();

        for (const ids of chunk(bookingIds, FILTER_CHUNK)) {
            const filter = ids.map((id) => `bookableresourcebookingid eq ${id}`).join(" or ");
            const options =
                "?$select=bookableresourcebookingid,starttime,endtime," +
                "msdyn_estimatedtravelduration,_msdyn_workorder_value,_bookingstatus_value" +
                `&$filter=${filter}`;
            const res = await this.api.retrieveMultipleRecords(BOOKING, options);
            for (const e of res.entities) {
                const workOrderId = (e._msdyn_workorder_value as string) || undefined;
                const statusId = (e._bookingstatus_value as string) || undefined;
                if (workOrderId) workOrderIds.add(workOrderId);
                if (statusId) statusIds.add(statusId);
                rows.set(e.bookableresourcebookingid as string, {
                    bookingId: e.bookableresourcebookingid as string,
                    workOrderId,
                    statusId,
                    statusName: (e[`_bookingstatus_value${FV}`] as string) || "",
                    startIso: (e.starttime as string | null) ?? undefined,
                    travelMinutes: (e.msdyn_estimatedtravelduration as number | null) ?? undefined,
                });
            }
        }

        const [workOrders, productsByWo, statusFs] = await Promise.all([
            this.getWorkOrders([...workOrderIds]),
            this.getWorkOrderProducts([...workOrderIds]),
            this.getStatusFsValues([...statusIds]),
        ]);

        return bookingIds
            .map((id): BookingCardVM | undefined => {
                const b = rows.get(id);
                if (!b) return undefined;
                const wo = b.workOrderId ? workOrders.get(b.workOrderId) : undefined;
                const startDate = b.startIso ? this.parseDate(b.startIso) : undefined;
                return {
                    bookingId: id,
                    workOrderId: b.workOrderId,
                    workOrderNumber: wo?.name ?? "(no work order)",
                    serviceAccount: wo?.serviceAccount ?? "",
                    incidentType: wo?.incidentType ?? "",
                    addressText: wo?.addressText ?? "",
                    latitude: wo?.lat,
                    longitude: wo?.lng,
                    startDate,
                    startText: startDate ? this.formatStart(startDate) : "",
                    travelText: this.formatDuration(b.travelMinutes),
                    bookingStatusName: b.statusName,
                    fieldServiceStatus: b.statusId ? statusFs.get(b.statusId) : undefined,
                    products: b.workOrderId ? productsByWo.get(b.workOrderId) ?? [] : [],
                };
            })
            .filter((v): v is BookingCardVM => !!v);
    }

    private async getWorkOrders(workOrderIds: string[]): Promise<Map<string, WorkOrderInfo>> {
        const map = new Map<string, WorkOrderInfo>();
        if (workOrderIds.length === 0) return map;

        for (const ids of chunk(workOrderIds, FILTER_CHUNK)) {
            const filter = ids.map((id) => `msdyn_workorderid eq ${id}`).join(" or ");
            const options =
                "?$select=msdyn_workorderid,msdyn_name,_msdyn_serviceaccount_value," +
                "_msdyn_primaryincidenttype_value,msdyn_address1,msdyn_city,msdyn_postalcode," +
                "msdyn_latitude,msdyn_longitude" +
                `&$filter=${filter}`;
            const res = await this.api.retrieveMultipleRecords(WORKORDER, options);
            for (const w of res.entities) {
                const lat = w.msdyn_latitude as number | undefined;
                const lng = w.msdyn_longitude as number | undefined;
                const addressText = [w.msdyn_address1, w.msdyn_city, w.msdyn_postalcode]
                    .filter((p) => !!p)
                    .join(", ");
                map.set(w.msdyn_workorderid as string, {
                    name: (w.msdyn_name as string) || "",
                    serviceAccount: (w[`_msdyn_serviceaccount_value${FV}`] as string) || "",
                    incidentType: (w[`_msdyn_primaryincidenttype_value${FV}`] as string) || "",
                    addressText,
                    lat: typeof lat === "number" ? lat : undefined,
                    lng: typeof lng === "number" ? lng : undefined,
                });
            }
        }
        return map;
    }

    private async getWorkOrderProducts(
        workOrderIds: string[]
    ): Promise<Map<string, WorkOrderProductVM[]>> {
        const map = new Map<string, WorkOrderProductVM[]>();
        if (workOrderIds.length === 0) return map;

        for (const ids of chunk(workOrderIds, FILTER_CHUNK)) {
            const woFilter = ids.map((id) => `_msdyn_workorder_value eq ${id}`).join(" or ");
            const options =
                "?$select=msdyn_workorderproductid,msdyn_name,msdyn_estimatequantity," +
                "msdyn_quantity,_msdyn_workorder_value" +
                `&$filter=(${woFilter}) and statecode eq 0`;
            const res = await this.api.retrieveMultipleRecords(WORKORDERPRODUCT, options);
            for (const e of res.entities) {
                const woId = e._msdyn_workorder_value as string;
                if (!woId) continue;
                const qty =
                    (e.msdyn_estimatequantity as number | null) ??
                    (e.msdyn_quantity as number | null) ??
                    null;
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

        for (const ids of chunk(statusIds, FILTER_CHUNK)) {
            const filter = ids.map((id) => `bookingstatusid eq ${id}`).join(" or ");
            const options = `?$select=bookingstatusid,msdyn_fieldservicestatus&$filter=${filter}`;
            const res = await this.api.retrieveMultipleRecords(BOOKINGSTATUS, options);
            for (const s of res.entities) {
                const fs = s.msdyn_fieldservicestatus as number | null;
                if (fs != null) map.set(s.bookingstatusid as string, fs);
            }
        }
        return map;
    }

    /**
     * Read the current value of one or more environment variables by schema name.
     * Returns a map keyed by lowercased schema name. Current value = the set value,
     * else the definition's default value.
     */
    public async getEnvVars(schemaNames: string[]): Promise<Map<string, string>> {
        const map = new Map<string, string>();
        if (schemaNames.length === 0) return map;
        const filter = schemaNames.map((n) => `schemaname eq '${n}'`).join(" or ");
        const res = await this.api.retrieveMultipleRecords(
            "environmentvariabledefinition",
            "?$select=schemaname,defaultvalue" +
                "&$expand=environmentvariabledefinition_environmentvariablevalue($select=value)" +
                `&$filter=${filter}`
        );
        for (const d of res.entities) {
            const schema = d.schemaname as string | undefined;
            if (!schema) continue;
            const values = d.environmentvariabledefinition_environmentvariablevalue as
                | { value?: string }[]
                | undefined;
            const current =
                (values?.length ? values[0].value : undefined) ??
                (d.defaultvalue as string | undefined);
            if (current != null) map.set(schema.toLowerCase(), current);
        }
        return map;
    }

    /**
     * Run a Bookable Resource Booking system view (by its name) and return the matching
     * booking ids. Reads the view's FetchXML then executes it (FetchXML is supported by
     * the PCF Web API both online and offline).
     */
    public async getViewBookingIdsByName(viewName: string): Promise<string[]> {
        let fetchxml = this.viewFetchCache.get(viewName);
        if (fetchxml === undefined) {
            const escaped = viewName.replace(/'/g, "''");
            const meta = await this.api.retrieveMultipleRecords(
                "savedquery",
                "?$select=fetchxml" +
                    `&$filter=returnedtypecode eq 'bookableresourcebooking' and querytype eq 0 and name eq '${escaped}'` +
                    "&$top=1"
            );
            fetchxml = meta.entities.length ? (meta.entities[0].fetchxml as string | null) : null;
            this.viewFetchCache.set(viewName, fetchxml);
        }
        if (!fetchxml) return [];
        const res = await this.api.retrieveMultipleRecords(
            BOOKING,
            "?fetchXml=" + encodeURIComponent(fetchxml)
        );
        return res.entities
            .map((e) => e.bookableresourcebookingid as string)
            .filter((id): id is string => !!id);
    }

    /** Point the booking's Booking Status lookup at the given status record. */
    public async setBookingStatus(bookingId: string, statusRecordId: string): Promise<void> {
        await this.api.updateRecord(BOOKING, bookingId, {
            "BookingStatus@odata.bind": `/${BOOKINGSTATUS_SET}(${statusRecordId})`,
        });
    }

    /** Point the work order's Sub-Status lookup at the given Work Order Substatus record. */
    public async setWorkOrderSubStatus(workOrderId: string, subStatusId: string): Promise<void> {
        await this.api.updateRecord(WORKORDER, workOrderId, {
            "msdyn_substatus@odata.bind": `/msdyn_workordersubstatuses(${subStatusId})`,
        });
    }

    /** Find an active Booking Status record id by its Field Service Status value. */
    public async resolveStatusId(fieldServiceStatus: number): Promise<string | undefined> {
        if (this.statusIdCache.has(fieldServiceStatus)) {
            return this.statusIdCache.get(fieldServiceStatus);
        }
        const options =
            "?$select=bookingstatusid" +
            `&$filter=msdyn_fieldservicestatus eq ${fieldServiceStatus} and statecode eq 0` +
            "&$top=1";
        const res = await this.api.retrieveMultipleRecords(BOOKINGSTATUS, options);
        const id = res.entities.length ? (res.entities[0].bookingstatusid as string) : undefined;
        this.statusIdCache.set(fieldServiceStatus, id);
        return id;
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
