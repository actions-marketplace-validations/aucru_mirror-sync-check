# Mirror Sync Check

[简体中文](README.md) | [English](README.en.md)

检查 Gitea 拉取镜像是否与 GitHub 上游分支同步；提交不一致时触发 Gitea 镜像同步，并轮询确认结果。

## 工作方式

1. 获取 GitHub 上游指定分支的最新提交 SHA。
2. 获取 Gitea 镜像同名分支的提交 SHA。
3. SHA 一致则成功结束；不一致则调用 Gitea 的 `mirror-sync` API。
4. 等待后重新检查，直到同步成功或达到尝试次数上限。

每次检查都会重新获取上游 SHA。此 Action 不创建镜像仓库，也不直接推送 Git 提交；请先在 Gitea 中配置好指向目标 GitHub 仓库的拉取镜像。

## 在 Gitea Actions 中使用

在镜像仓库的 Actions 设置中添加密钥 `MSC_TOKEN`，其值为能够读取目标仓库并触发镜像同步的 Gitea 访问令牌。

创建 `.gitea/workflows/mirror-sync.yaml`：

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

替换仓库所有者及仓库名称，并将 `runs-on` 改为你的 Runner 提供的标签。Runner 需要支持 `node24` JavaScript Action，且能够访问 GitHub API 和 Gitea API。

在 GitHub Actions 中使用时，可写为 `uses: aucru/mirror-sync-check@v1.0.1`，并将 `gitea-url` 设置为实际的 Gitea 地址。

## 输入参数

| 参数 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `gitea-url` | 是 | — | Gitea 实例地址，例如 `https://gitea.example.com` |
| `gitea-owner` | 是 | — | Gitea 镜像仓库的用户或组织名 |
| `gitea-repo` | 是 | — | Gitea 镜像仓库名 |
| `gitea-token` | 是 | — | 用于读取仓库和触发镜像同步的 Gitea 令牌 |
| `upstream-owner` | 是 | — | GitHub 上游仓库的用户或组织名 |
| `upstream-repo` | 是 | — | GitHub 上游仓库名 |
| `upstream-token` | 否 | 空 | GitHub 令牌；留空时匿名访问 |
| `branch` | 否 | `main` | 两端需要比较的同名分支 |
| `max-retries` | 否 | `20` | 总尝试次数，包含首次检查；必须为正整数 |
| `retry-interval` | 否 | `15` | 两次尝试间隔，单位为秒；范围为 1 至 2147483.647 |

默认最多检查 20 次，检查之间等待 15 秒；实际耗时还包括 API 请求时间。上游 API 固定为 `https://api.github.com`，不支持自定义 GitHub Enterprise API 地址。

## 认证

`gitea-token` 和 `upstream-token` 分别用于 Gitea 与 GitHub，不能混用。

- 公开 GitHub 上游可以不填写 `upstream-token`。匿名请求仍受 GitHub API 限流约束。
- 私有 GitHub 上游需要显式提供能够读取该仓库的 GitHub 令牌，也可为公开上游提供令牌以使用认证请求额度。
- Action 不会自动使用 `${{ github.token }}` 或环境变量 `GITHUB_TOKEN`。在 Gitea Actions 中，不要将 Gitea 的运行令牌当成 GitHub 令牌传入。
- 私有上游的同步还需要在 Gitea 镜像设置中配置上游凭据；本 Action 的 `upstream-token` 仅用于读取 GitHub API，不会修改镜像配置。

如需认证访问 GitHub，在工作流步骤的 `with` 中增加：

```yaml
upstream-token: ${{ secrets.UPSTREAM_GITHUB_TOKEN }}
```

## 调试与错误排查

在运行工作流的仓库中添加 Actions 密钥 `ACTIONS_STEP_DEBUG`，值为 `true`，然后重新运行工作流。调试日志包含请求地址、认证方式和 HTTP 状态码，不打印令牌内容；两个输入令牌也会注册为日志掩码。

例如，未配置上游令牌时可看到：

```text
GitHub upstream: GET https://api.github.com/repos/owner/repo/branches/main; authentication=anonymous
GitHub upstream: HTTP 200
```

即使未开启调试，失败信息也会标明请求阶段：

```text
GitHub upstream failed (HTTP 401): Bad credentials
Gitea mirror failed (HTTP 401): Unauthorized
Gitea mirror sync failed (HTTP 403): Forbidden
```

| 现象 | 检查项 |
| --- | --- |
| `GitHub upstream` 返回 401 | `upstream-token` 是否为有效的 GitHub 令牌；公开仓库可移除该参数 |
| `Gitea mirror` 或 `Gitea mirror sync` 认证失败 | Gitea 地址、令牌有效性及目标仓库访问/同步权限 |
| 上游分支不存在或无法访问 | GitHub 仓库名称、`branch` 及私有仓库读取权限 |
| `Out of time` | Gitea 镜像配置和同步任务状态；必要时增加尝试次数或间隔 |
| 更新后仍没有新日志 | 检查工作流的 `uses: ...@版本` 是否指向包含修改的标签或提交 |

HTTP 429、HTTP 5xx、部分临时网络错误及请求超时会重试。认证错误会立即失败；达到上限仍未同步也会使步骤失败。成功时输出 `Sync successful! Mirror is up to date.`，不提供自定义 outputs。

## 本地开发

安装项目所需的 Node.js 和 pnpm 后运行：

```sh
pnpm install --frozen-lockfile
pnpm test -- --runInBand
pnpm run build
```

Action 实际执行的是 `dist/index.js`。修改源码后需要重新构建，并将构建产物与源码一起提交；发布标签必须包含这些文件。
