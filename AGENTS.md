# Classroom touch requirements

Preserve the user's explicit default for all teaching games: immediate touch response and independent simultaneous students are required, including drawing activities.

- Use per-pointer input; accept non-primary contacts. Never globally debounce or lock all players.
- Keep input targets stable across answer and hint updates. Deduplicate compatibility clicks without rejecting separate taps.
- Preserve keyboard and click-only fallback. Handle contact cancellation and lost capture.
- Keep main keypad targets at least 44 CSS px. Verify three-lane layout at 1280×720.
- Run `node --test tests/*.test.cjs` after input changes. Use the owned browser fixture `tests/browser-touch.html` for synthetic overlapping contacts and full-round flow; this does not replace a physical display test.
- For drawing games, retain per-pointer stroke state and coordinate scaling; use requestAnimationFrame without discarding input samples or delaying strokes behind debounce.
- Keep the touch diagnostic and visible version useful for hardware/Touchback comparison. Never claim synthetic tests prove real hardware delivery.
