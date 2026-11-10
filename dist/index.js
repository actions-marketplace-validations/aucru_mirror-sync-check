require('./sourcemap-register.js');/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ 785:
/***/ (function(__unused_webpack_module, exports, __nccwpck_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
const core = __importStar(__nccwpck_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module '@actions/core'"); e.code = 'MODULE_NOT_FOUND'; throw e; }())));
const verify_1 = __nccwpck_require__(493);
async function run() {
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
        await (0, verify_1.verifyMirror)(config);
        core.info('Gitea was the newest one');
    }
    catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message);
        }
        else {
            core.setFailed(String(error));
        }
    }
}
run();


/***/ }),

/***/ 493:
/***/ (function(__unused_webpack_module, exports, __nccwpck_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.verifyMirror = verifyMirror;
const core = __importStar(__nccwpck_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module '@actions/core'"); e.code = 'MODULE_NOT_FOUND'; throw e; }())));
const http = __importStar(__nccwpck_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module '@actions/http-client'"); e.code = 'MODULE_NOT_FOUND'; throw e; }())));
const GITHUB_API = 'https://api.github.com';
async function getUpstreamSha(config, client) {
    const url = `${GITHUB_API}/repos/${config.upstreamOwner}/${config.upstreamRepo}/branches/${config.branch}`;
    const headers = {
        Accept: 'application/vnd.github+json',
    };
    if (config.upstreamToken) {
        headers['Authorization'] = `Bearer ${config.upstreamToken}`;
    }
    const res = await client.getJson(url, headers);
    if (!res.result?.commit?.sha) {
        throw new Error(`Failed to get upstream SHA: HTTP ${res.statusCode}`);
    }
    return res.result.commit.sha;
}
async function getGiteaSha(config, client) {
    const base = config.giteaUrl.replace(/\/$/, '');
    const url = `${base}/api/v1/repos/${config.giteaOwner}/${config.giteaRepo}/branches/${config.branch}`;
    const res = await client.getJson(url, {
        Authorization: `token ${config.giteaToken}`
    });
    if (res.statusCode === 404)
        return null;
    if (!res.result?.commit?.id)
        return null;
    return res.result.commit?.id;
}
async function triggerSync(config, client) {
    const base = config.giteaUrl.replace(/\/$/, '');
    const url = `${base}/api/v1/repos/${config.giteaOwner}/${config.giteaRepo}/mirror-sync`;
    core.info('Triggering Sync...');
    await client.postJson(url, {}, {
        Authorization: `token ${config.giteaToken}`
    });
}
async function verifyMirror(config) {
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
        if (i < config.maxRetries) {
            await new Promise((r) => setTimeout(r, config.retryInterval * 1000));
            await triggerSync(config, client);
        }
    }
    throw new Error(`Out of time, upstream Sha: ${upstreamSha}`);
}


/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId].call(module.exports, module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/asset-relocator-loader */
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __nccwpck_require__(785);
/******/ 	module.exports = __webpack_exports__;
/******/ 	
/******/ })()
;
//# sourceMappingURL=index.js.map