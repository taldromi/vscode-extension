import * as vscode from 'vscode';
import { Hover } from 'vscode';
import { IVSCodeLanguages } from '../../common/vscode/languages';
import { IThemeColorAdapter } from '../../common/vscode/theme';
import {
  DecorationOptions,
  TextEditorDecorationType,
  ThemableDecorationInstanceRenderOptions,
} from '../../common/vscode/types';
import { IVSCodeWindow } from '../../common/vscode/window';
import { AdvisorScore } from '../AdvisorTypes';

type LineDecorations = DecorationOptions[]; // array index is a line number
const SCORE_PREFIX = 'Advisor Score';

export default class EditorDecorator {
  private readonly decorationType: TextEditorDecorationType;
  private readonly fileDecorationMap: Map<string, LineDecorations>;
  private readonly vulnsLineDecorations: Map<string, number>;
  private readonly editorLastCharacterIndex = Number.MAX_SAFE_INTEGER;

  constructor(
    private readonly window: IVSCodeWindow,
    private readonly languages: IVSCodeLanguages,
    private readonly themeColorAdapter: IThemeColorAdapter,
  ) {
    this.fileDecorationMap = new Map<string, LineDecorations>();
    // TODO: common
    this.decorationType = this.window.createTextEditorDecorationType({
      after: { margin: '0 0 0 1rem' },
    });
    this.vulnsLineDecorations = new Map<string, number>();
  }

  addScoresDecorations(filePath: string, scores: AdvisorScore[], lineDecorations: Map<string, number>): void {
    if (scores && lineDecorations?.size) {
      const decorations: LineDecorations = [];
      for (const [packageName, line] of lineDecorations) {
        if (line < 0) {
          continue;
        }

        const score = scores.find(score => score && score.name === packageName);
        if (score) {
          decorations[line] = {
            range: this.languages.createRange(
              line - 1,
              this.editorLastCharacterIndex,
              line - 1,
              this.editorLastCharacterIndex,
            ),
            renderOptions: this.getRenderOptions(`| ${SCORE_PREFIX} ${Math.round(score.score * 100)}/100`),
            hoverMessage: this.getHoverMessage(score)?.contents,
          };
        }
      }
      this.updateDecorations(filePath, decorations);
    }
  }

  getHoverMessage(score: AdvisorScore): Hover | null {
    if (!score) {
      return null;
    }
    const hoverMessageMarkdown = new vscode.MarkdownString(``);
    hoverMessageMarkdown.isTrusted = true;
    const hoverMessage = new Hover(hoverMessageMarkdown);
    Object.keys(score.labels).forEach(label => {
      hoverMessageMarkdown.appendMarkdown(`${label}: ${score?.labels[label]}`);
      hoverMessageMarkdown.appendMarkdown('\n');
      hoverMessageMarkdown.appendMarkdown('\n');
    });
    hoverMessageMarkdown.appendMarkdown(`[More Details](http://snyk.io/advisor/npm-package/${score.name})`);

    return hoverMessage;
  }

  // TODO: move to common
  updateDecorations(filePath: string, decorations?: LineDecorations): void {
    const visibleEditors = this.window.getVisibleTextEditors().filter(editor => editor.document.fileName === filePath);

    for (const editor of visibleEditors) {
      decorations = decorations || this.fileDecorationMap.get(filePath);

      if (decorations && decorations.length) {
        editor.setDecorations(
          this.decorationType,
          decorations.filter(d => !!d),
        );
      }
    }
  }

  // TODO: move to common
  private getRenderOptions(contentText: string): ThemableDecorationInstanceRenderOptions {
    const color = this.themeColorAdapter.create('descriptionForeground');
    const fontWeight = 'normal';

    return {
      after: {
        contentText,
        color,
        fontWeight,
      },
    };
  }
}
