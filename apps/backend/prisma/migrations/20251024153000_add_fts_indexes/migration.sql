-- Add FTS GIN indexes for definitions (VocabularyItem and VocabularySense)

-- Create tsvector indexes using the 'simple' configuration for English-like tokens
CREATE INDEX IF NOT EXISTS "VocabularyItem_definition_fts_idx"
ON "VocabularyItem"
USING GIN (to_tsvector('simple', coalesce("definition", '')));

CREATE INDEX IF NOT EXISTS "VocabularySense_definition_fts_idx"
ON "VocabularySense"
USING GIN (to_tsvector('simple', coalesce("definition", '')));

