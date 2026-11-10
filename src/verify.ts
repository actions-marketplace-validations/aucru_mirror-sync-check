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
    const base = config.giteaUrl.replace(/\/$/, '')
    const url = `${base}/api/v1/repos/${config.giteaOwner}/${config.giteaRepo}/branches/${config.branch}`;
    const res = await client.getJson<{ commit: { id: string }}>(url, {
        Authorization: `token ${config.giteaToken}`
    });

    if (res.statusCode === 404) return null;
    if (!res.result?.commit?.id) return null;

    return res.result.commit?.id;
}

async function triggerSync(config: MirrorConfig, client: http.HttpClient): Promise<void> {
    const base = config.giteaUrl.replace(/\/$/, '');
    const url = `${base}/api/v1/repos/${config.giteaOwner}/${config.giteaRepo}/mirror-sync`;
    core.info('Triggering Sync...');
    await client.postJson(url, {}, {
        Authorization: `token ${config.giteaToken}`
    });
}

export async function verifyMirror(config: MirrorConfig): Promise<void> {
    const client = new http.HttpClient('gitea-mirror-check');
    const upstreamSha = await getUpstreamSha(config, client);

    core.info(`Upstream Sha: ${upstreamSha}`);

    await triggerSync(config, client);

    for (let i = 1; i <= config.maxRetries; i++) {
        core.info(`Try ${i}/${config.maxRetries}`);
        const giteaSha = await getGiteaSha(config, client);

        if (giteaSha === upstreamSha) {
            return;
        }

        core.info(`Gitea Sha: ${giteaSha ?? 'not found'}`);
        if ( i < config.maxRetries) {
            await new Promise((r) => setTimeout(r, config.retryInterval * 1000));
            await triggerSync(config, client);
        }
    }

    throw new Error(`Out of time, upstream Sha: ${upstreamSha}`);
}