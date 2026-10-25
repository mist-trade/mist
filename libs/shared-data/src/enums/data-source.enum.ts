export enum DataSource {
  EAST_MONEY = 'ef', // 东方财富
  TDX = 'tdx', // 通达信
  QMT = 'qmt', // 大QMT
  VENDOR_A = 'vendor_a', // 第三方长历史（A 供应商）
  CANONICAL = 'canonical', // 回测标记：由拼接策略解析，不对应任何物理行
}
