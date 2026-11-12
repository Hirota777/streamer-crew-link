# Code signing policy

Updated: 2026-11-12

## Current status

Preparing an application to SignPath Foundation. No application has been
submitted and no approval or certificate has been obtained. Existing v1.00
MSI/ZIP releases remain unsigned. The MIT licensing change does not replace
or sign existing release assets.

The planned attribution below will apply only after approval and actual use:

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org).

## Scope and build provenance

- Intended distribution: Windows x64 MSI packages on
  [GitHub Releases](https://github.com/Hirota777/streamer-crew-link/releases).
- Build from the public repository on GitHub-hosted Windows runners. Upload
  unsigned build artifacts to GitHub Actions before submitting for signing.
- Initial intended signing target: the MSI container. Any signing of the
  application launcher or Reader requires a separately reviewed artifact
  configuration and confirmation of SignPath's treatment of Electron/.NET
  binaries. Never recursively re-sign upstream DLLs or executables.
- SignPath approval is required before enabling submission. Its project,
  organization, artifact configuration and signing policy must be configured
  to enforce this repository, release refs, product name and version.
- Every production signing request requires explicit maintainer approval.
  An unsigned result must never be substituted for a required signed result.
- Verify the returned Authenticode signature and timestamp before publishing.
  Compute release SHA-256 checksums only after signing.
- Private keys will be held by SignPath; do not commit tokens or certificates.
  Store an eventual API token in GitHub Actions secrets.

## Team roles

- Authors / committers: [Hirota777](https://github.com/Hirota777).
- Reviewers: [Hirota777](https://github.com/Hirota777). External contributions
  must be reviewed before merging, including changes to build workflows.
- Signing approver: [Hirota777](https://github.com/Hirota777), with manual
  approval of each production signing request.
- GitHub and SignPath accounts must use MFA before signing is enabled.
  Account MFA configuration has not been verified by this document.

## Privacy

See [PRIVACY.md](PRIVACY.md) for Discord OAuth, Discord CDN access,
local game reading, OBS display and encrypted local settings. Discord's
[privacy policy](https://discord.com/privacy) applies to its services.
The application does not send telemetry or game data to the maintainer.
Do not interpret this as a claim that the application never uses a network.

## Eligibility still to resolve

Original code is MIT-licensed. Third-party licenses are retained separately.
Crew images and the app icon have a recorded permission to use, bundle and
recolor, but an OSI-compatible redistribution/modification grant is not
established by [ASSET-NOTICES.md](ASSET-NOTICES.md). Do not claim that all
packaged content meets the Foundation's conditions. Resolve the exact grant
or replace the assets with suitably licensed alternatives before applying.
SignPath makes the final eligibility decision.

## Alternative: an independently obtained certificate

The existing Windows certificate-store signing commands below are separate
from SignPath. They do not submit to SignPath and do not sign the MSI
automatically. They require an independently obtained trusted certificate.

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
3. MSIを作る場合は、署名済みのEXEを格納してMSIを作り、そのMSI自体にも取得した証明書で署名・検証する。MSI作成機能は実装済みですが、MSIへの署名は別途必要です。
4. 署名後のファイルから配布ZIP、ファイル一覧、SHA256を作り直す。既存の公開済みZIPをそのまま署名済みとして扱わない。

署名後にEXEを書き換えない。署名済みでもSmartScreenの警告が必ず消えるわけではない。証明書の名義・公開される氏名を取得前に確認する。

参考：
- https://learn.microsoft.com/en-us/windows/win32/seccrypto/signtool
- https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation
