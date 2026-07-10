# BookingCardList — Mobile Offline Profile requirements

The control resolves everything with **flat FetchXML** (no link-entity joins, no OData `_value`
filters) so it works in the Field Service Mobile **offline-first** engine. But offline-first rejects
a query with *"Specified FetchXML is invalid"* whenever a **table _or a requested column_** isn't in
the app's mobile offline profile. So every table **and column** below must be added to the offline
profile used by the mobile app (the app the engineers run, e.g. "Field Service Mobile").

From **v0.0.37** the control degrades gracefully — a missing enrichment column no longer breaks the
whole card, and the card shows an amber notice naming exactly which **table (columns: …)** are
missing offline. The two **Required** tables below must still be present or nothing loads.

## Required — the card will not load without these

| Table (logical name) | Columns (logical names) | Why |
|---|---|---|
| **Booking** `bookableresourcebooking` | `bookableresourcebookingid`, `starttime`, `endtime`, `msdyn_estimatedtravelduration`, `msdyn_workorder`, `bookingstatus`, `resource` | The bound list + the core "my bookings" window query. Filters on `resource`, `starttime`, `bookingstatus`. |
| **Bookable Resource** `bookableresource` | `bookableresourceid`, `userid` | Resolve the signed-in user → their resource, to show *their* bookings. Filter on `userid`. |

> The mobile offline profile normally already scopes bookings to the signed-in user's resource, but
> the control still resolves `bookableresource` by `userid`, so that table + those two columns are
> required.

## Recommended — card loads, but this data is blank offline without them

| Table (logical name) | Columns (logical names) | Drives |
|---|---|---|
| **Booking Status** `bookingstatus` | `bookingstatusid`, `msdyn_fieldservicestatus` | Status pill colour + the Start-Job / one-open-job lock (Traveling / In Progress detection). |
| **Work Order** `msdyn_workorder` | `msdyn_workorderid`, `msdyn_name`, `msdyn_serviceaccount`, `msdyn_primaryincidenttype`, `msdyn_priority`, `msdyn_address1`, `msdyn_city`, `msdyn_postalcode`, `msdyn_latitude`, `msdyn_longitude` | Work-order number, address (+ maps link), incident type / priority badges. |
| **Work Order Product** `msdyn_workorderproduct` | `msdyn_workorderproductid`, `msdyn_name`, `msdyn_estimatequantity`, `msdyn_quantity`, `msdyn_workorder`, `statecode` | The "Products Needed" list. Filters on `msdyn_workorder`, `statecode`. |
| **Field Service Settings** `msdyn_fieldservicesetting` | `prx3_customstatuslabel`, `prx3_custombookingstatus`, `prx3_customworkordersubstatus`, `prx3_activebookingdays` | The optional custom "Start Job" status and the active-booking-days window. |

## Needed only if the custom "Start Job" status is used (status write-back offline)

| Table (logical name) | Columns | Why |
|---|---|---|
| **Work Order** `msdyn_workorder` | `msdyn_substatus` | Custom status sets the work order sub-status. |
| **Work Order Sub-Status** `msdyn_workordersubstatus` | (record referenced by `prx3_customworkordersubstatus`) | Target of the sub-status write. |

## For related-record *names* to show offline (formatted values)

Lookups only display their text (service account name, incident type, priority, resource name) offline
if the **related** record is also in the offline profile:

- `account` (service account name)
- `msdyn_incidenttype` (primary incident type name)
- `msdyn_priority` (priority name)
- `bookableresource` (already required — resource name)

If these aren't synced the card still loads; those specific labels just render blank.

## Any custom columns you configure on the control

If you set **Extra Field 1–3** or the **Header Badge Field** in the control config, those columns
(on `bookableresourcebooking` or, with the `workorder.` prefix, on `msdyn_workorder`) must **also** be
in the offline profile, or they'll be dropped offline (the control retries per-field, so one bad
field won't break the card).
