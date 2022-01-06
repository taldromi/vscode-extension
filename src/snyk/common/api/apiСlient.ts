import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { IConfiguration } from '../configuration/configuration';
import { DEFAULT_API_HEADERS } from './headers';

export interface ISnykApiClient {
  get<T = unknown, R = AxiosResponse<T>>(url: string, config?: AxiosRequestConfig): Promise<R>;
  post<T = unknown, R = AxiosResponse<T>>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<R>;
}

export class SnykApiClient implements ISnykApiClient {
  private instance: AxiosInstance | null = null;

  constructor(private readonly configuration: IConfiguration) {}

  private get http(): AxiosInstance {
    return this.instance != null ? this.instance : this.initHttp();
  }

  initHttp(): AxiosInstance {
    const http = axios.create({
      headers: DEFAULT_API_HEADERS,
      responseType: 'json',
    });

    http.interceptors.response.use(
      response => response,
      error => {
        console.error('Call to Snyk API failed: ', error);
        return Promise.reject(error);
      },
    );

    this.instance = http;
    return http;
  }

  get<T = unknown, R = AxiosResponse<T>>(url: string, config?: AxiosRequestConfig): Promise<R> {
    this.http.interceptors.request.use(req => {
      if (req.method === 'get') {
        req.baseURL = `${this.configuration.authHost}/api/v1/`;
        req.headers = {
          ...req.headers,
          Authorization: `token ${this.configuration.token}`,
        } as { [header: string]: string };
      }

      return req;
    });

    return this.http.get<T, R>(url, config);
  }

  post<T = unknown, R = AxiosResponse<T>>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<R> {
    this.http.interceptors.request.use(req => {
      if (req.method === 'post') {
        req.baseURL = this.configuration.baseApiUrl;
        req.headers = {
          ...req.headers,
          Authorization: `token ${this.configuration.token}`,
        } as { [header: string]: string };
      }

      return req;
    });
    return this.http.post<T, R>(url, data, config);
  }
}
