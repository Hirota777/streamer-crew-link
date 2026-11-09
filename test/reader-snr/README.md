# SNR 3.3.0.0 colour reader checks

Requires .NET 10 SDK. Runs the production `reader/SnrPalette.cs` unchanged with a DTO stub for `NebulaPalette.Shade`; it does not load or execute the mod DLL.

Download `SuperNewRoles.dll` from the [official 3.3.0.0 release](https://github.com/SuperNewRoles/SuperNewRoles/releases/tag/3.3.0.0), then run:

```sh
dotnet run --project test/reader-snr/SnrCheck.csproj -- /path/to/SuperNewRoles.dll
```

The check pins the official asset SHA256, checks 64 additional colour IDs (18–81), CSV ordering (including non-numeric source order), light/dark boundaries, and malformed input rejection. An optional second argument accepts `SuperNewRoles/Resources/Color.csv` from the official `3.3.0.0` tag and compares all body/shadow RGB channels independently. An optional third argument writes the palette to JSON for display integration checks.

The external DLL and source CSV are not committed here. This check and `test/reader-life` do not verify Windows process access, game-memory offsets, live SNR meetings, role-specific delayed deaths, Discord authentication or OBS capture in an actual multiplayer lobby.

To check the server snapshot and icon selection with all official colours, provide the CSV and an output JSON path to SnrCheck, then run:

```sh
node test/reader-snr/display-check.mjs /path/to/palette.json
dotnet run --project test/reader-life/LifeCheck.csproj
npm test
```

## 検証結果（2026年11月9日）

対象アプリ：main `31f43f3eeb0df2057a2a42f4e72e6db653c6a655`（0.9.6）。Windows配布ZIP自体は対象外。
環境：Ubuntu 24.04 x64、Node.js 24.22.1、.NET SDK 10.0.403。

| 項目 | 結果 |
| --- | --- |
| `npm test` | 54件成功、失敗・スキップなし。SNR専用3件を含む |
| SNR公式DLL | 3.3.0.0のSHA256が公式リリースの値と一致 |
| 実DLLの埋込色読取 | 64色・ID18〜81を取得し、同タグの公式CSVと全本体色・影色が一致 |
| パーサー | CSV順序、明暗境界、範囲外・重複ID、巨大入力、不正PE、別アセンブリの拒否を確認 |
| 表示データ連携 | 追加64色＋標準18色×生存・死亡・追放＝246通り成功。発言状態・色取得待ちも確認 |
| 生死タイミング | `test/reader-life`成功。通常タスク中の死亡秘匿、会議境界、追放遅延、スキップ、生存する投票対象、次試合リセットなどを確認 |

表示データ連携は実パーサーが出力した追加色をアプリへ入力するシミュレーションです。ブラウザーの画素描画や実OBSへの取り込みを実行したものではありません。標準色はPNG選択経路を検証しています。

この環境にはWindows・Among Us本体・Discordの実接続がありません。SNRの実プロセスメモリーからの読取、複数人の会議・追放・特殊役職による追加犠牲者・ロビー復帰・長時間配信は未確認です。Nebulaの前日の動作成功は利用者申告であり、SNRの実機確認の代用にはしていません。現時点のソフトウェアテストではSNRに起因する不具合を検出していませんが、SNRでの実機動作保証ではありません。
