import { Injectable, Inject } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Security, K, Period, DataSource } from '@app/shared-data';
import { BaseMcpToolService } from '../base/base-mcp-tool.service';
import { ValidationHelper } from '../utils/validation.helpers';
import { McpErrorCode, McpError } from '@app/constants';
import { DataSourceService } from '@app/utils';

type KLineSourceInput = 'ef' | 'tdx' | 'mqmt';
type LatestPeriodKey = 'daily' | '1min' | '5min' | '15min' | '30min' | '60min';

const LATEST_PERIOD_QUERIES: Array<{
  key: LatestPeriodKey;
  period: Period;
}> = [
  { key: 'daily', period: Period.DAY },
  { key: '1min', period: Period.ONE_MIN },
  { key: '5min', period: Period.FIVE_MIN },
  { key: '15min', period: Period.FIFTEEN_MIN },
  { key: '30min', period: Period.THIRTY_MIN },
  { key: '60min', period: Period.SIXTY_MIN },
];

@Injectable()
export class DataMcpService extends BaseMcpToolService {
  constructor(
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    @InjectRepository(K)
    private readonly kRepository: Repository<K>,
    @Inject(DataSourceService)
    private readonly dataSourceService: DataSourceService,
  ) {
    super(DataMcpService.name);
  }

  private sanitizeRequiredSymbol(symbol: string): string {
    const sanitizedSymbol = ValidationHelper.sanitizeString(symbol);
    if (!sanitizedSymbol) {
      throw new McpError(
        'Symbol cannot be empty or contain only whitespace.',
        McpErrorCode.INVALID_SYMBOL,
      );
    }
    return sanitizedSymbol;
  }

  private buildKLineQuery(params: {
    securityId: number;
    period: Period | string;
    source: DataSource;
    limit: number;
    startDate?: string;
    endDate?: string;
  }): SelectQueryBuilder<K> {
    const queryBuilder = this.kRepository
      .createQueryBuilder('bar')
      .leftJoin('bar.security', 'security')
      .where('security.id = :securityId', { securityId: params.securityId })
      .andWhere('bar.period = :period', { period: params.period })
      .andWhere('bar.source = :source', { source: params.source })
      .orderBy('bar.timestamp', 'DESC')
      .limit(params.limit);

    if (params.startDate) {
      queryBuilder.andWhere('bar.timestamp >= :startDate', {
        startDate: params.startDate,
      });
    }
    if (params.endDate) {
      queryBuilder.andWhere('bar.timestamp <= :endDate', {
        endDate: params.endDate,
      });
    }

    return queryBuilder;
  }

  private mapKLineRow(item: K, includeAmount: boolean = false) {
    return {
      id: item.id,
      time: item.timestamp,
      open: item.open,
      close: item.close,
      highest: item.high,
      lowest: item.low,
      volume: item.volume.toString(),
      ...(includeAmount ? { amount: item.amount } : {}),
    };
  }

  @Tool({
    name: 'get_index_info',
    description: `Get detailed metadata for a specific index.

PURPOSE: Retrieve index information and metadata. Useful for validating
symbol existence and getting basic details.

WHEN TO USE: Validating a symbol before detailed queries, getting
index metadata, checking if index exists.

REQUIRES: symbol - Index code (e.g., '000001').

NOTE: Use list_indices to see all available symbols first.

RETURNS: Index object with id, symbol, name, and type.`,
  })
  async getIndexInfo(symbol: string) {
    return this.executeTool('get_index_info', async () => {
      // Validate symbol
      const symbolError = ValidationHelper.validateSymbol(symbol);
      if (symbolError) {
        throw new McpError(
          symbolError,
          ValidationHelper.getValidationErrorCode(symbolError),
        );
      }

      const sanitizedSymbol = this.sanitizeRequiredSymbol(symbol);

      const security = await this.securityRepository.findOne({
        where: { code: sanitizedSymbol },
      });

      if (!security) {
        throw new McpError(
          `Security with symbol "${sanitizedSymbol}" not found. Use list_indices to see available symbols.`,
          McpErrorCode.INDEX_NOT_FOUND,
        );
      }

      return {
        id: security.id,
        symbol: security.code,
        name: security.name,
        type: security.type,
      };
    });
  }

  @Tool({
    name: 'get_kline_data',
    description: `Get intraday K-line data from database.

PURPOSE: Retrieve historical intraday price data.

WHEN TO USE: Getting data for analysis.

REQUIRES: symbol, period (1min/5min/15min/30min/60min).
Optional: limit (default 100), startDate, endDate, source (ef/tdx/mqmt).

NOTE: Use list_indices first.

RETURNS: K-line array with time, OHLC, volume.`,
  })
  async getKlineData(
    symbol: string,
    period: '1min' | '5min' | '15min' | '30min' | '60min' | 'daily',
    limit: number = 100,
    startDate?: string,
    endDate?: string,
    source?: KLineSourceInput,
  ) {
    return this.executeTool('get_kline_data', async () => {
      // Validate symbol
      const symbolError = ValidationHelper.validateSymbol(symbol);
      if (symbolError) {
        throw new McpError(
          symbolError,
          ValidationHelper.getValidationErrorCode(symbolError),
        );
      }

      // Validate limit
      const limitError = ValidationHelper.validateLimit(limit, 10000);
      if (limitError) {
        throw new McpError(
          limitError,
          ValidationHelper.getValidationErrorCode(limitError),
        );
      }

      // Validate date range
      const dateRangeError = ValidationHelper.validateDateRange(
        startDate,
        endDate,
      );
      if (dateRangeError) {
        throw new McpError(
          dateRangeError,
          ValidationHelper.getValidationErrorCode(dateRangeError),
        );
      }

      const sanitizedSymbol = this.sanitizeRequiredSymbol(symbol);

      const security = await this.securityRepository.findOne({
        where: { code: sanitizedSymbol },
      });
      if (!security) {
        throw new McpError(
          `Security with symbol "${sanitizedSymbol}" not found. Use list_indices to see available symbols.`,
          McpErrorCode.INDEX_NOT_FOUND,
        );
      }

      // Select data source
      const selectedSource = this.dataSourceService.select(source);

      const queryBuilder = this.buildKLineQuery({
        securityId: security.id,
        period,
        source: selectedSource,
        limit,
        startDate,
        endDate,
      });

      const data = await queryBuilder.getMany();

      return data.map((item) => this.mapKLineRow(item));
    });
  }

  @Tool({
    name: 'get_daily_kline',
    description: `Get daily K-line (candlestick) data from database.

PURPOSE: Retrieve historical daily price data for longer-term analysis.
Contains OHLC, volume, and amount.

WHEN TO USE: Daily/swing trading analysis, long-term trends.

REQUIRES: symbol (e.g., '000001').
Optional: limit (default 100), startDate (YYYY-MM-DD HH:MM:SS), endDate (YYYY-MM-DD HH:MM:SS), source (ef/tdx/mqmt).

NOTE: Use list_indices first. Use get_kline_data for intraday.

RETURNS: Array of daily K-line objects with OHLC, volume, amount.`,
  })
  async getDailyKline(
    symbol: string,
    limit: number = 100,
    startDate?: string,
    endDate?: string,
    source?: KLineSourceInput,
  ) {
    return this.executeTool('get_daily_kline', async () => {
      // Validate symbol
      const symbolError = ValidationHelper.validateSymbol(symbol);
      if (symbolError) {
        throw new McpError(
          symbolError,
          ValidationHelper.getValidationErrorCode(symbolError),
        );
      }

      // Validate limit
      const limitError = ValidationHelper.validateLimit(limit, 10000);
      if (limitError) {
        throw new McpError(
          limitError,
          ValidationHelper.getValidationErrorCode(limitError),
        );
      }

      // Validate date range
      const dateRangeError = ValidationHelper.validateDateRange(
        startDate,
        endDate,
      );
      if (dateRangeError) {
        throw new McpError(
          dateRangeError,
          ValidationHelper.getValidationErrorCode(dateRangeError),
        );
      }

      const sanitizedSymbol = this.sanitizeRequiredSymbol(symbol);

      const security = await this.securityRepository.findOne({
        where: { code: sanitizedSymbol },
      });
      if (!security) {
        throw new McpError(
          `Security with symbol "${sanitizedSymbol}" not found. Use list_indices to see available symbols.`,
          McpErrorCode.INDEX_NOT_FOUND,
        );
      }

      // Select data source
      const selectedSource = this.dataSourceService.select(source);

      const queryBuilder = this.buildKLineQuery({
        securityId: security.id,
        period: Period.DAY,
        source: selectedSource,
        limit,
        startDate,
        endDate,
      });

      const data = await queryBuilder.getMany();

      return data.map((item) => this.mapKLineRow(item, true));
    });
  }

  @Tool({
    name: 'list_indices',
    description: `List all available stock indices in the database.

PURPOSE: Discovery tool to find available indices for analysis.
Use BEFORE calling other data tools.

WHEN TO USE: Finding available symbols, validating symbol codes.

REQUIRES: No parameters.

RETURNS: Array of index objects with id, symbol, name, and type.
NOTE: This should be your first data query tool call.`,
  })
  async listIndices() {
    return this.executeTool('list_indices', async () => {
      const securities = await this.securityRepository.find({
        select: ['id', 'code', 'name', 'type'],
      });
      return securities.map((s) => ({
        id: s.id,
        symbol: s.code,
        name: s.name,
        type: s.type,
      }));
    });
  }

  @Tool({
    name: 'get_latest_data',
    description: `Get the latest K-line data for all time periods.

PURPOSE: Retrieve the most recent data point across all timeframes
(daily and all intraday periods) in a single call.

WHEN TO USE: Getting current market snapshot, checking data freshness,
quick status check across all periods.

REQUIRES: symbol - Index code (e.g., '000001').
Optional: source (ef/tdx/mqmt).

RETURNS: Object containing latest data for daily, 1min, 5min,
15min, 30min, 60min. Each has time, OHLC, volume.`,
  })
  async getLatestData(symbol: string, source?: KLineSourceInput) {
    return this.executeTool('get_latest_data', async () => {
      const security = await this.securityRepository.findOne({
        where: { code: symbol },
      });
      if (!security) {
        throw new McpError(
          `Security with symbol ${symbol} not found`,
          McpErrorCode.INDEX_NOT_FOUND,
        );
      }

      // Select data source
      const selectedSource = this.dataSourceService.select(source);

      const latestEntries = await Promise.all(
        LATEST_PERIOD_QUERIES.map(async ({ key, period }) => {
          const value = await this.buildKLineQuery({
            securityId: security.id,
            period,
            source: selectedSource,
            limit: 1,
          }).getOne();
          return [key, value] as const;
        }),
      );

      const latestByKey = Object.fromEntries(latestEntries) as Record<
        LatestPeriodKey,
        K | null
      >;

      return {
        symbol,
        name: security.name,
        daily: latestByKey.daily,
        '1min': latestByKey['1min'],
        '5min': latestByKey['5min'],
        '15min': latestByKey['15min'],
        '30min': latestByKey['30min'],
        '60min': latestByKey['60min'],
      };
    });
  }
}
