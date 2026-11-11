# 第三者ライセンス

本アプリの自作部分：Copyright (c) 2026 Hirota777。第三者部分の権利は各権利者に帰属し、個別のライセンスが優先します。

| 対象 | 条件・同梱ファイル |
| --- | --- |
| Electron 45.2.3 | MIT。ルートのLICENSEはElectronの著作権・許諾文です |
| Chromium等 | LICENSES.chromium.htmlに各著作権・ライセンスを原文で収録 |
| FFmpeg | LGPL 2.1以降等。ffmpeg.dllは公式Electronのものを変更せず同梱 |
| .NET | resources/reader/LICENSE-dotnet.txt、THIRD-PARTY-NOTICES-dotnet.txt |
| ClrMD等のReader依存 | resources/reader/THIRD-PARTY-NOTICES-reader.md |
| AmongUsCapture由来の対応情報 | MIT。resources/reader/LICENSE-AmongUsCapture.txt |
| クルー画像・アプリアイコン | ASSET-NOTICES.md。ライブラリのMITとは別の権利です |

## FFmpegの対応ソース

同じ配布ZIP内のthird-party-sources/FFmpeg-Electron-45.2.3-sources.zipに、FFmpegの全ソース、Electronの修正パッチ、Electronのソースアーカイブ、ビルド設定・版・ハッシュを含めています。アプリの「ライセンス」からも取得できます。プライベートGitHubの閲覧権限がなくても、アプリの配布ZIPを受け取った方は同梱ソースを利用できます。

FFmpegはChromiumリビジョン9db86ce5b5b454dfc96c435f9f0723012980c37fに、Electron v45.2.3の公開パッチを適用したものです。README-SOURCES.txtにビルド・交換方法があります。互換性のある改変DLLへの交換と、そのデバッグのための解析など、LGPLが認める行為を本アプリの規約で禁止しません。交換後の動作・安全性を保証するものではありません。

Chromiumの文書には複数OS・多数の部品の条件が含まれます。FFmpeg以外を含め、各部品に適用される個別条件を保持します。Electron本体のMITだけですべてを扱うものではありません。

参考： https://ffmpeg.org/legal.html / https://github.com/electron/electron/tree/v45.2.3

## 権利確認が別に必要なもの

本書の整備は、Innerslothの原作IPの利用許諾やDiscordの一般向けAPI利用承認の代わりにはなりません。素材は配布者が許諾済みと確認した範囲で扱います。原作・素材の許諾範囲や、サービス規約との適合を保証する表示ではありません。
