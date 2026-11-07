# Public meeting completion integration check

Build `Fixture.csproj` in Release, then run `node check.mjs <dotnet.exe> <CrewLink.Reader.exe>` after publishing the reader.

The fixture is a synthetic managed process with the same public event metadata shape as the installed Nebula build. The reader must report exactly two meeting completions and ignore kill/report/start events. No game is launched, injected, suspended or modified. The tracker regressions in `test/reader-life` cover initial baselines, late/multiple exiles, unknown native phase, unchanged count, and new-game reset.

Installed Nebula metadata inspected: `Nebula.Patches.NebulaExileWrapUp.WrapUpAndSpawn`, `Nebula.Patches.ModPreSpawnInPatch.ModPreSpawnIn`, `Nebula.Game.Statistics.GameStatistics.EventVariation.MeetingEnd`. Completion is recorded after exile/extra-victim synchronization. No role, source/target mask or position field is read.

An actual multiplayer meeting in the user's Nebula version remains necessary for end-to-end confirmation.
