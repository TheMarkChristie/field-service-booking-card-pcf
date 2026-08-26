import * as React from "react";
import {
  Card, Text, Link, Spinner,
  makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import { BookingCardVM, STATUS_ACTIONS, StatusActionKey, StatusChoice, StatusLockReason, ACTIVE_FS_STATUSES } from "../types";

type T = (key: string, fallback: string) => string;

const useStyles = makeStyles({
  card: {
    position: "relative",
    paddingTop: "16px",
    paddingRight: "16px",
    paddingBottom: "12px",
    paddingLeft: "16px",
    cursor: "pointer",
    rowGap: "10px",
    borderTopWidth: "3px",
    borderTopStyle: "solid",
    borderTopColor: tokens.colorBrandStroke1,
  },
  cardLocked: {
    cursor: "default",
  },
  headerRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "flex-start",
    flexWrap: "wrap",
    columnGap: "8px",
    rowGap: "6px",
  },
  headerLeft: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    columnGap: "8px",
    rowGap: "4px",
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "auto",
  },
  headerRight: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    columnGap: "6px",
    rowGap: "4px",
    minWidth: 0,
    marginLeft: "auto",
  },
  // Header pill (incident type / header badge). Unlike Fluent's Badge it has no fixed height,
  // so multi-line text wraps and the pill grows to fit instead of clipping.
  chip: {
    display: "inline-block",
    boxSizing: "border-box",
    flexShrink: 1,
    maxWidth: "100%",
    whiteSpace: "normal",
    overflowWrap: "break-word",
    textAlign: "center",
    lineHeight: tokens.lineHeightBase200,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    paddingTop: "2px",
    paddingBottom: "2px",
    paddingLeft: "8px",
    paddingRight: "8px",
    borderRadius: tokens.borderRadiusMedium,
    borderTopWidth: "1px",
    borderRightWidth: "1px",
    borderBottomWidth: "1px",
    borderLeftWidth: "1px",
    borderTopStyle: "solid",
    borderRightStyle: "solid",
    borderBottomStyle: "solid",
    borderLeftStyle: "solid",
  },
  chipIncident: {
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground2,
    borderTopColor: tokens.colorNeutralStroke2,
    borderRightColor: tokens.colorNeutralStroke2,
    borderBottomColor: tokens.colorNeutralStroke2,
    borderLeftColor: tokens.colorNeutralStroke2,
  },
  chipHeader: {
    backgroundColor: tokens.colorTransparentBackground,
    color: tokens.colorNeutralForeground2,
    borderTopColor: tokens.colorNeutralStroke1,
    borderRightColor: tokens.colorNeutralStroke1,
    borderBottomColor: tokens.colorNeutralStroke1,
    borderLeftColor: tokens.colorNeutralStroke1,
  },
  priorityPill: {
    flexShrink: 0,
    borderRadius: "999px",
    paddingTop: "2px",
    paddingBottom: "2px",
    paddingLeft: "8px",
    paddingRight: "8px",
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    whiteSpace: "nowrap",
  },
  woNumber: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase400,
    color: tokens.colorNeutralForeground1,
  },
  section: {
    display: "flex",
    flexDirection: "column",
    rowGap: "2px",
  },
  label: {
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightSemibold,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: tokens.colorNeutralForeground3,
  },
  value: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
  },
  addressLink: {
    display: "inline-flex",
    alignItems: "center",
    columnGap: "4px",
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorBrandForegroundLink,
  },
  pin: {
    flexShrink: 0,
  },
  products: {
    display: "flex",
    flexDirection: "column",
    rowGap: "2px",
  },
  productRow: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
  },
  productQty: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground3,
  },
  footer: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: "8px",
    marginTop: "2px",
  },
  divider: {
    height: "1px",
    backgroundColor: tokens.colorNeutralStroke2,
  },
  // The status control was a native <select>; its React onChange never fires inside the Field Service
  // mobile webview (the dropdown opens but picking an option does nothing). Rebuilt as a button + a
  // click-based popup menu — onClick works everywhere the native change event does not.
  statusWrap: {
    position: "relative",
    flexShrink: 0,
  },
  statusSelect: {
    display: "inline-flex",
    alignItems: "center",
    columnGap: "4px",
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    borderTopStyle: "none",
    borderRightStyle: "none",
    borderBottomStyle: "none",
    borderLeftStyle: "none",
    borderRadius: "4px",
    paddingTop: "6px",
    paddingBottom: "6px",
    paddingLeft: "12px",
    paddingRight: "10px",
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    cursor: "pointer",
    ":hover": {
      backgroundColor: tokens.colorBrandBackgroundHover,
    },
    ":disabled": {
      opacity: 0.6,
      cursor: "default",
      backgroundColor: tokens.colorBrandBackground,
    },
  },
  caret: {
    fontSize: "10px",
    lineHeight: "1",
  },
  statusMenu: {
    zIndex: 30,
    minWidth: "170px",
    display: "flex",
    flexDirection: "column",
    paddingTop: "4px",
    paddingBottom: "4px",
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
    boxShadow: tokens.shadow16,
  },
  statusMenuItem: {
    display: "block",
    width: "100%",
    textAlign: "left",
    backgroundColor: "transparent",
    borderTopStyle: "none",
    borderRightStyle: "none",
    borderBottomStyle: "none",
    borderLeftStyle: "none",
    paddingTop: "9px",
    paddingBottom: "9px",
    paddingLeft: "14px",
    paddingRight: "14px",
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
    cursor: "pointer",
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
});

const actionLabel = (key: StatusActionKey, t: T): string => {
  switch (key) {
    case "traveling":
      return t("Status_Traveling", "Traveling");
    case "inprogress":
      return t("Status_InProgress", "In Progress");
    case "cancelled":
      return t("Status_Cancelled", "Cancelled");
    default:
      return key;
  }
};

const stop = (e: React.SyntheticEvent): void => e.stopPropagation();

/** Pick black or white pill text for a given hex background using the real WCAG contrast ratio
 *  (relative luminance with sRGB gamma), so configured mid-tone colours still get legible text. */
const readableText = (bg: string): string => {
  const m = /^#?([0-9a-f]{6})$/i.exec(bg.trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const chan = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * chan(n >> 16) + 0.7152 * chan((n >> 8) & 255) + 0.0722 * chan(n & 255);
  // Contrast ratio vs black = (L+0.05)/0.05; vs white = 1.05/(L+0.05). Pick the higher.
  return (L + 0.05) / 0.05 >= 1.05 / (L + 0.05) ? "#000000" : "#ffffff";
};

export interface BookingCardProps {
  vm: BookingCardVM;
  statusBusy: boolean;
  /** True while another card's status change is committing — freeze this card meanwhile. */
  boardBusy?: boolean;
  /** Why status changes are locked, if at all (undefined = not locked). */
  statusLockReason?: StatusLockReason;
  /** When true the card cannot be opened (no job started yet, or another job is active). */
  openDisabled: boolean;
  /** Tooltip explaining why opening is locked. */
  openLockHint?: string;
  /** Optional shared heading shown above the custom field values. */
  extrasTitle?: string;
  /** Lowercased priority-name → colour map (from the manifest). Empty = feature off. */
  priorityColours?: Record<string, string>;
  customStatusName?: string;
  /** Read-only mode (All Jobs tab): show the engineer, hide the status control. */
  readOnly?: boolean;
  onOpen: () => void;
  onOpenMaps: () => void;
  onChangeStatus: (action: StatusChoice) => void;
  t: T;
}

export const BookingCard: React.FC<BookingCardProps> = (props) => {
  const styles = useStyles();
  const [statusMenuOpen, setStatusMenuOpen] = React.useState(false);
  // The menu is position:fixed (see below) so the card's overflow:hidden can't clip it; menuPos is
  // computed from the button's rect on open.
  const [menuPos, setMenuPos] = React.useState<{ top: number; right: number } | null>(null);
  const statusWrapRef = React.useRef<HTMLDivElement>(null);
  // Close on any outside pointer-down, or on scroll (a fixed menu must not linger while the page
  // moves). No onBlur — blur would fire before an option's click and swallow it. The menu stays a
  // DOM child of statusWrap even though it renders fixed, so contains() still recognises option clicks.
  React.useEffect(() => {
    if (!statusMenuOpen) return;
    const close = (e: Event): void => {
      if (e.type === "scroll") { setStatusMenuOpen(false); return; }
      if (statusWrapRef.current && !statusWrapRef.current.contains(e.target as Node)) setStatusMenuOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      window.removeEventListener("scroll", close, true);
    };
  }, [statusMenuOpen]);
  const {
    vm, statusBusy, boardBusy, statusLockReason, openDisabled, openLockHint, extrasTitle, priorityColours, customStatusName,
    readOnly, onOpen, onOpenMaps, onChangeStatus, t,
  } = props;
  const statusDisabled = !!statusLockReason;
  // Another card is mid-commit: freeze this card so a second job can't be started in the gap.
  const busyElsewhere = !!boardBusy && !statusBusy;
  const openBlocked = openDisabled || busyElsewhere;

  // Priority colouring (only when a colour map is configured). The top border takes the
  // priority colour; the header shows a pill in that colour. Unmapped names get a neutral pill.
  const priorityOn = !!vm.priorityName && !!priorityColours && Object.keys(priorityColours).length > 0;
  const priorityColour = priorityOn ? priorityColours?.[vm.priorityName.toLowerCase()] : undefined;
  const lockedLabel =
    statusLockReason === "complete"
      ? t("StatusLockedComplete", "Locked (Complete)")
      : t("StatusLockedOther", "Locked (Other Open Job)");
  const lockedTitle =
    statusLockReason === "complete"
      ? t("StatusLockedCompleteTip", "This job is complete and can no longer be updated.")
      : t("StatusLocked", "Finish the active job before updating others.");

  // "Start Job" mode: this card is startable and not yet started (no active job). The control
  // reads "Start Job" and offers only the start actions (Travelling / In Progress) + the custom
  // option — not Cancelled. Once a job is active, the active card reverts to full "Update status".
  const isActiveCard = ACTIVE_FS_STATUSES.has(vm.fieldServiceStatus ?? -1);
  const startMode = !statusDisabled && !isActiveCard;
  const statusActions = startMode ? STATUS_ACTIONS.filter((a) => a.key !== "cancelled") : STATUS_ACTIONS;
  const placeholder = statusDisabled
    ? lockedLabel
    : startMode
    ? t("StartJob", "Start Job")
    : t("ChangeStatus", "Update status");

  return (
    <Card
      className={mergeClasses(styles.card, openBlocked && styles.cardLocked)}
      style={priorityColour ? { borderTopColor: priorityColour } : undefined}
      onClick={openBlocked ? undefined : onOpen}
      onKeyDown={
        openBlocked
          ? undefined
          : (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen();
              }
            }
      }
      role="button"
      tabIndex={openBlocked ? -1 : 0}
      aria-disabled={openBlocked || undefined}
      aria-label={vm.workOrderNumber}
      title={
        openDisabled
          ? openLockHint ?? t("OpenLocked", "Finish the active job before opening another.")
          : busyElsewhere
          ? t("Updating", "Updating status…")
          : undefined
      }
    >
      <div className={styles.headerRow}>
        <div className={styles.headerLeft}>
          <Text className={styles.woNumber}>{vm.workOrderNumber}</Text>
          {priorityOn ? (
            <span
              className={styles.priorityPill}
              style={
                priorityColour
                  ? { backgroundColor: priorityColour, color: readableText(priorityColour) }
                  : { backgroundColor: tokens.colorNeutralBackground3, color: tokens.colorNeutralForeground2 }
              }
            >
              {vm.priorityName}
            </span>
          ) : null}
        </div>
        <div className={styles.headerRight}>
          {vm.headerBadge ? (
            <span className={mergeClasses(styles.chip, styles.chipHeader)}>{vm.headerBadge}</span>
          ) : null}
          {vm.incidentType ? (
            <span className={mergeClasses(styles.chip, styles.chipIncident)}>{vm.incidentType}</span>
          ) : null}
        </div>
      </div>

      <div className={styles.divider} />

      {readOnly && vm.resourceName ? (
        <div className={styles.section}>
          <Text className={styles.label}>{t("Label_Engineer", "Engineer")}</Text>
          <Text className={styles.value}>{vm.resourceName}</Text>
        </div>
      ) : null}

      {vm.serviceAccount ? (
        <div className={styles.section}>
          <Text className={styles.label}>{t("Label_Customer", "Customer")}</Text>
          <Text className={styles.value}>{vm.serviceAccount}</Text>
        </div>
      ) : null}

      {vm.addressText || vm.latitude != null ? (
        <div className={styles.section}>
          <Text className={styles.label}>{t("Label_Address", "Address")}</Text>
          <Link
            className={styles.addressLink}
            onClick={(e) => {
              stop(e);
              onOpenMaps();
            }}
            aria-label={t("OpenInMaps", "Open in maps")}
          >
            <svg
              className={styles.pin}
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" />
            </svg>
            <span>{vm.addressText || t("ViewOnMap", "View on map")}</span>
          </Link>
        </div>
      ) : null}

      {vm.startText ? (
        <div className={styles.section}>
          <Text className={styles.label}>{t("Label_Start", "Start Date & Time")}</Text>
          <Text className={styles.value}>{vm.startText}</Text>
        </div>
      ) : null}

      {vm.travelText ? (
        <div className={styles.section}>
          <Text className={styles.label}>{t("Label_Travel", "Est. Travel")}</Text>
          <Text className={styles.value}>{vm.travelText}</Text>
        </div>
      ) : null}

      <div className={styles.section}>
        <Text className={styles.label}>{t("Label_Products", "Products Needed")}</Text>
        {vm.products.length > 0 ? (
          <div className={styles.products}>
            {vm.products.map((p) => (
              <Text key={p.id} className={styles.productRow}>
                {p.name}
                {p.quantity != null ? (
                  <span className={styles.productQty}>{`  ×${p.quantity}`}</span>
                ) : null}
              </Text>
            ))}
          </div>
        ) : (
          <Text className={styles.productQty}>{t("NoParts", "No Products Specified")}</Text>
        )}
      </div>

      {vm.extras.length > 0 ? (
        <div className={styles.section}>
          {extrasTitle ? <Text className={styles.label}>{extrasTitle}</Text> : null}
          {vm.extras.map((v, i) => (
            <Text key={i} className={styles.value}>{v}</Text>
          ))}
        </div>
      ) : null}

      <div className={styles.divider} />

      <div className={styles.footer} onClick={stop}>
        <Text className={styles.value}>
          {vm.bookingStatusName || t("StatusUnknown", "No status")}
        </Text>
        {readOnly ? null : statusBusy ? (
          <Spinner size="tiny" labelPosition="after" label={t("Updating", "Updating status…")} />
        ) : (
          <div className={styles.statusWrap} ref={statusWrapRef}>
            <button
              type="button"
              className={styles.statusSelect}
              disabled={statusDisabled || busyElsewhere}
              title={statusDisabled ? lockedTitle : undefined}
              aria-haspopup="menu"
              aria-expanded={statusMenuOpen}
              aria-label={t("ChangeStatus", "Update status")}
              onClick={(e) => {
                if (statusMenuOpen) { setStatusMenuOpen(false); return; }
                const rect = e.currentTarget.getBoundingClientRect();
                const menuH = 140;
                const openBelow = rect.bottom + menuH + 8 <= window.innerHeight;
                setMenuPos({
                  top: openBelow ? rect.bottom + 4 : Math.max(4, rect.top - menuH - 4),
                  right: Math.max(4, window.innerWidth - rect.right),
                });
                setStatusMenuOpen(true);
              }}
            >
              <span>{placeholder}</span>
              <span className={styles.caret} aria-hidden="true">&#9662;</span>
            </button>
            {statusMenuOpen && menuPos ? (
              <div
                className={styles.statusMenu}
                role="menu"
                style={{ position: "fixed", top: menuPos.top, right: menuPos.right }}
              >
                {statusActions.map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    role="menuitem"
                    className={styles.statusMenuItem}
                    onClick={() => {
                      setStatusMenuOpen(false);
                      onChangeStatus(a.key);
                    }}
                  >
                    {actionLabel(a.key, t)}
                  </button>
                ))}
                {customStatusName ? (
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.statusMenuItem}
                    onClick={() => {
                      setStatusMenuOpen(false);
                      onChangeStatus("custom");
                    }}
                  >
                    {customStatusName}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </Card>
  );
};
