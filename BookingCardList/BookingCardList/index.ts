import * as React from "react";
import { IInputs, IOutputs } from "./generated/ManifestTypes";
import { BookingApp, BookingAppProps } from "./components/BookingApp";
import { BookingDataService } from "./services/dataverse";
import { MapsProvider, ExtraFieldSpec, parseExtraField, parsePriorityColours } from "./types";

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
      service: this.service,
      theme: theme as BookingAppProps["theme"],
      defaultTabNames: [
        name(context.parameters.activeTabName?.raw, "Active"),
        name(context.parameters.tab1Name?.raw, "Today"),
        name(context.parameters.tab2Name?.raw, "Tomorrow"),
        name(context.parameters.tab3Name?.raw, "Complete"),
      ],
      mapsProvider: this.mapsProvider(context),
      allJobsEnabled: context.parameters.allJobsTabEnabled?.raw === true,
      allJobsName: name(context.parameters.allJobsTabName?.raw, "All Jobs"),
      allJobsDays: this.allJobsDays(context),
      extraFields: this.extraFields(context),
      extrasTitle: (context.parameters.extraFieldsTitle?.raw ?? "").trim(),
      headerField: parseExtraField(context.parameters.headerField?.raw) ?? undefined,
      priorityColours: parsePriorityColours(context.parameters.priorityColours?.raw),
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
