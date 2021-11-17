import { v4 as uuidv4 } from 'uuid';
import { ISnykApiClient } from './api/apiСlient';
import { MEMENTO_ANONYMOUS_ID } from './constants/globalState';
import { ExtensionContext } from './vscode/extensionContext';

export type UserDto = {
  id: string;
  username: string;
};

export class User {
  private _authenticatedId?: string;

  readonly anonymousId: string;

  constructor(anonymousId?: string, authenticatedId?: string) {
    this.anonymousId = anonymousId ?? uuidv4();
    this._authenticatedId = authenticatedId ?? undefined;
  }

  static async get(context: ExtensionContext): Promise<User> {
    let anonymousId = context.getGlobalStateValue<string>(MEMENTO_ANONYMOUS_ID);
    if (!anonymousId) {
      anonymousId = uuidv4();
      await context.updateGlobalStateValue(MEMENTO_ANONYMOUS_ID, anonymousId);
    }

    return new User(anonymousId);
  }

  get authenticatedId(): string | undefined {
    return this._authenticatedId;
  }

  async identify(apiClient: ISnykApiClient): Promise<void> {
    const user = await this.userMe(apiClient);
    if (user && user.id) {
      this._authenticatedId = user.id;
    }
  }

  private async userMe(api: ISnykApiClient): Promise<UserDto> {
    const { data } = await api.get<UserDto>('/user/me');
    return data;
  }
}