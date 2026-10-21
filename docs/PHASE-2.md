# Phase 2 — Service profile & lead foundation

**Branch:** `feature/phase-2-profile-leads`. **Status:** implemented and verified in Claude's build environment. Awaiting your Windows verification.

## What was built

| Area | Delivered |
|---|---|
| Service profile | One company profile (name, tagline, about, city, public contacts, qualification preferences, "require website or Instagram" switch). Everyone can read it; only admins can edit it. Every save is audited with the names of the changed fields. |
| Services | The 11 approved services, **no prices anywhere**. Admins can add, edit (benefits, restrictions, call to action, portfolio link) and enable/disable them; there is no delete. Names are unique regardless of case, spacing or "&" vs "and". |
| Target market | The 16 merged industries, each with editable suggested services. Surat and its 12 areas (Vesu, Adajan, City Light, Piplod, Pal, Dumas, Varachha, Katargam, Udhna, Athwa, Althan, VIP Road). Admins can add, rename and enable/disable industries and areas; area names are unique within a city. The data model already supports more cities. |
| Leads | Manual entry of candidates from public information. Fields: business, industry, area/city, address, Instagram, website, phone, email, source and source link, notes. **Three categories:** Candidates (pending review) → Approved (not contacted) → Contacted, plus Rejected. Leads can be approved, rejected (reason required) or reopened, assigned to an owner, verified, marked do-not-contact, and recorded as contacted. Full history comes from the audit log. |
| Duplicate protection | Contact details are normalised (domain, +91 phone, email, Instagram handle). The rules: **exact duplicate** (same contact detail + same name + same or unknown area) is always blocked. **Shared contact detail** with a different name or area (e.g. branches) is blocked unless an **admin** approves it with a reason. **Same name in the same area** needs a "different business" confirmation. Matches are shown live while typing and checked again on save. Records are **never merged**. |
| Verification | "Details verified" is set only when a person confirms the details, and is cleared automatically when contact details change. |
| Retention | The threshold is configurable, default **180 days**, range 30–3650. Admins see eligible leads: never contacted, not do-not-contact, older than the threshold, and not kept. From the list they can **keep** a lead for another period or **delete** it after typing `DELETE n LEADS`. Every lead is re-checked at delete time, and the request is all-or-nothing. Audit rows hold the lead number, industry, area and age only. **There is no automatic deletion.** |
| Permissions | Configuration and retention: admin only. Leads: admins and managers add and review; sales users see only leads assigned to them (others return 404); viewers have read-only access. Only admins can remove a do-not-contact mark. |

### Not built in this phase (as agreed)

- The hashed do-not-reimport list.
- CSV import (Phase 6).
- Google Places.
- Any external API calls.
- Campaigns.
- Outreach statuses and the manual Instagram send flow (Phase 8).

## Database

New migration: `packages/db/prisma/migrations/20261021090000_phase2_profile_leads/`.

- **Additive only.** It creates 4 enums and 9 tables (`CompanyProfile`, `SystemSettings`, `Service`, `Industry`, `IndustryService`, `City`, `Area`, `Lead`, `LeadIdentifier`) with their indexes and foreign keys.
- It does not alter User, Session or AuditLog, and inserts or deletes no data. An automated test checks this by upgrading a Phase 1 database that already contains data.
- The Phase 1 migration is unchanged.
- **Written by hand**, as in Phase 1, because Prisma's migration engine can't be downloaded in Claude's environment. It was checked by:
  - applying it to PostgreSQL 16;
  - a column-by-column comparison with `schema.prisma` (12 models, 133 columns; all 37 indexes present);
  - 91 API integration tests.
- `pnpm db:check-drift` on Windows is Prisma's own confirmation.

**Seed:** `pnpm db:seed` loads the company profile, 11 services, 16 industries with suggested services, Surat with its 12 areas, and the 180-day setting.
- It only adds what is missing and never overwrites admin edits.
- It is safe to run more than once.
- It creates **no leads**.

## Duplicate matching: known limitations

- Business names are compared exactly after normalisation (case, accents, punctuation and suffixes such as "Pvt Ltd" are ignored). There is no fuzzy matching, so "Brew Lab" and "Brewlab" are treated as different businesses.
- Websites are compared by host name without `www.`, so `shop.abc.com` and `abc.com` differ. Link-in-bio, social, map and directory hosts (linktr.ee, instagram.com, wa.me, Google Maps, Justdial…) are ignored as identifiers.
- Phone numbers: Indian mobiles, and landlines written with their STD code. Numbers from other countries must start with `+`.
- A lead that is edited and marked as sharing details stays marked even if the other lead later changes.

## Tests

| Package | Phase 1 | Phase 2 | Total |
|---|---|---|---|
| shared | 12 | +30 | 42 |
| web | 15 | +10 | 25 |
| API | 47 | +44 | 91 |
| **Total** | **74** | **+84** | **158** |

All 74 Phase 1 tests are unchanged and passing.

## Windows commands

```powershell
cd D:\prosolution
git switch feature/phase-2-profile-leads
git pull
pnpm install
pnpm services:up
pnpm db:migrate        # applies the Phase 2 migration (additive)
pnpm db:check-drift    # expected: "No difference detected"
pnpm db:seed           # loads services, industries, areas, profile
pnpm check             # expected: 42 + 25 + 91 = 158 tests, builds, secret scan
pnpm dev               # http://localhost:5173
```

## Manual browser checklist

Sign in as admin first, then as a viewer (and a sales user, if you have one).

1. **Service profile:** details are filled from the seed. Change the tagline and save; a toast appears. Change retention to 365 and back to 180; shortening asks for confirmation.
2. **Services:** 11 services, no prices. Edit one and save. Disable one, confirm, then enable it again. Try adding "Graphic design and branding": it's refused as a duplicate.
3. **Target market → Industries:** 16 industries with suggested services. Edit one's suggested services.
4. **Target market → Areas:** Surat's 12 areas. Add "Rander". Try adding "vesu": refused. Rename an area, then disable and enable it.
5. **Leads → Add lead:** a café in Vesu with a phone and an Instagram handle. It opens as a **Candidate**.
6. **Shared details:** add "<same name> Adajan" with the same phone in Adajan. An amber notice appears; as admin, tick *separate branch* and give a reason. Both leads now show *Shared contact details*.
7. **Exact duplicate:** add the first café again with the same Instagram handle (written as a profile link). A red notice appears and **Add candidate** is disabled.
8. **Same name, same area:** a different phone and handle but the same name and area. You must tick *different business*.
9. **Lead page:**
   - Approve, assign an owner and mark the details verified.
   - Edit the phone number: *Details verified* disappears.
   - Record past contact: the lead moves to the **Contacted** tab.
   - History lists every step.
10. **Do not contact:** mark a candidate; it can't be approved. As a manager you can't remove the mark; as admin you can, with a reason.
11. **Data retention (admin):** no leads should need review on a fresh database. To test it, backdate one **test** candidate (use its LD number, e.g. 1):
    ```powershell
    docker exec -it prosolution-dev-postgres-1 psql -U prosolution -d prosolution
    ```
    then, at the `prosolution=#` prompt:
    ```sql
    UPDATE "Lead" SET "createdAt" = now() - interval '200 days' WHERE "displayId" = 1 AND "contactStatus" = 'NOT_CONTACTED';
    \q
    ```
    It now appears under **Data retention**. Try **Keep selected**, which removes it from the list. Backdate a second test lead and try **Delete selected**: the button stays disabled until you type `DELETE 1 LEAD`.
12. **Audit log:** filter by *Deleted lead (retention)*, *Reviewed lead* and *Edited service*.
13. **As a viewer:** Leads, Services and Target market are read-only, with no add, edit or review buttons. **Data retention** says you don't have access.
14. **As a sales user:** you see only leads assigned to you.
