import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosInstance } from 'axios';
import { UtilsService } from '@app/utils';

export type DownloadSource = 'qmt' | 'tdx';

export interface DownloadJobSubmission {
  jobId: string;
  tasks: Array<Record<string, unknown>>;
}

export interface DownloadJobStatus {
  jobId: string;
  aggregate: 'in_progress' | 'all_done' | 'any_failed';
  tasks: Array<{ state: string; error?: string | null }>;
}

export type DownloadPollOutcome = 'all_done' | 'any_failed' | 'timeout';

interface EnvelopeError {
  code?: string;
  message?: string;
}

interface Envelope<T> {
  ok?: boolean;
  data?: T;
  error?: EnvelopeError;
}

/**
 * Client for the datasource history-download job surfaces
 * (`POST /v1/{source}/download` + `GET /v1/{source}/download/{jobId}`).
 *
 * 统一合同（双源同形）：提交立即返回 job；轮询状态直至全部完成。
 * 日期范围：QMT 传给原生 API；TDX 接受但终端托管范围（官方 API 无范围参数）。
 */
@Injectable()
export class HistoryDownloadClient {
  private readonly logger = new Logger(HistoryDownloadClient.name);
  public static readonly JOB_BUDGET_MS = 600000;
  private readonly axiosBySource: Record<DownloadSource, AxiosInstance>;

  constructor(configService: ConfigService, utilsService: UtilsService) {
    const qmtBase =
      configService.get<string>('QMT_BASE_URL') || 'http://127.0.0.1:9002';
    const tdxBase =
      configService.get<string>('TDX_BASE_URL') || 'http://127.0.0.1:9001';
    this.axiosBySource = {
      qmt: utilsService.createAxiosInstance({
        baseURL: qmtBase,
        timeout: 15000,
      }),
      tdx: utilsService.createAxiosInstance({
        baseURL: tdxBase,
        timeout: 15000,
      }),
    };
  }

  async submitDownloadJob(
    source: DownloadSource,
    stockList: string[],
    basePeriods: string[],
    window: { start: string; end: string },
  ): Promise<DownloadJobSubmission> {
    const axios = this.axiosBySource[source];
    this.logger.log(
      `submit download job source=${source} stocks=${stockList.length} ` +
        `periods=${basePeriods.join('/')} window=${window.start}..${window.end}`,
    );
    const response = await axios.post<Envelope<DownloadJobSubmission>>(
      `/v1/${source}/download`,
      {
        stock_list: stockList,
        base_periods: basePeriods,
        start_time: window.start,
        end_time: window.end,
      },
    );
    const data = response.data?.data;
    if (!data?.jobId) {
      throw new Error(
        `Download job submission returned no jobId (source=${source})`,
      );
    }
    return data;
  }

  async getJobStatus(
    source: DownloadSource,
    jobId: string,
  ): Promise<DownloadJobStatus | null> {
    const axios = this.axiosBySource[source];
    const response = await axios.get<Envelope<DownloadJobStatus>>(
      `/v1/${source}/download/${jobId}`,
    );
    return response.data?.data ?? null;
  }

  async pollUntilDone(
    source: DownloadSource,
    jobId: string,
    budgetMs: number,
  ): Promise<DownloadPollOutcome> {
    const deadline = Date.now() + budgetMs;
    while (Date.now() < deadline) {
      const status = await this.getJobStatus(source, jobId);
      if (status === null) {
        return 'timeout';
      }
      if (status.aggregate !== 'in_progress') {
        return status.aggregate;
      }
      await new Promise((resolve) => setTimeout(resolve, 8000));
    }
    return 'timeout';
  }
}
