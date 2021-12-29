import * as vscode from 'vscode';
import { Hover } from 'vscode';
import { getRenderOptions, updateDecorations } from '../../common/vscode/editorDecorator';
import { IVSCodeLanguages } from '../../common/vscode/languages';
import { IThemeColorAdapter } from '../../common/vscode/theme';
import { DecorationOptions, TextEditorDecorationType } from '../../common/vscode/types';
import { IVSCodeWindow } from '../../common/vscode/window';
import { AdvisorScore } from '../AdvisorTypes';

type LineDecorations = DecorationOptions[]; // array index is a line number
const SCORE_PREFIX = 'Advisor Score';

export default class EditorDecorator {
  private readonly decorationType: TextEditorDecorationType;
  private readonly editorLastCharacterIndex = Number.MAX_SAFE_INTEGER;

  constructor(
    private readonly window: IVSCodeWindow,
    private readonly languages: IVSCodeLanguages,
    private readonly themeColorAdapter: IThemeColorAdapter,
  ) {
    this.decorationType = this.window.createTextEditorDecorationType({
      after: { margin: '0 0 0 1rem' },
    });
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
            renderOptions: getRenderOptions(
              `| ${SCORE_PREFIX} ${Math.round(score.score * 100)}/100`,
              this.themeColorAdapter,
            ),
            hoverMessage: this.getHoverMessage(score)?.contents,
          };
        }
      }
      updateDecorations(this.window, filePath, decorations, this.decorationType);
    }
  }

  getHoverMessage(score: AdvisorScore): Hover | null {
    if (!score) {
      return null;
    }
    const hoverMessageMarkdown = new vscode.MarkdownString(``);
    hoverMessageMarkdown.isTrusted = true;
    const hoverMessage = new Hover(hoverMessageMarkdown);
    hoverMessageMarkdown.appendMarkdown('| |  | |  |');
    hoverMessageMarkdown.appendMarkdown('\n');
    hoverMessageMarkdown.appendMarkdown('| ---- | ---- | ---- |  :---- |');
    hoverMessageMarkdown.appendMarkdown('\n');
    Object.keys(score.labels).forEach(label => {
      hoverMessageMarkdown.appendMarkdown(`| ${label}: | | | ${score?.labels[label]} |`);
      hoverMessageMarkdown.appendMarkdown('\n');
    });
    hoverMessageMarkdown.appendMarkdown(`[More Details](http://snyk.io/advisor/npm-package/${score.name})`);

    return hoverMessage;
  }
}
