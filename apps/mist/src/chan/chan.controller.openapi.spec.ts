import 'reflect-metadata';
import { DECORATORS } from '@nestjs/swagger/dist/constants';
import { ChanController } from './chan.controller';
import { ChannelTwoPhaseResponseVo, ChannelVo } from './vo/channel.vo';
import { BiTwoPhaseResponseVo } from './vo/bi.vo';

describe('ChanController OpenAPI contract', () => {
  function responseType(method: 'postIndexBi' | 'postChannel') {
    const responses = Reflect.getMetadata(
      DECORATORS.API_RESPONSE,
      ChanController.prototype[method],
    ) as Record<string, { type?: unknown }>;

    return (responses['200'].type as { name?: string }).name;
  }

  it('documents Bi and Channel responses as two-phase envelopes', () => {
    expect(responseType('postIndexBi')).toBe('BiTwoPhaseResponseVo');
    expect(responseType('postChannel')).toBe('ChannelTwoPhaseResponseVo');
  });

  it('documents the Channel item fields used by generated clients', () => {
    const documented = ['bis', 'zg', 'zd', 'gg', 'dd', 'status'].map(
      (property) =>
        Reflect.getMetadata(
          DECORATORS.API_MODEL_PROPERTIES,
          ChannelVo.prototype,
          property,
        ),
    );

    expect(documented.every(Boolean)).toBe(true);
  });

  it('marks two-phase data as required in success envelopes', () => {
    for (const responseType of [
      BiTwoPhaseResponseVo,
      ChannelTwoPhaseResponseVo,
    ]) {
      const metadata = Reflect.getMetadata(
        DECORATORS.API_MODEL_PROPERTIES,
        responseType.prototype,
        'data',
      ) as { required?: boolean };

      expect(metadata.required).toBe(true);
    }
  });
});
