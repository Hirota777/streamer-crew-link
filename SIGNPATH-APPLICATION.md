# SignPath Foundation 申請準備

更新日：2026年11月12日。**未申請・未承認・未署名**です。

## 申請フォーム用情報（下書き）

| 項目 | 入力内容 |
| --- | --- |
| Project | Streamer crew link |
| Repository | https://github.com/Hirota777/streamer-crew-link |
| Download | https://github.com/Hirota777/streamer-crew-link/releases |
| License | MIT for original application code; third-party licenses and assets must be disclosed separately |
| Maintainer | Hirota777 / https://github.com/Hirota777 |
| Code signing policy | https://github.com/Hirota777/streamer-crew-link/blob/main/CODE-SIGNING.md |
| Privacy policy | https://github.com/Hirota777/streamer-crew-link/blob/main/PRIVACY.md |
| Contact email | 申請者が入力。リポジトリへ個人メールを記載する必要はありません |

Project description:

> Streamer crew link is an unofficial Windows desktop companion for Among Us
> streamers. It displays player names, colors and meeting-confirmed life
> states in a local OBS browser overlay, with optional user-authorized Discord
> integration. Windows x64 MSI and ZIP packages are distributed free of charge
> on GitHub Releases. The application uses Electron and a self-contained .NET
> reader. It reads local game state without injecting code, writing game
> memory or modifying game files. Original application code is MIT-licensed;
> third-party components retain their respective licenses.

素材の条件が解決してから提出してください。現在の画像・アイコンの許諾状況を
省略して「すべてMIT」と申告しないでください。

## 申請前に残る項目

1. ASSET-NOTICES.mdの画像36枚と、それを用いたアイコンについて、作者・配布元・
   許諾文を確認。OSI互換の条件で配布できるか不明なら、申請対象を含めて
   SignPathへ確認するか、適切なライセンスの素材へ置き換える。
2. GitHub-hosted Windows CIでMSIをビルドし、成果物と実行記録を確認する。
   Actionsの「Windows unsigned build」を手動実行して確認する。
   ワークフローは用意済みですが、成功記録はまだありません。
   既存のローカルビルドだけをCI由来と申告しない。
3. GitHub・SignPathのMFAと連絡可能な申請メールを本人が確認する。
4. 公開ホームページ・ダウンロードページにも「Code signing policy」リンクを置く。
   現在配布中の未署名v1.00を署名済みと表記しない。
5. https://signpath.org/apply.html から申請。審査結果はSignPathが判断する。

## 承認後の設定

- SignPath側でGitHub連携、プロジェクト、署名ポリシー、成果物設定を作成する。
- MSIに限定した成果物設定と製品名・バージョン制約をまず確認する。
  Electron由来のランチャーと.NET自己完結Readerの署名範囲は別途確認する。
- APIトークンはGitHub Actions secretへ登録し、チャットやGitへ貼らない。
- ビルド → unsigned artifactアップロード → SignPath申請 → 手動承認 →
  署名済みMSI取得 → 署名・タイムスタンプ検証 → SHA256生成 → 公開の順にする。
- 署名が失敗した場合は公開を止める。現時点では署名送信処理は有効にしない。

公式条件: https://signpath.org/terms.html
GitHub連携: https://docs.signpath.io/trusted-build-systems/github
