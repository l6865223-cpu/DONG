# DONG - 軟體品質控管與測試規範 (Quality Control & Assurance)

歡迎來到 **DONG** 品質控管專案倉庫。本文件旨在建立標準化的軟體品質保證 (QA) 與品質控管 (QC) 流程，確保產品交付的高品質與穩定性。

---

## 1. 核心目標 (Core Objectives)
- **零重大缺陷上線**：在發布至生產環境前攔截高風險 Bug。
- **標準化測試流程**：規範需求分析、測試規劃、執行到結案的完整生命週期。
- **持續改善**：透過數據統計與缺陷分析，優化開發與測試效率。

---

## 2. 測試生命週期 (STLC - Software Testing Life Cycle)

1. **需求審查 (Requirement Review)**
   - 參與規格審查，釐清驗收標準 (Acceptance Criteria)。
   - 評估可測性與潛在風險。

2. **測試規劃與設計 (Test Planning & Design)**
   - 撰寫測試計畫 (Test Plan) 與測試案例 (Test Cases)。
   - 涵蓋範圍：功能測試、邊界測試、異常處理、迴歸測試。

3. **測試執行與回報 (Test Execution & Reporting)**
   - 執行黑箱/白箱測試。
   - 記錄測試結果，並針對失敗案例提交 Bug 報告。

4. **缺陷追蹤與修復驗證 (Defect Tracking & Verification)**
   - 追蹤缺陷生命週期：`Open` -> `In Progress` -> `Resolved` -> `Closed`。
   - 驗證工程師修復後的程式碼 (Bug Verification)。

5. **測試結案與品質評估 (Test Closure)**
   - 評估缺陷分佈與密度。
   - 產出測試總結報告 (Test Summary Report)。

---

## 3. 缺陷優先級與嚴重度定義 (Defect Severity & Priority)

| 嚴重度 (Severity) | 定義 | 處理時效 |
|-------------------|------|----------|
| **Critical (嚴重)** | 系統崩潰、資料遺失、核心功能完全無法使用 | 24 小時內修復 |
| **Major (主要)** | 重要功能異常，無替代方案 | 48 小時內修復 |
| **Minor (次要)** | 局部功能異常，有替代方案或影響不大 | 下一版本修復 |
| **Trivial (輕微)** | UI 排版錯誤、錯別字、不影響功能 | 依排程處理 |

---

## 4. 自動化與程式碼品質標準 (Code Quality & Automation)
- **程式碼審查 (Code Review)**：所有 PR 須經過至少一位資深工程師或 QA 審查。
- **靜態程式碼分析**：透過 Linter / SonarQube 等工具進行代碼品質掃描。
- **自動化測試**：逐步導入單元測試 (Unit Test) 與端到端測試 (E2E Test)。

---

*本文件將隨著專案進展持續更新。*
