# BookingCardList — Release notes

## v0.0.34 — 2026-06-24  ·  DevSync
**Summary:** Agreement & Asset section at the bottom of each card — Under Agreement tick → customer-filtered Agreement, functional-location-filtered Asset (required, with quick-create), writing to manifest-mapped Work Order columns.

### Changed
- New per-card section (shown when its columns are mapped): **Under Agreement** tick → **Agreement** dropdown (the customer's agreements), and **Asset** dropdown (required) filtered to the Work Order's functional location, with **+ Add new asset** quick-create. Selections write back to the mapped Work Order columns immediately. Hidden on the read-only All Engineers tab.
- Lookups use flat FetchXML (offline-safe); option lists are batch-loaded across visible cards.

### Config / breaking
- New manifest properties (Work Order column logical names): **Under Agreement: Work Order column** (`underAgreementField`), **Agreement: Work Order column** (`agreementField`, default `msdyn_agreement`), **Asset: Work Order column** (`assetField`, default `msdyn_primarycustomerasset`), **Functional Location: Work Order column** (`functionalLocationField`, default `msdyn_functionallocation`).
- Filters: agreements by `msdyn_serviceaccount`, assets by `msdyn_functionallocation` (standard FS). Add `msdyn_agreement` / `msdyn_customerasset` / `msdyn_functionallocation` to the offline profile for offline use. Re-add the control on the form to surface the new properties.

## v0.0.33 — 2026-06-24  ·  DevSync
**Summary:** Configurable Active-tab lookback — active jobs older than N days are ignored so a stale open job can't block new work; leave blank for no limit.

### Changed
- New manifest property **Active: Days Back** (`activeDays`, whole number). An active (Traveling/In Progress) booking that started within this many days shows in the Active tab and locks the board; older active bookings are ignored — not shown and they don't block opening a new job. **Leave blank to show all active bookings regardless of age** (the previous behaviour).

### Config / breaking
- New optional property `activeDays`. Re-add the control on the form once so it appears in the designer.

## v0.0.31 — 2026-06-24  ·  DevSync
**Summary:** Booking-card control for the FS mobile app — Active/Today/Tomorrow/Complete tabs, start-to-open focus lock, Field Service Settings custom status and an optional All-Engineers tab; data layer is now flat FetchXML so it loads in the new mobile offline-first engine as well as classic offline and the web app.

*(First release-notes entry — covers the cumulative 0.0.20 → 0.0.31 work.)*

### Changed
- Tabs **Active / Today / Tomorrow / Complete**, self-queried in code — no system views to configure. The **Active** tab (started Traveling/In Progress job) is shown first.
- **Custom `Start Job` status** is read from the Field Service Settings record (`msdyn_fieldservicesetting`); the three manifest `Custom*` properties were removed.
- Optional **All Engineers** tab — manifest Yes/No toggle + days-ahead; read-only overview of every engineer's bookings.
- Always loads any **active** booking regardless of date, so a forgotten open job appears in the Active tab and locks the board (matches the server-side `EnsureSingleRunningBooking` one-running rule).
- Header chips wrap instead of clipping; incident chip is a neutral tag.

### Fixed
- **Offline-first mobile**: *"Specified FetchXML is invalid"* — removed all `link-entity` joins (the new offline-first engine rejects inner/outer joins); queries are now flat FetchXML with pre-resolved ids. Earlier, moved OData → FetchXML so classic offline works (OData `_lookup_value` filters aren't supported offline). Dropped milliseconds from FetchXML datetime literals.
- Status-change failures now show the real reason (e.g. the one-running-booking message) instead of *"Couldn't load bookings"*.

### Config / breaking
- New manifest properties (since 0.0.27): **Show All Engineers Tab** (No/Yes), **All Jobs Tab Name**, **All Jobs: Days Ahead**. **Re-add the control on the form once** so the new properties surface in the designer.
- The mobile **offline profile** must include `bookableresource`, `bookableresourcebooking` and `bookingstatus`.


