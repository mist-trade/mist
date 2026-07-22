import { Injectable } from '@nestjs/common';
import {
  CanonicalRealtimeSnapshot,
  RealtimeNativeFrame,
} from './realtime-native-frame';
import { toCanonicalSnapshot } from './realtime-snapshot.adapter';

@Injectable()
export class RealtimeSnapshotIngressService {
  private readonly latest = new Map<string, CanonicalRealtimeSnapshot>();

  handleSnapshot(frame: RealtimeNativeFrame): CanonicalRealtimeSnapshot {
    const snapshot = toCanonicalSnapshot(frame);
    this.latest.set(`${frame.source}:${frame.symbol}`, snapshot);
    return snapshot;
  }

  read(source: RealtimeNativeFrame['source'], symbol: string) {
    return this.latest.get(`${source}:${symbol}`) ?? null;
  }
}
