import { Test, TestingModule } from '@nestjs/testing';
import { UtilsService } from './utils.service';
import axios from 'axios';

jest.mock('axios', () => ({
  create: jest.fn(),
}));

const mockedAxiosCreate = axios.create as jest.MockedFunction<
  typeof axios.create
>;

describe('UtilsService', () => {
  let service: UtilsService;

  beforeEach(async () => {
    mockedAxiosCreate.mockReset();
    mockedAxiosCreate.mockReturnValue({
      get: jest.fn(),
    } as unknown as ReturnType<typeof axios.create>);

    const module: TestingModule = await Test.createTestingModule({
      providers: [UtilsService],
    }).compile();

    service = module.get<UtilsService>(UtilsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createAxiosInstance', () => {
    it('creates an Axios instance with the default timeout', () => {
      const instance = service.createAxiosInstance();

      expect(mockedAxiosCreate).toHaveBeenCalledWith({
        timeout: 10000,
      });
      expect(instance).toBe(mockedAxiosCreate.mock.results[0].value);
    });

    it('allows callers to override the timeout and base URL', () => {
      service.createAxiosInstance({
        baseURL: 'http://datasource.local:9001',
        timeout: 30000,
      });

      expect(mockedAxiosCreate).toHaveBeenCalledWith({
        timeout: 30000,
        baseURL: 'http://datasource.local:9001',
      });
    });
  });
});
