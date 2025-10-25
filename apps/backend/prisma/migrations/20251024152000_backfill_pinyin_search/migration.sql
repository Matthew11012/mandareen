-- Backfill pinyin_search from existing pinyin (numeric tones or marked)
-- Note: This strips tone digits and normalizes ü/u: to v. Diacritics remain if present.
-- For full diacritic stripping use an application script if needed.

UPDATE "VocabularyItem"
SET "pinyin_search" =
  lower(
    replace(
      replace(
        regexp_replace(coalesce("pinyin", ''), '[1-5]', '', 'g'),
        'ü',
        'v'
      ),
      'u:',
      'v'
    )
  );

