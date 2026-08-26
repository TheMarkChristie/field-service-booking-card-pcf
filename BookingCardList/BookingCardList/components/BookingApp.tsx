import * as React from "react";
import { Theme } from "@fluentui/react-components";
import { BookingList } from "./BookingList";
import {
  BookingCardVM, CustomStatus, MapsProvider, StatusChoice, ExtraFieldSpec,
  ACTIVE_FS_STATUSES, TERMINAL_FS_STATUSES, STATUS_ACTIONS, TERMINAL_WO_SYSTEMSTATUS, bucketOf, BuiltinBucket,
} from "../types";
import { BookingDataService } from "../services/dataverse";
import { buildMapsUrl, errMsg } from "../util/maps";

type T = (key: string, fallback: string) => string;

// One tab: a named booking bucket, the "Next N Days" list, or the read-only All Jobs list.
type TabDef =
  | { kind: "bucket"; bucket: BuiltinBucket; label: string }
  | { kind: "next"; label: string }
  | { kind: "alljobs"; label: string };

export interface BookingAppProps {
  service: BookingDataService;
  /** Cards built from the bound dataset (offline-native). The primary data source. */
  datasetBookings: BookingCardVM[];
  theme?: Theme;
  defaultTabNames: string[];
  mapsProvider: MapsProvider;
  /** Show a final read-only tab of all engineers' bookings for the next N days. */
  allJobsEnabled: boolean;
  allJobsName: string;
  allJobsDays: number;
  extraFields: ExtraFieldSpec[];
  extrasTitle: string;
  /** Optional Work Order / booking field shown as a badge in the card header. */
  headerField?: ExtraFieldSpec;
  priorityColours: Record<string, string>;
  /** When set (manifest Configuration Source = "This control"), the day windows + custom status come
   *  from the control's own properties instead of the Field Service Settings record — self-contained
   *  and offline-safe (no Dataverse read). Undefined = read from Field Service Settings (default). */
  controlConfig?: {
    activeDays?: number;
    completedDays?: number;
    nextDays?: number;
    customStatus?: CustomStatus;
  };
  openItem: (id: string) => void;
  openUrl: (url: string) => void;
  /** Re-query the bound dataset after a write so the board reflects the change (not stale rows). */
  refreshDataset: () => void;
  t: T;
}

export const BookingApp: React.FC<BookingAppProps> = (props) => {
  const {
    service, datasetBookings, theme, defaultTabNames, mapsProvider,
    allJobsEnabled, allJobsName, allJobsDays,
    extraFields, extrasTitle, headerField, priorityColours, controlConfig, openItem, openUrl, refreshDataset, t,
  } = props;

  // Stabilise the custom-field list (index.ts rebuilds it each render) so detail loads
  // depend on its contents, not its identity, and don't refetch on every render.
  const extraKey = extraFields.map((f) => `${f.table}.${f.field}`).join("|");
  const extraSpecs = React.useMemo(() => extraFields, [extraKey]);
  const headerKey = headerField ? `${headerField.table}.${headerField.field}` : "";
  const headerSpec = React.useMemo(() => headerField, [headerKey]);

  const [details, setDetails] = React.useState<Record<string, BookingCardVM>>({});
  const detailsRef = React.useRef(details);
  detailsRef.current = details;

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const [statusBusy, setStatusBusy] = React.useState<Record<string, boolean>>({});
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [bookingIds, setBookingIds] = React.useState<string[]>([]);

  // All Jobs tab (optional, read-only): all engineers' bookings for the next N days. Kept in a
  // separate map so other engineers' active jobs never affect this user's focus lock.
  const [allJobsIds, setAllJobsIds] = React.useState<string[]>([]);
  const [allJobsDetails, setAllJobsDetails] = React.useState<Record<string, BookingCardVM>>({});
  const [allJobsLoading, setAllJobsLoading] = React.useState(false);
  const allJobsDetailsRef = React.useRef(allJobsDetails);
  allJobsDetailsRef.current = allJobsDetails;

  // Custom status + active-booking window both come from the Field Service Settings record, so they
  // live with the environment and match the EnsureSingleRunningBooking plugin's window.
  const [effectiveCustomStatus, setEffectiveCustomStatus] = React.useState<CustomStatus | undefined>(undefined);
  const [settingsActiveDays, setSettingsActiveDays] = React.useState<number | undefined>(undefined);
  const [settingsCompletedDays, setSettingsCompletedDays] = React.useState<number | undefined>(undefined);
  const [settingsNextDays, setSettingsNextDays] = React.useState<number | undefined>(undefined);
  React.useEffect(() => {
    // Manifest-configured ("This control"): take the windows + custom status straight from the
    // control's own properties — no Field Service Settings read, so it is fully offline-safe. The
    // default source still reads the msdyn_fieldservicesetting record as before.
    if (controlConfig) {
      setEffectiveCustomStatus(controlConfig.customStatus);
      setSettingsActiveDays(controlConfig.activeDays);
      setSettingsCompletedDays(controlConfig.completedDays);
      setSettingsNextDays(controlConfig.nextDays);
      return;
    }
    let cancelled = false;
    void (async () => {
      const s = await service.getFieldServiceSettings();
      if (cancelled) return;
      setEffectiveCustomStatus(s.customStatus);
      setSettingsActiveDays(s.activeDays);
      setSettingsCompletedDays(s.completedDays);
      setSettingsNextDays(s.nextDays);
    })();
    return () => {
      cancelled = true;
    };
    // Depend on the stable primitive config values, not the controlConfig object identity (rebuilt
    // each render in index.ts) — otherwise the effect would re-run every render.
  }, [
    service,
    controlConfig?.activeDays,
    controlConfig?.completedDays,
    controlConfig?.nextDays,
    controlConfig?.customStatus?.bookingStatusId,
    controlConfig?.customStatus?.workOrderSubStatusId,
    controlConfig?.customStatus?.name,
  ]);

  // Active jobs that started before this floor are ignored: not shown in Active and they don't block
  // opening new jobs (a forgotten open job can't lock the board forever). No setting = epoch (no
  // limit, every active job counts) — matching the plugin's "blank/0 = no limit".
  const activeFloor = React.useMemo(() => {
    if (settingsActiveDays == null) return new Date(0);
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate() - Math.max(0, settingsActiveDays));
  }, [settingsActiveDays]);

  // Completed jobs older than this drop off the Complete tab. From Field Service Settings
  // (prx3_completedbookingdays); blank/unset (incl. offline, where settings can't be read) = no
  // limit — the Complete tab then shows whatever finished jobs the bound view / offline store holds.
  const completeFloor = React.useMemo(() => {
    if (settingsCompletedDays == null) return new Date(0);
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate() - Math.max(0, settingsCompletedDays));
  }, [settingsCompletedDays]);

  // Optional "Next N Days" tab: shown ONLY when prx3_nextbookingdays (Field Service Settings) is set
  // (>0). Blank/unset — including offline, where settings can't be read — hides the tab entirely.
  const nextEnabled = settingsNextDays != null && settingsNextDays > 0;

  // Tab order: Active, Today, Tomorrow, then the optional "Next N Days" tab, then Complete, then the
  // optional All Jobs tab (all engineers) last. Each tab is a named booking bucket, the Next-days
  // list, or the All Jobs list.
  const tabDefs = React.useMemo<TabDef[]>(() => {
    const names = [0, 1, 2, 3].map((i) => defaultTabNames[i] || `Tab ${i + 1}`);
    const defs: TabDef[] = [
      { kind: "bucket", bucket: "active", label: names[0] },
      { kind: "bucket", bucket: "today", label: names[1] },
      { kind: "bucket", bucket: "tomorrow", label: names[2] },
    ];
    if (nextEnabled) defs.push({ kind: "next", label: `Next ${settingsNextDays} Days` });
    defs.push({ kind: "bucket", bucket: "complete", label: names[3] });
    if (allJobsEnabled) defs.push({ kind: "alljobs", label: allJobsName });
    return defs;
  }, [defaultTabNames, nextEnabled, settingsNextDays, allJobsEnabled, allJobsName]);

  // Booking cards come from the BOUND DATASET (the configured view), which the Field Service mobile
  // app serves offline from its local store — the same source the native views use. This replaces
  // the old Web API self-query, which the offline-first engine rejects (it can't resolve the
  // signed-in Bookable Resource offline). Show the dataset cards immediately, then enrich online
  // (products, custom fields, and any Work Order fields the view didn't carry).
  // Key on the id AND the booking-status/start so that when the bound dataset is refreshed after a
  // write, a genuine status/reschedule change re-runs the effect and re-applies the fresh rows —
  // while an unchanged re-render (same content) does not.
  const datasetKey = datasetBookings
    .map((v) => `${v.bookingId}:${v.bookingStatusId ?? ""}:${v.startDate?.getTime() ?? ""}`)
    .join("|");
  React.useEffect(() => {
    let cancelled = false;
    setError(undefined);
    // Base cards from the dataset — render straight away (works offline).
    const base: Record<string, BookingCardVM> = {};
    for (const v of datasetBookings) base[v.bookingId] = v;
    setBookingIds(datasetBookings.map((v) => v.bookingId));
    setDetails(base);
    setLoading(false);
    // Seed the status cache from on-screen cards so a status change resolves offline with no query.
    service.seedStatusCache(datasetBookings);
    // Warm the full Booking Status / Sub-Status maps too, so a change to a status NOT on the board
    // (e.g. Cancelled when nothing is cancelled) still resolves offline without a click-time query.
    void service.preloadStatuses();
    // Online enrichment overlay — best-effort; offline it returns the cards unchanged.
    void (async () => {
      try {
        const enriched = await service.enrichCards(datasetBookings, extraSpecs, headerSpec);
        if (cancelled) return;
        service.seedStatusCache(enriched);
        const next: Record<string, BookingCardVM> = {};
        for (const v of enriched) next[v.bookingId] = v;
        setDetails(next);
      } catch (e) {
        console.warn("[BookingCardList] enrichment skipped", errMsg(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [datasetKey, service, extraSpecs, headerSpec]);

  // Load the All Jobs tab (all engineers, next N days) when enabled. Independent of the self-query
  // and the focus lock.
  React.useEffect(() => {
    if (!allJobsEnabled) {
      setAllJobsIds([]);
      setAllJobsDetails({});
      return;
    }
    let cancelled = false;
    setAllJobsLoading(true);
    void (async () => {
      try {
        const ids = await service.getAllBookingIds(allJobsDays);
        if (cancelled) return;
        setAllJobsIds(ids);
        const vms = await service.getBookingDetails(ids, extraSpecs, headerSpec);
        if (cancelled) return;
        const map: Record<string, BookingCardVM> = {};
        for (const vm of vms) map[vm.bookingId] = vm;
        setAllJobsDetails(map);
      } catch (e) {
        if (cancelled) return;
        console.error("[BookingCardList] Failed to load all-engineer bookings", e);
      } finally {
        if (!cancelled) setAllJobsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allJobsEnabled, allJobsDays, service, extraSpecs, headerSpec]);

  // Bucket the loaded bookings into Active / Today / Tomorrow / Complete (keyed by bucket name so
  // the tab ORDER can differ from the bucket order — e.g. Next N Days sits between Tomorrow/Complete).
  const idsByBucket = React.useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const m: Record<BuiltinBucket, string[]> = { active: [], today: [], tomorrow: [], complete: [] };
    for (const id of bookingIds) {
      const vm = details[id];
      if (!vm) continue;
      const bucket = bucketOf(vm, today, tomorrow, activeFloor, completeFloor);
      if (bucket) m[bucket].push(id);
    }
    return m;
  }, [bookingIds, details, activeFloor, completeFloor]);

  // "Next N Days" tab: this engineer's own bookings from today through today + N days
  // (prx3_nextbookingdays) — a forward-looking overview spanning Today/Tomorrow and beyond.
  const nextDaysIds = React.useMemo(() => {
    if (!nextEnabled || settingsNextDays == null) return [];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + settingsNextDays + 1);
    return bookingIds
      .filter((id) => {
        const d = details[id]?.startDate;
        return !!d && d >= today && d < end;
      })
      .sort((a, b) => (details[a]?.startDate?.getTime() ?? 0) - (details[b]?.startDate?.getTime() ?? 0));
  }, [bookingIds, details, nextEnabled, settingsNextDays]);

  // Ids for a given tab def: its booking bucket, the Next-days list, or the All Jobs list.
  const idsForTab = React.useCallback(
    (def: TabDef): string[] =>
      def.kind === "alljobs" ? allJobsIds : def.kind === "next" ? nextDaysIds : idsByBucket[def.bucket],
    [allJobsIds, nextDaysIds, idsByBucket]
  );

  // On first load, land on the Active tab if a job is already started, otherwise Today.
  const tabInitialised = React.useRef(false);
  React.useEffect(() => {
    if (tabInitialised.current || loading || Object.keys(details).length === 0) return;
    tabInitialised.current = true;
    setActiveIndex((idsByBucket.active?.length ?? 0) > 0 ? 0 : 1);
  }, [loading, details, idsByBucket]);

  const tabs = tabDefs.map((def, i) => ({ key: String(i), label: def.label, count: idsForTab(def).length }));

  // The All Jobs tab is a separate, read-only data source (all engineers). The "Next N Days" tab and
  // the built-in tabs are all the signed-in user's own bookings, subject to the focus lock.
  const activeDef = tabDefs[activeIndex];
  const isAllJobsTab = activeDef?.kind === "alljobs";
  const activeDetails = isAllJobsTab ? allJobsDetails : details;
  const visibleIds = (activeDef ? idsForTab(activeDef) : []).filter((id) => activeDetails[id]);

  // Focus lock. While any booking is active (Traveling / In Progress), the technician must
  // finish it before opening OR updating any other job — including tomorrow's. Completed /
  // cancelled bookings are terminal: their status can never change again, but they can still
  // be opened to view the record.
  const allIds = Object.keys(details);
  // Active only counts if it started within the active window (activeDays) — a stale active job is
  // ignored, so it neither blocks nor shows (matches the Active tab bucketing).
  const isActive = (id: string) => {
    const vm = details[id];
    return (
      ACTIVE_FS_STATUSES.has(vm.fieldServiceStatus ?? -1) && !!vm.startDate && vm.startDate >= activeFloor
    );
  };
  const isTerminal = (id: string) => TERMINAL_FS_STATUSES.has(details[id].fieldServiceStatus ?? -1);
  const anyActive = allIds.some(isActive);

  // Status changes are blocked on terminal jobs ("complete"), and on every other job while one
  // is active ("otherOpen"). Terminal wins. (The active job itself stays editable.)
  const statusLockReasons: Record<string, "complete" | "otherOpen"> = {};
  for (const id of allIds) {
    if (isTerminal(id)) statusLockReasons[id] = "complete";
    else if (anyActive && !isActive(id)) statusLockReasons[id] = "otherOpen";
  }
  // Opening the record is blocked on every non-active, non-terminal job — including before any
  // job has been started, so the day begins fully locked. Starting a job (Traveling / In Progress)
  // unlocks that one; the active job and any completed/cancelled job remain openable. (The status
  // dropdown stays usable when no job is active, so a job can be started from its locked card.)
  const openLockedIds = new Set(allIds.filter((id) => !isActive(id) && !isTerminal(id)));
  const openLockHint = anyActive
    ? t("OpenLocked", "Finish the active job before opening another.")
    : t("OpenLockedStart", "Set this job to Traveling or In Progress to open it.");
  // While a status change is committing on any card, freeze the rest so a second job can't be
  // started in the window before the started job is reflected as active (double-start race).
  const boardBusy = Object.values(statusBusy).some(Boolean);

  // The "Working offline" banner/icon reflect real DEVICE connectivity — NOT service.isOffline(),
  // which reports the offline-first app mode (true even with a live connection) and made the banner
  // fire while the technician was online. Re-render when connectivity actually changes.
  const [offline, setOffline] = React.useState<boolean>(() => service.isDeviceOffline());
  React.useEffect(() => {
    const update = () => setOffline(service.isDeviceOffline());
    update();
    if (typeof window === "undefined") return undefined;
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [service]);

  const onOpen = React.useCallback((id: string) => openItem(id), [openItem]);

  const onOpenMaps = React.useCallback(
    (id: string) => {
      const vm = detailsRef.current[id] ?? allJobsDetailsRef.current[id];
      if (vm) openUrl(buildMapsUrl(vm, mapsProvider));
    },
    [mapsProvider, openUrl]
  );

  // "This control" config mode (the community build): the booking Work Order Sub-Status
  // (prx3_substatus) is a P3-only custom field enforced by a business rule, so it is never resolved
  // or written in this mode — a terminal move just sets the booking status. Keeps the control free of
  // any prx3_ schema. (The custom-status sub-status writes the WORK ORDER's native msdyn_substatus,
  // so that path needs no gating.)
  const usingControlConfig = !!controlConfig;

  const doChangeStatus = React.useCallback(
    async (id: string, action: StatusChoice) => {
      setStatusBusy((s) => ({ ...s, [id]: true }));
      // Offline, a webAPI write IS queued to the local store, but the platform still reports
      // "couldn't connect to the server" because it can't confirm with the server. Treat that as a
      // successful offline queue (it syncs when connectivity returns); only a genuine ONLINE failure
      // (e.g. the one-running-booking rule) should surface as an error.
      const commitWrite = async (fn: () => Promise<void>): Promise<void> => {
        try {
          await fn();
        } catch (writeErr) {
          if (service.isDeviceOffline() || service.isOffline()) {
            console.warn("[BookingCardList] status write queued offline (server unreachable)", errMsg(writeErr));
            return;
          }
          throw writeErr;
        }
      };
      try {
        if (action === "custom") {
          if (!effectiveCustomStatus) return;
          if (effectiveCustomStatus.bookingStatusId) {
            await commitWrite(() => service.setBookingStatus(id, effectiveCustomStatus.bookingStatusId!));
          }
          const woId = detailsRef.current[id]?.workOrderId;
          if (effectiveCustomStatus.workOrderSubStatusId && woId) {
            await commitWrite(() => service.setWorkOrderSubStatus(woId, effectiveCustomStatus.workOrderSubStatusId!));
          }
        } else {
          const meta = STATUS_ACTIONS.find((a) => a.key === action);
          if (!meta) return;
          const statusId = await service.resolveStatusId(meta.fieldServiceStatus);
          if (!statusId) {
            throw new Error(
              t("NoStatusFound", "No active Booking Status is set up for this action. Ask your administrator to add it in Field Service ▸ Settings ▸ Booking Statuses.")
            );
          }
          // Moving to a terminal status requires a Work Order Sub-Status on the booking
          // (prx3_substatus) in this environment — resolve and set it in the same write. If none is
          // configured, tell the user WHERE to fix it rather than letting the raw server error show.
          const woSys = usingControlConfig ? undefined : TERMINAL_WO_SYSTEMSTATUS[meta.fieldServiceStatus];
          let subStatusId: string | undefined;
          if (woSys != null) {
            subStatusId = await service.resolveSubStatusId(woSys);
            if (!subStatusId) {
              throw new Error(
                t("NoSubStatusFound", "No Work Order Sub-Status is set up for this outcome. Ask your administrator to add one in Field Service ▸ Settings.")
              );
            }
          }
          await commitWrite(() => service.setBookingStatus(id, statusId, subStatusId));
        }

        // Optimistic on-screen update of the changed card — this PERSISTS (drives the focus lock
        // immediately), then we ask the PLATFORM to re-query the bound dataset so the authoritative
        // rows and tab bucketing catch up. This replaces the old internal reloadToken, which
        // re-rendered the STALE dataset (PCF doesn't auto-refresh a bound dataset after a write) and
        // reverted the change on screen.
        // Re-read the changed card. The detail enrichment is a LIVE (online) query and is
        // best-effort: offline it can't reach the server, so swallow the failure and rely on the
        // bound-dataset refresh below (local store), which already reflects the write. Previously
        // this sat inside the outer try, so an offline re-read surfaced "couldn't connect to the
        // server" even though the write (an offline-aware webAPI update) had already succeeded.
        // Optimistically reflect the new status locally so the card and focus-lock update at once,
        // with NO server round-trip — the reliable path offline. fieldServiceStatus drives the lock
        // and which tab the card lands in; the exact name/detail catch up on the next refresh/sync.
        const targetFs =
          action === "custom"
            ? detailsRef.current[id]?.fieldServiceStatus
            : STATUS_ACTIONS.find((a) => a.key === action)?.fieldServiceStatus;
        if (targetFs != null) {
          setDetails((d) => {
            const cur = d[id];
            return cur ? { ...d, [id]: { ...cur, fieldServiceStatus: targetFs } } : d;
          });
        }
        // The live re-read AND the dataset refresh both hit the server and fail offline (especially
        // right after an online->offline switch). Both are best-effort: the write already succeeded
        // and is queued to sync, so their failure must never surface as an update error.
        try {
          const [vm] = await service.getBookingDetails([id], extraSpecs, headerSpec);
          if (vm) setDetails((d) => ({ ...d, [id]: vm }));
        } catch (e) {
          console.warn("[BookingCardList] post-update detail re-read skipped (offline)", errMsg(e));
        }
        try {
          refreshDataset();
        } catch (e) {
          console.warn("[BookingCardList] dataset refresh skipped (offline)", errMsg(e));
        }
      } catch (e) {
        console.error("[BookingCardList] Failed to update status", e);
        // Surface the real reason (e.g. the one-running-booking rule) — not a "load" error.
        setError(`${t("StatusUpdateFailed", "Couldn't update the booking")}: ${errMsg(e)}`);
      } finally {
        setStatusBusy((s) => ({ ...s, [id]: false }));
      }
    },
    [service, effectiveCustomStatus, extraSpecs, headerSpec, refreshDataset, t, usingControlConfig]
  );

  const onChangeStatus = React.useCallback(
    (id: string, action: StatusChoice) => {
      void doChangeStatus(id, action);
    },
    [doChangeStatus]
  );

  const onTabSelect = React.useCallback((key: string) => setActiveIndex(Number(key)), []);

  return (
    <BookingList
      theme={theme}
      tabs={tabs}
      activeTab={String(activeIndex)}
      onTabSelect={onTabSelect}
      bookingIds={visibleIds}
      details={activeDetails}
      loading={isAllJobsTab ? allJobsLoading : loading}
      error={error}
      offlineMode={offline}
      readOnly={isAllJobsTab}
      statusBusy={statusBusy}
      boardBusy={isAllJobsTab ? false : boardBusy}
      statusLockReasons={isAllJobsTab ? undefined : statusLockReasons}
      openLockedIds={isAllJobsTab ? undefined : openLockedIds}
      openLockHint={openLockHint}
      extrasTitle={extrasTitle}
      priorityColours={priorityColours}
      customStatusName={effectiveCustomStatus?.name}
      onOpen={onOpen}
      onOpenMaps={onOpenMaps}
      onChangeStatus={onChangeStatus}
      t={t}
    />
  );
};
