const git = require('simple-git');
const fs = require('fs-extra');
const _ = require('lodash');
const debug = require('debug')('git');
const semver = require('semver');
const helpers = require('../utils/helpers');

const { tasmotaRepo, githubRepo, minVersion, maxVersion, edgeBranch } = require('../config/config');

const isGitRepoAvailable = async () => {
  try {
    await fs.stat(tasmotaRepo);
  } catch (e) {
    return false; // directory does not exists
  }

  const isRepo = await git(tasmotaRepo).checkIsRepo();
  if (!isRepo) {
    // directory is not git repo, lets try to delete it
    debug(`${tasmotaRepo} is not git repo. Trying to delete it...`);
    try {
      await fs.remove(tasmotaRepo);
      debug('Directory deleted');
    } catch (e) {
      const message = `Cannot remove directory: ${tasmotaRepo}`;
      debug(message);
      throw new Error(message);
    }
  }

  return isRepo;
};

const getRepoTags = async () => {
  const isRepo = await isGitRepoAvailable();
  const message = 'Unable to get TAGS';
  const tcVersion = helpers.getTcVersion().toLowerCase();

  if (isRepo) {
    try {
      if (tcVersion.includes('dev')) {
        return [edgeBranch];
      }
      const allTags = await git(tasmotaRepo).tags();
      let tags = allTags.all.filter((t) => t.startsWith('v'));
      tags = tags.filter((t) => semver.valid(t) && semver.gte(t, minVersion) && semver.lte(t, maxVersion));
      return [...tags];
    } catch (e) {
      debug(e.message);
      debug(message);
      throw new Error(message);
    }
  }

  debug(message);
  throw new Error(message);
};

const switchToBranch = async (branch) => {
  try {
    await git(tasmotaRepo).reset('hard');
  } catch (e) {
    throw new Error(`Unable to RESET repository: ${e.message}`);
  }

  try {
    await git(tasmotaRepo).clean('dfx');
  } catch (e) {
    throw new Error(`Unable to CLEAN repository: ${e.message}`);
  }

  // The development branch is a remote branch, while version releases are tags.
  if (branch === edgeBranch) {
    try {
      await git(tasmotaRepo).fetch('origin', branch);
      const summary = await git(tasmotaRepo).branchLocal();
      const localBranches = Object.keys(summary.branches);

      if (localBranches.includes(branch)) {
        await git(tasmotaRepo).checkout(branch);
      } else {
        await git(tasmotaRepo).checkoutBranch(branch, `origin/${branch}`);
      }
      return branch;
    } catch (e) {
      throw new Error(`Switching to remote branch ${branch} failed: ${e.message}`);
    }
  }

  try {
    await git(tasmotaRepo).checkout(branch);
    return branch;
  } catch (e) {
    throw new Error(`Switching to version/tag ${branch} failed: ${e.message}`);
  }
};

const cloneRepo = async () => {
  const isRepo = await isGitRepoAvailable();
  if (!isRepo) {
    try {
      await git().clone(githubRepo, tasmotaRepo);
      debug('Repo cloned.');
    } catch (e) {
      const message = 'Unable to CLONE git repository';
      debug(message);
      throw new Error(message);
    }
  }

  const tags = await getRepoTags();
  return tags;
};

const pullRepo = async (refresh) => {
  const isRepo = await isGitRepoAvailable();
  if (isRepo) {
    await switchToBranch(edgeBranch);

    try {
      await git(tasmotaRepo).pull();
      debug('Branch %s is now up to date.', edgeBranch);
    } catch (e) {
      const message = 'Unable to PULL latest changes';
      debug(message);
      throw new Error(message);
    }

    const tags = await getRepoTags();
    return tags;
  }

  debug('There is no repository available. Trying to clone.');
  const tags = await cloneRepo();
  return tags;
};

module.exports = {
  isGitRepoAvailable,
  getRepoTags,
  switchToBranch,
  cloneRepo,
  pullRepo,
};
