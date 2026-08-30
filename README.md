# 孫子兵法研讀

離線可讀、可朗讀的網頁版《孫子兵法》研讀工具。純靜態網頁（HTML/CSS/JavaScript），不需要伺服器後端，可加入手機主畫面像 App 一樣使用。

## 特色

- 十三篇逐節呈現，兩層目錄（篇 > 節），每一節三個頁籤：**原文**、**白話**、**要義解讀**
- 要義解讀先談本節在兵法上的主張與常見誤讀，再談可以拿到今天用的地方
- 朗讀功能：依「原文 → 白話 → 要義解讀」順序連續朗讀，三段之間有可調整的停頓（預設 2 秒）
- 朗讀時逐句高亮、自動切換頁籤、自動捲動到正在讀的句子
- 單一播放鍵：按一下開始，朗讀中按一下暫停、再按一下繼續，長按停止並回到本節開頭
- 內文字體大小四級可調，只影響三個頁籤的內文
- 朗讀期間保持螢幕常亮：優先用 Screen Wake Lock，取不到時改用無聲循環影片備援；設定面板會即時顯示目前走的是哪一條
- 自動記住上次讀到哪一節與所有朗讀設定
- PWA 離線支援：第一次連線開啟過之後，完全沒有網路也能閱讀與朗讀

## 文本來源與說明

| 項目 | 來源 |
|------|------|
| 原文 | 《孫子兵法》十三篇，維基文庫通行本（武經七書系統） |
| 分篇 | 十三篇為原典固有 |
| 分節與節名 | 本站所定，非原典固有 |
| 白話、要義解讀 | 本專案自行撰寫 |

- 原文由 `scripts/parse_source.py` 從封存的原始 wikitext 解析、`scripts/build_data.py` 依分節規格產生，**不手動編輯**，並由測試逐字比對。
- 白話與要義解讀是本專案自己的整理，僅供研讀參考，不代表任何學派定說，也**未引用任何仍在著作權保護期內的著作**。
- **異文說明**：《孫子》主要有武經七書本與十一家注本兩個系統。本站底本為前者，與坊間依十一家注本的版本相比，較明顯的差異例如虛實篇作「兵無成勢，無恒形」（十一家注本作「兵無常勢，水無常形」）、謀攻篇作「每戰必殆」（十一家注本作「每戰必敗」），另有大量「於／于」「眾／衆」等異體字差異。

## 檔案說明

| 檔案 | 用途 |
|------|------|
| index.html | 頁面結構 |
| style.css | 版面樣式 |
| sunzi.js | 經文資料（自動產生，勿手改） |
| app.js | 閱讀、朗讀、螢幕常亮、設定保存、PWA 註冊 |
| sw.js | Service Worker，快取所有檔案供離線使用 |
| wake.mp4 | 無 Wake Lock API 時維持螢幕常亮的無聲影片 |
| manifest.webmanifest | PWA 設定 |
| icons/ | PWA 圖示 |
| scripts/source/ | 封存的原始文本來源 |
| scripts/parse_source.py | 由原始 wikitext 解析成十三篇逐段 |
| scripts/sections.json | 分節規格（節名與段落索引） |
| scripts/content.json | 白話與要義解讀 |
| scripts/build_data.py | 產生 sunzi.js |
| scripts/fetch_source.py | 抓取比對用的外部文本（低頻，非必要不執行） |
| tests/ | 資料完整性與端到端測試 |

## 修改內容的流程

```bash
python3 scripts/parse_source.py    # 由封存來源重建 ws_chapters.json
python3 scripts/build_data.py      # 重新產生 sunzi.js
bash tests/run_tests.sh            # 跑完整測試
```

改分節就編輯 `scripts/sections.json`，改白話或解讀就編輯 `scripts/content.json`。原文不要手動編輯。

## 測試

```bash
bash tests/run_tests.sh
```

- `test_data.py`：篇名與節數、原文與封存的維基文庫原始 wikitext 逐字比對、分節不重不漏覆蓋每篇所有段落、白話與解讀齊備、無簡體字與 emoji。
- `e2e.js`：無頭瀏覽器端到端測試。載入、兩層目錄、頁籤切換、朗讀三段順序與段落間停頓、逐句高亮、單鍵短按與長按（含觸控路徑）、字體大小、螢幕常亮的兩條路徑、切到背景不空跳內容、設定與進度保存、Service Worker 離線重載與離線換節。

端到端測試需要 node 與 chromium，puppeteer-core 路徑可用環境變數 `PUPPETEER_PATH`、瀏覽器路徑用 `CHROMIUM_PATH` 指定。

## 部署到 GitHub Pages

1. 在 GitHub 建立 repository。
2. 將本資料夾所有檔案 push 到 `main` 分支。
3. Settings > Pages，Source 選「Deploy from a branch」，Branch 選 `main`、資料夾 `/ (root)`，儲存。

所有路徑皆為相對路徑，放在子路徑（project pages）下可直接運作。

## 朗讀的裝置差異

朗讀使用瀏覽器內建的語音合成，語音品質與可選語音由裝置決定：

- iPhone / iPad：建議在「設定 > 輔助使用 > 朗讀內容 > 聲音 > 中文」下載較高品質的中文語音。
- Android：通常需要安裝「Google 文字轉語音」並下載中文（台灣）語音資料。
- 桌機瀏覽器：Chrome 與 Edge 皆有內建中文語音。

## 更新版本注意事項

修改任何檔案後，記得把 `sw.js` 內的 `CACHE_NAME` 版號加一（例如 `sunzi-cache-v2`），使用者端才會在下次連線時更新快取。
