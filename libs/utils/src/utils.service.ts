import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class UtilsService {
  /**
   * Create axios instance with common configuration
   * @param config Axios configuration
   * @returns Configured axios instance
   */
  createAxiosInstance(
    config: { baseURL?: string; timeout?: number } = {},
  ): AxiosInstance {
    return axios.create({
      timeout: config.timeout || 10000,
      ...config,
    });
  }
}
