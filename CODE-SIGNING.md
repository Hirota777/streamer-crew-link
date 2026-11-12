# Windowsコード署名

## 現在の状態

2026年11月12日：公開中のv1.0.4のアプリ・MSI・読取EXEは未署名です。署名申請は中止しており、証明書は取得していません。以下は署名を再開する場合の手順です。自己署名証明書は一般配布用に使用しません。

## 用意するもの

- 本人確認を経て取得した、公に信頼されるコード署名証明書。
- Windowsの証明書ストアから利用できる秘密鍵（USBトークンや証明書サービスの対応プロバイダーを含む）。PFXを使う場合も、本人がWindowsへインポートし、パスワードをチャット・ソース・コマンド引数へ書かない。
- Windows SDKのSignTool。このPCのSDKには配置済み。

契約・購入・本人確認は所有者の操作で完了する。クラウド署名はサービスによって方式が異なるため、契約先決定後に接続方式を確認する。現在の自動処理はWindows証明書ストア方式。

## 設定例（PowerShell）

```powershell
$env:CREW_LINK_SIGN_CERT_SHA1 = '取得した証明書の40桁の拇印'
$env:CREW_LINK_SIGN_STORE = 'CurrentUser'
npm run build:signed
```

証明書をLocalMachineへ登録した場合はストアをLocalMachineにする。自動検出できない場合のみCREW_LINK_SIGNTOOL_PATHでSignToolの絶対パスを指定。タイムスタンプ先はCREW_LINK_TIMESTAMP_URLで変更可能。初期値はMicrosoftのSignTool文書にあるhttp://timestamp.digicert.com。

既に作成した配布フォルダーは次の操作で署名する。

```powershell
npm run sign:package -- "dist/Streamer crew link-win32-x64"
```

署名対象はStreamer crew link.exeとresources/reader/CrewLink.Reader.exe。Electron等の第三者ファイルは再署名しない。SHA256で署名・RFC3161タイムスタンプを付与し、SignTool verify /pa /all /twによる両方の検証が成功した場合だけCODE-SIGNATURES.jsonを作成する。失敗時は処理を停止し、以前の成功記録を残さない。

通常のnpm run buildは未署名ビルド。署名必須の配布にはnpm run build:signedを使い、失敗を無視して配布しない。

## 配布順序

1. アプリ・読取EXEをビルドする。
2. EXEに署名し、検証する。
3. MSIを作る場合は、署名済みのEXEを格納してMSIを作り、そのMSI自体にも取得した証明書で署名・検証する。MSI作成・署名は今回まだ行っていない。
4. 署名後のファイルから配布ZIP、ファイル一覧、SHA256を作り直す。既存の公開済みZIPをそのまま署名済みとして扱わない。

署名後にEXEを書き換えない。署名済みでもSmartScreenの警告が必ず消えるわけではない。証明書の名義・公開される氏名を取得前に確認する。

参考：
- https://learn.microsoft.com/en-us/windows/win32/seccrypto/signtool
- https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation

## 署名済み更新へ移行する際の検証要件

現在の更新は配布元のHTTPS、GitHubのdigestとのSHA256一致、MSIの製品名・UpgradeCode・バージョンを検証します。GitHubアカウントやリポジトリ自体が侵害された場合に、更新の発行者を独立して保証するものではありません。このリスクは現状の未署名配布では残ります。

署名用証明書を取得し、署名済みMSIへ移行する時点で、補助処理に次の検証を追加する必要があります。

- `Get-AuthenticodeSignature -LiteralPath` のStatusがValidであること。Windowsによる署名・信頼チェーンの検証を省略しない。
- SignerCertificate.Thumbprintがアプリ本体にあらかじめ組み込んだ許可リストと一致すること。リリース本文・同時ダウンロードした設定ファイルの値を信頼の根拠にしない。
- 証明書更新時は新旧の拇印を扱う移行手順を用意し、既存の信頼された更新または手動更新で許可リストを更新する。
- 署名欠落・検証失敗・許可外の発行者はインストールせず、未署名更新へ自動で切り替えない。

証明書と承認済みの拇印が未定のため、現在の未署名配布へ固定値の検証を形だけ追加することはしていません。署名や検証が有効になったことを示すものではありません。
