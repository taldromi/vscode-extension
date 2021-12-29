import { Subscription } from 'rxjs';
import { IVSCodeLanguages } from '../../common/vscode/languages';
import { getModules, getSupportedLanguage, isValidModuleName } from '../../common/vscode/parsing';
import { ThemeColorAdapter } from '../../common/vscode/theme';
import { Disposable, Language, TextDocument } from '../../common/vscode/types';
import { IVSCodeWindow } from '../../common/vscode/window';
import { ModuleVulnerabilityCountProvider } from '../../snykOss/services/vulnerabilityCount/vulnerabilityCountProvider';
import EditorDecorator from '../editor/EditorDecorator';
import AdvisorService from './AdvisorService';

export class AdvisorScoreDisposable implements Disposable {
  protected disposables: Disposable[] = [];
  protected advisorScanFinishedSubscription: Subscription;

  private readonly editorDecorator: EditorDecorator;

  constructor(
    private readonly window: IVSCodeWindow,
    private readonly languages: IVSCodeLanguages,
    private readonly advisorService: AdvisorService,
    private readonly vulnerabilityCountProvider: ModuleVulnerabilityCountProvider,
  ) {
    this.editorDecorator = new EditorDecorator(window, languages, new ThemeColorAdapter());
  }

  activate(): boolean {
    this.advisorScanFinishedSubscription = this.advisorService.scanFinished$.subscribe(() => {
      this.processActiveEditor();
    });
    return false;
  }

  processActiveEditor(): void {
    const activeEditor = this.window.getActiveTextEditor();
    if (activeEditor) {
      this.processFile(activeEditor.document);
    }
  }

  processFile(document: TextDocument): boolean {
    if (!document) {
      return false;
    }

    const { fileName, languageId } = document;
    const supportedLanguage = getSupportedLanguage(fileName, languageId);
    if (supportedLanguage !== Language.PJSON) {
      return false;
    }
    const scores = this.advisorService.getScoresResult();
    if (scores?.length) {
      console.log('__SCORES_DISPOSABLE__', this.advisorService.getScoresResult());
      if (supportedLanguage) {
        const modules = getModules(fileName, document.getText(), supportedLanguage).filter(isValidModuleName);
        console.log('__MODULES__', modules);
        const promises = modules
          .map(module => this.vulnerabilityCountProvider.getVulnerabilityCount(module, supportedLanguage))
          .map(promise => promise.then(module => module));
        // const testedModules = await Promise.all(promises);
        Promise.all(promises).then(
          testedModules => {
            console.log('__TESTED__', testedModules);
            // this.vulnsLineDecorations.set(vulnerabilityCount.name, vulnerabilityCount.line);
            const vulnsLineDecorations: Map<string, number> = new Map<string, number>();
            testedModules.forEach(vulnerabilityCount => {
              vulnsLineDecorations.set(vulnerabilityCount.name, vulnerabilityCount.line || -1);
            });
            this.editorDecorator.addScoresDecorations(fileName, scores, vulnsLineDecorations);
          },
          err => {
            console.log('__ERROR__', err);
          },
        );
      }
    }

    return true;
  }

  dispose(): void {
    throw new Error('Method not implemented.');
  }
}
