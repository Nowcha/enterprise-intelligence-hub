# Enterprise Intelligence Hub - CLAUDE.md

経営コンサルティング支援ツール。日本の上場企業を対象に、企業情報の自動収集・AI分析・ダッシュボード可視化を行う。

## プロジェクト概要

- **目的**: コンサルタントのアサイン前リサーチおよびアサイン中モニタリングを効率化
- **対象**: 東証上場企業（1社深掘り + 競合3〜5社比較）
- **利用者**: 個人利用（シングルユーザー）
- **UI言語**: 日本語のみ

## 技術スタック

### フロントエンド
- React + Vite + TypeScript + Tailwind CSS
- Chart.js + react-chartjs-2（チャート描画）
- Firebase Web SDK v9+（Firestore接続）
- GitHub Pages でホスティング

### バックエンド（データ収集・分析）
- Python 3.12+（GitHub Actions ubuntu-latest 上で実行）
- firebase-admin SDK（Firestore書き込み）
- Claude Code サブエージェント（AI分析）

### データストア
- Cloud Firestore（NoSQLドキュメントDB）
- Firebase プロジェクト内で管理

### CI/CD
- GitHub Actions（collect.yml → analyze.yml → deploy.yml）

## ディレクトリ構造

```
enterprise-intelligence-hub/
├── .github/workflows/
│   ├── collect.yml          # データ収集→Firestore書き込み
│   ├── analyze.yml          # AI分析→Firestore書き込み
│   └── deploy.yml           # GitHub Pagesデプロイ（コード変更時のみ）
├── .claude/
│   ├── CLAUDE.md            # このファイル
│   └── agents/
│       ├── financial-analyst.md
│       ├── governance-analyst.md
│       ├── competitor-analyst.md
│       └── industry-analyst.md
├── collector/               # Python収集エンジン
│   ├── requirements.txt
│   ├── main.py              # 収集オーケストレータ
│   ├── firestore_client.py  # Firestore書き込み抽象化
│   ├── sources/
│   │   ├── edinet.py        # EDINET API v2
│   │   ├── xbrl_parser.py   # XBRLパーサー
│   │   ├── pdf_extractor.py # PDFテキスト抽出
│   │   ├── google_news.py   # Google News RSS
│   │   ├── stock_price.py   # 株価データ（yfinance）
│   │   └── ir_scraper.py    # 企業IRページスクレイピング
│   └── competitors/
│       └── estimator.py     # 競合自動推定ロジック
├── analyzer/                # AI分析エンジン
│   ├── firestore_reader.py  # Firestore読み出し
│   ├── prompts/
│   │   ├── summary.md
│   │   ├── financial.md
│   │   ├── governance.md
│   │   └── competitor.md
│   └── run_analysis.sh
├── firebase/
│   ├── firestore.rules
│   ├── firestore.indexes.json
│   └── firebase.json
├── src/                     # Reactフロントエンド
│   ├── App.tsx
│   ├── lib/
│   │   └── firebase.ts      # Firebase初期化
│   ├── hooks/
│   │   ├── useCompany.ts
│   │   ├── useFinancials.ts
│   │   ├── useGovernance.ts
│   │   ├── useCompetitors.ts
│   │   ├── useNews.ts
│   │   └── useAnalysis.ts
│   ├── components/
│   │   ├── Dashboard/
│   │   ├── FinancialCharts/
│   │   ├── GovernanceView/
│   │   ├── CompetitorBenchmark/
│   │   ├── NewsTimeline/
│   │   └── CompanySearch/
│   ├── types/
│   └── utils/
├── config/
│   └── sector_map.json      # 東証33業種マッピング
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.ts
```

## Firestoreデータモデル

### コレクション階層

```
companies/{ticker}                    # ドキュメントID = 証券コード（例: "7203"）
  ├─ [フィールド] meta情報           # 企業基本情報
  ├─ financials/{period}              # サブコレクション: 期別財務データ
  ├─ governance                       # サブコレクション内の単一ドキュメント
  ├─ competitors                      # サブコレクション内の単一ドキュメント
  ├─ news/{article_hash}             # サブコレクション: ニュース記事
  ├─ stock                           # サブコレクション内の単一ドキュメント
  └─ analysis/                       # サブコレクション: AI分析結果
      ├─ summary
      ├─ financial_insight
      ├─ governance_assessment
      └─ competitor_insight
```

### 共通ルール
- 全ドキュメントに `collected_at`（timestamp）と `schema_version`（string, semver）を必須フィールドとする
- 証券コードをドキュメントIDとして使用する（例: `companies/7203`）
- 時系列データはサブコレクション、単一時点データはドキュメントフィールドで管理
- Firestoreドキュメントサイズ上限（1MB）を考慮し、大きなデータはサブコレクションに分割

### companies/{ticker} トップレベルフィールド

```typescript
interface CompanyMeta {
  edinet_code: string;
  ticker: string;
  company_name: string;
  company_name_en: string | null;
  sector_code_33: string;
  sector_name: string;
  listing_market: 'プライム' | 'スタンダード' | 'グロース';
  founded_date: string | null;
  employee_count: number | null;
  fiscal_year_end: string;     // 例: "03"
  website_url: string | null;
  ir_url: string | null;
  description: string | null;  // AI要約
  collected_at: Timestamp;
  schema_version: string;
}
```

### financials/{period}

```typescript
interface FinancialPeriod {
  period: string;              // 例: "2025-03", "2024-12-Q3"
  period_type: 'annual' | 'quarterly';
  revenue: number;             // 売上高（百万円）
  operating_income: number;    // 営業利益
  ordinary_income: number;     // 経常利益
  net_income: number;          // 当期純利益
  total_assets: number;        // 総資産
  net_assets: number;          // 純資産
  equity_ratio: number;        // 自己資本比率（%）
  roe: number | null;
  roa: number | null;
  operating_cf: number | null;
  investing_cf: number | null;
  financing_cf: number | null;
  eps: number | null;
  dividend_per_share: number | null;
  segments: Segment[];
  data_source: 'xbrl' | 'pdf_extraction';
  collected_at: Timestamp;
  schema_version: string;
}

interface Segment {
  name: string;
  revenue: number;
  operating_income: number | null;
}
```

### governance

```typescript
interface GovernanceData {
  board_members: BoardMember[];
  outside_director_ratio: number;
  committees: Committee[];
  executive_compensation: {
    fixed_ratio: number;
    variable_ratio: number;
    total_amount: number | null;
  };
  major_shareholders: Shareholder[];
  cross_shareholdings: CrossShareholder[];
  cg_report_url: string | null;
  collected_at: Timestamp;
  schema_version: string;
}

interface BoardMember {
  name: string;
  role: string;            // 代表取締役, 取締役, 社外取締役, 監査役 等
  is_outside: boolean;
  is_independent: boolean;
  career_summary: string | null;
  appointment_year: number | null;
}

interface Committee {
  name: string;            // 指名委員会, 報酬委員会, 監査委員会
  exists: boolean;
  chair_name: string | null;
  member_count: number | null;
}

interface Shareholder {
  name: string;
  shares_held: number;
  ownership_ratio: number; // %
}

interface CrossShareholder {
  company_name: string;
  ticker: string | null;
  shares_held: number;
  book_value: number | null;
  purpose: string | null;
}
```

### competitors

```typescript
interface CompetitorData {
  target_ticker: string;
  estimated_competitors: CompetitorEntry[];
  manual_competitors: CompetitorEntry[];
  benchmark_data: BenchmarkEntry[];
  estimation_method: string;
  collected_at: Timestamp;
  schema_version: string;
}

interface CompetitorEntry {
  ticker: string;
  company_name: string;
  reason: string;          // 推定理由（自動推定の場合）
}

interface BenchmarkEntry {
  ticker: string;
  company_name: string;
  revenue: number;
  operating_margin: number;
  roe: number | null;
  per: number | null;
  pbr: number | null;
  market_cap: number | null;
}
```

### news/{article_hash}

```typescript
interface NewsArticle {
  title: string;
  url: string;
  source: string;          // "google_news", "ir_page" 等
  published_at: Timestamp;
  summary: string | null;  // AI要約
  collected_at: Timestamp;
  schema_version: string;
}
```

### stock

```typescript
interface StockData {
  daily: DailyPrice[];     // 直近5年分
  derived: {
    per: number | null;
    pbr: number | null;
    market_cap: number | null;
    dividend_yield: number | null;
    ma_50: number | null;
    ma_200: number | null;
    volatility_30d: number | null;
  };
  collected_at: Timestamp;
  schema_version: string;
}

interface DailyPrice {
  date: string;            // "2025-03-18"
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
```

### analysis/* (AI分析結果)

```typescript
interface AnalysisSummary {
  company_profile: string;
  governance_score: {
    rating: 1 | 2 | 3 | 4 | 5;
    comment: string;
  };
  financial_highlights: {
    trend: 'improving' | 'stable' | 'declining';
    key_metrics: Record<string, number>;
    comment: string;
  };
  competitive_position: string;
  risks: string[];
  opportunities: string[];
  consulting_suggestions: string[];
  analyzed_at: Timestamp;
  schema_version: string;
}
```

## 情報ソース

| ソース | 取得方法 | APIキー |
|--------|----------|---------|
| EDINET API v2 | REST API | 不要 |
| Google News RSS | feedparser | 不要 |
| 株価（yfinance） | Python ライブラリ | 不要 |
| 企業IRページ | requests + BeautifulSoup4 | 不要 |
| Firestore | firebase-admin SDK (Python) / Firebase Web SDK (TS) | Firebase サービスアカウント |

## 開発ルール

### 全般
- TypeScript strict mode を有効にする
- Python は type hints を必ず付与する
- コミットメッセージは日本語で記述する
- ブランチ戦略: main直接プッシュ（個人プロジェクト）

### フロントエンド
- コンポーネントは関数コンポーネント + hooks パターン
- Firestore からのデータ取得はカスタムフック（src/hooks/）に集約
- onSnapshot でリアルタイムリスナーを使用し、データ変更時に自動再レンダリング
- Chart.js のチャートは react-chartjs-2 でラップ
- Tailwind CSS のユーティリティクラスのみ使用（カスタムCSS最小化）
- 環境変数は `VITE_FIREBASE_*` プレフィックスで管理

### バックエンド（Python）
- Firestore への書き込みは firestore_client.py を経由する
- batch write で複数ドキュメントをアトミックに更新
- collected_at タイムスタンプは firestore_client.py が自動付与
- ソース別の独立した例外処理（1ソースの失敗が全体を停止させない）
- EDINET API のリトライ: 3回、指数バックオフ

### Firebase
- Firestore セキュリティルール: フロントエンドからは読み取り専用
- firebase-admin SDK（Python）: サービスアカウント認証で全権限
- GitHub Secrets に `FIREBASE_SERVICE_ACCOUNT_JSON` を格納
- Firebase Web 設定（apiKey等）は環境変数経由

### テスト
- フロントエンド: Vitest
- バックエンド: pytest
- Firestore エミュレータでのローカルテスト環境構築

## GitHub Actions ワークフロー

### パイプライン連鎖

```
手動トリガー → collect.yml（収集→Firestore） → 自動トリガー → analyze.yml（分析→Firestore）
```

deploy.yml はコード変更時のみ実行。データ更新時の再ビルドは不要（Firestoreリアルタイム取得のため）。

### collect.yml 入力パラメータ

| パラメータ | 型 | 必須 | 説明 |
|------------|-----|------|------|
| ticker | string | ○ | 証券コード（4桁）または企業名 |
| mode | choice | ○ | "full"（全データ）/ "update"（差分のみ） |
| include_competitors | boolean | — | 競合データも収集するか（デフォルト: true） |

### collect.yml 実行ステップ

1. Python環境セットアップ（3.12 + requirements.txt + firebase-admin）
2. Firebase サービスアカウント認証（GitHub Secrets）
3. 企業名の場合は EDINET API で証券コード解決
4. ソース別並列収集（EDINET, Google News RSS, 株価, IRページ）
5. データ正規化・バリデーション
6. Firestore batch write で全データをアトミックに書き込み
7. mode=full の場合、競合企業自動推定を実行
8. include_competitors=true の場合、推定企業のデータも収集

### analyze.yml 実行ステップ

1. collect.yml 完了を workflow_run でトリガー
2. Firestore から対象企業の最新データを読み出し
3. 4つのサブエージェントを順次実行
4. 分析結果を Firestore の analysis サブコレクションに書き込み

## サブエージェント

4つの専門サブエージェントを `.claude/agents/` に定義する。

| エージェント | 入力（Firestore） | 出力（Firestore） |
|-------------|-------------------|-------------------|
| financial-analyst | financials/* | analysis/financial_insight |
| governance-analyst | governance | analysis/governance_assessment |
| competitor-analyst | competitors + 各社financials | analysis/competitor_insight |
| industry-analyst | news/* + macro | analysis/industry_insight |

詳細は各エージェントファイルを参照。

## 競合推定アルゴリズム

1. 東証33業種コード（config/sector_map.json）から同一業種企業リストを取得
2. 売上高でフィルタリング（対象企業の0.3倍〜3倍）
3. 売上規模の近い順にソートし、上位5社を返却
4. ユーザーは手動で追加・削除可能

## 開発フェーズ

| Phase | スコープ | 目安 |
|-------|---------|------|
| Phase 0 | 基盤構築（リポジトリ、Firebase設定、React初期化） | 3日 |
| Phase 1 | P1: ガバナンス（EDINET連携、GovernanceView） | 2週間 |
| Phase 2 | P2: 財務分析（XBRL/PDF、FinancialCharts） | 2週間 |
| Phase 3 | P3: 競合比較（推定ロジック、CompetitorBenchmark） | 1.5週間 |
| Phase 4 | P4: 業界トレンド（Google News RSS、NewsTimeline） | 1週間 |
| Phase 5 | AI分析統合（Claude Codeサブエージェント） | 1.5週間 |
| Phase 6 | 統合ダッシュボード（メイン画面、差分検知） | 1週間 |
| Phase 7 | レポート出力（Word/PDF/PPTX）※将来 | TBD |

## 禁止事項

- `rm -rf` の使用禁止
- Firestore サービスアカウントキーをリポジトリにコミットしない
- フロントエンドから Firestore への書き込みを行わない（読み取り専用）
- data/ ディレクトリの使用禁止（旧設計、Firestoreに移行済み）
