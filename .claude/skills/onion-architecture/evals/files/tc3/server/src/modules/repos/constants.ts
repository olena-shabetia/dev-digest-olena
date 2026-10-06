export const DEFAULT_BRANCH = 'main';
export const MAX_REPO_NAME_LENGTH = 100;
export const SUPPORTED_PROVIDERS = ['github', 'gitlab'] as const;
export type Provider = (typeof SUPPORTED_PROVIDERS)[number];
