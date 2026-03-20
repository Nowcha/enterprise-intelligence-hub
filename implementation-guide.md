# Enterprise Intelligence Hub — Claude Code 実装手順書

## 本書の位置づけ

業務要件定義書（BRD v1.1）・システム要件定義書（SRD v1.1）で定義した要件を、Claude Code を使って実装するための手順書である。Phase 0〜6 の各フェーズについて、事前準備・Claude Code への指示（プロンプト例）・完了条件を定義する。

---

## 前提条件

### 必要なアカウント・ツール

| 項目 | 状態 |
|------|------|
| Claude Pro サブスクリプション | 済 |
| Google AI Pro サブスクリプション | 済 |
| GitHub アカウント | 済 |
| Claude Code（CLI） | インストール済 |
| Node.js + npm | インストール済 |
| Python 3.12+ | GitHub Actions 上で使用（ローカル不要） |
| Firebase アカウント（Google Cloud） | **Phase 0 で作成** |

### 事前に手動で行う作業（Firebase Console）

Claude Code では Firebase プロジェクトの作成やサービスアカウントキーの生成はできないため、以下は Firebase Console（ブラウザ）で手動実施する。

1. **Firebase プロジェクト作成**
   - https://console.firebase.google.com/ にアクセス
   - 「プロジェクトを追加」→ プロジェクト名: `enterprise-intelligence-hub`
   - Google アナリティクスは無効でOK

2. **Firestore データベース作成**
   - Firebase Console → 「Firestore Database」→「データベースを作成」
   - ロケーション: `asia-northeast1`（東京）
   - 「テストモードで開始」を選択（後でセキュリティルールを上書きする）

3. **Web アプリの登録**
   - Firebase Console →「プロジェクトの設定」→「アプリを追加」→ Web（`</>`アイコン）
   - アプリのニックネーム: `eih-dashboard`
   - Firebase Hosting は設定しない（GitHub Pages を使用）
   - 表示される `firebaseConfig` オブジェクトを控える（後で `.env` に設定）

4. **サービスアカウントキーの生成**
   - Firebase Console →「プロジェクトの設定」→「サービスアカウント」
   - 「新しい秘密鍵の生成」→ JSONファイルをダウンロード
   - **このファイルはリポジトリにコミットしない**

5. **GitHub Secrets の登録**
   - GitHub リポジトリ →「Settings」→「Secrets and variables」→「Actions」
   - `FIREBASE_SERVICE_ACCOUNT_JSON` にダウンロードしたJSONの内容を貼り付け

---

## Phase 0: 基盤構築（目安: 3日）

### 目的

リポジトリの初期化、Firebase連携の基盤、React プロジェクトの初期化を完了し、全 Phase の土台を作る。

### Step 0-1: リポジトリ作成と初期構造

**GitHub で手動実施:**

- リポジトリ `enterprise-intelligence-hub` を作成（Public、README付き）
- ローカルに clone

**Claude Code プロンプト:**

```
CLAUDE.mdを読み込んで、プロジェクトの初期構造を作成してください。
以下を実施してください：

1. ディレクトリ構造の作成（CLAUDE.mdのディレクトリ構造に従う）
2. .claude/CLAUDE.md と .claude/agents/ 配下の4つのサブエージェント定義を配置
3. .gitignore の作成（node_modules, dist, .env*, __pycache__, *.pyc, firebase-service-account*.json）
4. package.json の初期化（React + Vite + TypeScript + Tailwind CSS）
5. tsconfig.json（strict: true）
6. vite.config.ts（GitHub Pages用のbase設定）
7. tailwind.config.ts
8. collector/requirements.txt（firebase-admin, requests, beautifulsoup4, feedparser, yfinance, pdfplumber, lxml）
9. config/sector_map.json のスケルトン（東証33業種コードのマッピング、最初の数件だけでOK）

まだFirebase初期化やコンポーネント実装は行わないでください。
```

**完了条件:**
- `npm install` が成功する
- `npm run dev` で Vite 開発サーバーが起動する
- ディレクトリ構造が CLAUDE.md と一致する

### Step 0-2: Firebase フロントエンド初期化

**事前準備:** Firebase Console での手動作業（上述）が完了していること。

**Claude Code プロンプト:**

```
Firebase Web SDKの初期化を設定してください。

1. firebase パッケージをインストール（npm install firebase）
2. src/lib/firebase.ts を作成
   - 環境変数 VITE_FIREBASE_* から設定を読み込み
   - initializeApp + getFirestore をエクスポート
3. .env.example を作成（VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID）
4. .env.local を .gitignore に追加済みか確認

firebaseConfigの値は.env.localに設定する想定なので、コードには直接書かないでください。
```

### Step 0-3: Firestore セキュリティルール

**Claude Code プロンプト:**

```
firebase/ディレクトリにFirestoreのセキュリティルールとインデックス定義を作成してください。

1. firebase/firestore.rules
   - companies コレクション配下は全て読み取り専用（allow read: if true; allow write: if false;）
   - サブコレクションも同様

2. firebase/firestore.indexes.json
   - financials: period_type ASC, period DESC
   - news: published_at DESC
   - news: source ASC, published_at DESC

3. firebase/firebase.json（Firestoreルールとインデックスのパス設定のみ）
```

### Step 0-4: Firestore 書き込みクライアント（Python）

**Claude Code プロンプト:**

```
collector/firestore_client.py を作成してください。

機能要件：
- firebase-admin SDKを使用してFirestoreに接続
- 環境変数 FIREBASE_SERVICE_ACCOUNT_JSON からサービスアカウントキーを読み込み（JSON文字列）
- 以下のメソッドを持つ FirestoreClient クラスを実装：
  - __init__(self): Firebase初期化
  - write_company_meta(self, ticker: str, data: dict): companies/{ticker} に書き込み
  - write_financial(self, ticker: str, period: str, data: dict): companies/{ticker}/financials/{period} に書き込み
  - write_governance(self, ticker: str, data: dict): companies/{ticker}/governance に書き込み（単一ドキュメント "latest"）
  - write_competitors(self, ticker: str, data: dict): companies/{ticker}/competitors に書き込み（単一ドキュメント "latest"）
  - write_news_batch(self, ticker: str, articles: list[dict]): companies/{ticker}/news/{hash} にバッチ書き込み
  - write_stock(self, ticker: str, data: dict): companies/{ticker}/stock に書き込み（単一ドキュメント "latest"）
  - write_analysis(self, ticker: str, analysis_type: str, data: dict): companies/{ticker}/analysis/{analysis_type} に書き込み
- 全メソッドで collected_at（サーバータイムスタンプ）と schema_version（"1.0.0"）を自動付与
- batch writeを使用して複数ドキュメントのアトミック更新をサポート
- type hintsを必ず付与

CLAUDE.mdのデータモデル定義を参照してください。
```

### Step 0-5: GitHub Actions 初期設定

**Claude Code プロンプト:**

```
GitHub Actionsのワークフローファイルを3つ作成してください。

1. .github/workflows/collect.yml
   - workflow_dispatch トリガー（inputs: ticker(string,required), mode(choice:full/update,required), include_competitors(boolean,default:true)）
   - ubuntu-latest
   - Python 3.12 セットアップ
   - pip install -r collector/requirements.txt
   - FIREBASE_SERVICE_ACCOUNT_JSON を secrets から環境変数に設定
   - python collector/main.py --ticker ${{ inputs.ticker }} --mode ${{ inputs.mode }} --include-competitors ${{ inputs.include_competitors }}
   - 注: main.py はまだスケルトンでOK

2. .github/workflows/analyze.yml
   - workflow_run トリガー（collect.yml完了時）
   - スケルトンのみ（Claude Code実行ステップは Phase 5 で実装）

3. .github/workflows/deploy.yml
   - push to main トリガー（paths: src/**, package.json, vite.config.ts に限定）
   - Node.js 20 セットアップ
   - npm ci → npm run build
   - GitHub Pages へデプロイ（actions/deploy-pages@v4）
```

### Step 0-6: 収集オーケストレータのスケルトン

**Claude Code プロンプト:**

```
collector/main.py のスケルトンを作成してください。

- argparse でCLI引数を受け取る（--ticker, --mode, --include-competitors）
- 各ソースモジュールのimport（まだ未実装なので pass のスケルトン関数を各 sources/*.py に作成）
- FirestoreClientのインスタンス化
- ソース別に try/except で独立した例外処理（1ソースの失敗が全体を停止させない）
- ログ出力（logging モジュール使用、INFO/WARNING/ERROR）
- メイン処理フロー:
  1. 企業名→証券コード解決（edinet.resolve_ticker）
  2. 各ソースからデータ収集（並列ではなく順次でOK、Phase後半で並列化検討）
  3. FirestoreClientで書き込み
  4. mode=full の場合、競合推定実行
  5. include_competitors=true の場合、競合企業のデータも収集

全sourcesファイル（edinet.py, xbrl_parser.py, pdf_extractor.py, google_news.py, stock_price.py, ir_scraper.py）と competitors/estimator.py にスケルトン（関数シグネチャ + pass）を作成してください。
type hints必須。
```

### Step 0-7: 東証33業種コードマッピング

**Claude Code プロンプト:**

```
config/sector_map.json を完成させてください。

東証の33業種分類の全コードと名称のマッピングを作成してください。
形式:
{
  "0050": {"name": "水産・農林業", "name_en": "Fishery, Agriculture & Forestry"},
  ...
}

全33業種を網羅してください。Webで確認して正確なコード・名称を使用してください。
```

### Step 0-8: Phase 0 動作確認

**Claude Code プロンプト:**

```
Phase 0の動作確認を行います。以下を順番に確認してください：

1. npm run dev でVite開発サーバーが起動するか
2. npm run build でビルドが成功するか
3. TypeScriptのコンパイルエラーがないか（npx tsc --noEmit）
4. collector/main.py が --help で正常にヘルプを表示するか
5. collector/firestore_client.py のimportエラーがないか（python -c "from collector.firestore_client import FirestoreClient"）
6. config/sector_map.json が33件のエントリを持つか

問題があれば修正してください。
```

---

## Phase 1: ガバナンス（P1）実装（目安: 2週間）

### 目的

最優先のP1（経営陣・ガバナンス）を実装する。EDINET APIからの有価証券報告書取得、ガバナンスデータの抽出、GovernanceViewコンポーネントの表示まで。

### Step 1-1: EDINET API クライアント

**Claude Code プロンプト:**

```
collector/sources/edinet.py を実装してください。

EDINET API v2（https://disclosure.edinet-fsa.go.jp/api/v2/）のクライアントを実装します。

機能：
1. resolve_ticker(query: str) -> tuple[str, str, str]
   - 企業名または証券コードから (edinet_code, ticker, company_name) を返す
   - /api/v2/documents.json で検索

2. search_documents(edinet_code: str, doc_type: str, from_date: str, to_date: str) -> list[dict]
   - 指定期間の書類一覧を取得
   - doc_type: "120"（有価証券報告書）, "140"（四半期報告書）, "160"（決算短信）等

3. download_document(doc_id: str, output_type: int = 1) -> bytes
   - type=1: XBRL、type=2: PDF
   - リトライ3回、指数バックオフ

4. get_company_meta(edinet_code: str) -> dict
   - 企業基本情報を取得してCompanyMeta形式で返す

エラーハンドリング:
- HTTPエラー時のリトライ（3回、指数バックオフ）
- レート制限対応（1秒間隔）
- タイムアウト30秒

EDINET APIはAPIキー不要の公開APIです。
type hints必須、docstring必須。
```

### Step 1-2: PDF抽出によるガバナンスデータ取得

**Claude Code プロンプト:**

```
collector/sources/pdf_extractor.py を実装してください。

有価証券報告書のPDFからガバナンス関連情報を抽出します。

機能：
1. extract_text_from_pdf(pdf_bytes: bytes) -> str
   - pdfplumberでPDF全文テキストを抽出

2. extract_governance_section(full_text: str) -> str
   - 「コーポレート・ガバナンスの状況」セクションを抽出
   - セクション区切りの正規表現パターンで特定

3. extract_board_members(governance_text: str) -> list[dict]
   - 取締役・監査役一覧を抽出（氏名、役職、社外/社内）
   - テーブル形式のテキストをパース

4. extract_major_shareholders(full_text: str) -> list[dict]
   - 大株主の状況セクションから上位10名を抽出

5. extract_executive_compensation(full_text: str) -> dict
   - 役員報酬セクションから報酬体系を抽出

注意：PDFからの抽出は完璧でなくてOK。Phase 5でClaude Codeサブエージェントによる精度向上を行う。
まずはベストエフォートで動くものを作る。
```

### Step 1-3: GovernanceView コンポーネント

**Claude Code プロンプト:**

```
ガバナンス情報を表示するReactコンポーネント群を作成してください。

1. src/hooks/useGovernance.ts
   - Firestore の companies/{ticker}/governance ドキュメントを onSnapshot で購読
   - loading, error, data を返すカスタムフック

2. src/hooks/useCompany.ts
   - Firestore の companies/{ticker} トップレベルドキュメントを onSnapshot で購読
   - CompanyMeta型のデータを返す

3. src/components/GovernanceView/GovernanceView.tsx
   - 取締役会構成（テーブル: 氏名、役職、社外/社内、独立性）
   - 社外取締役比率のハイライト表示
   - 大株主構成のドーナツチャート（Chart.js）
   - 委員会設置状況のステータス表示
   - ローディング中のスケルトンUI
   - Tailwind CSSでスタイリング、日本語UI

4. src/components/GovernanceView/index.ts（re-export）

5. src/App.tsx を更新して、仮の証券コードでGovernanceViewを表示

Chart.jsのドーナツチャートでは、大株主上位5名とその他で構成比を表示してください。
カラーパレットはダークネイビー系（#1B365D基調）で統一してください。
```

### Step 1-4: 収集→Firestore→表示の結合テスト

**Claude Code プロンプト:**

```
Phase 1の結合テストを行います。

1. collector/main.py で特定の企業（例: トヨタ自動車、証券コード7203）のガバナンスデータを収集してFirestoreに書き込むテストスクリプトを作成してください
   - collector/test_collect_governance.py として作成
   - FIREBASE_SERVICE_ACCOUNT_JSON 環境変数が必要
   - EDINET API でトヨタの最新有価証券報告書を取得
   - PDFからガバナンスデータを抽出
   - Firestore に書き込み

2. フロントエンドで companies/7203 のガバナンスデータが表示されることを確認
   - .env.local にFirebase設定が必要

実際に動かす前に、テストスクリプトのコードを見せてください。
```

---

## Phase 2: 財務分析（P2）実装（目安: 2週間）

### Step 2-1: XBRLパーサー

**Claude Code プロンプト:**

```
collector/sources/xbrl_parser.py を実装してください。

EDINETから取得したXBRLデータから財務数値を抽出するパーサーです。

機能：
1. parse_xbrl(xbrl_zip_bytes: bytes) -> dict
   - EDINET API type=1 で取得したZIPを解凍
   - XBRL インスタンスドキュメントを特定
   - lxml でパース

2. extract_financials(xbrl_tree) -> dict
   - CLAUDE.mdのFinancialPeriod型に合致するデータを抽出
   - JPCRPタクソノミの主要タグマッピング:
     - jppfs_cor:Revenue → revenue
     - jppfs_cor:OperatingIncome → operating_income
     - jppfs_cor:OrdinaryIncome → ordinary_income
     - jppfs_cor:NetIncomeLoss → net_income
     - jppfs_cor:TotalAssets → total_assets
     - jppfs_cor:NetAssets → net_assets
     - 等
   - IFRS適用企業の場合は ifrs-full: プレフィックスのタグも対応
   - 未知のタグはwarningログを出力

3. extract_segments(xbrl_tree) -> list[dict]
   - セグメント情報の抽出

4. calculate_derived_metrics(financials: dict) -> dict
   - ROE, ROA, 自己資本比率, 営業利益率等の算出指標を計算

マッピングテーブルは辞書で定義し、段階的に拡充可能な構造にしてください。
未マッピングのタグに遭遇した場合はログ出力して処理を継続してください。
```

### Step 2-2: 財務データ収集の結合

**Claude Code プロンプト:**

```
collector/main.py を更新し、財務データ収集フローを追加してください。

1. EDINET APIで直近5期分の有価証券報告書を検索
2. 各期のXBRLデータを取得
3. xbrl_parser.py でパース
4. XBRL取得失敗 or パース失敗の場合は pdf_extractor.py でフォールバック
5. calculate_derived_metrics で算出指標を追加
6. firestore_client.write_financial で期別にFirestoreへ書き込み

data_source フィールドに "xbrl" または "pdf_extraction" を設定してください。
```

### Step 2-3: FinancialCharts コンポーネント

**Claude Code プロンプト:**

```
財務分析画面のコンポーネントを作成してください。

1. src/hooks/useFinancials.ts
   - companies/{ticker}/financials サブコレクションを onSnapshot で購読
   - period_type でフィルタリング可能
   - period降順でソート

2. src/components/FinancialCharts/FinancialCharts.tsx
   以下のチャートを Chart.js + react-chartjs-2 で実装：
   - 売上高・営業利益・純利益の推移（折れ線グラフ、5期分）
   - 営業利益率・ROE・ROAの推移（折れ線グラフ）
   - セグメント別売上構成（積み上げ棒グラフ）
   - キャッシュフロー推移（棒グラフ: 営業CF, 投資CF, 財務CF）
   - 年次/四半期の切り替えタブ

3. 各チャートの下に主要指標のサマリーテーブルを表示

カラーパレット: #1B365D（メイン）、#2E75B6（アクセント）、#D4760A（警告系）
レスポンシブ対応（PC優先）。日本語ラベル。数値は百万円単位で3桁カンマ区切り。
```

---

## Phase 3: 競合比較（P3）実装（目安: 1.5週間）

### Step 3-1: 競合推定ロジック

**Claude Code プロンプト:**

```
collector/competitors/estimator.py を実装してください。

競合企業の自動推定ロジックを実装します。

機能：
1. estimate_competitors(ticker: str, sector_code: str, revenue: float, sector_map: dict, firestore_client) -> list[dict]
   - sector_map から同一業種の企業リストを取得
   - 各企業の売上高をFirestoreから取得（未登録の場合はEDINET APIで簡易取得）
   - 売上高フィルタ: 対象企業の0.3倍〜3倍の範囲
   - 売上規模の近い順にソート、上位5社を返却
   - 各エントリに推定理由（reason）を付与

2. 補助関数:
   - get_sector_companies(sector_code: str) -> list[dict]: EDINETの提出者一覧から同業種企業を取得
   - get_simple_revenue(edinet_code: str) -> float | None: 直近の売上高を簡易取得

注意: 東証33業種コードは config/sector_map.json を参照。
EDINET API で同一業種の提出者を検索する際、全件取得は非効率なのでキャッシュ戦略を検討してください。
```

### Step 3-2: CompetitorBenchmark コンポーネント

**Claude Code プロンプト:**

```
競合比較画面のコンポーネントを作成してください。

1. src/hooks/useCompetitors.ts
   - companies/{ticker}/competitors を onSnapshot で購読

2. src/components/CompetitorBenchmark/CompetitorBenchmark.tsx
   - レーダーチャート: 売上高、営業利益率、ROE、PER、成長率の5軸で競合比較
   - 散布図: X軸=売上高、Y軸=営業利益率のポジションマップ（対象企業をハイライト）
   - 比較テーブル: 全指標を一覧表示（対象企業の行をハイライト）
   - 競合企業の追加/削除UI（手動追加用の証券コード入力フォーム）

チャートのツールチップに企業名と数値を表示。
対象企業は濃い色、競合企業は薄い色で描画。
```

---

## Phase 4: 業界トレンド（P4）実装（目安: 1週間）

### Step 4-1: Google News RSS 収集

**Claude Code プロンプト:**

```
collector/sources/google_news.py を実装してください。

Google News RSS フィードからニュース記事を収集します。

機能：
1. fetch_news(company_name: str, max_articles: int = 30) -> list[dict]
   - URL: https://news.google.com/rss/search?q={company_name}&hl=ja&gl=JP&ceid=JP:ja
   - feedparser でRSSをパース
   - 各記事: title, url, source, published_at を抽出
   - URLのSHA256ハッシュを article_hash として生成（Firestore ドキュメントID用）

2. fetch_industry_news(sector_name: str, max_articles: int = 20) -> list[dict]
   - 業種名でニュースを検索

3. deduplicate(articles: list[dict], existing_hashes: set[str]) -> list[dict]
   - 既存記事との重複排除

feedparserでのパースエラーは警告ログを出して該当記事をスキップ。
Google News RSSにはAPIキー不要です。
```

### Step 4-2: 株価データ収集

**Claude Code プロンプト:**

```
collector/sources/stock_price.py を実装してください。

yfinance を使用して株価データを収集します。

機能：
1. fetch_stock_data(ticker: str, period: str = "5y") -> dict
   - yfinance で東証銘柄の日次OHLCVを取得（ティッカーは "{ticker}.T" 形式）
   - CLAUDE.mdのStockData型に合致する形式で返す
   - daily配列（直近5年分の日次データ）
   - derived: PER, PBR, 時価総額, 配当利回り, MA50, MA200, 30日ボラティリティ

2. calculate_derived_metrics(daily_data, financials) -> dict
   - 株価データと財務データを結合してバリュエーション指標を算出
   - PER = 株価 / EPS
   - PBR = 株価 / BPS
   - 配当利回り = 配当/株価

yfinanceの接続失敗時はリトライ（3回）。
東証銘柄のティッカーはyfinanceでは "{ticker}.T" の形式で指定します。
```

### Step 4-3: NewsTimeline コンポーネント

**Claude Code プロンプト:**

```
ニュースタイムライン画面のコンポーネントを作成してください。

1. src/hooks/useNews.ts
   - companies/{ticker}/news サブコレクションを onSnapshot で購読
   - published_at降順、limit指定可能

2. src/components/NewsTimeline/NewsTimeline.tsx
   - タイムライン形式でニュース記事を表示
   - 各記事: タイトル（外部リンク）、ソース名、発行日時
   - 無限スクロールまたは「もっと読む」ボタン
   - ソース別フィルタリング（タブ: 全て / Google News / IRページ）
   - 新着記事のハイライト（直近24時間以内）

シンプルで視認性の高いデザイン。日付は「YYYY/MM/DD HH:mm」形式。
```

---

## Phase 5: AI分析統合（目安: 1.5週間）

### Step 5-1: Firestore リーダー（分析用）

**Claude Code プロンプト:**

```
analyzer/firestore_reader.py を実装してください。

AI分析エンジンがFirestoreからデータを読み出すためのクライアントです。

機能：
1. read_company(ticker: str) -> dict: 企業基本情報
2. read_all_financials(ticker: str) -> list[dict]: 全期間の財務データ
3. read_governance(ticker: str) -> dict: ガバナンス情報
4. read_competitors(ticker: str) -> dict: 競合情報（ベンチマークデータ含む）
5. read_news(ticker: str, limit: int = 50) -> list[dict]: ニュース一覧
6. read_previous_analysis(ticker: str, analysis_type: str) -> dict | None: 前回分析結果

firebase-admin SDK使用。サービスアカウント認証。
```

### Step 5-2: 分析プロンプトの作成

**Claude Code プロンプト:**

```
analyzer/prompts/ 配下の4つの分析プロンプトを作成してください。

各プロンプトは .claude/agents/ のサブエージェント定義に基づき、
Firestore から読み出したデータを入力として渡す形式にします。

1. analyzer/prompts/summary.md
   - 全データを統合した企業概要サマリー生成プロンプト
   - analysis/summary の JSON Schema を指定

2. analyzer/prompts/financial.md
   - 財務データ分析プロンプト
   - .claude/agents/financial-analyst.md の出力スキーマに準拠

3. analyzer/prompts/governance.md
   - ガバナンス分析プロンプト
   - .claude/agents/governance-analyst.md の出力スキーマに準拠
   - 5段階スコアリング基準を含める

4. analyzer/prompts/competitor.md
   - 競合分析プロンプト
   - .claude/agents/competitor-analyst.md の出力スキーマに準拠

各プロンプトには以下を含めてください：
- 役割定義（あなたは経営コンサルティング向けの○○アナリストです）
- 入力データの説明（以下のJSON形式のデータが提供されます）
- 出力JSONスキーマ（この形式で出力してください）
- 分析ルール（.claude/agents/*.md から転記）
- 前回分析結果がある場合の差分分析指示
```

### Step 5-3: 分析実行スクリプト

**Claude Code プロンプト:**

```
analyzer/run_analysis.sh を実装してください。

GitHub Actions上でClaude Codeを使って分析を実行するシェルスクリプトです。

処理フロー：
1. 引数: ticker（証券コード）
2. firestore_reader.py で対象企業の全データを読み出し、JSONファイルに一時保存
3. 各分析プロンプトに対して claude --print コマンドを実行
   - プロンプトファイル + データJSONを入力として渡す
   - 出力をJSONとしてパース
4. 分析結果をfirestore_client.pyでFirestoreに書き込み

注意: claude CLI の正確な使い方はClaude Codeのドキュメントを確認してください。
まずはスケルトンとして、プロンプト読み込み→データ結合→出力パース→Firestore書き込みの流れを作ってください。
Claude Code CLI の呼び出し部分は後で調整する前提でOKです。
```

### Step 5-4: analyze.yml の完成

**Claude Code プロンプト:**

```
.github/workflows/analyze.yml を完成させてください。

- workflow_run トリガー（collect.yml完了時）
- Ubuntu-latest
- Python 3.12セットアップ + requirements.txt インストール
- Claude Code CLIのセットアップ（npx @anthropic/claude-code等）
- FIREBASE_SERVICE_ACCOUNT_JSON を secrets から設定
- analyzer/run_analysis.sh を実行
- タイムアウト: 15分
```

### Step 5-5: AI分析結果の表示

**Claude Code プロンプト:**

```
AI分析結果をダッシュボードに表示するコンポーネントを作成してください。

1. src/hooks/useAnalysis.ts
   - companies/{ticker}/analysis/* を onSnapshot で購読
   - summary, financial_insight, governance_assessment, competitor_insight を返す

2. 各既存コンポーネントにAI分析結果を統合:
   - GovernanceView: governance_assessment.overall_score を5段階スコアバッジで表示
   - FinancialCharts: financial_insight のトレンド判定とコメントを各チャート下に表示
   - CompetitorBenchmark: competitor_insight のポジション評価を表示
   - NewsTimeline: news_digest のセンチメント・主要テーマを上部に表示

3. src/components/Dashboard/AISummaryCard.tsx（新規）
   - analysis/summary のデータを企業概要カードとして表示
   - ガバナンススコア、財務トレンド、リスク・機会のハイライト
   - コンサルティング示唆のリスト表示
```

---

## Phase 6: 統合ダッシュボード（目安: 1週間）

### Step 6-1: メインダッシュボード

**Claude Code プロンプト:**

```
メインダッシュボード画面を作成してください。

src/components/Dashboard/Dashboard.tsx:
- グリッドレイアウト（2列×3行）
- 上段左: 企業概要カード（社名、業種、時価総額、AI概要サマリー）
- 上段右: ガバナンススコアカード（5段階評価、経営陣ハイライト）
- 中段（全幅）: 財務ハイライトチャート（売上・利益推移の折れ線グラフ）
- 下段左: 競合ポジションマップ（散布図のミニ版）
- 下段右: 最新ニュースフィード（直近5件）

各カードはクリックで詳細画面に遷移。
React Router を使用してページ遷移を実装:
- / : ダッシュボード（企業選択）
- /company/{ticker} : メインダッシュボード
- /company/{ticker}/financials : 財務分析詳細
- /company/{ticker}/governance : ガバナンス詳細
- /company/{ticker}/competitors : 競合比較詳細
- /company/{ticker}/news : ニュース詳細
```

### Step 6-2: 企業検索・登録画面

**Claude Code プロンプト:**

```
企業検索・登録画面を作成してください。

src/components/CompanySearch/CompanySearch.tsx:
- 証券コード入力フィールド（4桁数字）
- 企業名検索フィールド（テキスト入力→サジェスト）
- 検索結果の表示（企業名、証券コード、業種、市場区分）
- 「データ収集を開始」ボタン（GitHub Actionsのworkflow_dispatchへのリンクを表示）
- 直近で収集済みの企業リスト（Firestoreのcompaniesコレクション一覧）

注意：フロントエンドからGitHub Actions APIを直接叩くのではなく、
workflow_dispatchのURLを表示して手動トリガーを促す形でOKです。
将来的にはGitHub APIトークンを使った自動トリガーも検討。

企業名サジェストは、config/sector_map.jsonと組み合わせた簡易的なものでOK。
本格的なサジェストはPhase後半で改善。
```

### Step 6-3: 差分検知・ハイライト

**Claude Code プロンプト:**

```
データの差分検知とハイライト表示機能を追加してください。

1. src/utils/diffDetector.ts
   - 前回収集データと最新データを比較し、変更点を検出
   - 財務数値: 前期比で一定以上（±5%以上）の変動をハイライト
   - ガバナンス: 取締役の変更（就任/退任）を検知
   - 競合: 順位変動を検知
   - ニュース: 直近24時間以内の新着をマーク

2. 各コンポーネントに差分表示を統合
   - 変更があったフィールドに「NEW」「CHANGED」「↑」「↓」等のバッジを表示
   - ダッシュボード上部に「最終更新: YYYY/MM/DD HH:mm」と変更サマリーを表示

3. collected_at フィールドを活用して「前回」と「今回」を区別
```

### Step 6-4: 最終調整・E2Eテスト

**Claude Code プロンプト:**

```
Phase 6の最終調整を行います。

1. 全画面のレスポンシブ確認（PC: 1280px以上、タブレット: 768px以上）
2. ローディング状態のUI確認（スケルトンUI or スピナー）
3. エラー状態のUI確認（Firestore接続失敗、データなし）
4. ダークネイビー系カラーパレットの統一確認
5. Chart.jsのチャートが全て正常に描画されるか確認
6. React Router の全ルートが正常に動作するか確認
7. GitHub Pages デプロイのビルド確認（npm run build が成功するか）
8. Lighthouse でパフォーマンス確認（LCP 3秒以内が目標）

問題を発見したら修正してください。
```

---

## 実装上の注意事項

### Claude Code への指示のコツ

1. **CLAUDE.md を常に参照させる**: 最初のプロンプトで「CLAUDE.mdを読み込んで」と指示する
2. **1ステップずつ**: 大きなタスクは分割して依頼する。一度に複数ファイルの大規模実装を頼まない
3. **型定義を先に**: TypeScript の型定義（src/types/）を先に確定させてからコンポーネント実装に入る
4. **テスト駆動**: 各ステップで動作確認を行い、壊れた状態で次に進まない
5. **コミット粒度**: 各ステップ完了時にコミットする

### よくある問題と対処

| 問題 | 対処 |
|------|------|
| EDINET API がタイムアウトする | リトライ間隔を長くする（5秒→10秒→20秒） |
| XBRL パースで未知のタグ | 警告ログ出力して継続。PDF フォールバック |
| yfinance で東証銘柄が取得できない | ティッカー形式確認（"7203.T"）、リトライ |
| Firestore の書き込みがバッチ上限超過 | 500件ずつ分割して batch commit |
| Chart.js が真っ白 | データの null チェック、空配列チェック |
| GitHub Pages で 404 | vite.config.ts の base 設定確認 |

### Firebase 無料枠の目安

| リソース | Spark プラン無料枠 | 本ツールの想定使用量 |
|---------|-------------------|---------------------|
| Firestore 読み取り | 50,000/日 | ~500/日（個人利用） |
| Firestore 書き込み | 20,000/日 | ~200/収集実行 |
| Firestore ストレージ | 1GB | ~50MB/企業 |

個人利用であれば Spark プラン（無料）で十分運用可能。
