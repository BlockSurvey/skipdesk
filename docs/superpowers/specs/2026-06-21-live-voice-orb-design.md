# Live Voice Orb — signature voice-call experience

**Date:** 2026-06-21
**Status:** Approved (design forks confirmed with user)

## Problem

SkipDesk's whole product is a *voice* conversation, yet the on-screen voice UI is an
80px mic button (`VapiWidget`) with a single ping ring. It listens only to Vapi's
`speech-start`/`speech-end`, so it cannot show the one thing that makes a voice agent
feel alive and trustworthy: **whose turn it is** — is the agent *speaking*, is it
*waiting for me*, is it *thinking*? The landing hero's `CallConsole` is a separate,
unrelated fake dramatization. Nothing reacts to the real audio the SDK already emits.

## Goal

One **signature, reusable voice visualization** that reads instantly as
*speaking vs. your-turn*, reacts to **real** call audio, and appears consistently on
all three surfaces:

1. **Landing** — the live demo card (`#try`, `TryAgent`) and a restyled hero
   `CallConsole` that shares the visual language (kept self-playing, no mic).
2. **Public page** — `/talk/[slug]`.
3. **Dashboard** — "Talk to your agent" on `/widget` (`WidgetManager`).

Approved design forks:
- **Visual motif: a living voice orb** — a central circular presence that breathes
  when idle, radiates concentric coral rings + a halo scaled by *real audio volume*
  when the agent speaks, and calms to an open teal mic-ripple on the visitor's turn.
  On-brand with the voice-pulse logo.
- **Hero: keep the scripted dramatization**, restyled to the new language. The real,
  live experience lives in `#try` + `/talk` + dashboard.

## Vapi event surface (confirmed against `@vapi-ai/web` types)

- `volume-level: (v: number) => void` — assistant output level, 0–1. Drives the halo.
- `speech-start` / `speech-end` — assistant speech boundaries.
- `message` (`any`) — transcript messages: `{ type:'transcript', role:'assistant'|'user',
  transcriptType:'partial'|'final', transcript:string }`. Drives caption + turn-taking.
- `call-start`, `call-end`, `error`.

## Architecture

Three new files under `components/voice/` + thin re-wiring of existing call sites. The
orb is split into a **pure presentational** piece and a **Vapi-driven** piece so the
scripted hero console can reuse the exact same visuals.

### `components/voice/VoiceOrb.tsx` — presentational
- Props: `phase: OrbPhase`, `getAmplitude?: () => number`, `size?: 'sm'|'md'|'lg'`,
  `label?: string`.
- `OrbPhase = 'idle' | 'connecting' | 'speaking' | 'listening' | 'thinking' | 'ended' | 'error'`.
- Per-phase **color + motion** via CSS custom props (coral=speaking, teal=listening,
  amber=thinking, neutral=idle, rose=error, green=ended).
- Reactive halo: an internal `requestAnimationFrame` loop reads `getAmplitude()` and
  writes a CSS variable `--amp` (0–1) on the root — **no React re-render in the hot
  path**. CSS scales the halo/glow from `--amp`.
- Honors `prefers-reduced-motion`: no rAF, no emanating rings; static colored ring +
  label still communicate the phase.
- No Vapi import — fully reusable.

### `components/voice/useVapiCall.ts` — Vapi-driven state
- Returns `{ phase, getAmplitude, caption, start, stop, error }`.
- Lazy-imports `@vapi-ai/web` on first `start()` (keeps it out of the initial bundle).
- State machine:
  - `start()` → `connecting`
  - `call-start` → `thinking` (assistant about to greet)
  - `speech-start` → `speaking`
  - `speech-end` → `listening`
  - `message`/transcript: update `caption {role,text}`; user `final` → `thinking`
  - `call-end` → `ended` (settles back to `idle` after ~1.6s)
  - `error` → `error`
- Amplitude: `volume-level` lerped into an `ampRef`; decays toward a small idle value
  when not speaking. Exposed via `getAmplitude`.

### `components/LiveVoiceOrb.tsx` — the live experience
- Props mirror today's `VapiWidget`: `{ publicKey, assistantId, variableValues, size?,
  hints? }`.
- Composes `useVapiCall` + `VoiceOrb` + a **live caption line** (`aria-live="polite"`)
  + controls (tap orb to start when idle; an explicit **End call** pill while live;
  **Tap to retry** on error) + an optional "Try saying…" hint list.
- `size: 'hero'|'full'|'panel'` maps to `VoiceOrb` `lg|lg|md`.

### Re-wiring (minimal churn)
- `VapiWidget.tsx` → thin wrapper that renders `<LiveVoiceOrb/>`, preserving its current
  props so `TryAgent`, `/talk/[slug]`, and `WidgetManager` need **no changes**.
- `CallConsole.tsx` → keep the scripted transcript + pillars; replace the footer
  `Waveform` with a compact `VoiceOrb` (size `sm`) driven by the script's
  speaking/listening state + a synthetic amplitude, so the hero matches the live orb.
- `app/globals.css` → orb keyframes (breathe, ring-emanate, ripple-in, thinking
  shimmer) + `--amp`-driven halo, all gated by `prefers-reduced-motion`.

## Data flow

```
Vapi SDK ──events──▶ useVapiCall ──phase──▶ VoiceOrb (color + motion)
                          │  └─getAmplitude()─▶ rAF ─▶ CSS --amp ─▶ halo scale
                          └─caption──▶ LiveVoiceOrb caption line (aria-live)
```

## Testing / verification

UI-only change; no server or DB surface. Verify by **compile + lint**
(`npm run build`), per the repo's "never run a 2nd dev server" rule. Manual smoke of a
real call is the user's call. Reduced-motion path verified by code (static fallback).

## Out of scope

Mid-call tool visualization, per-business assistants, transcript persistence in the UI,
chat (text) mode. No new dependencies.
