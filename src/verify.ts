import * as core from '@actions/core';
import * as http from '@actions/http-client';

export interface MirrorConfig {
    giteaUrl: string;
    giteaOwner: string;
    giteaRepo: string;
    giteaToken: string;
    branch: string;
    upstreamOwner: string;
    upstreamRepo: string;
    upstreamToken: string;
    maxRetries: number;
    retryInterval: number;
}

const GITHUB_API = 'https://api.github.com';

function isTransientError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const { statusCode, code } = error as Error & { statusCode?: number; code?: string };
    return statusCode === 429 || (statusCode !== undefined && statusCode >= 500 && statusCode < 600) ||
        ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'].includes(code ?? '') ||
        error.message.startsWith('Request timeout:');
}

async function getUpstreamSha(config: MirrorConfig, client: http.HttpClient): Promise<string> {
    const url = `${GITHUB_API}/repos/${config.upstreamOwner}/${config.upstreamRepo}/branches/${config.branch}`;
    const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
    };

    if (config.upstreamToken) {
        headers['Authorization'] = `Bearer ${config.upstreamToken}`;
    }

    const res = await client.getJson<{ commit: { sha: string } }>(url, headers);

    if (!res.result?.commit?.sha) {
        throw new Error(`Failed to get upstream SHA: HTTP ${res.statusCode}`);
    }

    return res.result.commit.sha;
}

async function getGiteaSha(config: MirrorConfig, client: http.HttpClient): Promise<string | null> {
    const base = config.giteaUrl.replace(/\/$/, '');
    const url = `${base}/api/v1/repos/${config.giteaOwner}/${config.giteaRepo}/branches/${config.branch}`;

    const res = await client.getJson<{ commit: { id: string } }>(url, {
        Authorization: `Bearer ${config.giteaToken}`
    });

    if (res.statusCode === 404) return null;

    if (!res.result?.commit?.id) return null;

    return res.result.commit.id;
}

async function triggerSync(config: MirrorConfig, client: http.HttpClient): Promise<void> {
    const base = config.giteaUrl.replace(/\/$/, '');
    const url = `${base}/api/v1/repos/${config.giteaOwner}/${config.giteaRepo}/mirror-sync`;
    core.info('Triggering Sync...');

    const res = await client.postJson(url, {}, {
        Authorization: `Bearer ${config.giteaToken}`
    });

    if (res.statusCode < 200 || res.statusCode >= 300) {
        throw new Error(`Failed to trigger sync. Check your Gitea token or config. HTTP ${res.statusCode}`);
    }
}

export async function verifyMirror(config: MirrorConfig): Promise<void> {
    if (!Number.isSafeInteger(config.maxRetries) || config.maxRetries < 1) {
        throw new Error('max-retries must be a positive safe integer');
    }
    if (!Number.isFinite(config.retryInterval) || config.retryInterval < 1 ||
        config.retryInterval * 1000 > 2_147_483_647) {
        throw new Error('retry-interval must be between 1 and 2147483.647 seconds');
    }

    const client = new http.HttpClient('gitea-mirror-check');
    let upstreamSha: string | undefined;
    try {
        for (let i = 1; i <= config.maxRetries; i++) {
            core.info(`Try ${i}/${config.maxRetries}`);
            try {
                upstreamSha = await getUpstreamSha(config, client);
                core.info(`Upstream Sha: ${upstreamSha}`);
                const giteaSha = await getGiteaSha(config, client);
                if (giteaSha === upstreamSha) {
                    core.info('Sync successful! Mirror is up to date.');
                    return;
                }
                core.info(`Gitea Sha: ${giteaSha ?? 'not found'}`);
                await triggerSync(config, client);
            } catch (error) {
                if (!isTransientError(error)) throw error;
                if (i === config.maxRetries) throw error;
                core.warning(`Transient error on attempt ${i}: ${String(error)}. Retrying...`);
            }

            if (i < config.maxRetries) {
                await new Promise((resolve) => setTimeout(resolve, config.retryInterval * 1000));
            }
        }
        throw new Error(`Out of time. Final upstream Sha: ${upstreamSha}`);
    } finally {
        client.dispose();
    }
}
