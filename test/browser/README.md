Run `node test/browser/mapping-unlink.mjs` with Playwright and Microsoft Edge available. Uses a temporary test-only profile and loopback port 37947; never reads the owner profile. Covers removal of absent/current players, discard, dropdown removal, save and disk reload, unrelated mappings, and demo read-only controls.

`transition.mjs` covers partial and empty lobby frames, returned-player life updates, retained avatar elements, all appearance settings reaching OBS while held, fresh game-start roster/colour/life, reload and Discord departures. `motion-crew.mjs` covers speaking animation and crew visibility.

`preset-save.mjs` uses an isolated temporary settings directory and loopback port 37953. Covers delayed preset saves, live updates during the lock, duplicate clicks, save/create failures, edit recovery, normal save/reload and collateral timing help. Does not access saved Discord credentials or a running game.
