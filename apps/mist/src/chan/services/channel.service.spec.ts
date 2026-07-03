import { Test, TestingModule } from '@nestjs/testing';
import { ChannelService } from './channel.service';
import { TrendDirection } from '../enums/trend-direction.enum';
import { BiVo } from '../vo/bi.vo';

function bi(index: number): BiVo {
  return {
    highest: 100 + index,
    lowest: 90 + index,
    trend: index % 2 === 0 ? TrendDirection.Up : TrendDirection.Down,
    originIds: [index * 2, index * 2 + 1],
    startFenxing: { middleOriginId: index * 2 },
    endFenxing: { middleOriginId: index * 2 + 1 },
  } as BiVo;
}

describe('ChannelService', () => {
  let service: ChannelService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChannelService],
    }).compile();

    service = module.get<ChannelService>(ChannelService);
  });

  it('service should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns only the public channel array for valid short input', () => {
    const result = service.createChannel({
      bi: [bi(1), bi(2), bi(3), bi(4)],
    });

    expect(Array.isArray(result)).toBe(true);
    expect(result).not.toHaveProperty('offsetIndex');
  });
});
