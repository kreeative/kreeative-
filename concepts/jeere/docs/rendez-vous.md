# Jeere Rendez-vous — appointments for service businesses

What « Commandes » is to a shop, for a lash tech, a nail tech, a hairdresser, a make-up artist: clients book a
service online, the studio runs its agenda from the dashboard. Built on 13 November 2026.

## What a studio gets

| For her clients | For her (dashboard › Rendez-vous) |
| --- | --- |
| A menu of services by category, with duration and price (« dès » for a starting price) | **Agenda**: the week, the day's appointments, blocked time, the week's numbers |
| Add-ons that lengthen the appointment and the price (French, lower lashes…) | **À confirmer**: requests waiting for her answer, with a badge in the menu |
| The choice of the person, when she is not alone | **Nouveau rendez-vous**: a booking taken by phone or WhatsApp |
| A calendar that only shows free days and times, in the studio's time zone | **Bloquer un créneau**: a day off, a break, holidays, for one person or everyone |
| The deposit to pay and the conditions to accept before booking | An appointment: confirm, done, no-show, move, cancel, deposit received, WhatsApp, private note |
| A confirmation e-mail, a reminder the day before | **Prestations**: services and add-ons; **Horaires et équipe**: hours, breaks, team, booking rules |
| « Gérer mon rendez-vous »: move or cancel by herself, until the delay the studio chose | **Réservation en ligne**: on/off, automatic or manual confirmation, deposit, payment means, policies |
| « Ajouter à mon agenda » (an .ics file) | **Clientes**: visits, no-shows, amount spent, from the appointments |

## Where it lives

| Piece | File |
| --- | --- |
| Tables `booking_settings`, `appointments`, `booking_blocks` | `supabase/migrations/20261113150000_jeere_bookings.sql` |
| Edge Function `bookings` (everything goes through it) | `supabase/functions/bookings/index.ts` |
| The booking steps on any site | `connect/jeere-booking.js`, `connect/jeere-booking.css` |
| A booking page for every store, with no site to build | `rdv/index.html` → `jeere.kreeative.xyz/rdv/?b=<slug>` |
| The dashboard section | `admin/rdv.js`, `admin/rdv.css` (hooked in `admin/admin.js`: route `rendez-vous`) |
| Three model sites | `concepts/regard/` (lashes), `concepts/vernie/` (nails) and `concepts/minuit/` (lashes and nails, dark), on the branch kreeative.xyz serves |

## Rules worth knowing

- **No double booking, ever.** The function checks each time against her hours, breaks, blocks and other
  appointments; then the database refuses any overlap for the same person of the same store (exclusion
  constraint `appointments_no_overlap`), even when two clients confirm in the same second. The second one is
  told « Ce créneau vient d'être pris » and sent back to the calendar.
- **The browser decides nothing.** It sends which service, which add-ons and which start time. Duration,
  price and deposit are recomputed from her settings, in the smallest unit of her currency, like orders.
- **Her time zone.** Hours are stored as she types them (« 09:00 ») with her zone (`settings.timezone`,
  default Africa/Abidjan); the function turns them into instants. The agenda shows her hours wherever the
  browser is.
- **`busy_until`** = the end of the appointment plus the pause she asked between two clients: that is the range
  the constraint protects.
- **How she publishes her availability** (dashboard › Rendez-vous › Horaires et équipe):
  the week's opening hours with one break a day; **« Jours particuliers »** (`settings.special`: one date with
  its own hours, or closed, that wins over the week for everyone: an exceptional Sunday, a shorter eve, a public
  holiday); **« Bloquer un créneau »** for a few hours or days off (`booking_blocks`, for one person or all);
  and until when clients may book: N weeks ahead, rolling (`settings.horizon`), or **until a date she chooses**
  (`settings.openUntil`, « j'ouvre mon agenda jusqu'au 31 décembre »). The booking calendar stops at that day
  (`config.until`). Booked times disappear by themselves.
- **The client's link** (`manage_url`, `?rdv=<64 hex>`) is the only key to an appointment from outside. It
  goes back to the site she booked on when that site is kreeative.xyz, jeere.kreeative.xyz or the store's own
  domain; otherwise to `rdv/`.
- **Deposits are tracked, not charged.** The client chooses a means (Wave, Orange Money…); the studio sends
  the payment request and marks the deposit « reçu ». Card deposits through Stripe are not wired yet (the
  `payments` function only knows orders).
- **E-mails** go through Resend like orders, from the store's name, and can be overridden per store in
  `stores.notifications` under the keys `rdv_confirmation`, `rdv_demande`, `rdv_nouveau`, `rdv_confirme`,
  `rdv_rappel`, `rdv_deplace`, `rdv_annule` (`{ on, subject, body }`); there is no screen for that yet.
- **Reminders**: pg_cron job `jeere-rdv-rappels`, every hour at :41, calls the function with `{ action:
  'remind' }` and the `x-jeere-cron` secret; a confirmed appointment 2 to 26 hours away gets one reminder.
- **Brakes on robots**: 3 bookings per phone number per store in 10 minutes, 30 per store, 6 upcoming per number.
- The three tables have row level security on and no policy: nothing reads or writes them but the function.

## Putting it on a site

```html
<script src="https://jeere.kreeative.xyz/connect/jeere-booking.js" data-store="regard"
        data-book-url="reserver/" data-manage-url="rendez-vous/" defer></script>

<div data-jeere-booking></div>           <!-- the booking steps -->
<div data-jeere-appointment></div>       <!-- « my appointment », from the e-mail link -->
<button data-jeere-book="s2">Réserver</button>   <!-- opens the booking with service s2 chosen -->
<div data-jeere-services></div>          <!-- her whole menu -->
<div data-jeere-hours></div>             <!-- her opening hours -->
<p data-jeere-policy="cancel"></p>       <!-- deposit | late | cancel | payment | prep -->
```

The steps come with a default look that inherits the site's fonts. A site makes it its own with a few
properties: `.jb { --jb-accent: #5c544e; --jb-on-accent: #fff; --jb-soft: #efece8; --jb-radius: 22px;
--jb-title: 'Bebas Neue'; }`, and any rule on the `.jb-*` classes. The header of `jeere-booking.js` lists
every attribute and event.

## Not built yet

Card deposits (Stripe), SMS or WhatsApp reminders (e-mail only today), a waiting list, recurring
appointments, calendar sync (Google, Apple) beyond the .ics file, per-person opening hours in the dashboard
(the data model has them: `staff[].hours`), a screen to edit the e-mail texts, and an English version of the
booking steps.
