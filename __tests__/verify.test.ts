import { jest, beforeEach, afterEach, it, expect } from '@jest/globals';
import * as http from '@actions/http-client';
import * as core from '@actions/core';
import { verifyMirror, type MirrorConfig } from '../src/verify';

// These dependencies expose import-only exports; the CommonJS test runner uses virtual mocks.
jest.mock('@actions/core', () => ({ info: jest.fn(), warning: jest.fn(), debug: jest.fn(), setSecret: jest.fn() }), { virtual: true });
jest.mock('@actions/http-client', () => ({ HttpClient: jest.fn() }), { virtual: true });

const config: MirrorConfig = {
    giteaUrl: 'https://mirror.example', giteaOwner: 'o', giteaRepo: 'r',
    giteaToken: 't', branch: 'main', upstreamOwner: 'u', upstreamRepo: 'r',
    upstreamToken: '', maxRetries: 2, retryInterval: 1,
};
const upstream = (sha: string) => ({ statusCode: 200, result: { commit: { sha } } });
const mirror = (id: string) => ({ statusCode: 200, result: { commit: { id } } });
const client = {
    getJson: jest.fn<(url: string, headers?: Record<string, string>) => Promise<unknown>>(),
    postJson: jest.fn<(url: string, body: unknown, headers?: Record<string, string>) => Promise<unknown>>(),
    dispose: jest.fn(),
};

beforeEach(() => {
    jest.useFakeTimers();
    jest.resetAllMocks();
    (http.HttpClient as unknown as jest.Mock<() => typeof client>).mockReturnValue(client);
    client.postJson.mockResolvedValue({ statusCode: 200 });
});
afterEach(() => { jest.useRealTimers(); });

async function finish() {
    const result = verifyMirror(config);
    const assertion = expect(result).resolves.toBeUndefined();
    await jest.runAllTimersAsync();
    await assertion;
    expect(client.dispose).toHaveBeenCalledTimes(1);
}

it.each([
    Object.assign(new Error('Unavailable'), { statusCode: 503 }),
    Object.assign(new Error('Rate limited'), { statusCode: 429 }),
    Object.assign(new Error('reset'), { code: 'ECONNRESET' }),
    new Error('Request timeout: /repos/u/r'),
])('retries initial upstream errors: %s', async error => {
    client.getJson.mockRejectedValueOnce(error)
        .mockResolvedValueOnce(upstream('A')).mockResolvedValueOnce(mirror('A'));
    await finish();
    expect(client.getJson).toHaveBeenCalledTimes(3);
});

it('retries a polling HTTP 503', async () => {
    client.getJson.mockResolvedValueOnce(upstream('A'))
        .mockRejectedValueOnce(Object.assign(new Error('Unavailable'), { statusCode: 503 }))
        .mockResolvedValueOnce(upstream('A')).mockResolvedValueOnce(mirror('A'));
    await finish();
});

it('retries a sync HTTP 503', async () => {
    client.getJson.mockResolvedValueOnce(upstream('A')).mockResolvedValueOnce(mirror('old'))
        .mockResolvedValueOnce(upstream('A')).mockResolvedValueOnce(mirror('A'));
    client.postJson.mockRejectedValueOnce(Object.assign(new Error('Unavailable'), { statusCode: 503 }));
    await finish();
});

it('accepts the latest SHA on the final attempt', async () => {
    client.getJson.mockResolvedValueOnce(upstream('A')).mockResolvedValueOnce(mirror('old'))
        .mockResolvedValueOnce(upstream('B')).mockResolvedValueOnce(mirror('B'));
    await finish();
    expect(client.postJson).toHaveBeenCalledTimes(1);
    expect(client.getJson).toHaveBeenCalledWith(
        'https://mirror.example/api/v1/repos/o/r/branches/main',
        { Authorization: 'Bearer t' },
    );
    expect(client.postJson).toHaveBeenCalledWith(
        'https://mirror.example/api/v1/repos/o/r/mirror-sync', {},
        { Authorization: 'Bearer t' },
    );
});

it('fails immediately for authentication errors', async () => {
    const error = Object.assign(new Error('Unauthorized'), { statusCode: 401 });
    client.getJson.mockRejectedValueOnce(error);
    await expect(verifyMirror(config)).rejects.toMatchObject({
        message: 'GitHub upstream failed (HTTP 401): Unauthorized', cause: error,
    });
    expect(client.getJson).toHaveBeenCalledTimes(1);
    expect(client.dispose).toHaveBeenCalledTimes(1);
});

it.each(['', 'github-pat'])('uses only the configured upstream token: %j', async upstreamToken => {
    client.getJson.mockResolvedValueOnce(upstream('A')).mockResolvedValueOnce(mirror('A'));
    await verifyMirror({ ...config, upstreamToken });
    expect(client.getJson).toHaveBeenNthCalledWith(1,
        'https://api.github.com/repos/u/r/branches/main',
        upstreamToken
            ? { Accept: 'application/vnd.github+json', Authorization: 'Bearer github-pat' }
            : { Accept: 'application/vnd.github+json' },
    );
    expect(core.debug).toHaveBeenCalledWith(expect.stringContaining(
        `authentication=${upstreamToken ? 'token' : 'anonymous'}`,
    ));
});

it.each(['Gitea mirror', 'Gitea mirror sync'])('identifies authentication failures from %s', async stage => {
    const error = Object.assign(new Error('Bad credentials'), { statusCode: 401 });
    client.getJson.mockResolvedValueOnce(upstream('A'));
    if (stage === 'Gitea mirror') client.getJson.mockRejectedValueOnce(error);
    else {
        client.getJson.mockResolvedValueOnce(mirror('old'));
        client.postJson.mockRejectedValueOnce(error);
    }
    await expect(verifyMirror(config)).rejects.toMatchObject({
        message: `${stage} failed (HTTP 401): Bad credentials`, cause: error,
    });
    expect(client.dispose).toHaveBeenCalledTimes(1);
});

it('logs request diagnostics and registers tokens for masking', async () => {
    const giteaToken = 'secret-gitea-token';
    const upstreamToken = 'secret-github-token';
    client.getJson.mockResolvedValueOnce(upstream('A')).mockResolvedValueOnce(mirror('old'))
        .mockResolvedValueOnce(upstream('A')).mockResolvedValueOnce(mirror('A'));
    const result = verifyMirror({ ...config, giteaToken, upstreamToken });
    const assertion = expect(result).resolves.toBeUndefined();
    await jest.runAllTimersAsync();
    await assertion;
    expect(core.setSecret).toHaveBeenCalledWith(giteaToken);
    expect(core.setSecret).toHaveBeenCalledWith(upstreamToken);
    for (const stage of ['GitHub upstream', 'Gitea mirror', 'Gitea mirror sync']) {
        expect(core.debug).toHaveBeenCalledWith(expect.stringContaining(`${stage}: HTTP 200`));
    }
    const logs = JSON.stringify([
        jest.mocked(core.info).mock.calls, jest.mocked(core.debug).mock.calls,
        jest.mocked(core.warning).mock.calls,
    ]);
    expect(logs).not.toContain(giteaToken);
    expect(logs).not.toContain(upstreamToken);
});

it('preserves the last transient error when retries are exhausted', async () => {
    const error = Object.assign(new Error('Unavailable'), { statusCode: 503 });
    client.getJson.mockRejectedValue(error);
    const assertion = expect(verifyMirror(config)).rejects.toMatchObject({
        message: 'GitHub upstream failed (HTTP 503): Unavailable', cause: error,
    });
    await jest.runAllTimersAsync();
    await assertion;
    expect(client.getJson).toHaveBeenCalledTimes(2);
    expect(client.dispose).toHaveBeenCalledTimes(1);
});

it('fails when the mirror never catches up', async () => {
    client.getJson.mockImplementation(async (url: string) =>
        url.startsWith('https://api.github.com') ? upstream('A') : mirror('old'));
    const assertion = expect(verifyMirror(config)).rejects.toThrow('Out of time');
    await jest.runAllTimersAsync();
    await assertion;
    expect(client.dispose).toHaveBeenCalledTimes(1);
});

it.each([NaN, Infinity, -1, 0, 3_000_000])('rejects invalid retry intervals: %s', async retryInterval => {
    await expect(verifyMirror({ ...config, retryInterval })).rejects.toThrow('retry-interval');
    expect(http.HttpClient).not.toHaveBeenCalled();
});
it.each([NaN, Infinity, -1, 0, 1.5])('rejects invalid retry counts: %s', async maxRetries => {
    await expect(verifyMirror({ ...config, maxRetries })).rejects.toThrow('max-retries');
    expect(http.HttpClient).not.toHaveBeenCalled();
});
