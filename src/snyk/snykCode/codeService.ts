import { analyzeFolders, extendAnalysis, FileAnalysis } from '@snyk/code-client';
import { AnalysisStatusProvider } from '../common/analysis/statusProvider';
import { IAnalytics, SupportedAnalysisProperties } from '../common/analytics/itly';
import { ISnykApiClient } from '../common/api/apiСlient';
import { IConfiguration } from '../common/configuration/configuration';
import { IDE_NAME } from '../common/constants/general';
import { SNYK_CONTEXT } from '../common/constants/views';
import { ISnykCodeErrorHandler } from '../common/error/snykCodeErrorHandler';
import { ILog } from '../common/logger/interfaces';
import { Logger } from '../common/logger/logger';
import { getSastSettings } from '../common/services/cliConfigService';
import { IContextService } from '../common/services/contextService';
import { IOpenerService } from '../common/services/openerService';
import { IViewManagerService } from '../common/services/viewManagerService';
import { ExtensionContext } from '../common/vscode/extensionContext';
import { IVSCodeLanguages } from '../common/vscode/languages';
import { Disposable } from '../common/vscode/types';
import { IVSCodeWorkspace } from '../common/vscode/workspace';
import SnykCodeAnalyzer from './analyzer/analyzer';
import { Progress } from './analyzer/progress';
import { ISnykCodeAnalyzer } from './interfaces';
import { messages as analysisMessages } from './messages/analysis';
import { ICodeSuggestionWebviewProvider } from './views/interfaces';
import { CodeSuggestionWebviewProvider } from './views/suggestion/codeSuggestionWebviewProvider';

export interface ISnykCodeService extends AnalysisStatusProvider, Disposable {
  analyzer: ISnykCodeAnalyzer;
  analysisStatus: string;
  analysisProgress: string;
  remoteBundle: FileAnalysis;
  suggestionProvider: ICodeSuggestionWebviewProvider;
  hasError: boolean;

  startAnalysis(paths: string[], manual: boolean, reportTriggeredEvent: boolean): Promise<void>;
  updateStatus(status: string, progress: string): void;
  errorEncountered(error: Error): void;
  checkCodeEnabled(): Promise<boolean>;
  enable(): Promise<boolean>;
  addChangedFile(filePath: string): void;
}

export class SnykCodeService extends AnalysisStatusProvider implements ISnykCodeService {
  remoteBundle: FileAnalysis;
  analyzer: ISnykCodeAnalyzer;
  suggestionProvider: ICodeSuggestionWebviewProvider;

  private changedFiles: Set<string> = new Set();

  private progress: Progress;
  private _analysisStatus = '';
  private _analysisProgress = '';
  private failed = false;

  constructor(
    readonly extensionContext: ExtensionContext,
    private readonly config: IConfiguration,
    private readonly openerService: IOpenerService,
    private readonly viewManagerService: IViewManagerService,
    private readonly contextService: IContextService,
    private readonly workspace: IVSCodeWorkspace,
    private readonly snykApiClient: ISnykApiClient,
    private readonly logger: ILog,
    private readonly analytics: IAnalytics,
    readonly languages: IVSCodeLanguages,
    private readonly errorHandler: ISnykCodeErrorHandler,
  ) {
    super();
    this.analyzer = new SnykCodeAnalyzer(logger, languages, analytics, errorHandler);
    this.suggestionProvider = new CodeSuggestionWebviewProvider(extensionContext, this.logger);

    this.progress = new Progress(this, viewManagerService, this.workspace);
    this.progress.bindListeners();
  }

  get hasError(): boolean {
    return this.failed;
  }

  get analysisStatus(): string {
    return this._analysisStatus;
  }
  get analysisProgress(): string {
    return this._analysisProgress;
  }

  public async startAnalysis(paths: string[], manualTrigger: boolean, reportTriggeredEvent: boolean): Promise<void> {
    if (this.isAnalysisRunning || !paths.length) {
      return;
    }

    const enabledFeatures = this.config.getFeaturesConfiguration();

    try {
      Logger.info(analysisMessages.started);

      if (reportTriggeredEvent) {
        const analysisType: SupportedAnalysisProperties[] = [];
        if (enabledFeatures?.codeSecurityEnabled) analysisType.push('Snyk Code Security');
        if (enabledFeatures?.codeQualityEnabled) analysisType.push('Snyk Code Quality');

        if (analysisType) {
          this.analytics.logAnalysisIsTriggered({
            analysisType: analysisType as [SupportedAnalysisProperties, ...SupportedAnalysisProperties[]],
            ide: IDE_NAME,
            triggeredByUser: manualTrigger,
          });
        }
      }

      this.analysisStarted();

      let result: FileAnalysis | null = null;
      if (this.changedFiles.size && this.remoteBundle) {
        const changedFiles = [...this.changedFiles];
        this.changedFiles.clear();
        result = await extendAnalysis({ ...this.remoteBundle, files: changedFiles });
      } else {
        result = await analyzeFolders({
          connection: {
            baseURL: this.config.snykCodeBaseURL,
            sessionToken: this.config.snykCodeToken ?? '', // todo: handle the case appropriately
            source: this.config.source,
          },
          analysisOptions: {
            legacy: true,
          },
          fileOptions: {
            paths,
          },
          analysisContext: {
            flow: this.config.source,
            initiator: 'IDE',
            orgDisplayName: this.config.organization,
          },
        });
      }

      if (result) {
        this.remoteBundle = result;

        if (result.analysisResults.type == 'legacy') {
          this.analyzer.setAnalysisResults(result.analysisResults);
        }
        this.analyzer.createReviewResults();

        Logger.info(analysisMessages.finished);

        if (enabledFeatures?.codeSecurityEnabled) {
          this.analytics.logAnalysisIsReady({
            ide: IDE_NAME,
            analysisType: 'Snyk Code Security',
            result: 'Success',
          });
        }
        if (enabledFeatures?.codeQualityEnabled) {
          this.analytics.logAnalysisIsReady({
            ide: IDE_NAME,
            analysisType: 'Snyk Code Quality',
            result: 'Success',
          });
        }

        this.suggestionProvider.checkCurrentSuggestion();
      }
    } catch (err) {
      await this.errorHandler.processError(err, undefined, (error: Error) => {
        this.errorEncountered(error);
      });

      if (enabledFeatures?.codeSecurityEnabled) {
        this.analytics.logAnalysisIsReady({
          ide: IDE_NAME,
          analysisType: 'Snyk Code Security',
          result: 'Error',
        });
      }
      if (enabledFeatures?.codeQualityEnabled) {
        this.analytics.logAnalysisIsReady({
          ide: IDE_NAME,
          analysisType: 'Snyk Code Quality',
          result: 'Error',
        });
      }
    } finally {
      this.analysisFinished();
      this.viewManagerService.refreshCodeAnalysisViews(enabledFeatures);
    }
  }

  updateStatus(status: string, progress: string): void {
    this._analysisStatus = status;
    this._analysisProgress = progress;
  }

  errorEncountered(error: Error): void {
    this.failed = true;
    this.logger.error(`${analysisMessages.failed} ${JSON.stringify(error)}`);
  }

  async checkCodeEnabled(): Promise<boolean> {
    const enabled = await this.isEnabled();

    await this.contextService.setContext(SNYK_CONTEXT.CODE_ENABLED, enabled);

    return enabled;
  }

  private async isEnabled(): Promise<boolean> {
    const settings = await getSastSettings(this.snykApiClient);
    return settings.sastEnabled;
  }

  async enable(): Promise<boolean> {
    let settings = await getSastSettings(this.snykApiClient);
    if (settings.sastEnabled) {
      return true;
    }

    if (this.config.snykCodeUrl != null) {
      await this.openerService.openBrowserUrl(this.config.snykCodeUrl);
    }

    // Poll for changed settings (65 sec)
    for (let i = 2; i < 12; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await this.sleep(i * 1000);

      // eslint-disable-next-line no-await-in-loop
      settings = await getSastSettings(this.snykApiClient);
      if (settings.sastEnabled) {
        return true;
      }
    }

    return false;
  }

  addChangedFile(filePath: string): void {
    this.changedFiles.add(filePath);
  }

  dispose(): void {
    this.progress.removeAllListeners();
    this.analyzer.dispose();
  }

  private sleep = (duration: number) => new Promise(resolve => setTimeout(resolve, duration));
}
