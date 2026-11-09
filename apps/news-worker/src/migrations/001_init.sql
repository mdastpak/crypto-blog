-- Sources, synced from the sources file. A row is also the fetch job of its
-- source: workers lease due rows with FOR UPDATE SKIP LOCKED.
CREATE TABLE news_sources (
  id text PRIMARY KEY,
  name text NOT NULL,
  kind text NOT NULL,
  url text NOT NULL,
  homepage text,
  language text NOT NULL,
  region text NOT NULL CHECK (region IN ('ir', 'global')),
  license text NOT NULL CHECK (license IN ('headline', 'full')),
  interval_seconds integer NOT NULL CHECK (interval_seconds >= 60),
  enabled boolean NOT NULL DEFAULT true,
  etag text,
  last_modified text,
  next_fetch_at timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_until timestamptz,
  consecutive_failures integer NOT NULL DEFAULT 0,
  last_status text,
  last_error text,
  last_fetched_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX news_sources_due ON news_sources (next_fetch_at) WHERE enabled;

-- One story, reported by one or more sources.
CREATE TABLE news_clusters (
  id bigserial PRIMARY KEY,
  language text NOT NULL,
  title text NOT NULL,
  title_tokens text[] NOT NULL,
  coins text[] NOT NULL DEFAULT '{}',
  item_count integer NOT NULL DEFAULT 0,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX news_clusters_recent ON news_clusters (language, last_seen_at DESC);

CREATE TABLE news_items (
  id bigserial PRIMARY KEY,
  source_id text NOT NULL REFERENCES news_sources (id),
  cluster_id bigint NOT NULL REFERENCES news_clusters (id),
  canonical_url text NOT NULL UNIQUE,
  url text NOT NULL,
  title text NOT NULL,
  summary text,
  -- Only for sources whose license allows storing the text.
  content text,
  image_url text,
  author text,
  language text NOT NULL,
  region text NOT NULL,
  published_at timestamptz NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  content_hash text NOT NULL UNIQUE,
  coins text[] NOT NULL DEFAULT '{}'
);
CREATE INDEX news_items_cluster ON news_items (cluster_id);
CREATE INDEX news_items_published ON news_items (published_at DESC);
CREATE INDEX news_items_coins ON news_items USING gin (coins);
