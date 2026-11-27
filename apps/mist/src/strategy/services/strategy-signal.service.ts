import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DEFAULT_API_PAGE_LIMIT,
  MAX_API_PAGE_LIMIT,
  MIN_API_PAGE_LIMIT,
} from '@app/constants';
import { StrategySignal } from '@app/shared-data';
import { FindOptionsWhere, Repository } from 'typeorm';
import { QueryStrategySignalDto } from '../dto/query-strategy-signal.dto';
import { StrategySignalVo } from '../vo/strategy-signal.vo';

@Injectable()
export class StrategySignalService {
  constructor(
    @InjectRepository(StrategySignal)
    private readonly signalRepository: Repository<StrategySignal>,
  ) {}

  async findAll(query: QueryStrategySignalDto): Promise<StrategySignalVo[]> {
    const where: FindOptionsWhere<StrategySignal> = {};

    if (query.strategyDefinitionId) {
      where.strategyDefinitionId = Number(query.strategyDefinitionId);
    }
    if (query.securityId) where.securityId = Number(query.securityId);
    if (query.period !== undefined) where.period = query.period;
    if (query.source !== undefined) where.source = query.source;

    const limit = Math.min(
      Math.max(query.limit ?? DEFAULT_API_PAGE_LIMIT, MIN_API_PAGE_LIMIT),
      MAX_API_PAGE_LIMIT,
    );

    const signals = await this.signalRepository.find({
      where,
      relations: ['security'],
      order: { signalTime: 'DESC' },
      take: limit,
    });

    return signals.map((signal) => StrategySignalVo.fromEntity(signal));
  }
}
