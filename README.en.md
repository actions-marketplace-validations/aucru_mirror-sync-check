# Mirror Sync Check

[简体中文](README.md) | [English](README.en.md)

Check whether a Gitea pull mirror matches its GitHub upstream branch. When commits differ, trigger Gitea mirror synchronization and poll until the mirror catches up.

## How it works

1. Fetch the latest commit SHA for the selected GitHub upstream branch.
2. Fetch the commit SHA for the same branch in the Gitea mirror.
3. If the SHAs match, finish successfully. Otherwise, call Gitea's `mirror-sync` API.
4. Wait and check again until synchronization succeeds or the attempt limit is reached.

The upstream SHA is fetched again on every attempt. This action does not create mirror repositories or push Git commits directly. First configure a Gitea pull mirror pointing to the target GitHub repository.

## Use in Gitea Actions

In the mirror repository's Actions settings, add a secret named `MSC_TOKEN` containing a Gitea access token that can read the target repository and trigger mirror synchronization.

Create `.gitea/workflows/mirror-sync.yaml`:

```yaml
name: Mirror Sync Check

on:
  workflow_dispatch:
  schedule:
    - cron: '*/30 * * * *'

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: Check mirror synchronization
        uses: https://github.com/aucru/mirror-sync-check@v1.0.1
        with:
          gitea-url: ${{ gitea.server_url }}
          gitea-owner: your-gitea-owner
          gitea-repo: your-mirror-repo
          gitea-token: ${{ secrets.MSC_TOKEN }}
          upstream-owner: your-github-owner
          upstream-repo: your-upstream-repo
          branch: main
```

Replace the owners and repository names, and set `runs-on` to a label available on your runner. The runner must support `node24` JavaScript actions and have network access to both the GitHub and Gitea APIs.

For GitHub Actions, use `uses: aucru/mirror-sync-check@v1.0.1` and set `gitea-url` to your actual Gitea instance URL.

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `gitea-url` | Yes | — | Gitea instance URL, such as `https://gitea.example.com` |
| `gitea-owner` | Yes | — | User or organization that owns the Gitea mirror |
| `gitea-repo` | Yes | — | Gitea mirror repository name |
| `gitea-token` | Yes | — | Gitea token for reading the repository and triggering mirror synchronization |
| `upstream-owner` | Yes | — | User or organization that owns the GitHub upstream repository |
| `upstream-repo` | Yes | — | GitHub upstream repository name |
| `upstream-token` | No | Empty | GitHub token; omit for anonymous access |
| `branch` | No | `main` | Branch name to compare on both sides |
| `max-retries` | No | `20` | Total number of attempts, including the first check; must be a positive integer |
| `retry-interval` | No | `15` | Seconds between attempts; from 1 to 2147483.647 |

By default, the action checks up to 20 times with a 15-second wait between attempts. API request time adds to the total duration. The upstream API is fixed to `https://api.github.com`; custom GitHub Enterprise API URLs are not supported.

## Authentication

`gitea-token` authenticates with Gitea, while `upstream-token` authenticates with GitHub. They are not interchangeable.

- Public GitHub upstream repositories can be accessed without `upstream-token`. Anonymous requests remain subject to GitHub API rate limits.
- Private GitHub upstream repositories require an explicitly supplied GitHub token with read access to the repository. You can also supply a token for public repositories to use authenticated request limits.
- The action does not automatically use `${{ github.token }}` or the `GITHUB_TOKEN` environment variable. In Gitea Actions, do not pass a Gitea job token as a GitHub token.
- For private upstream repositories, configure upstream credentials separately in the Gitea mirror settings. This action's `upstream-token` is only used to read the GitHub API and does not change the mirror configuration.

To authenticate GitHub requests, add this input to the step's `with` section:

```yaml
upstream-token: ${{ secrets.UPSTREAM_GITHUB_TOKEN }}
```

## Debugging and troubleshooting

Add an Actions secret named `ACTIONS_STEP_DEBUG` with the value `true` to the repository running the workflow, then run the workflow again. Debug logs include request URLs, authentication modes, and HTTP status codes without printing token values. Both input tokens are also registered for log masking.

For example, without an upstream token:

```text
GitHub upstream: GET https://api.github.com/repos/owner/repo/branches/main; authentication=anonymous
GitHub upstream: HTTP 200
```

Errors identify the request stage even when debug logging is disabled:

```text
GitHub upstream failed (HTTP 401): Bad credentials
Gitea mirror failed (HTTP 401): Unauthorized
Gitea mirror sync failed (HTTP 403): Forbidden
```

| Symptom | What to check |
| --- | --- |
| `GitHub upstream` returns 401 | Check that `upstream-token` is a valid GitHub token; for public repositories, you can remove this input |
| Authentication fails at `Gitea mirror` or `Gitea mirror sync` | Check the Gitea URL, token validity, and repository access/synchronization permissions |
| Upstream branch is missing or inaccessible | Check the GitHub repository name, `branch`, and read access for private repositories |
| `Out of time` | Check the Gitea mirror configuration and synchronization task status; increase the attempt limit or interval if needed |
| New logs do not appear after an update | Check that the workflow's `uses: ...@version` points to a tag or commit containing the changes |

The action retries HTTP 429, HTTP 5xx, certain temporary network errors, and request timeouts. Authentication errors fail immediately. The step also fails if the mirror has not caught up by the attempt limit. On success, it logs `Sync successful! Mirror is up to date.` No custom outputs are provided.

## Local development

Install the project's required Node.js and pnpm versions, then run:

```sh
pnpm install --frozen-lockfile
pnpm test -- --runInBand
pnpm run build
```

The action executes `dist/index.js`. After changing source files, rebuild and commit the generated bundle together with the source changes. Release tags must include these files.
