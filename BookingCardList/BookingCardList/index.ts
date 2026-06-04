import * as React from "react";
import { IInputs, IOutputs } from "./generated/ManifestTypes";
import { BookingApp, BookingAppProps } from "./components/BookingApp";
import { BookingDataService } from "./services/dataverse";
import { CustomStatus, MapsProvider, ExtraFieldSpec, parseExtraField } from "./types";

export class BookingCardList
  implements ComponentFramework.ReactControl<IInputs, IOutputs>
{
  private notifyOutputChanged: () => void;
  private service?: BookingDataService;

  public init(
    context: ComponentFramework.Context<IInputs>,
    notifyOutputChanged: () => void
  ): void {
    this.notifyOutputChanged = notifyOutputChanged;
    context.mode.trackContainerResize(true);
  }

  public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
    this.service ??= new BookingDataService(context);
    const theme = (context as unknown as { fluentDesignLanguage?: { tokenTheme?: unknown } })
      .fluentDesignLanguage?.tokenTheme;

    const name = (v: string | null | undefined, fallback: string): string => {
      const s = (v ?? "").trim();
      return s.length ? s : fallback;
    };

    const props: BookingAppProps = {
      dataset: context.parameters.bookings,
      service: this.service,
      theme: theme as BookingAppProps["theme"],
      defaultTabNames: [
        name(context.parameters.tab1Name?.raw, "Today"),
        name(context.parameters.tab2Name?.raw, "Tomorrow"),
        name(context.parameters.tab3Name?.raw, "Complete"),
      ],
      customStatus: this.customStatus(context),
      mapsProvider: this.mapsProvider(context),
      extraFields: this.extraFields(context),
      extrasTitle: (context.parameters.extraFieldsTitle?.raw ?? "").trim(),
      openItem: (id) => this.openItem(context, id),
      openUrl: (url) => context.navigation.openUrl(url),
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

  private customStatus(context: ComponentFramework.Context<IInputs>): CustomStatus | undefined {
    const name = (context.parameters.customStatusName?.raw ?? "").trim();
    if (!name) return undefined;
    const bookingStatusId = (context.parameters.customBookingStatusId?.raw ?? "").trim();
    const workOrderSubStatusId = (context.parameters.customWorkOrderSubStatusId?.raw ?? "").trim();
    return {
      name,
      bookingStatusId: bookingStatusId || undefined,
      workOrderSubStatusId: workOrderSubStatusId || undefined,
    };
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
