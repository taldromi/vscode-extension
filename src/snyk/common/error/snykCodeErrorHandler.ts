import { constants } from '@snyk/code-client';
import { errorType, IBaseSnykModule } from '../../base/modules/interfaces';
import { ILoadingBadge } from '../../base/views/loadingBadge';
import { configuration } from '../configuration/instance';
import { CONNECTION_ERROR_RETRY_INTERVAL, MAX_CONNECTION_RETRIES } from '../constants/general';
import { SNYK_CONTEXT, SNYK_ERROR_CODES } from '../constants/views';
import { ILog } from '../logger/interfaces';
import { IContextService } from '../services/contextService';
import { ErrorHandler } from './errorHandler';

export interface ISnykCodeErrorHandler {
  resetTransientErrors(): void;
  processError(
    error: errorType,
    options?: { [key: string]: unknown },
    callback?: (error: Error) => void,
  ): Promise<void>;
}

export class SnykCodeErrorHandler extends ErrorHandler implements ISnykCodeErrorHandler {
  private transientErrors = 0;

  constructor(
    private contextService: IContextService,
    private loadingBadge: ILoadingBadge,
    private readonly logger: ILog,
    private readonly baseSnykModule: IBaseSnykModule,
  ) {
    super();
  }

  resetTransientErrors(): void {
    this.transientErrors = 0;
  }

  async processError(
    error: errorType,
    options: { [key: string]: unknown } = {},
    callback: (error: Error) => void,
  ): Promise<void> {
    // We don't want to have unhandled rejections around, so if it
    // happens in the error handler we just log it
    return this.processErrorInternal(error, options, callback).catch(err =>
      ErrorHandler.handle(err, this.logger, 'Snyk Code error handler failed with error.'),
    );
  }

  private async processErrorInternal(
    error: errorType,
    options: { [key: string]: unknown } = {},
    callback: (error: Error) => void,
  ): Promise<void> {
    console.debug(options);

    const defaultErrorHandler = () => {
      this.generalErrorHandler(error, options, callback);
    };

    const errorHandlers: { [P in constants.ErrorCodes]: () => Promise<void> | void } = {
      [constants.ErrorCodes.serverError]: defaultErrorHandler,
      [constants.ErrorCodes.badGateway]: async () => {
        return this.connectionErrorHandler(error, options, callback);
      },
      [constants.ErrorCodes.serviceUnavailable]: async () => {
        return this.connectionErrorHandler(error, options, callback);
      },
      [constants.ErrorCodes.timeout]: async () => {
        return this.connectionErrorHandler(error, options, callback);
      },
      [constants.ErrorCodes.dnsNotFound]: async () => {
        return this.connectionErrorHandler(error, options, callback);
      },
      [constants.ErrorCodes.connectionRefused]: async () => {
        return this.connectionErrorHandler(error, options, callback);
      },
      [constants.ErrorCodes.loginInProgress]: async () => Promise.resolve(),
      [constants.ErrorCodes.badRequest]: async () => Promise.resolve(),
      [constants.ErrorCodes.unauthorizedUser]: async () => {
        return this.authenticationErrorHandler();
      },
      [constants.ErrorCodes.unauthorizedBundleAccess]: async () => Promise.resolve(),
      [constants.ErrorCodes.notFound]: async () => Promise.resolve(),
      [constants.ErrorCodes.bigPayload]: async () => Promise.resolve(),
    };

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const errorStatusCode = error?.statusCode;
    if (errorHandlers.hasOwnProperty(errorStatusCode)) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await errorHandlers[errorStatusCode]();
    } else {
      defaultErrorHandler();
    }
  }

  private async authenticationErrorHandler(): Promise<void> {
    await configuration.setToken('');
    await this.contextService.setContext(SNYK_CONTEXT.LOGGEDIN, false);
    this.loadingBadge.setLoadingBadge(true);
  }

  private generalErrorHandler(
    error: errorType,
    options: { [key: string]: unknown },
    callback: (error: Error) => void,
  ): void {
    this.transientErrors = 0;
    callback(error);
    this.capture(error, options);
  }

  private async connectionErrorHandler(
    error: errorType,
    options: { [key: string]: unknown },
    callback: (error: Error) => void,
  ): Promise<void> {
    this.logger.error('Connection error to Snyk Code service.');
    if (this.transientErrors > MAX_CONNECTION_RETRIES) return this.generalErrorHandler(error, options, callback);

    this.transientErrors += 1;
    await this.contextService.setContext(SNYK_CONTEXT.ERROR, SNYK_ERROR_CODES.TRANSIENT);
    setTimeout(() => {
      this.baseSnykModule.runCodeScan().catch(err => this.capture(err, options));
    }, CONNECTION_ERROR_RETRY_INTERVAL);
    return Promise.resolve();
  }

  capture(error: Error, options: { [key: string]: unknown }): void {
    ErrorHandler.handle(
      error,
      this.logger,
      Object.keys(options).length > 0 ? `${error.message}. ${options}` : error.message,
    );
  }
}
