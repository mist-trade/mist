import { Injectable } from '@nestjs/common';
import {
  CanonicalRealtimeSnapshot,
  RealtimeSource,
} from './realtime-native-frame';

@Injectable()
export class RealtimeSnapshotIngressService {
  private readonly latest = new Map<string, CanonicalRealtimeSnapshot>();

  handleSnapshot(
    snapshot: CanonicalRealtimeSnapshot,
  ): CanonicalRealtimeSnapshot {
    this.latest.set(`${snapshot.source}:${snapshot.symbol}`, snapshot);
    return snapshot;
  }

  read(source: RealtimeSource, symbol: string) {
    return this.latest.get(`${source}:${symbol}`) ?? null;
  }
}
