import * as React from "react";
import {
  FluentProvider, webLightTheme, Theme,
  TabList, Tab, CounterBadge, Text, Spinner,
  makeStyles, tokens,
} from "@fluentui/react-components";
import { BookingCard } from "./BookingCard";
import { ErrorBoundary } from "./ErrorBoundary";
import { BookingCardVM, StatusChoice, StatusLockReason } from "../types";

type T = (key: string, fallback: string) => string;

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
    paddingLeft: "8px",
    paddingRight: "8px",
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: tokens.colorNeutralStroke2,
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
  noticeBanner: {
    marginTop: "12px",
    marginLeft: "12px",
    marginRight: "12px",
    paddingTop: "10px",
    paddingBottom: "10px",
    paddingLeft: "10px",
    paddingRight: "10px",
    backgroundColor: tokens.colorStatusWarningBackground1,
    color: tokens.colorStatusWarningForeground1,
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
  /** Non-blocking informational notice (e.g. offline-profile gaps): amber, shown above the list. */
  notice?: string;
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

  return (
    <FluentProvider theme={props.theme ?? webLightTheme} className={styles.root}>
      <ErrorBoundary>
        {tabs && tabs.length > 0 ? (
          <div className={styles.tabBar}>
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
        ) : null}

        <div className={styles.scroll}>
          {error ? <div className={styles.errorBanner}>{error}</div> : null}
          {props.notice ? <div className={styles.noticeBanner}>{props.notice}</div> : null}

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
