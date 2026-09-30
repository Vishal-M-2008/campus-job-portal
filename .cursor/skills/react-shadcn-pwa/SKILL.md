---
name: react-shadcn-pwa
description: Builds the React PWA with react-router-dom, shadcn/ui, Tailwind, deck theme tokens, ThemeProvider, and i18n JSON namespaces. Use when editing apps/web, components, locales, manifest, or theme CSS.
---

# React, shadcn, PWA

## Stack

- Vite + React + TypeScript in `apps/web`.
- `react-router-dom` route trees per role.
- Tailwind. shadcn-style components use `class-variance-authority` and CSS variables.
- Strings live in `src/locales/en/<namespace>.json`. Read them with a small `t(ns, key)` helper.

## Theme

Deck defaults: orange `#c2410c`, cream `#f6efe6`, near-black text. Put them in `:root` as `--background`, `--foreground`, `--primary`, `--primary-foreground`.

`ThemeProvider` reads `college.theme_json` and sets those variables. Missing theme falls back to the deck.

Header motif: a simple arrow corner (two lines), bold title, cream or orange band.

## PWA

`public/manifest.webmanifest` with name Campus Job Portal, `display: standalone`, theme color matching `--primary`. Register the service worker only for the app shell. No push.

## Do not

- Fetch in components (use sagas).
- Add a second color system beside the CSS variables.
