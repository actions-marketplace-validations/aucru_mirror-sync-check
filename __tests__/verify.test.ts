import type { MirrorConfig } from "../src/verify";
import { describe, it, expect } from '@jest/globals';
describe('MirrorConfig', () => {
    it('should have correct shape', () => {
        const cfg: MirrorConfig = {
            giteaUrl: 'https://gitea.com',
            giteaOwner: 'o',
            giteaRepo: 'r',
            giteaToken: 't',
            branch: 'main',
            upstreamOwner: 'uo',
            upstreamRepo: 'up',
            upstreamToken: 'ut',
            maxRetries: 3,
            retryInterval: 1
        };
        expect(cfg.branch).toBe('main');
    });
});