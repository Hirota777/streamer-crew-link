Run `node test/browser/mapping-unlink.mjs` with Playwright and Microsoft Edge available. Uses a temporary test-only profile and loopback port 37947; never reads the owner profile. Covers removal of absent/current players, discard, dropdown removal, save and disk reload, unrelated mappings, and demo read-only controls.

`transition.mjs` covers partial and empty lobby frames, returned-player life updates, retained avatar elements, all appearance settings reaching OBS while held, fresh game-start roster/colour/life, reload and Discord departures. `motion-crew.mjs` covers speaking animation and crew visibility.

`preset-save.mjs` uses an isolated temporary settings directory and loopback port 37953. Covers delayed preset saves, live updates during the lock, duplicate clicks, save/create failures, edit recovery, normal save/reload and collateral timing help. Does not access saved Discord credentials or a running game.

`multi-window.mjs` uses temporary profiles on ports 37954–37956. Covers another window saving the same preset, another window switching presets while edits are unsaved, and out-of-order preset-selection responses. On 0.9.10 the first case passes and the latter two intentionally fail as reproducible open bugs; they are not skipped or marked expected-pass. Run with `node --test test/browser/multi-window.mjs` after making Playwright and Microsoft Edge available.

`game-only.mjs` tests Discord-free crew/name rendering, three colour sources, life marks, preview vs OBS save, vertical layouts, saved mode, demo and preserved Discord mappings. Uses temporary settings and port 37957.
