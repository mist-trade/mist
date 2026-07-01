## 1. Snapshot Contract

- [x] 1.1 Update TDX snapshot types to use `code`, `formatCode`, and `raw`, and remove `stockCode`.
- [x] 1.2 Map HTTP snapshot responses into the updated snapshot contract.
- [x] 1.3 Map WebSocket quote payloads into the updated snapshot contract while preserving raw provider fields.

## 2. Aggregation And Persistence Boundary

- [x] 2.1 Update K-line aggregation to key by canonical `code` and consume only normalized snapshot fields.
- [x] 2.2 Keep completed streaming candles raw-free before persistence.

## 3. Verification

- [x] 3.1 Update unit tests covering HTTP snapshot mapping, WebSocket quote parsing, raw preservation, and `stockCode` removal.
- [x] 3.2 Run targeted backend tests and OpenSpec validation.
