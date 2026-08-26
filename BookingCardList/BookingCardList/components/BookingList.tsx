import * as React from "react";
import {
  FluentProvider, webLightTheme, Theme,
  TabList, Tab, CounterBadge, Text, Spinner,
  makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import { BookingCard } from "./BookingCard";
import { ErrorBoundary } from "./ErrorBoundary";
import { BookingCardVM, StatusChoice, StatusLockReason, CONTROL_VERSION } from "../types";

type T = (key: string, fallback: string) => string;

// Top-right connectivity icons (inline SVG — no @fluentui/react-icons, keeps the bundle lean).
const CloudOnIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6.5 19a4.5 4.5 0 0 1-.55-8.97 6 6 0 0 1 11.63-1.02A4 4 0 0 1 18 19H6.5z" />
  </svg>
);
const CloudOffIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6.7 18.5a4.2 4.2 0 0 1-.5-8.36 5.6 5.6 0 0 1 8.9-3.2" />
    <path d="M17.5 9.6A3.9 3.9 0 0 1 18 18.5H9.5" />
    <path d="M3.5 3.5l17 17" />
  </svg>
);

const useStyles = makeStyles({
  root: {
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    backgroundColor: tokens.colorNeutralBackground2,
  },
  tabBar: {
    flexShrink: 0,
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: "8px",
    paddingLeft: "8px",
    paddingRight: "8px",
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: tokens.colorNeutralStroke2,
  },
  tabListWrap: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    overflowX: "auto",
    overflowY: "hidden",
  },
  topRight: {
    position: "relative",
    flexShrink: 0,
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    columnGap: "8px",
  },
  statusButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderTopStyle: "none",
    borderRightStyle: "none",
    borderBottomStyle: "none",
    borderLeftStyle: "none",
    backgroundColor: "transparent",
    paddingTop: "2px",
    paddingBottom: "2px",
    paddingLeft: "2px",
    paddingRight: "2px",
    cursor: "pointer",
  },
  statusBubble: {
    position: "absolute",
    top: "calc(100% + 4px)",
    right: 0,
    zIndex: 20,
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    columnGap: "8px",
    whiteSpace: "nowrap",
    paddingTop: "6px",
    paddingBottom: "6px",
    paddingLeft: "10px",
    paddingRight: "10px",
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground1,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: "6px",
    borderTopWidth: "1px",
    borderRightWidth: "1px",
    borderBottomWidth: "1px",
    borderLeftWidth: "1px",
    borderTopStyle: "solid",
    borderRightStyle: "solid",
    borderBottomStyle: "solid",
    borderLeftStyle: "solid",
    borderTopColor: tokens.colorNeutralStroke2,
    borderRightColor: tokens.colorNeutralStroke2,
    borderBottomColor: tokens.colorNeutralStroke2,
    borderLeftColor: tokens.colorNeutralStroke2,
    boxShadow: tokens.shadow8,
  },
  iconOnline: {
    color: tokens.colorStatusSuccessForeground1,
  },
  iconOffline: {
    color: tokens.colorStatusWarningForeground1,
  },
  version: {
    flexShrink: 0,
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground4,
    whiteSpace: "nowrap",
  },
  scroll: {
    flexGrow: 1,
    overflowY: "auto",
  },
  errorBanner: {
    marginTop: "12px",
    marginLeft: "12px",
    marginRight: "12px",
    paddingTop: "10px",
    paddingBottom: "10px",
    paddingLeft: "10px",
    paddingRight: "10px",
    backgroundColor: tokens.colorStatusDangerBackground1,
    color: tokens.colorStatusDangerForeground1,
    borderRadius: "4px",
    fontSize: tokens.fontSizeBase300,
  },
  list: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
    columnGap: "12px",
    rowGap: "12px",
    alignItems: "start",
    paddingTop: "12px",
    paddingRight: "12px",
    paddingBottom: "12px",
    paddingLeft: "12px",
  },
  centered: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    rowGap: "8px",
    paddingTop: "32px",
    paddingBottom: "32px",
  },
  badge: {
    marginLeft: "6px",
  },
});

export interface TabDef {
  key: string;
  label: string;
  count: number;
}

export interface BookingListProps {
  theme?: Theme;
  tabs: TabDef[];
  activeTab: string;
  onTabSelect?: (key: string) => void;
  bookingIds: string[];
  details: Record<string, BookingCardVM>;
  loading: boolean;
  error?: string;
  /** True when the app is running offline — shows a "Working offline" banner above the list. */
  offlineMode?: boolean;
  statusBusy: Record<string, boolean>;
  /** True while any card's status change is in flight (freezes the rest). */
  boardBusy?: boolean;
  statusLockReasons?: Record<string, StatusLockReason>;
  openLockedIds?: Set<string>;
  openLockHint?: string;
  extrasTitle?: string;
  priorityColours?: Record<string, string>;
  customStatusName?: string;
  /** Read-only mode (All Jobs tab): show the engineer, hide the status control. */
  readOnly?: boolean;
  onOpen: (id: string) => void;
  onOpenMaps: (id: string) => void;
  onChangeStatus: (id: string, action: StatusChoice) => void;
  t: T;
}

export const BookingList: React.FC<BookingListProps> = (props) => {
  const styles = useStyles();
  const { tabs, activeTab, bookingIds, details, loading, error, statusBusy, t } = props;
  const hasAnyDetail = bookingIds.some((id) => details[id]);
  const [statusOpen, setStatusOpen] = React.useState(false);

  return (
    // pointer-events is INHERITED: a read-only host (entity-list / grid, and the FS Mobile view) sets
    // pointer-events:none on the control container, which cascades into the whole tree so everything
    // paints and looks enabled but nothing is clickable — a native <select> won't even open. This
    // control is always interactive (engineers start jobs / change status), so force pointer-events
    // back on at the root. It MUST be an inline style: Griffel drops a makeStyles `pointer-events:auto`
    // as a no-op default, and inline both survives that and outranks the inherited none.
    <FluentProvider theme={props.theme ?? webLightTheme} className={styles.root} style={{ pointerEvents: "auto" }}>
      <ErrorBoundary>
        {tabs && tabs.length > 0 ? (
          <div className={styles.tabBar}>
            <div className={styles.tabListWrap}>
              <TabList
                selectedValue={activeTab}
                onTabSelect={(_, d) => props.onTabSelect?.(d.value as string)}
                size="small"
              >
                {tabs.map((tab) => (
                  <Tab key={tab.key} value={tab.key}>
                    {tab.label}
                    {tab.count > 0 ? (
                      <CounterBadge
                        count={tab.count}
                        appearance="filled"
                        color="informative"
                        size="small"
                        className={styles.badge}
                      />
                    ) : null}
                  </Tab>
                ))}
              </TabList>
            </div>
            <div className={styles.topRight}>
              <button
                type="button"
                className={mergeClasses(styles.statusButton, props.offlineMode ? styles.iconOffline : styles.iconOnline)}
                aria-label={props.offlineMode
                  ? t("OfflineIcon", "Offline — showing data saved on this device")
                  : t("OnlineIcon", "Online — connected to live data")}
                aria-expanded={statusOpen}
                onClick={() => setStatusOpen((o) => !o)}
                onBlur={() => setStatusOpen(false)}
              >
                {props.offlineMode ? <CloudOffIcon /> : <CloudOnIcon />}
              </button>
              {statusOpen ? (
                <div className={styles.statusBubble} role="status">
                  <span>{props.offlineMode
                    ? t("StatusOffline", "Working offline with downloaded files")
                    : t("StatusOnline", "Working online")}</span>
                  <span className={styles.version}>{`v${CONTROL_VERSION}`}</span>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className={styles.scroll}>
          {error ? <div className={styles.errorBanner} role="alert">{error}</div> : null}

          {bookingIds.length === 0 && !loading && !error ? (
            <div className={styles.centered}>
              <Text>{t("NoBookings", "No bookings to show.")}</Text>
            </div>
          ) : null}

          {loading && !hasAnyDetail ? (
            <div className={styles.centered}>
              <Spinner label={t("Loading", "Loading bookings…")} />
            </div>
          ) : null}

          {hasAnyDetail ? (
            <div className={styles.list}>
              {bookingIds.map((id) => {
                const vm = details[id];
                if (!vm) return null;
                return (
                  <BookingCard
                    key={id}
                    vm={vm}
                    statusBusy={!!statusBusy[id]}
                    boardBusy={!!props.boardBusy}
                    statusLockReason={props.statusLockReasons?.[id]}
                    openDisabled={!!props.openLockedIds?.has(id)}
                    openLockHint={props.openLockHint}
                    extrasTitle={props.extrasTitle}
                    priorityColours={props.priorityColours}
                    customStatusName={props.customStatusName}
                    readOnly={props.readOnly}
                    onOpen={() => props.onOpen(id)}
                    onOpenMaps={() => props.onOpenMaps(id)}
                    onChangeStatus={(action) => props.onChangeStatus(id, action)}
                    t={t}
                  />
                );
              })}
            </div>
          ) : null}
        </div>
      </ErrorBoundary>
    </FluentProvider>
  );
};
