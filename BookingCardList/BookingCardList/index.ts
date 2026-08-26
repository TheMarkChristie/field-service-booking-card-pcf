import * as React from "react";
import { IInputs, IOutputs } from "./generated/ManifestTypes";
import { BookingApp, BookingAppProps } from "./components/BookingApp";
import { BookingDataService } from "./services/dataverse";
import { buildCardsFromDataset } from "./services/datasetMap";
import { BookingCardVM, CustomStatus, MapsProvider, ExtraFieldSpec, parseExtraField, parsePriorityColours } from "./types";

export class BookingCardList
  implements ComponentFramework.ReactControl<IInputs, IOutputs>
{
  private notifyOutputChanged: () => void;
  private service?: BookingDataService;
  // Last non-empty set of cards, kept so an offline dataset re-query that returns nothing doesn't
  // blank the whole board (see updateView).
  private lastCards: BookingCardVM[] = [];

  public init(
    context: ComponentFramework.Context<IInputs>,
    notifyOutputChanged: () => void
  ): void {
    this.notifyOutputChanged = notifyOutputChanged;
    context.mode.trackContainerResize(true);
  }

  public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
    this.service ??= new BookingDataService(context);
    const service = this.service;
    const theme = (context as unknown as { fluentDesignLanguage?: { tokenTheme?: unknown } })
      .fluentDesignLanguage?.tokenTheme;

    // Offline-first: build the cards from the BOUND DATASET (the configured Bookings view), which
    // the Field Service mobile app serves from its local store. The Web API self-query can't resolve
    // the signed-in resource offline, so the dataset is the source of truth; enrichCards() then adds
    // products / extras online. Every displayed field must be a column in the bound view.
    let datasetBookings = buildCardsFromDataset(context.parameters.bookings, {
      formatStart: (d) => service.fmtStart(d),
      formatDuration: (m) => service.fmtDuration(m),
      parseDate: (iso) => service.parseIso(iso),
    });
    // Offline, the platform can re-query the bound view against the local store and return NOTHING
    // (the "my bookings" filter not resolving offline, or a transient re-query on the online->offline
    // switch) — which would blank the entire board. Keep the last-good cards on screen when the
    // dataset comes back empty while offline, rather than vanishing every job.
    if (datasetBookings.length > 0) {
      this.lastCards = datasetBookings;
    } else if (this.lastCards.length > 0 && service.isDeviceOffline()) {
      datasetBookings = this.lastCards;
    }

    const name = (v: string | null | undefined, fallback: string): string => {
      const s = (v ?? "").trim();
      return s.length ? s : fallback;
    };

    const props: BookingAppProps = {
      service,
      datasetBookings,
      theme: theme as BookingAppProps["theme"],
      defaultTabNames: [
        name(context.parameters.activeTabName?.raw, "Active"),
        name(context.parameters.tab1Name?.raw, "Today"),
        name(context.parameters.tab2Name?.raw, "Tomorrow"),
        name(context.parameters.tab3Name?.raw, "Complete"),
      ],
      mapsProvider: this.mapsProvider(context),
      allJobsEnabled: (context.parameters.allJobsTabEnabled?.raw ?? "0").toString() === "1",
      allJobsName: name(context.parameters.allJobsTabName?.raw, "All Jobs"),
      allJobsDays: this.allJobsDays(context),
      extraFields: this.extraFields(context),
      extrasTitle: (context.parameters.extraFieldsTitle?.raw ?? "").trim(),
      headerField: parseExtraField(context.parameters.headerField?.raw) ?? undefined,
      priorityColours: parsePriorityColours(context.parameters.priorityColours?.raw),
      controlConfig: this.controlConfig(context),
      openItem: (id) => this.openItem(context, id),
      openUrl: (url) => context.navigation.openUrl(url),
      // Re-query the bound dataset from the platform (server online / local store offline) after a
      // write, so the board reflects the change instead of re-rendering stale dataset rows.
      refreshDataset: () => context.parameters.bookings.refresh(),
      t: (key, fallback) => this.localize(context, key, fallback),
    };

    return React.createElement(BookingApp, props);
  }

  public getOutputs(): IOutputs {
    return {};
  }

  public destroy(): void {
    // React tree is unmounted by the platform; nothing to clean up.
  }

  private openItem(context: ComponentFramework.Context<IInputs>, bookingId: string): void {
    const ds = context.parameters.bookings;
    const record = ds.records[bookingId];
    if (record && typeof ds.openDatasetItem === "function") {
      ds.openDatasetItem(record.getNamedReference());
    } else {
      void context.navigation.openForm({
        entityName: "bookableresourcebooking",
        entityId: bookingId,
      });
    }
  }

  private allJobsDays(context: ComponentFramework.Context<IInputs>): number {
    const n = context.parameters.allJobsDays?.raw;
    return typeof n === "number" && n > 0 ? Math.floor(n) : 7;
  }

  private extraFields(context: ComponentFramework.Context<IInputs>): ExtraFieldSpec[] {
    return [
      context.parameters.extraField1?.raw,
      context.parameters.extraField2?.raw,
      context.parameters.extraField3?.raw,
    ]
      .map(parseExtraField)
      .filter((x): x is ExtraFieldSpec => !!x);
  }

  private mapsProvider(context: ComponentFramework.Context<IInputs>): MapsProvider {
    const raw = (context.parameters.mapsProvider?.raw ?? "").toString();
    if (raw === "1" || raw === "bing") return "bing";
    if (raw === "2" || raw === "apple") return "apple";
    return "google";
  }

  /** When Configuration Source = "This control", read the day windows + custom status from the
   *  control's own manifest properties (self-contained; no Field Service Settings read, so it is
   *  fully offline-safe). Returns undefined for the default source, where BookingApp reads the
   *  Field Service Settings record as before. */
  private controlConfig(context: ComponentFramework.Context<IInputs>): BookingAppProps["controlConfig"] {
    const src = (context.parameters.configSource?.raw ?? "0").toString();
    if (src !== "1" && src !== "control") return undefined;
    const days = (v: number | null | undefined): number | undefined =>
      typeof v === "number" && v > 0 ? Math.floor(v) : undefined;
    const text = (v: string | null | undefined): string | undefined => {
      const s = (v ?? "").trim();
      return s.length ? s : undefined;
    };
    const bookingStatusId = text(context.parameters.customBookingStatusId?.raw);
    const customStatus: CustomStatus | undefined = bookingStatusId
      ? {
          name: text(context.parameters.customStatusLabel?.raw) ?? "Custom",
          bookingStatusId,
          workOrderSubStatusId: text(context.parameters.customSubStatusId?.raw),
        }
      : undefined;
    return {
      activeDays: days(context.parameters.activeBookingDays?.raw),
      completedDays: days(context.parameters.completedBookingDays?.raw),
      nextDays: days(context.parameters.nextBookingDays?.raw),
      customStatus,
    };
  }

  private localize(
    context: ComponentFramework.Context<IInputs>,
    key: string,
    fallback: string
  ): string {
    try {
      const s = context.resources.getString(key);
      return s && s !== key ? s : fallback;
    } catch {
      return fallback;
    }
  }
}
