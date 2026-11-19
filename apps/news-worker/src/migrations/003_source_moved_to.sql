-- Where a source's feed last said it moved for good (301 or 308), so an
-- operator can update the sources file. Cleared when the feed URL changes.
ALTER TABLE news_sources ADD COLUMN moved_to text;
