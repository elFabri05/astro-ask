---
name: project-form-slice
description: The birth-data form slice — geocode route, PlaceAutocomplete, BirthForm, /new page, /chart/:id stub
metadata:
  type: project
---

**Files added in this slice:**
- `next.config.js` — Next.js config; `experimental.serverComponentsExternalPackages` prevents webpack from bundling native addons (sweph, node-geocoder, geo-tz, prisma)
- `app/globals.css` — CSS custom properties (design tokens); imported by root layout
- `app/layout.tsx` — required root layout for App Router
- `app/api/geocode/route.ts` — GET ?q=...; calls resolvePlace, returns ResolvedPlace[] (one-element or empty)
- `components/PlaceAutocomplete.tsx` + `.module.css` — controlled combobox; 300ms debounce; stale-search guard via searchSeqRef
- `components/BirthForm.tsx` + `.module.css` — form with client-side Zod validation; POST to /api/charts; redirect to /chart/:id on 201
- `app/(main)/new/page.tsx` — renders BirthForm at /new
- `app/chart/[id]/page.tsx` — stub server component; calls getBirthChart directly; dumps JSON

**Key design decisions:**
- `experimental.serverComponentsExternalPackages` (NOT `serverExternalPackages` — that's Next.js v15 naming); correct key for Next.js 14.x
- Place validity = selected candidate, never raw text. Editing after selection clears value and re-triggers search.
- Pre-check required fields (date, time, place) with friendly messages before running full Zod parse
- Button stays enabled always; errors show inline per field
- `onMouseDown={e => e.preventDefault()}` on dropdown options prevents blur before click registers

**How to run:** `npm run dev` → visit http://localhost:3000/new
