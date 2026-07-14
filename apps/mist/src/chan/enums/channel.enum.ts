export enum ChannelLevel {
  Bi = 'bi',
  Duan = 'duan',
}

export enum ChannelType {
  UnComplete = 'uncomplete',
  Complete = 'complete',
}

export enum ChannelStatus {
  Unknown = 0, // 未知状态（初始默认值）
  Valid = 1, // 有效中枢（满足所有条件）
  Invalid = 2, // 无效中枢（不满足条件，Phase B 待消化）
}
