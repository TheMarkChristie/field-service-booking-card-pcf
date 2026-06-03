import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Theme } from "@fluentui/react-components";
import { BookingList } from "./BookingList";
import { BookingDataService } from "../services/dataverse";
import {
    ACTIVE_FS_STATUSES,
    BookingCardVM,
    BUILTIN_BUCKETS,
    bucketOf,
    CustomStatusConfig,
    STATUS_ACTIONS,
    StatusActionKey,
    TabConfig,
    TAB_VIEW_NAMES,
    TabInfo,
} from "../types";
import { buildMapsUrl, errMsg, MapsProvider } from "../util/maps";

export interface BookingAppProps {
    dataset: ComponentFramework.PropertyTypes.DataSet;
    service: BookingDataService;
    theme?: Theme;
    defaultTabNames: string[];
    customStatus?: CustomStatusConfig;
    mapsProvider: MapsProvider;
    openItem: (bookingId: string) => void;
    openUrl: (url: string) => void;
    t: (key: string, fallback: string) => string;
}

const EMPTY_BY_TAB: string[][] = [[], [], []];

export const BookingApp: React.FC<BookingAppProps> = (props) => {
    const { dataset, service, theme, defaultTabNames, customStatus, mapsProvider, openItem, openUrl, t } =
        props;

    const idsKey = (dataset.sortedRecordIds ?? []).join(",");
    const dsLoading = dataset.loading;
    const datasetIds = idsKey ? idsKey.split(",") : [];

    const [details, setDetails] = useState<Record<string, BookingCardVM>>({});
    const detailsRef = useRef(details);
    detailsRef.current = details;
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | undefined>();
    const [statusBusy, setStatusBusy] = useState<Record<string, boolean>>({});
    const [activeIndex, setActiveIndex] = useState(0);
    const [viewIdsByTab, setViewIdsByTab] = useState<string[][]>(EMPTY_BY_TAB);
    const [reloadToken, setReloadToken] = useState(0);

    // Tab config: labels from the manifest defaults, views hard-coded by name.
    const tabsConfig: TabConfig[] = useMemo(
        () =>
            [0, 1, 2].map((i) => ({
                name: defaultTabNames[i] || `Tab ${i + 1}`,
                viewName: TAB_VIEW_NAMES[i],
            })),
        [defaultTabNames]
    );

    const viewMode = tabsConfig.some((tab) => !!tab.viewName);
    const viewKey = tabsConfig.map((tab) => tab.viewName ?? "").join("|");

    const loadDetailsFor = useCallback(
        async (ids: string[]): Promise<void> => {
            const vms = await service.getBookingDetails(ids);
            const next: Record<string, BookingCardVM> = {};
            for (const vm of vms) next[vm.bookingId] = vm;
            setDetails(next);
        },
        [service]
    );

    // VIEW MODE: load each configured view's booking ids, then detail for the union.
    useEffect(() => {
        if (!viewMode) return;
        let cancelled = false;
        setLoading(true);
        setError(undefined);
        void (async () => {
            try {
                const lists = await Promise.all(
                    tabsConfig.map((tab) =>
                        tab.viewName
                            ? service.getViewBookingIdsByName(tab.viewName)
                            : Promise.resolve<string[]>([])
                    )
                );
                if (cancelled) return;
                setViewIdsByTab(lists);
                const union = [...new Set(lists.flat())];
                await loadDetailsFor(union);
            } catch (e: unknown) {
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
    useEffect(() => {
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
            } catch (e: unknown) {
                console.error("[BookingCardList] Failed to load bookings", e);
                setError(errMsg(e));
            } finally {
                setLoading(false);
            }
        })();
    }, [viewMode, idsKey, dsLoading, loadDetailsFor]);

    // Built-in bucketing of the bound dataset into the three positions.
    const builtinByTab = useMemo(() => {
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

    const tabs: TabInfo[] = tabsConfig.map((tab, i) => ({
        key: String(i),
        label: tab.name,
        count: idsByTab[i]?.length ?? 0,
    }));

    const visibleIds = (idsByTab[activeIndex] ?? []).filter((id) => details[id]);

    // If any loaded booking is already Traveling / In Progress, lock status changes on all
    // the OTHER bookings until that active job is finished.
    const activeBookingIds = Object.keys(details).filter((id) =>
        ACTIVE_FS_STATUSES.has(details[id].fieldServiceStatus ?? -1)
    );
    const lockedStatusIds = new Set<string>(
        activeBookingIds.length > 0
            ? Object.keys(details).filter((id) => !activeBookingIds.includes(id))
            : []
    );

    const onOpen = useCallback((id: string) => openItem(id), [openItem]);

    const onOpenMaps = useCallback(
        (id: string) => {
            const vm = details[id];
            if (vm) openUrl(buildMapsUrl(vm, mapsProvider));
        },
        [details, mapsProvider, openUrl]
    );

    const onLoadMore = useCallback(() => {
        if (dataset.paging?.hasNextPage && !dataset.loading) {
            dataset.paging.loadNextPage();
        }
    }, [dataset]);

    const doChangeStatus = useCallback(
        async (id: string, action: StatusActionKey): Promise<void> => {
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
                            t(
                                "NoStatusFound",
                                "No active Booking Status was found for this action in this environment."
                            )
                        );
                    }
                    await service.setBookingStatus(id, statusId);
                }
                const [vm] = await service.getBookingDetails([id]);
                if (vm) setDetails((d) => ({ ...d, [id]: vm }));
                if (viewMode) {
                    setReloadToken((n) => n + 1);
                } else {
                    dataset.refresh();
                }
            } catch (e: unknown) {
                console.error("[BookingCardList] Failed to update status", e);
                setError(errMsg(e));
            } finally {
                setStatusBusy((s) => ({ ...s, [id]: false }));
            }
        },
        [service, dataset, viewMode, customStatus, t]
    );

    const onChangeStatus = useCallback(
        (id: string, action: StatusActionKey) => {
            void doChangeStatus(id, action);
        },
        [doChangeStatus]
    );

    const onTabSelect = useCallback((key: string) => setActiveIndex(Number(key)), []);

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
            lockedStatusIds={lockedStatusIds}
            customStatusName={customStatus?.name}
            onLoadMore={onLoadMore}
            onOpen={onOpen}
            onOpenMaps={onOpenMaps}
            onChangeStatus={onChangeStatus}
            t={t}
        />
    );
};
