# 開発とビルド

## 必要な環境
Windows x64、Node.js 22以上、.NET 10 SDKを使用します。
GitHub上のソースにはゲーム本体・個人設定・DiscordのSecretやトークン・SDK本体を含みません。
lib/application.mjsにあるDiscordのアプリIDは公開識別子であり、秘密情報ではありません。

## テスト
```
npm ci
npm test
```

## Windowsアプリをビルド
```
npm run build
```
dist/Streamer crew link-win32-x64に配布ファイルが生成されます。
実行時の.NETは自己完結形式で同梱します。ビルド時には.NET 10 SDKをPATHに設定してください。
ZIPを作る場合は生成したdist内のアプリフォルダーだけを圧縮します。使用中のデスクトップフォルダーやAppDataからファイルを追加しないでください。

## 開発用に起動
ゲーム読取プログラムをビルド後、npm startでElectron版を起動できます。
Nodeのサーバーだけを起動する場合はnpm run start:serverを使用します。ブラウザーでの本物のOAuth起動とWindows暗号化はElectron版で行います。

## Discordの配布用設定
アプリは公開クライアント・PKCE S256を使用し、Client Secretを要求しません。
リダイレクトURIはhttp://127.0.0.1:37891/oauth/callbackです。
要求スコープはidentify、rpc、rpc.voice.readです。現行アプリのDiscord連携は一般公開承認済みです（2026年11月12日、提供者確認）。別のApplication IDへ変更・フォークする場合、そのアプリの利用条件・承認は別途確認してください。DISTRIBUTION.mdを参照してください。

## 依存する取得情報
reader/profiles.jsonはAmongUsCaptureの名前・色の読み取りに必要な対応表を抜粋したものです。
参照コミット: 7038d375b9eacd97d8352bcc0f5a090fc3ab6a28
出典: https://github.com/automuteus/amonguscapture
ライセンスはreader/LICENSE-AmongUsCapture.txtに同梱しています。
指定されたキャラクター表示素材はpublic/iconsに含めています。
.NETのライセンスと第三者通知はthird_party/dotnetに含めています。
