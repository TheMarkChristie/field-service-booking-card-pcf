# BookingCardList — Release notes

## v1.1.0 — 2026-08-26

**Summary:** Brings the public repo up to the current control version (the interim 0.0.38 → 1.0.x
builds shipped internally). Headline change: the control can now run **fully self-contained** — its
day-windows and custom "Start Job" status can be read from the control's own properties instead of
Field Service Settings, so it installs into any Field Service environment with **no `prx3_` tables or
columns**. Also folds in the mobile status-menu fix and the offline-first data layer.

### Added
- **Configuration Source** property (Choice): **Field Service Settings** (default — unchanged) or
  **This control**. In *This control* mode the control reads its config from new manifest properties
  and makes **no Field Service Settings read at all** (fully offline-safe, no custom settings schema):
  - **Active / Completed / Next: Booking Days** (whole numbers; blank/0 = no limit). *Completed* drives
    the Complete-tab lookback; *Next*, when set, adds an optional forward-looking tab.
  - **Custom Status Label**, **Custom Booking Status Id** (GUID), **Custom Sub-Status Id** (GUID) — the
    optional extra "Start Job" status, self-contained in the control.
- **Standalone-ready:** in *This control* mode the control touches **no `prx3_` field** — the
  terminal-move Work Order Sub-Status write (a Field-Service-Settings-mode business rule) is skipped,
  and the custom status writes the Work Order's **native** `msdyn_substatus`. Ships as a control-only
  solution with zero custom tables. In the default *Field Service Settings* mode nothing changes.

### Fixed
- **Mobile status menu** — tapping a card's status did nothing in the Field Service Mobile webview: a
  native `<select>` never fires its change event there. Replaced with a button + click-driven menu,
  rendered fixed-position so it is no longer clipped by the card. Start / complete / etc. now work on
  both mobile and web.

### Changed
- **Dataset-driven, offline-first loading.** Cards build from the **bound view** (served from the
  mobile local store when offline) with keep-last-good-cards if the bound dataset returns empty
  offline, an offline write queue (a "couldn't reach the server" write is treated as a successful
  local queue), and an online/offline banner.
- **Completed-tab lookback** and an optional **"Next N Days"** tab, from Field Service Settings
  (`prx3_completedbookingdays` / `prx3_nextbookingdays`) or, in *This control* mode, from the new
  properties.
- Control version → **1.1.0**.

### Config / breaking
- **Re-add the control on the form once** so the new properties surface in the designer.
- For a standalone / community install, set **Configuration Source = This control** — no
  `msdyn_fieldservicesetting` `prx3_*` columns are required. The default mode still expects them.

## v0.0.37 — 2026-07-10  ·  DevSync
**Summary:** Offline hardening. A column missing from the mobile offline profile no longer breaks the whole card, and the control now names exactly which tables/columns are missing offline.

### Changed
- Enrichment queries (work order, products, booking status, settings, core detail) degrade gracefully: a table/column absent from the offline profile is skipped instead of throwing "Specified FetchXML is invalid" and failing the entire load.
- Work-order attributes are tried in tiers (drops geo, then incident/priority) so one missing field can't lose the whole work order.
- New precise error/notice: names the missing **table (columns: …)** — red banner on hard failure, amber notice when the card still loads.
- Added docs/OFFLINE-PROFILE.md listing every required table + column for the mobile offline profile.

## v0.0.36 — 2026-07-10  ·  DevSync
**Summary:** The active-booking window now comes from Field Service Settings (`prx3_activebookingdays`), read by BOTH the control and the EnsureSingleRunningBooking plugin so they always agree. Manifest `activeDays` removed.

### Changed
- Removed the manifest **Active: Days Back** property. The window is now read from **Field Service Settings** `prx3_activebookingdays` (Whole Number). Blank/0 = no limit.
- `getCustomStatusSettings` → `getFieldServiceSettings`, returning `{ customStatus, activeDays }`.
- Paired with a plugin change: `EnsureSingleRunningBooking` reads `prx3_activebookingdays` and only blocks on open bookings started within that window, so control and plugin match.

## v0.0.35 — 2026-06-24  ·  DevSync
**Summary:** Removed the Agreement & Asset section — that feature belongs on the Domestic Work Order PCF, not BookingCardList. Back to the 0.0.33 feature set.

### Changed
- Reverted the per-card Agreement/Asset section and its four manifest properties (added in 0.0.34).

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


