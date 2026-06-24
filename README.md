# Booking Card List — Field Service PCF control

A React (virtual) **dataset** PowerApps Component Framework (PCF) control for the **Field
Service mobile** app. It shows an engineer's Bookable Resource Bookings as rich, tappable
**cards** grouped into **Today / Tomorrow / Complete** tabs, and lets the engineer update a
booking's status inline.

- **Control:** `Proximo3.FieldService.BookingCardList`
- **Publisher prefix:** `prx3`
- **Current version:** `0.0.31`
- **Platform libraries:** React 16.14 + Fluent UI v9 (provided by the platform — not bundled)

---

## Documentation

Branded HTML guides (open in a browser — GitHub shows raw HTML when a file is clicked):

- **[User Guide](BookingCardList/docs/User-Guide.html)** — for engineers: using the booking board day to day.
- **[Install & Configuration](BookingCardList/docs/Install-and-Configuration.html)** — for makers/admins: setup and every property.

> The proprietary brand fonts (Gotham HTF / Agency FB) are omitted from this public repo for licensing; the guides fall back to Montserrat.

---

## What it does

Each booking renders as a card showing:

| Element | Source |
|---|---|
| Work Order number | `msdyn_workorder.msdyn_name` |
| Incident Type (chip) | `msdyn_workorder.msdyn_primaryincidenttype` |
| Customer | `msdyn_workorder.msdyn_serviceaccount` |
| Address (link → maps, with 📍 icon) | `msdyn_workorder` address fields / lat-long |
| Start Date & Time | `bookableresourcebooking.starttime` |
| Est. Travel | `bookableresourcebooking.msdyn_estimatedtravelduration` |
| Products Needed | related `msdyn_workorderproduct` rows (or *"No Products Specified"*) |
| Booking Status | `bookableresourcebooking.bookingstatus` |

Behaviour:

- **Tabs** — *Active*, *Today*, *Tomorrow*, *Complete*, each with a count badge. The control queries
  the signed-in user's own bookings itself and sorts them into the tabs — **no system views to set
  up** (see [Tabs & how bookings are loaded](#tabs--how-bookings-are-loaded)). The **Active** tab
  holds the started (Traveling / In Progress) job and is shown first.
- **Tap a card** → opens the booking record.
- **Tap the address** → opens the native maps app at that location.
- **Update status** dropdown → Traveling / In Progress / Cancelled, plus an optional
  **custom** option you configure. Selecting one writes the booking's status (and, for the
  custom option, the work order's sub-status).
- **Start-to-open focus lock** — jobs are **locked until you start one**. Every non-terminal card
  **cannot be opened** until it is set to **Traveling** or **In Progress**, so the day begins fully
  locked. Starting a job opens that one and keeps the rest locked (their status dropdowns disable
  too, including the *Tomorrow* tab) until it is finished; completing it re-locks the others until
  the next is started. The status dropdown stays usable on a locked card so a job can be started
  from it — before anything is started it reads **Start Job** (Travelling / In Progress / your
  custom option — no Cancel).
- **Completed / Cancelled are terminal** — their status can no longer be changed, but the card can
  still be opened to view the record.
- **Custom fields** — up to three extra columns can be shown on each card (see [Custom fields](#custom-fields)).
- **Modern theming** — follows the app's theme, including modern theme overrides and dark mode
  (via `context.fluentDesignLanguage.tokenTheme`).
- **Responsive** — single column on a phone, multiple columns on a wide screen.
- **Offline-capable** — all reads/writes go through `context.webAPI`, which resolves against
  the mobile offline store when offline. Every query is **flat FetchXML** (not OData `$filter`,
  and **no `link-entity` joins**) so it's valid in all modes: classic offline rejects OData
  `_lookup_value` filters/selects, and the new **offline-first** engine rejects inner/outer joins
  ("Specified FetchXML is invalid"). Related ids (the user's resource, active statuses) are
  resolved with their own flat queries, then bookings are filtered with `in` / date conditions.
  Same code runs offline-first, classic offline and online. Requires `bookableresource`,
  `bookableresourcebooking` and (for the always-show-active safety net) `bookingstatus` in the
  offline profile.

---

## Configuration (control properties)

Set these in the form/subgrid designer when you add the control (App designer → the control's
**Properties**). All are optional.

| Property | Type | Purpose |
|---|---|---|
| **Active Tab Name (default)** | Text | Label for the first tab (the started Traveling/In Progress job). Default `Active`. |
| **Tab 1 Name (default)** | Text | Label for tab 1. Default `Today`. |
| **Tab 2 Name (default)** | Text | Label for tab 2. Default `Tomorrow`. |
| **Tab 3 Name (default)** | Text | Label for tab 3. Default `Complete`. |
| **Extra Field 1 / 2 / 3 (column name)** | Text | Up to three extra columns to show on each card. See [Custom fields](#custom-fields). |
| **Custom Fields Heading** | Text | Optional heading shown above the custom field values (one for all three); appears only when at least one value is present. |
| **Priority Colours** | Text | Colour the card's top border and show a priority pill, by Work Order priority (`msdyn_priority`). Format: `High=#D13438;Medium=#F7A600;Low=#107C10`. Blank = off. |
| **Header Badge Field** | Text | A Work Order / booking column shown as a badge in the card header (e.g. job type — domestic/commercial). Prefix `workorder.` for a WO field; lookups use `_logicalname_value`. Blank = off. |
| **Maps Provider** | Choice | Which maps app the address opens: Google (default), Bing, or Apple. |
| **Show All Engineers Tab** | Choice (No/Yes) | Add a final read-only tab listing **all engineers'** bookings for the next N days. Default `No`. |
| **All Jobs Tab Name (default)** | Text | Label for the All Jobs tab. Default `All Jobs`. |
| **All Jobs: Days Ahead** | Whole Number | How many days ahead (from today) the All Jobs tab covers. Default `7`. |

> **Custom "Start Job" status — configured on Field Service Settings, not the control.** The extra
> status option's label and target IDs are read from the **Field Service Settings** record
> (`msdyn_fieldservicesetting`) so the GUIDs travel with the environment (the same pattern the
> `EnsureSingleRunningBooking` plugin uses for its paused sub-status). Add these columns to
> `msdyn_fieldservicesetting`: **`prx3_custombookingstatus`** (lookup → `bookingstatus`, required to
> enable the option), **`prx3_customworkordersubstatus`** (lookup → `msdyn_workordersubstatus`,
> optional), and **`prx3_customstatuslabel`** (text; falls back to the booking-status name). When
> `prx3_custombookingstatus` is empty, the custom option is hidden. *(Before 0.0.23 these were three
> manifest properties on the control; they were removed in 0.0.23 in favour of Field Service Settings.)*

### Custom fields

`Extra Field 1..3` surface up to three extra columns on each card with no code change. Enter a
column **logical name**; the field's **value** is shown (no caption), and the row is hidden when the
property is blank or the value is empty.

- Default source is the **booking** (`bookableresourcebooking`).
- Prefix with `workorder.` (or `wo.`) to read from the related **Work Order** — e.g.
  `workorder.prx3_riskcategory`. `booking.` / `brb.` is also accepted explicitly.
- Choices, dates, money and similar render via their **formatted value** automatically. For a
  **lookup** column, enter its `_logicalname_value` form (e.g. `_prx3_site_value`).
- Custom fields are fetched in an isolated, FormattedValue-aware query: a typo'd/invalid name
  degrades gracefully (that row is skipped) instead of breaking the card.
- Set **Custom Fields Heading** to show a single caption (styled like *Est. Travel* / *Products
  Needed*) above the values. The whole block — heading included — only renders when at least one
  custom value is present.

### Tabs & how bookings are loaded

**No system views are required.** The control loads its own data in code:

1. It resolves the **signed-in user's Bookable Resource** (`bookableresource` where `userid` is the
   current user).
2. It runs one query for that resource's bookings from `COMPLETE_WINDOW_DAYS` before today up to the
   end of tomorrow.
3. [`bucketOf()`](BookingCardList/BookingCardList/types.ts) sorts each booking into a tab:
   **Active** if it's Traveling/In Progress, then **Complete** if it's Completed/Cancelled,
   otherwise **Today** or **Tomorrow** by start date.

- The **Active** tab (first) holds the started job — a Traveling / In Progress booking, regardless of
  its date. The control lands on this tab on open when a job is already started, otherwise on Today.
- The **Complete** tab shows finished jobs from the last **`COMPLETE_WINDOW_DAYS`** days (default `7`,
  by job start date), set in [`BookingCardList/types.ts`](BookingCardList/BookingCardList/types.ts).
  Change it there and redeploy.
- Because the control self-queries, **the view/subgrid it's placed on does not drive the card
  content** — bind it to anything.
- Requires `bookableresource` and `bookableresourcebooking` to be in the **mobile offline profile**
  (booking already is; add the resource table if it isn't) so it works offline.
- The tab **labels** are configurable via the Active / Tab 1 / Tab 2 / Tab 3 Name properties.
- **All Jobs tab (optional).** When **Show All Jobs Tab** is on, a final tab lists **all engineers'**
  bookings from today to *Days Ahead* days out, ordered by start time, each card showing the
  **Engineer**. It's **read-only** (open a card to view, but no status changes) and is kept separate
  from your own bookings, so other engineers' active jobs don't affect your focus lock. It's
  **online-oriented** — the mobile offline profile usually only holds your own bookings, so this tab
  will be sparse or empty offline.

### Getting the GUIDs for the custom option

Paste these in a browser (signed in), and copy the GUID you want:

```
Booking statuses:
<org-url>/api/data/v9.2/bookingstatuses?$select=name,bookingstatusid,msdyn_fieldservicestatus&$filter=statecode eq 0&$orderby=name

Work Order sub-statuses:
<org-url>/api/data/v9.2/msdyn_workordersubstatuses?$select=msdyn_name,msdyn_workordersubstatusid,msdyn_systemstatus&$filter=statecode eq 0&$orderby=msdyn_name
```

---

## How an engineer uses it

1. Open the area/page hosting the control. The **Today** tab is selected by default; **Tomorrow**
   and **Complete** show their own counts.
2. **Scroll** the cards; **tap a card** to open the full booking.
3. **Tap the address** (the link with the 📍) to navigate in maps.
4. **Update status** — pick Traveling / In Progress / Cancelled (or your custom option). The card
   refreshes to show the new status.
5. While a job is **Traveling/In Progress**, other cards are **locked** — you can't open them or
   change their status (even Tomorrow's) — finish (or cancel) the active job first. A **Completed**
   job is read-only for status but can still be opened.

---

## Status update logic

- **Traveling / In Progress / Cancelled** — the control finds the active `bookingstatus` record
  whose `msdyn_fieldservicestatus` matches (690970001 / 690970003 / 690970005) and sets the
  booking's **Booking Status** lookup. Field Service's own logic then handles timestamps and the
  work-order status rollup.
- **Custom option** — sets the booking's **Booking Status** to your configured GUID and/or the
  work order's **Sub-Status** (`msdyn_substatus`) to your configured GUID (which cascades the WO
  System Status in FS). Either GUID is optional.

---

## Build, package & deploy

Prerequisites: Node LTS, npm, Power Platform CLI (`pac`), .NET SDK.

```powershell
# Control
cd BookingCardList
npm install
npm run build            # compile + lint + bundle
npm start watch          # optional local harness (mock data only)

# Solution package
cd ..\Solution
dotnet build -c Debug    # -> bin\Debug\Solution.zip   (unmanaged, for dev)
dotnet build -c Release  # -> bin\Release\Solution.zip (managed, for test/prod)

# Import
pac auth create --environment https://<org>.crm11.dynamics.com
pac solution import --path Solution\bin\Debug\Solution.zip --publish-changes
```

> The manifest declares Fluent as **9.46.2** (a platform-supported version). Newer locally
> installed Fluent is fine for building, but the declared platform-library version must be one
> the environment supports or import fails.

### Add it to the app

1. Put a **Bookable Resource Booking subgrid** on the form / custom page used by the mobile app
   (or set the control as a view's grid control).
2. In the subgrid's **Components**, add **Booking Card List** and enable it for the **Phone**
   form factor.
3. Set the control properties as needed (custom status, maps provider, tab names).
4. Create the three system views named exactly as in `TAB_VIEW_NAMES`.

### Offline

For offline use on Field Service Mobile, ensure these tables are in the mobile **offline
profile** (the default FS profile already includes them): `bookableresourcebooking`,
`msdyn_workorder`, `msdyn_workorderproduct`, `bookingstatus`, `msdyn_workordersubstatus`,
`account`, `msdyn_incidenttype`, `savedquery`.

---

## Architecture

| File | Role |
|---|---|
| [`index.ts`](BookingCardList/BookingCardList/index.ts) | Control lifecycle; reads manifest props + host theme; renders `BookingApp`. |
| [`components/BookingApp.tsx`](BookingCardList/BookingCardList/components/BookingApp.tsx) | Owns data + state (hooks): runs the views, buckets bookings into tabs, computes the active-job lock, handles status changes. |
| [`components/BookingList.tsx`](BookingCardList/BookingCardList/components/BookingList.tsx) | Tab bar + scrollable card grid + loading/empty/error states; wraps the host theme in a `FluentProvider`. |
| [`components/BookingCard.tsx`](BookingCardList/BookingCardList/components/BookingCard.tsx) | A single card and its status dropdown. |
| [`components/ErrorBoundary.tsx`](BookingCardList/BookingCardList/components/ErrorBoundary.tsx) | Surfaces render errors instead of a blank control. |
| [`services/dataverse.ts`](BookingCardList/BookingCardList/services/dataverse.ts) | All `context.webAPI` calls (flat `retrieveMultiple`, no `$expand`); runs views via FetchXML; status writes. |
| [`types.ts`](BookingCardList/BookingCardList/types.ts) | View models, FS status values, `TAB_VIEW_NAMES`, bucketing. |
| [`util/maps.ts`](BookingCardList/BookingCardList/util/maps.ts) | Maps-URL builder + error helper. |
| `strings/BookingCardList.1033.resx` | Localised display strings. |

Data flow: each tab's view → FetchXML → booking ids → one batched detail fetch (bookings →
work orders → products → status FS values), merged into card view models. Status changes write
via `updateRecord` then re-query the affected booking.

---

## Key schema (logical names)

| Concept | Table / column |
|---|---|
| Booking | `bookableresourcebooking` (set `bookableresourcebookings`) |
| Booking → Work Order | `msdyn_workorder` |
| Booking → Booking Status | `bookingstatus` (nav `BookingStatus`, set `bookingstatuses`) |
| Start / travel | `starttime`, `msdyn_estimatedtravelduration` |
| Work Order | `msdyn_workorder` — `msdyn_name`, `msdyn_serviceaccount`, `msdyn_primaryincidenttype`, address fields |
| Work Order → Sub-Status | `msdyn_substatus` (→ `msdyn_workordersubstatus`, set `msdyn_workordersubstatuses`) |
| Work Order Products | `msdyn_workorderproduct` (`msdyn_workorder`, `msdyn_name`, `msdyn_estimatequantity`) |
| Booking Status | `bookingstatus` — `msdyn_fieldservicestatus` (Scheduled 690970000, Traveling …001, On Break …002, In Progress …003, Completed …004, Canceled …005) |

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| A tab is empty | The view name doesn't match `TAB_VIEW_NAMES` exactly (watch hyphen vs en-dash, spaces). Fix the view name or the constant. |
| Cards don't update after deploy | The mobile app caches PCF bundles — hard-refresh (Ctrl+Shift+R) or reopen the app. The manifest version is bumped each release to bust cache. |
| Errors are invisible | The control logs `[BookingCardList] …` to the browser console (F12) and shows a red banner on the card area. |
| Custom option doesn't write the WO status | Confirm the GUID is a `msdyn_workordersubstatus` record and the booking has a work order. If the write throws on the `msdyn_substatus` nav property, it may need PascalCase `msdyn_SubStatus`. |
| Theme looks wrong | The control follows the app's modern theme; ensure the app uses the "new look". |


