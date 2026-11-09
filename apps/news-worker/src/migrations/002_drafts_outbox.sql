-- One draft job per story and language: written by the writer and pushed to
-- the CMS. Leased like sources, so any number of workers share the jobs.
CREATE TABLE news_drafts (
  cluster_id bigint NOT NULL REFERENCES news_clusters (id) ON DELETE CASCADE,
  language text NOT NULL,
  -- The story's id in the CMS (articles.externalId), unique there too, so a
  -- push retried after a crash finds the document instead of making another.
  external_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'pushed', 'skipped', 'failed')),
  cms_id text,
  published boolean NOT NULL DEFAULT false,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cluster_id, language)
);
CREATE INDEX news_drafts_due ON news_drafts (next_attempt_at) WHERE status = 'pending';

-- The channels posts go to, with the time each was first configured: news
-- published before that is never posted, so turning a channel on does not
-- flood it with the past day.
CREATE TABLE news_channels (
  id text PRIMARY KEY,
  since timestamptz NOT NULL DEFAULT now()
);

-- The outbox: one post per channel, article, and locale. The unique key
-- makes queuing idempotent; a failed post is retried without publishing
-- anything again.
CREATE TABLE news_outbox (
  id bigserial PRIMARY KEY,
  channel text NOT NULL REFERENCES news_channels (id),
  article_id text NOT NULL,
  locale text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_until timestamptz,
  last_error text,
  remote_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (channel, article_id, locale)
);
CREATE INDEX news_outbox_due ON news_outbox (next_attempt_at) WHERE status = 'pending';

-- Periodic jobs that one node runs per period, whichever claims it first.
CREATE TABLE news_schedules (
  name text PRIMARY KEY,
  next_run_at timestamptz NOT NULL DEFAULT now()
);
