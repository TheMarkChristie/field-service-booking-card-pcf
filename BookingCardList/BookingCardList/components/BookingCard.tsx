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
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: "8px",
  },
  headerLeft: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    columnGap: "8px",
    minWidth: 0,
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
  },
  // Header pill (incident type / header badge). Unlike Fluent's Badge it has no fixed height,
  // so multi-line text wraps and the pill grows to fit instead of clipping.
  chip: {
    display: "inline-block",
    boxSizing: "border-box",
    maxWidth: "200px",
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
  statusSelect: {
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
    paddingRight: "8px",
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    cursor: "pointer",
    ":disabled": {
      opacity: 0.6,
      cursor: "default",
    },
  },
  aaSection: {
    display: "flex",
    flexDirection: "column",
    rowGap: "8px",
  },
  checkRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    columnGap: "8px",
    cursor: "pointer",
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
  },
  reqStar: {
    color: tokens.colorPaletteRedForeground1,
    marginLeft: "2px",
  },
  reqHint: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorPaletteRedForeground1,
  },
  lookupSelect: {
    width: "100%",
    boxSizing: "border-box",
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    borderTopWidth: "1px",
    borderRightWidth: "1px",
    borderBottomWidth: "1px",
    borderLeftWidth: "1px",
    borderTopStyle: "solid",
    borderRightStyle: "solid",
    borderBottomStyle: "solid",
    borderLeftStyle: "solid",
    borderTopColor: tokens.colorNeutralStroke1,
    borderRightColor: tokens.colorNeutralStroke1,
    borderBottomColor: tokens.colorNeutralStroke1,
    borderLeftColor: tokens.colorNeutralStroke1,
    borderRadius: "4px",
    paddingTop: "6px",
    paddingBottom: "6px",
    paddingLeft: "8px",
    paddingRight: "8px",
    fontSize: tokens.fontSizeBase300,
  },
  addRow: {
    display: "flex",
    flexDirection: "row",
    columnGap: "6px",
  },
  addInput: {
    flexGrow: 1,
    boxSizing: "border-box",
    borderTopWidth: "1px",
    borderRightWidth: "1px",
    borderBottomWidth: "1px",
    borderLeftWidth: "1px",
    borderTopStyle: "solid",
    borderRightStyle: "solid",
    borderBottomStyle: "solid",
    borderLeftStyle: "solid",
    borderTopColor: tokens.colorNeutralStroke1,
    borderRightColor: tokens.colorNeutralStroke1,
    borderBottomColor: tokens.colorNeutralStroke1,
    borderLeftColor: tokens.colorNeutralStroke1,
    borderRadius: "4px",
    paddingTop: "6px",
    paddingBottom: "6px",
    paddingLeft: "8px",
    paddingRight: "8px",
    fontSize: tokens.fontSizeBase300,
  },
  addBtn: {
    flexShrink: 0,
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    borderTopStyle: "none",
    borderRightStyle: "none",
    borderBottomStyle: "none",
    borderLeftStyle: "none",
    borderRadius: "4px",
    paddingLeft: "12px",
    paddingRight: "12px",
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    cursor: "pointer",
  },
});

/** Sentinel value for the "add new asset" option in the asset dropdown. */
const ADD_ASSET = "__add__";

export interface CardAgreementAsset {
  showUnderAgreement: boolean;
  showAgreement: boolean;
  showAsset: boolean;
  onSetUnderAgreement: (value: boolean) => void;
  onSetAgreement: (agreementId: string) => void;
  onSetAsset: (assetId: string) => void;
  onAddAsset: (name: string) => void;
}

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

/** Pick black or white text for a given hex background, by perceived luminance. */
const readableText = (bg: string): string => {
  const m = /^#?([0-9a-f]{6})$/i.exec(bg.trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? "#000000" : "#ffffff";
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
  /** Agreement & Asset section (undefined hides it). Data comes from vm.agreementAsset. */
  agreementAsset?: CardAgreementAsset;
  onOpen: () => void;
  onOpenMaps: () => void;
  onChangeStatus: (action: StatusChoice) => void;
  t: T;
}

export const BookingCard: React.FC<BookingCardProps> = (props) => {
  const styles = useStyles();
  const {
    vm, statusBusy, boardBusy, statusLockReason, openDisabled, openLockHint, extrasTitle, priorityColours, customStatusName,
    readOnly, agreementAsset, onOpen, onOpenMaps, onChangeStatus, t,
  } = props;
  const [addingAsset, setAddingAsset] = React.useState(false);
  const [newAssetName, setNewAssetName] = React.useState("");
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
      aria-label={vm.workOrderNumber}
      title={
        openDisabled
          ? openLockHint ?? t("OpenLocked", "Finish the active job before opening another.")
          : busyElsewhere
          ? t("Updating", "Updating…")
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
          <Spinner size="tiny" labelPosition="after" label={t("Updating", "Updating…")} />
        ) : (
          <select
            className={styles.statusSelect}
            value=""
            disabled={statusDisabled || busyElsewhere}
            title={statusDisabled ? lockedTitle : undefined}
            aria-label={t("ChangeStatus", "Update status")}
            onChange={(e) => {
              const v = e.target.value;
              if (v) onChangeStatus(v as StatusChoice);
            }}
          >
            <option value="">{placeholder}</option>
            {statusActions.map((a) => (
              <option key={a.key} value={a.key}>
                {actionLabel(a.key, t)}
              </option>
            ))}
            {customStatusName ? <option value="custom">{customStatusName}</option> : null}
          </select>
        )}
      </div>

      {agreementAsset && !readOnly ? (
        <div className={styles.aaSection} onClick={stop}>
          <div className={styles.divider} />

          {agreementAsset.showUnderAgreement ? (
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={!!vm.agreementAsset?.underAgreement}
                onChange={(e) => agreementAsset.onSetUnderAgreement(e.target.checked)}
              />
              {t("Label_UnderAgreement", "Under Agreement")}
            </label>
          ) : null}

          {agreementAsset.showAgreement && vm.agreementAsset?.underAgreement ? (
            <div className={styles.section}>
              <Text className={styles.label}>{t("Label_Agreement", "Agreement")}</Text>
              <select
                className={styles.lookupSelect}
                aria-label={t("Label_Agreement", "Agreement")}
                value={vm.agreementAsset?.agreementId ?? ""}
                onChange={(e) => agreementAsset.onSetAgreement(e.target.value)}
              >
                <option value="">{t("NonePlaceholder", "— none —")}</option>
                {(vm.agreementAsset?.agreementOptions ?? []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {agreementAsset.showAsset ? (
            <div className={styles.section}>
              <Text className={styles.label}>
                {t("Label_Asset", "Asset")}
                <span className={styles.reqStar}>*</span>
              </Text>
              {addingAsset ? (
                <div className={styles.addRow}>
                  <input
                    className={styles.addInput}
                    aria-label={t("NewAssetName", "New asset name")}
                    value={newAssetName}
                    placeholder={t("NewAssetName", "New asset name")}
                    onChange={(e) => setNewAssetName(e.target.value)}
                  />
                  <button
                    type="button"
                    className={styles.addBtn}
                    onClick={() => {
                      const name = newAssetName.trim();
                      if (name) {
                        agreementAsset.onAddAsset(name);
                        setNewAssetName("");
                        setAddingAsset(false);
                      }
                    }}
                  >
                    {t("Add", "Add")}
                  </button>
                </div>
              ) : (
                <select
                  className={styles.lookupSelect}
                  aria-label={t("Label_Asset", "Asset")}
                  value={vm.agreementAsset?.assetId ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === ADD_ASSET) {
                      setAddingAsset(true);
                      return;
                    }
                    agreementAsset.onSetAsset(v);
                  }}
                >
                  <option value="">{t("NonePlaceholder", "— none —")}</option>
                  {(vm.agreementAsset?.assetOptions ?? []).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                  <option value={ADD_ASSET}>{t("AddNewAsset", "+ Add new asset…")}</option>
                </select>
              )}
              {!vm.agreementAsset?.assetId && !addingAsset ? (
                <Text className={styles.reqHint}>{t("AssetRequired", "Asset is required")}</Text>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
};
