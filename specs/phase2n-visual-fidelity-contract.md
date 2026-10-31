# Phase 2N Visual Fidelity Contract

## Goal

Raise the CodeX / AI Xiaohaigui prototype from a working classroom shell to a more polished, high-fidelity classroom experience without changing the no-dependency architecture or introducing external image/model calls.

## Scope

- Login first viewport: preserve the local glass terminal asset and strengthen the product-first hero composition.
- Student workspace: improve scan density, depth, focus states, responsive constraints, and visual hierarchy around task, IDE, turtle preview, and mentor panels.
- Teacher and research views: keep operational dashboard density while making evidence panels read as a coherent design system.
- QA: add static visual-fidelity assertions and extend click QA to prove the new visual markers render on desktop and mobile.

## Non-Goals

- No framework migration.
- No new package dependency.
- No outbound model or image-generation call.
- No real provider key usage, storage, logging, or echo.
- No production deployment.

## Acceptance Criteria

1. The UI exposes stable visual-fidelity hooks for login, student, and research surfaces.
2. The CSS contains a multi-hue, non-generic visual system with glass depth, texture, responsive constraints, and text overflow guards.
3. Static QA fails if Phase 2N markers, accessibility focus treatment, or responsive visual rules are removed.
4. Click-level QA still completes three student/teacher/research rounds and captures Phase 2N screenshots.
5. Existing API, smoke, static workflow QA, auth recovery, and provider guard checks remain green.

## Evidence Plan

- `node tests/visual-fidelity.mjs`
- `npm.cmd run test`
- `npm.cmd run qa`
- `PORT=3129 npm.cmd run qa:api`
- `PORT=3135 npm.cmd run qa:auth-recovery`
- `CLICK_QA_PREFIX=phase2n npm.cmd run qa:click`
- `python -m code_review_graph build` and `python -m code_review_graph status`
- Secret scan for key-shaped provider secrets
