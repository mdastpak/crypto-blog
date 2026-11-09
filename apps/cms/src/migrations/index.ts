import * as migration_20261109_112310_initial from './20261109_112310_initial';
import * as migration_20261109_113511_preview_and_viewer from './20261109_113511_preview_and_viewer';

export const migrations = [
  {
    up: migration_20261109_112310_initial.up,
    down: migration_20261109_112310_initial.down,
    name: '20261109_112310_initial',
  },
  {
    up: migration_20261109_113511_preview_and_viewer.up,
    down: migration_20261109_113511_preview_and_viewer.down,
    name: '20261109_113511_preview_and_viewer'
  },
];
