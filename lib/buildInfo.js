const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function normalizeCommit(value) {
  const commit = String(value || '').trim();
  return commit ? commit.slice(0, 12) : null;
}

function readPackageVersion(baseDir) {
  try {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(baseDir, 'package.json'), 'utf8')
    );
    return typeof packageJson.version === 'string' ? packageJson.version : null;
  } catch (_err) {
    return null;
  }
}

function readGitCommit(baseDir) {
  try {
    return normalizeCommit(execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: baseDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }));
  } catch (_err) {
    return null;
  }
}

function getBuildInfo(baseDir, env = process.env) {
  return {
    version: env.SCRUM_POKER_VERSION || readPackageVersion(baseDir) || 'unknown',
    commit: normalizeCommit(env.SCRUM_POKER_COMMIT || env.GITHUB_SHA) ||
      readGitCommit(baseDir) ||
      'unknown'
  };
}

module.exports = {
  getBuildInfo,
  normalizeCommit,
  readGitCommit,
  readPackageVersion
};
