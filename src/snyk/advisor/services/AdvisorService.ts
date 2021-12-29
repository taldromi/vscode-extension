import axios, { AxiosResponse } from 'axios';
import { Subject } from 'rxjs';
import { CliError } from '../../cli/services/cliService';
import { configuration } from '../../common/configuration/instance';
import { OssResult, OssResultBody, OssVulnerability } from '../../snykOss/ossResult';
import { ModuleVulnerabilityCount } from '../../snykOss/services/vulnerabilityCount/importedModule';
import { AdvisorScore } from '../AdvisorTypes';

export default class AdvisorService {
  protected scores: AdvisorScore[];
  readonly scanFinished$ = new Subject<void>();
  private _vulnerabilities: ModuleVulnerabilityCount[];
  private readonly api = `${configuration.baseApiUrl}/unstable/advisor/scores/npm-package`;

  get vulnerabilities(): ModuleVulnerabilityCount[] {
    return this._vulnerabilities;
  }
  private set vulnerabilities(vulnerabilities: ModuleVulnerabilityCount[]) {
    this._vulnerabilities = vulnerabilities;
  }

  public getScoresResult = (): AdvisorScore[] | undefined => this.scores;

  public async setScores(ossResult: OssResult): Promise<AdvisorScore | CliError> {
    const scores: AdvisorScore = null;
    try {
      const vulnerabilities = (ossResult as OssResultBody).vulnerabilities || [];
      const res: AxiosResponse = await axios.post(
        this.api,
        vulnerabilities.map((vuln: OssVulnerability) => vuln.name),
        {
          headers: { Authorization: `token ${configuration.token}` },
        },
      );
      if (res.data) {
        this.scores = res.data as AdvisorScore[];
        this.scanFinished$.next();
        return res.data as AdvisorScore;
      }
    } catch (err) {
      if (err instanceof CliError) {
        return err;
      }

      const result = new CliError(err, '');
      console.error('Failed to get scores', result.error.toString());
    }
    return scores;
  }
}
