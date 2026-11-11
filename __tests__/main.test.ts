import { jest, it, expect } from '@jest/globals';
import * as core from '@actions/core';
import { verifyMirror } from '../src/verify';

jest.mock('@actions/core', () => ({
    getInput: jest.fn(), info: jest.fn(), setFailed: jest.fn(),
}), { virtual: true });
jest.mock('../src/verify', () => ({ verifyMirror: jest.fn() }));

it.each(['', 'github-pat'])('does not substitute the runner token for upstream-token: %j', upstreamToken => {
    const previousToken = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = 'gitea-runner-token';
    try {
        jest.mocked(core.getInput).mockImplementation(name => name === 'upstream-token' ? upstreamToken : 'value');
        jest.isolateModules(() => { require('../src/main'); });
        expect(verifyMirror).toHaveBeenLastCalledWith(expect.objectContaining({ upstreamToken }));
    } finally {
        if (previousToken === undefined) delete process.env.GITHUB_TOKEN;
        else process.env.GITHUB_TOKEN = previousToken;
    }
});
