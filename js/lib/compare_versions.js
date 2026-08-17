/* @flow */
'use strict';

// True only when `installed` is numerically below `required` — used to check
// the installed app's version against mobile_stable_version, a floor that's
// bumped rarely and deliberately (breaking changes / must-update releases),
// not on every release. This is why the comparison is directional rather
// than a simple mismatch: since installed versions climb with every release
// while the required floor stays put between bumps, a mismatch check would
// nag on almost every launch instead of only once a device actually falls
// below the floor. Returns false (no banner) on anything unparseable, so a
// malformed mobile_stable_version can never false-positive.
export default function isBelowRequiredVersion(required, installed) {
  if (!required || !installed) {
    return false;
  }

  const requiredParts = String(required).trim().split('.');
  const installedParts = String(installed).trim().split('.');
  const length = Math.max(requiredParts.length, installedParts.length);

  for (let i = 0; i < length; i++) {
    const req = parseInt(requiredParts[i], 10);
    const inst = parseInt(installedParts[i], 10);

    if (isNaN(req) || isNaN(inst)) {
      return false;
    }

    if (inst < req) {
      return true;
    }
    if (inst > req) {
      return false;
    }
  }

  return false;
}
