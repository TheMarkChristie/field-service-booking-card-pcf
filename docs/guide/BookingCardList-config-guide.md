# BookingCardList — Configuration guide

The **BookingCardList** control (`Proximo3.FieldService.BookingCardList`) shows a Field Service engineer's own Bookable Resource Bookings as tappable cards, grouped into **Active / Today / Tomorrow / Complete** tabs, with inline status changes under a one‑running‑job focus lock. It is built for the **Field Service mobile** app and works online, in classic offline, and in the new offline‑first mode.

## Before you start

- The control is part of the **Field Service Starter Kit** solution (deployed via the dev environment).
- It is a **dataset** control placed on a Bookable Resource Booking view/subgrid, but it **queries the signed‑in user's own bookings itself** — so **no system views need to be created or configured**. The view it is bound to does not drive the card content.

## Add the control

- In the app/form designer, add the **BookingCardList** control to a Bookable Resource Booking subgrid or list.
- Open the control's **Properties** to set the options below.
- **Important:** if you added the control before a newer version's properties existed, **remove and re‑add the control once** so the latest properties appear in the designer.

## Tab labels

- **Active Tab Name** — label for the first tab (the started, Traveling/In Progress job). Default **Active**.
- **Tab 1 / 2 / 3 Name** — labels for the day tabs. Defaults **Today**, **Tomorrow**, **Complete**.

The control sorts bookings automatically: a started (Traveling/In Progress) job goes to **Active**; completed/cancelled go to **Complete**; everything else by start date into **Today** / **Tomorrow**.

## Custom "Start Job" status (optional)

The extra status option in the card's status dropdown is configured on the **Field Service Settings** record, not on the control, so the target IDs travel with the environment. Add these columns to **`msdyn_fieldservicesetting`** and set them on the settings record:

- **`prx3_custombookingstatus`** — lookup to **Booking Status**. Required to enable the option; when empty the custom option is hidden.
- **`prx3_customworkordersubstatus`** — lookup to **Work Order Sub‑Status**. Optional; set on the work order when the option is chosen.
- **`prx3_customstatuslabel`** — text. Optional; falls back to the booking status name.

## All Engineers tab (optional)

- **Show All Engineers Tab** — set to **Yes** to add a final, read‑only tab listing every engineer's bookings for the next N days. Default **No**.
- **All Jobs: Days Ahead** — how many days ahead the tab covers. Default **7**.
- **All Jobs Tab Name** — label for the tab. Default **All Jobs**.

This tab is online‑oriented: the mobile offline profile usually only holds the signed‑in user's own bookings, so it is sparse or empty offline.

## Card extras (optional)

- **Extra Field 1 / 2 / 3** — show up to three extra columns on each card. Enter a column logical name; prefix with `workorder.` to read from the related Work Order.
- **Custom Fields Heading** — optional heading shown above those values.
- **Header Badge Field** — a column shown as a badge in the card header (e.g. job type).
- **Priority Colours** — colour the card border and a priority pill by Work Order priority, e.g. `High=#D13438;Medium=#F7A600;Low=#107C10`.
- **Maps Provider** — which maps app the address opens (Google, Bing or Apple).

## Offline profile

For the board to load offline, the mobile **offline profile** must include the tables the control reads:

- **`bookableresourcebooking`** (in the default profile)
- **`bookableresource`** (needed to match the signed‑in user)
- **`bookingstatus`** (needed for the always‑show‑active safety net; if missing, the board still loads but that safety net is skipped offline)

The control uses flat FetchXML so it is valid in classic offline and the new offline‑first engine alike.

## How an engineer uses it

- The day starts **locked**: every card must be started before it can be opened. The status dropdown reads **Start Job** (Travelling / In Progress / your custom option).
- Starting a job opens that card and keeps the rest locked until it is finished; the started job appears in the **Active** tab.
- A forgotten open job from a previous day is also pulled into **Active**, so it can be completed before a new job is started.
