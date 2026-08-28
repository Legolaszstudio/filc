import type {
  WifiController,
  WifiSpeedProfile,
  WifiSpeedProfileInput,
} from './controller';
import { UnifiClient } from './unifi-api';

export class UnifiController implements WifiController {
  readonly provider = 'unifi';
  private readonly client: UnifiClient;

  constructor(client: UnifiClient) {
    this.client = client;
  }

  fetchClientHostname(macAddress: string) {
    return this.client.fetchClientHostname(macAddress);
  }

  applySpeedProfile(macAddress: string, speedProfileId: string) {
    return this.client.applySpeedProfile(macAddress, speedProfileId);
  }

  async getSpeedProfiles(): Promise<WifiSpeedProfile[]> {
    const profiles = await this.client.getUserGroups();
    return profiles.map((profile) => ({
      downloadSpeedMbps: profile.downloadSpeedMbps ?? null,
      id: profile._id,
      name: profile.name,
      uploadSpeedMbps: profile.uploadSpeedMbps ?? null,
    }));
  }

  async createSpeedProfile(
    input: WifiSpeedProfileInput
  ): Promise<WifiSpeedProfile> {
    const profile = await this.client.createUserGroup(
      input.name,
      input.downloadSpeedMbps,
      input.uploadSpeedMbps
    );
    return {
      downloadSpeedMbps: profile.downloadSpeedMbps ?? null,
      id: profile._id,
      name: profile.name,
      uploadSpeedMbps: profile.uploadSpeedMbps ?? null,
    };
  }

  async updateSpeedProfile(
    id: string,
    input: WifiSpeedProfileInput
  ): Promise<WifiSpeedProfile> {
    const profile = await this.client.editUserGroup(
      id,
      'default',
      input.name,
      input.downloadSpeedMbps,
      input.uploadSpeedMbps
    );
    return {
      downloadSpeedMbps: profile.downloadSpeedMbps ?? null,
      id: profile._id,
      name: profile.name,
      uploadSpeedMbps: profile.uploadSpeedMbps ?? null,
    };
  }

  deleteSpeedProfile(id: string) {
    return this.client.deleteUserGroup(id);
  }
}

export const createUnifiController = (config: {
  host: string;
  password: string;
  port: number;
  username: string;
}): WifiController =>
  new UnifiController(
    new UnifiClient({
      baseUrl: `https://${config.host}:${config.port}`,
      password: config.password,
      username: config.username,
    })
  );
