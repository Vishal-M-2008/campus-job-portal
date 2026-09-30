---
name: d3-analytics
description: Adds code-split D3 dashboards for placement funnel, skills, companies, and department rates. Use when editing analytics charts or the analytics route.
---

# D3 analytics

Load the analytics page with `React.lazy`. Do not import `d3` from the main bundle entry.

Charts read JSON from `GET /api/v1/analytics/summary` (tenant scoped). Draw with D3 selections inside a `useEffect` that clears the SVG on change.

Charts: application funnel, top skills, applications by company, placement rate by department. Empty data renders an empty-state sentence, not a thrown error.

Gate the route with the `analytics` feature flag. The flag defaults to on and free.
