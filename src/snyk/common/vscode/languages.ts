import * as vscode from 'vscode';
import {
  CodeActionProvider,
  CodeActionProviderMetadata,
  Diagnostic,
  DiagnosticCollection,
  DiagnosticSeverity,
  Disposable,
  DocumentSelector,
  HoverProvider,
  Range,
} from './types';

export interface IVSCodeLanguages {
  registerHoverProvider(selector: DocumentSelector, provider: HoverProvider): Disposable;
  createDiagnosticCollection(name: string): DiagnosticCollection;
  createDiagnostic(range: Range, message: string, severity?: DiagnosticSeverity): Diagnostic;
  createRange(...args: ConstructorParameters<typeof vscode.Range>): Range;
  registerCodeActionsProvider(
    selector: DocumentSelector,
    provider: CodeActionProvider,
    metadata?: CodeActionProviderMetadata,
  ): Disposable;
}

export class VSCodeLanguages implements IVSCodeLanguages {
  registerHoverProvider(selector: DocumentSelector, provider: HoverProvider): Disposable {
    return vscode.languages.registerHoverProvider(selector, provider);
  }

  createDiagnosticCollection(name: string): DiagnosticCollection {
    return vscode.languages.createDiagnosticCollection(name);
  }

  createDiagnostic(range: Range, message: string, severity?: DiagnosticSeverity): Diagnostic {
    return new vscode.Diagnostic(range, message, severity);
  }

  createRange(startLine: number, startCharacter: number, endLine: number, endCharacter: number): Range {
    return new vscode.Range(startLine, startCharacter, endLine, endCharacter);
  }

  registerCodeActionsProvider(
    selector: DocumentSelector,
    provider: CodeActionProvider,
    metadata?: CodeActionProviderMetadata,
  ): Disposable {
    return vscode.languages.registerCodeActionsProvider(selector, provider, metadata);
  }
}

export const vsCodeLanguages = new VSCodeLanguages();
