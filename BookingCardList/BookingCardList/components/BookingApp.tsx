import * as React from "react";
import { Theme } from "@fluentui/react-components";
import { BookingList } from "./BookingList";
import {
  BookingCardVM, CustomStatus, MapsProvider, StatusChoice, ExtraFieldSpec,
  ACTIVE_FS_STATUSES, TERMINAL_FS_STATUSES, BUILTIN_BUCKETS, STATUS_ACTIONS, COMPLETE_WINDOW_DAYS, bucketOf,
} from "../types";
import { BookingDataService } from "../services/dataverse";
import { buildMapsUrl, errMsg } from "../util/maps";

type T = (key: string, fallback: string) => string;

export interface BookingAppProps {
  service: BookingDataService;
  theme?: Theme;
  defaultTabNames: string[];
  mapsProvider: MapsProvider;
  extraFields: ExtraFieldSpec[];
  extrasTitle: string;
  /** Optional Work Order / booking field shown as a badge in the card header. */
  headerField?: ExtraFieldSpec;
  priorityColours: Record<string, string>;
  openItem: (id: string) => void;
  openUrl: (url: string) => void;
  t: T;
}

export const BookingApp: React.FC<BookingAppProps> = (props) => {
  const {
    service, theme, defaultTabNames,
    mapsProvider, extraFields, extrasTitle, headerField, priorityColours, openItem, openUrl, t,
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
  const [reloadToken, setReloadToken] = React.useState(0);

  // The custom status option (label + booking status + work order sub-status) is read from the
  // Field Service Settings record, so the GUIDs live with the environment.
  const [effectiveCustomStatus, setEffectiveCustomStatus] = React.useState<CustomStatus | undefined>(undefined);
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const s = await service.getCustomStatusSettings();
      if (!cancelled && s) setEffectiveCustomStatus(s);
    })();
    return () => {
      cancelled = true;
    };
  }, [service]);

  // Tab labels come from the manifest defaults. Tabs in order: Active, Today, Tomorrow, Complete.
  const tabNames = React.useMemo(
    () => [0, 1, 2, 3].map((i) => defaultTabNames[i] || `Tab ${i + 1}`),
    [defaultTabNames]
  );

  const loadDetailsFor = React.useCallback(
    async (ids: string[]) => {
      const vms = await service.getBookingDetails(ids, extraSpecs, headerSpec);
      const next: Record<string, BookingCardVM> = {};
      for (const vm of vms) next[vm.bookingId] = vm;
      setDetails(next);
    },
    [service, extraSpecs, headerSpec]
  );

  // Load the signed-in user's bookings for the Today / Tomorrow / Complete window directly
  // (no system views required), then load detail for them. bucketOf() sorts the rest.
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    void (async () => {
      try {
        const ids = await service.getMyBookingIds(COMPLETE_WINDOW_DAYS);
        if (cancelled) return;
        setBookingIds(ids);
        await loadDetailsFor(ids);
      } catch (e) {
        if (cancelled) return;
        console.error("[BookingCardList] Failed to load bookings", e);
        setError(errMsg(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadToken, service, loadDetailsFor]);

  // Bucket the loaded bookings into Active / Today / Tomorrow / Complete.
  const idsByTab = React.useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const byTab: string[][] = [[], [], [], []];
    for (const id of bookingIds) {
      const vm = details[id];
      if (!vm) continue;
      const bucket = bucketOf(vm, today, tomorrow);
      const pos = bucket ? BUILTIN_BUCKETS.indexOf(bucket) : -1;
      if (pos >= 0) byTab[pos].push(id);
    }
    return byTab;
  }, [bookingIds, details]);

  // On first load, land on the Active tab if a job is already started, otherwise Today.
  const tabInitialised = React.useRef(false);
  React.useEffect(() => {
    if (tabInitialised.current || loading || Object.keys(details).length === 0) return;
    tabInitialised.current = true;
    setActiveIndex((idsByTab[0]?.length ?? 0) > 0 ? 0 : 1);
  }, [loading, details, idsByTab]);

  const tabs = tabNames.map((name, i) => ({
    key: String(i),
    label: name,
    count: idsByTab[i]?.length ?? 0,
  }));

  const visibleIds = (idsByTab[activeIndex] ?? []).filter((id) => details[id]);

  // Focus lock. While any booking is active (Traveling / In Progress), the technician must
  // finish it before opening OR updating any other job — including tomorrow's. Completed /
  // cancelled bookings are terminal: their status can never change again, but they can still
  // be opened to view the record.
  const allIds = Object.keys(details);
  const isActive = (id: string) => ACTIVE_FS_STATUSES.has(details[id].fieldServiceStatus ?? -1);
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

  const onOpen = React.useCallback((id: string) => openItem(id), [openItem]);

  const onOpenMaps = React.useCallback(
    (id: string) => {
      const vm = details[id];
      if (vm) openUrl(buildMapsUrl(vm, mapsProvider));
    },
    [details, mapsProvider, openUrl]
  );

  const doChangeStatus = React.useCallback(
    async (id: string, action: StatusChoice) => {
      setStatusBusy((s) => ({ ...s, [id]: true }));
      try {
        if (action === "custom") {
          if (!effectiveCustomStatus) return;
          if (effectiveCustomStatus.bookingStatusId) {
            await service.setBookingStatus(id, effectiveCustomStatus.bookingStatusId);
          }
          const woId = detailsRef.current[id]?.workOrderId;
          if (effectiveCustomStatus.workOrderSubStatusId && woId) {
            await service.setWorkOrderSubStatus(woId, effectiveCustomStatus.workOrderSubStatusId);
          }
        } else {
          const meta = STATUS_ACTIONS.find((a) => a.key === action);
          if (!meta) return;
          const statusId = await service.resolveStatusId(meta.fieldServiceStatus);
          if (!statusId) {
            throw new Error(
              t("NoStatusFound", "No active Booking Status was found for this action in this environment.")
            );
          }
          await service.setBookingStatus(id, statusId);
        }

        const [vm] = await service.getBookingDetails([id], extraSpecs, headerSpec);
        if (vm) setDetails((d) => ({ ...d, [id]: vm }));

        // Re-run the self-query so the booking lands in the right tab (e.g. a completed job
        // moving to the Complete tab) and counts refresh.
        setReloadToken((n) => n + 1);
      } catch (e) {
        console.error("[BookingCardList] Failed to update status", e);
        setError(errMsg(e));
      } finally {
        setStatusBusy((s) => ({ ...s, [id]: false }));
      }
    },
    [service, effectiveCustomStatus, extraSpecs, headerSpec, t]
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
      details={details}
      loading={loading}
      error={error}
      statusBusy={statusBusy}
      boardBusy={boardBusy}
      statusLockReasons={statusLockReasons}
      openLockedIds={openLockedIds}
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
