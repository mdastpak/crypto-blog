import * as migration_20261109_112310_initial from './20261109_112310_initial';
import * as migration_20261109_113511_preview_and_viewer from './20261109_113511_preview_and_viewer';
import * as migration_20261109_121229_news_drafts from './20261109_121229_news_drafts';
import * as migration_20261110_142944_disable_staff_api_keys from './20261110_142944_disable_staff_api_keys';

export const migrations = [
  {
    up: migration_20261109_112310_initial.up,
    down: migration_20261109_112310_initial.down,
    name: '20261109_112310_initial',
  },
  {
    up: migration_20261109_113511_preview_and_viewer.up,
    down: migration_20261109_113511_preview_and_viewer.down,
    name: '20261109_113511_preview_and_viewer',
  },
  {
    up: migration_20261109_121229_news_drafts.up,
    down: migration_20261109_121229_news_drafts.down,
    name: '20261109_121229_news_drafts',
  },
  {
    up: migration_20261110_142944_disable_staff_api_keys.up,
    down: migration_20261110_142944_disable_staff_api_keys.down,
    name: '20261110_142944_disable_staff_api_keys'
  },
];
