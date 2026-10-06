import type { SecretsProvider } from '../../vendor/shared/adapters.js';

export class LocalSecretsProvider implements SecretsProvider {
  async get(key: string): Promise<string | undefined> {
    return process.env[key];
  }
}
