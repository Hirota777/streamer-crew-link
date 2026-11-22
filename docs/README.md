# 文書一覧

導入手順書はv1.1.6の実画面と操作に更新しています。機能仕様書・制御仕様書はv1.1.2時点の内容です。以降の変更は[v1.1.6リリースノート](RELEASE-116-NOTES.md)を参照してください。制御仕様書は文書版1.1の詳細版です。

| 文書 | ページ数 | 内容 |
| --- | --- | --- |
| [導入手順書](manuals/installation-guide-v1.1.6.pdf) | 8 | 最新実画面。OBS自動連携・11人デモ・初期表示・設定の引き継ぎ |
| [機能仕様書](specifications/functional-spec-v1.1.2.pdf) | 7 | 機能、設定項目、動作条件、既知の制限 |
| [制御仕様書](specifications/control-spec-v1.1.2.pdf) | 24 | 状態遷移、API、保存競合、OBS同期・復元、更新・異常系 |

PDFはGitHubのファイル画面からダウンロードできます。導入手順書は[公式サイト](https://streamer-crew-link-official-hirota.scentedcarat4.chatgpt.site/#download)からも取得できます。

## 配布物との分離

この3冊はソースリポジトリのdocs以下で管理し、アプリのMSI・実行用ZIPへ同梱しません。パッケージ作成はlib・public・obsと指定した本体・法務文書だけをコピーし、docsをコピーしません。製品コードの更新やMSI・ZIPの再発行を伴わない文書追加です。

GitHubが自動生成するSource codeアーカイブは実行用ZIPとは別のソース一式です。
