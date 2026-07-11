/** Level registry: levelId → builder. reset(seed, levelId) resolves here so
 * every level is reproducible from (seed, levelId) alone. */

import type { LevelBuilder } from './types';
import { flatDev } from './flat-dev';
import { testObstacle } from './test-obstacle';

export const LEVELS: Readonly<Record<string, LevelBuilder>> = {
  'flat-dev': flatDev,
  'test-obstacle': testObstacle,
};

export const DEFAULT_LEVEL_ID = 'flat-dev';

export function getLevelBuilder(levelId: string): LevelBuilder {
  const builder = LEVELS[levelId];
  if (!builder) {
    throw new Error(
      `unknown levelId "${levelId}" (known: ${Object.keys(LEVELS).join(', ')})`,
    );
  }
  return builder;
}

export type { LevelBuilder, LevelHandle, Rng, RapierModule } from './types';
