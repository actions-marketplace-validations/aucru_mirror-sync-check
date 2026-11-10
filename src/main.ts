import * as core from '@actions/core';
import { verifyMirror } from "./verify";

async function run(): Promise<void> {
    try {
        const config = {
            giteaUrl: core.getInput('gitea-url', { required: true }),
            giteaOwner: core.getInput('gitea-owner', { required: true }),
            giteaRepo: core.getInput('gitea-repo', { required: true }),
            giteaToken: core.getInput('gitea-token', { required: true }),
            branch: core.getInput('branch') || 'main',
            upstreamOwner: core.getInput('upstream-owner', { required: true }),
            upstreamRepo: core.getInput('upstream-repo', { required: true }),
            upstreamToken: core.getInput('upstream-token') || process.env.GITHUB_TOKEN || '',
            maxRetries: parseInt(core.getInput('max-retries') || '20', 10),
            retryInterval: parseInt(core.getInput('retry-interval') || '15', 10),
        };

        await verifyMirror(config);
        core.info('Gitea was the newest one');
    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message);
        } else {
            core.setFailed(String(error));
        }
    }
}

run();