export enum BacktestOrderStatus {
  PENDING = 'pending',
  FILLED = 'filled',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
  // Reserved in the persisted/API contract for a future order-level cancel
  // path. V1 run cancellation stops processing and does not emit this status.
  CANCELLED = 'cancelled',
}
