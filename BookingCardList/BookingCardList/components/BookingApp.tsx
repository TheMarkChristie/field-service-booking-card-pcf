import * as React from "react";
import { Theme } from "@fluentui/react-components";
import { BookingList } from "./BookingList";
import {
  BookingCardVM, CustomStatus, MapsProvider, StatusChoice, ExtraFieldSpec,
  ACTIVE_FS_STATUSES, TERMINAL_FS_STATUSES, BUILTIN_BUCKETS, STATUS_ACTIONS, TAB_VIEW_NAMES, bucketOf,
} from "../types";
import { BookingDataService } from "../services/dataverse";
import { buildMapsUrl, errMsg } from "../util/maps";

type T = (key: string, fallback: string) => string;

export interface BookingAppProps {
  dataset: ComponentFramework.PropertyTypes.DataSet;
  service: BookingDataService;
  theme?: Theme;
  defaultTabNames: string[];
  customStatus?: CustomStatus;
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

const EMPTY_BY_TAB: string[][] = [[], [], []];

export const BookingApp: React.FC<BookingAppProps> = (props) => {
  const {
    dataset, service, theme, defaultTabNames,
    customStatus, mapsProvider, extraFields, extrasTitle, headerField, priorityColours, openItem, openUrl, t,
  } = props;

  const idsKey = (dataset.sortedRecordIds ?? []).join(",");
  const dsLoading = dataset.loading;
  const datasetIds = idsKey ? idsKey.split(",") : [];

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
  const [viewIdsByTab, setViewIdsByTab] = React.useState<string[][]>(EMPTY_BY_TAB);
  const [reloadToken, setReloadToken] = React.useState(0);

  // Tab config: labels from the manifest defaults, views hard-coded by name.
  const tabsConfig = React.useMemo(
    () =>
      [0, 1, 2].map((i) => ({
        name: defaultTabNames[i] || `Tab ${i + 1}`,
        viewName: TAB_VIEW_NAMES[i],
      })),
    [defaultTabNames]
  );
  const viewMode = tabsConfig.some((tab) => !!tab.viewName);
  const viewKey = tabsConfig.map((tab) => tab.viewName ?? "").join("|");

  const loadDetailsFor = React.useCallback(
    async (ids: string[]) => {
      const vms = await service.getBookingDetails(ids, extraSpecs, headerSpec);
      const next: Record<string, BookingCardVM> = {};
      for (const vm of vms) next[vm.bookingId] = vm;
      setDetails(next);
    },
    [service, extraSpecs, headerSpec]
  );

  // VIEW MODE: load each configured view's booking ids, then detail for the union.
  React.useEffect(() => {
    if (!viewMode) return;
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    void (async () => {
      try {
        const lists = await Promise.all(
          tabsConfig.map((tab) =>
            tab.viewName ? service.getViewBookingIdsByName(tab.viewName) : Promise.resolve([])
          )
        );
        if (cancelled) return;
        setViewIdsByTab(lists);
        const union = [...new Set(lists.flat())];
        await loadDetailsFor(union);
      } catch (e) {
        if (cancelled) return;
        console.error("[BookingCardList] Failed to load views", e);
        setError(errMsg(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewMode, viewKey, reloadToken, service, tabsConfig, loadDetailsFor]);

  // BUILT-IN MODE: load detail for the bound dataset's records (bucketed by date/status).
  React.useEffect(() => {
    if (viewMode) return;
    if (dsLoading) return;
    if (idsKey.length === 0) {
      setDetails({});
      return;
    }
    setLoading(true);
    setError(undefined);
    void (async () => {
      try {
        await loadDetailsFor(idsKey.split(","));
      } catch (e) {
        console.error("[BookingCardList] Failed to load bookings", e);
        setError(errMsg(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [viewMode, idsKey, dsLoading, loadDetailsFor]);

  // Built-in bucketing of the bound dataset into the three positions.
  const builtinByTab = React.useMemo(() => {
    if (viewMode) return EMPTY_BY_TAB;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const byTab: string[][] = [[], [], []];
    for (const id of datasetIds) {
      const vm = details[id];
      if (!vm) continue;
      const bucket = bucketOf(vm, today, tomorrow);
      const pos = bucket ? BUILTIN_BUCKETS.indexOf(bucket) : -1;
      if (pos >= 0) byTab[pos].push(id);
    }
    return byTab;
  }, [viewMode, idsKey, details, datasetIds]);

  const idsByTab = viewMode ? viewIdsByTab : builtinByTab;

  const tabs = tabsConfig.map((tab, i) => ({
    key: String(i),
    label: tab.name,
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

  const onLoadMore = React.useCallback(() => {
    if (dataset.paging?.hasNextPage && !dataset.loading) {
      dataset.paging.loadNextPage();
    }
  }, [dataset]);

  const doChangeStatus = React.useCallback(
    async (id: string, action: StatusChoice) => {
      setStatusBusy((s) => ({ ...s, [id]: true }));
      try {
        if (action === "custom") {
          if (!customStatus) return;
          if (customStatus.bookingStatusId) {
            await service.setBookingStatus(id, customStatus.bookingStatusId);
          }
          const woId = detailsRef.current[id]?.workOrderId;
          if (customStatus.workOrderSubStatusId && woId) {
            await service.setWorkOrderSubStatus(woId, customStatus.workOrderSubStatusId);
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

        if (viewMode) {
          setReloadToken((n) => n + 1);
        } else {
          dataset.refresh();
        }
      } catch (e) {
        console.error("[BookingCardList] Failed to update status", e);
        setError(errMsg(e));
      } finally {
        setStatusBusy((s) => ({ ...s, [id]: false }));
      }
    },
    [service, dataset, viewMode, customStatus, extraSpecs, headerSpec, t]
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
      loading={loading || (!viewMode && dsLoading)}
      error={error}
      hasNextPage={!viewMode && !!dataset.paging?.hasNextPage}
      statusBusy={statusBusy}
      boardBusy={boardBusy}
      statusLockReasons={statusLockReasons}
      openLockedIds={openLockedIds}
      openLockHint={openLockHint}
      extrasTitle={extrasTitle}
      priorityColours={priorityColours}
      customStatusName={customStatus?.name}
      onLoadMore={onLoadMore}
      onOpen={onOpen}
      onOpenMaps={onOpenMaps}
      onChangeStatus={onChangeStatus}
      t={t}
    />
  );
};
