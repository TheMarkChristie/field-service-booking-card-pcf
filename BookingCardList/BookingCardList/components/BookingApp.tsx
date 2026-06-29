import * as React from "react";
import { Theme } from "@fluentui/react-components";
import { BookingList } from "./BookingList";
import {
  BookingCardVM, CustomStatus, MapsProvider, StatusChoice, ExtraFieldSpec, AgreementAssetConfig,
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
  /** Days back an active job still counts (shown in Active + blocks); older active jobs ignored.
   *  undefined = no limit (show all active jobs regardless of age). */
  activeDays?: number;
  /** Show a final read-only tab of all engineers' bookings for the next N days. */
  allJobsEnabled: boolean;
  allJobsName: string;
  allJobsDays: number;
  extraFields: ExtraFieldSpec[];
  extrasTitle: string;
  /** Optional Work Order / booking field shown as a badge in the card header. */
  headerField?: ExtraFieldSpec;
  priorityColours: Record<string, string>;
  /** Manifest-mapped Work Order columns for the Agreement & Asset card section. */
  agreementAsset: AgreementAssetConfig;
  openItem: (id: string) => void;
  openUrl: (url: string) => void;
  t: T;
}

export const BookingApp: React.FC<BookingAppProps> = (props) => {
  const {
    service, theme, defaultTabNames, mapsProvider, activeDays,
    allJobsEnabled, allJobsName, allJobsDays,
    extraFields, extrasTitle, headerField, priorityColours, agreementAsset, openItem, openUrl, t,
  } = props;

  // Stable Agreement/Asset config (index.ts rebuilds it each render).
  const aaKey = `${agreementAsset.underAgreementField}|${agreementAsset.agreementField}|${agreementAsset.assetField}|${agreementAsset.functionalLocationField}`;
  const aaConfig = React.useMemo(() => agreementAsset, [aaKey]);
  const aaEnabled = [aaConfig.assetField, aaConfig.agreementField, aaConfig.underAgreementField].some(Boolean);

  // Active jobs that started before this floor are ignored: not shown in Active and they don't
  // block opening new jobs (so a forgotten open job can't lock the board forever). When activeDays
  // is unset, the floor is the epoch — i.e. no limit, every active job counts.
  const activeFloor = React.useMemo(() => {
    if (activeDays == null) return new Date(0);
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate() - Math.max(0, activeDays));
  }, [activeDays]);

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

  // All Jobs tab (optional, read-only): all engineers' bookings for the next N days. Kept in a
  // separate map so other engineers' active jobs never affect this user's focus lock.
  const [allJobsIds, setAllJobsIds] = React.useState<string[]>([]);
  const [allJobsDetails, setAllJobsDetails] = React.useState<Record<string, BookingCardVM>>({});
  const [allJobsLoading, setAllJobsLoading] = React.useState(false);
  const allJobsDetailsRef = React.useRef(allJobsDetails);
  allJobsDetailsRef.current = allJobsDetails;

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

  // Tab labels from the manifest defaults: Active, Today, Tomorrow, Complete, then the optional
  // All Jobs tab appended last when enabled.
  const tabNames = React.useMemo(() => {
    const base = [0, 1, 2, 3].map((i) => defaultTabNames[i] || `Tab ${i + 1}`);
    if (allJobsEnabled) base.push(allJobsName);
    return base;
  }, [defaultTabNames, allJobsEnabled, allJobsName]);
  const ALL_JOBS_INDEX = 4;

  const loadDetailsFor = React.useCallback(
    async (ids: string[]) => {
      const vms = await service.getBookingDetails(ids, extraSpecs, headerSpec);
      const next: Record<string, BookingCardVM> = {};
      for (const vm of vms) next[vm.bookingId] = vm;
      if (aaEnabled) {
        const woIds = [...new Set(vms.map((v) => v.workOrderId).filter((x): x is string => !!x))];
        const aaMap = await service.getAgreementAssetData(woIds, aaConfig);
        for (const vm of Object.values(next)) {
          if (vm.workOrderId) vm.agreementAsset = aaMap.get(vm.workOrderId);
        }
      }
      setDetails(next);
    },
    [service, extraSpecs, headerSpec, aaEnabled, aaConfig]
  );

  // Load the signed-in user's bookings for the Today / Tomorrow / Complete window directly
  // (no system views required), then load detail for them. bucketOf() sorts the rest.
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    void (async () => {
      try {
        const ids = await service.getMyBookingIds(COMPLETE_WINDOW_DAYS, activeDays);
        if (cancelled) return;
        setBookingIds(ids);
        await loadDetailsFor(ids);
      } catch (e) {
        if (cancelled) return;
        console.error("[BookingCardList] Failed to load bookings", e);
        setError(`${t("ErrorPrefix", "Couldn't load bookings")}: ${errMsg(e)}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadToken, service, loadDetailsFor, activeDays, t]);

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

  // Bucket the loaded bookings into Active / Today / Tomorrow / Complete.
  const idsByTab = React.useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const byTab: string[][] = [[], [], [], []];
    for (const id of bookingIds) {
      const vm = details[id];
      if (!vm) continue;
      const bucket = bucketOf(vm, today, tomorrow, activeFloor);
      const pos = bucket ? BUILTIN_BUCKETS.indexOf(bucket) : -1;
      if (pos >= 0) byTab[pos].push(id);
    }
    return byTab;
  }, [bookingIds, details, activeFloor]);

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
    count: i === ALL_JOBS_INDEX ? allJobsIds.length : idsByTab[i]?.length ?? 0,
  }));

  // The All Jobs tab is a separate, read-only data source (all engineers); the others are the
  // signed-in user's own bookings, subject to the focus lock.
  const isAllJobsTab = allJobsEnabled && activeIndex === ALL_JOBS_INDEX;
  const activeDetails = isAllJobsTab ? allJobsDetails : details;
  const visibleIds = (isAllJobsTab ? allJobsIds : idsByTab[activeIndex] ?? []).filter(
    (id) => activeDetails[id]
  );

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

  const onOpen = React.useCallback((id: string) => openItem(id), [openItem]);

  const onOpenMaps = React.useCallback(
    (id: string) => {
      const vm = detailsRef.current[id] ?? allJobsDetailsRef.current[id];
      if (vm) openUrl(buildMapsUrl(vm, mapsProvider));
    },
    [mapsProvider, openUrl]
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
        // Keep the loaded Agreement/Asset state on the card through the status change.
        if (vm) setDetails((d) => ({ ...d, [id]: { ...vm, agreementAsset: d[id]?.agreementAsset } }));

        // Re-run the self-query so the booking lands in the right tab (e.g. a completed job
        // moving to the Complete tab) and counts refresh.
        setReloadToken((n) => n + 1);
      } catch (e) {
        console.error("[BookingCardList] Failed to update status", e);
        // Surface the real reason (e.g. the one-running-booking rule) — not a "load" error.
        setError(`${t("StatusUpdateFailed", "Couldn't update the booking")}: ${errMsg(e)}`);
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

  // ── Agreement & Asset handlers (write to the mapped Work Order columns) ───────────────
  const aaError = React.useCallback(
    (e: unknown) => setError(`${t("StatusUpdateFailed", "Couldn't update the booking")}: ${errMsg(e)}`),
    [t]
  );
  const patchAgreementAsset = React.useCallback(
    (id: string, patch: Partial<BookingCardVM["agreementAsset"]>) =>
      setDetails((d) => ({
        ...d,
        [id]: { ...d[id], agreementAsset: { ...(d[id].agreementAsset ?? {}), ...patch } },
      })),
    []
  );

  const onSetUnderAgreement = React.useCallback(
    (id: string, value: boolean) => {
      const vm = detailsRef.current[id];
      const field = aaConfig.underAgreementField;
      if (!vm?.workOrderId || !field) return;
      const woId = vm.workOrderId;
      patchAgreementAsset(id, { underAgreement: value });
      void service.setWorkOrderBool(woId, field, value).catch(aaError);
    },
    [service, aaConfig, patchAgreementAsset, aaError]
  );

  const onSetAgreement = React.useCallback(
    (id: string, agreementId: string) => {
      const vm = detailsRef.current[id];
      const field = aaConfig.agreementField;
      if (!vm?.workOrderId || !field) return;
      const woId = vm.workOrderId;
      const name = vm.agreementAsset?.agreementOptions?.find((o) => o.id === agreementId)?.name ?? "";
      patchAgreementAsset(id, { agreementId: agreementId || undefined, agreementName: name });
      void service
        .setWorkOrderLookup(woId, field, "msdyn_agreements", agreementId || null)
        .catch(aaError);
    },
    [service, aaConfig, patchAgreementAsset, aaError]
  );

  const onSetAsset = React.useCallback(
    (id: string, assetId: string) => {
      const vm = detailsRef.current[id];
      const field = aaConfig.assetField;
      if (!vm?.workOrderId || !field) return;
      const woId = vm.workOrderId;
      const name = vm.agreementAsset?.assetOptions?.find((o) => o.id === assetId)?.name ?? "";
      patchAgreementAsset(id, { assetId: assetId || undefined, assetName: name });
      void service
        .setWorkOrderLookup(woId, field, "msdyn_customerassets", assetId || null)
        .catch(aaError);
    },
    [service, aaConfig, patchAgreementAsset, aaError]
  );

  const onAddAsset = React.useCallback(
    (id: string, name: string) => {
      const vm = detailsRef.current[id];
      const field = aaConfig.assetField;
      const flId = vm?.agreementAsset?.functionalLocationId;
      if (!vm?.workOrderId || !field || !flId || !name.trim()) return;
      const woId = vm.workOrderId;
      const accountId = vm.agreementAsset?.serviceAccountId;
      void (async () => {
        try {
          const opt = await service.createAsset(name.trim(), flId, accountId);
          await service.setWorkOrderLookup(woId, field, "msdyn_customerassets", opt.id);
          setDetails((d) => {
            const cur = d[id].agreementAsset ?? {};
            return {
              ...d,
              [id]: {
                ...d[id],
                agreementAsset: {
                  ...cur,
                  assetId: opt.id,
                  assetName: opt.name,
                  assetOptions: [...(cur.assetOptions ?? []), opt],
                },
              },
            };
          });
        } catch (e) {
          aaError(e);
        }
      })();
    },
    [service, aaConfig, aaError]
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
      readOnly={isAllJobsTab}
      statusBusy={statusBusy}
      boardBusy={isAllJobsTab ? false : boardBusy}
      statusLockReasons={isAllJobsTab ? undefined : statusLockReasons}
      openLockedIds={isAllJobsTab ? undefined : openLockedIds}
      openLockHint={openLockHint}
      extrasTitle={extrasTitle}
      priorityColours={priorityColours}
      customStatusName={effectiveCustomStatus?.name}
      agreementAsset={
        isAllJobsTab || !aaEnabled
          ? undefined
          : {
              showUnderAgreement: !!aaConfig.underAgreementField,
              showAgreement: !!aaConfig.agreementField,
              showAsset: !!aaConfig.assetField,
              onSetUnderAgreement,
              onSetAgreement,
              onSetAsset,
              onAddAsset,
            }
      }
      onOpen={onOpen}
      onOpenMaps={onOpenMaps}
      onChangeStatus={onChangeStatus}
      t={t}
    />
  );
};
