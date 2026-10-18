# Platform verification — 17 Oct 2026

Checked against official sources before Phase 1. Re-check the relevant section before the phase that depends on it, because these platforms change.

## Node.js — affects Phase 1

Source: nodejs.org, "Previous releases".

| Version | Status on 17 Oct 2026 |
|---|---|
| v26 | Current (released May 2026) |
| **v24 "Krypton"** | **LTS — latest 24.22.0. Recommended for this project.** |
| v22 "Jod" | LTS (still supported) |
| v20 and older | End of life |

The project declares `"engines": { "node": ">=22.12.0" }`. Prisma 7 and Vite 8 both require at least 22.12. The test suite and production build were run on **Node 22.22.0 and Node 24.22.0**, and both passed.

## Anthropic Claude — affects Phase 5 (not used in Phase 1)

Sources: platform.claude.com → Models overview; TypeScript SDK page.

- **Current model IDs:** `claude-fable-5-1`, `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`.
- The IDs proposed in ARCHITECTURE.md (`claude-sonnet-5-5` for analysis and drafting, `claude-haiku-5-5` for validation and classification) are **valid**. They stay configurable in `.env`.
- **SDK:** `@anthropic-ai/sdk`. It needs Node.js 20 LTS or later (non-EOL) and TypeScript 5.0 or later. The latest version on npm today is 0.135.0. **It is not installed yet**; it gets added and pinned in Phase 5.
- **Still to verify in Phase 5:** structured-output support and the related SDK helpers. The SDK page I read documents Zod-based *tool* helpers (`betaZodTool`) but says nothing about structured outputs.

## Meta / Instagram — affects Phase 7 (not used in Phase 1)

Sources: developers.facebook.com → Instagram Platform overview, Messaging API (Instagram Login), Private Replies, Business Discovery.

**Confirmed:**
- **No cold DMs.** The Messaging API says: "Only after an Instagram user has sent your app user's Instagram professional account a message" can your app reply. The design stays: first contact is a manual send; the API handles replies.
- **24-hour window.** "Your app has 24 hours to respond to any message sent from an Instagram user." The **Human Agent** permission/feature allows a reply outside the window, sent by a human from a custom inbox.
- **Private Replies.** One message per comment, sent "within 7 days of the creation time of the comment". Follow-ups are allowed only if the person responds, and only within 24 hours of their response.
- **Message Requests.** Messages from people who don't follow the account land in Requests. Inactive request threads older than 30 days aren't returned by the API.
- **Two configurations:**
  - *Instagram Login*, host `graph.instagram.com`. Permissions: `instagram_business_basic`, `instagram_business_manage_messages`, `instagram_business_manage_comments`, `instagram_business_content_publish`, Human Agent.
  - *Facebook Login*, host `graph.facebook.com`, needs a linked Facebook Page. Permissions: `instagram_basic`, `instagram_manage_messages`, `instagram_manage_comments`, `instagram_manage_insights`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`, Human Agent, Instagram Public Content Access.
- **Business Discovery** is documented under the Facebook Login configuration only. It returns basic metadata and metrics for other professional accounts. Age-gated accounts are excluded, and the media objects it returns can't be fetched directly.
- **Access levels.** Standard Access is enough "if your app serves accounts you own or manage". Advanced Access (App Review plus Business Verification) is needed to serve accounts you *don't* own or manage.

**Corrections to ARCHITECTURE.md (to be settled in Phase 7):**
1. `pages_manage_metadata` and `business_management` were listed in §7.1 but are **not** in the overview's permission list. They will only be requested if the endpoint reference proves they're needed.
2. **App Review may not be required.** ProSolution is the only account the app serves, so Standard Access may be enough. Some features may still need Advanced Access; this gets confirmed in Phase 7.
3. **Business Discovery's exact permission** isn't named on its overview page. It will be confirmed from the endpoint reference in Phase 7.
4. **HUMAN_AGENT duration.** The 7-day figure wasn't on the page I read. It will be confirmed in Phase 7.

## Google Places — deferred

Not verified. As decided, it stays out until its availability, pricing, usage limits, attribution rules and data-storage terms have been checked.

## Dependency versions

- Every dependency is pinned to an exact version (no `^`). Each was chosen as the newest release at least 14 days old on 17 Oct 2026, which avoids freshly published packages.
- **Prisma:** npm's `latest` tag for `prisma` currently points at `8.0.0-rc.23`, a **pre-release** with a different CLI. The project uses the stable **7.10.0** pair (`prisma` and `@prisma/client`).
- **TypeScript:** 6.0.3, the last JavaScript-based compiler. TypeScript 7.0, the native rewrite, was released recently, and moving to it is a later, separate decision.

## Sources

- [Node.js — Previous releases](https://nodejs.org/en/about/previous-releases)
- [Claude — Models overview](https://platform.claude.com/docs/en/models/overview)
- [Claude — TypeScript SDK](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript)
- [Instagram Platform — Overview](https://developers.facebook.com/docs/instagram-platform/overview)
- [Instagram — Messaging API](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api)
- [Instagram — Private Replies](https://developers.facebook.com/docs/instagram-platform/private-replies)
- [Instagram — Business Discovery](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/business-discovery)
