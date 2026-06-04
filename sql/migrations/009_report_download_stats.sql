-- Per-day, per-language download counts for SG reports.
-- Source: https://digitallibrary.un.org/tindstats/bibdoc_downloads_dl?recid=<recid>&download=csv
-- Fetched by python/07_fetch_download_stats.py.
--
-- The granular table keeps every data point so different aggregates can be
-- recomputed later. The summary view is what the API actually reads.

CREATE TABLE IF NOT EXISTS sg_reports_survey.report_download_stats (
  symbol     TEXT      NOT NULL,
  recid      INTEGER   NOT NULL,
  date       DATE      NOT NULL,
  lang       TEXT      NOT NULL,
  downloads  INTEGER   NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- symbol is part of the PK because some DL records cover multiple symbols
  -- (compound documents, e.g. recid 4005377 → both A/77/772 and S/2023/151);
  -- we duplicate the row per sg_reports symbol so per-symbol queries are
  -- trivial joins on `symbol`.
  PRIMARY KEY (symbol, recid, date, lang)
);

CREATE INDEX IF NOT EXISTS idx_rds_symbol
  ON sg_reports_survey.report_download_stats (symbol);

CREATE INDEX IF NOT EXISTS idx_rds_date
  ON sg_reports_survey.report_download_stats (date);

COMMENT ON TABLE sg_reports_survey.report_download_stats IS
  'Raw daily per-language download counts from DL tindstats, one row per (recid, date, lang).';

--------------------------------------------------------------------------------
-- report_download_summary view
-- Per-symbol totals + per-language breakdown. Cheap to recompute and easy to
-- replace with a different shape later.
--------------------------------------------------------------------------------
CREATE OR REPLACE VIEW sg_reports_survey.report_download_summary AS
WITH per_lang AS (
  SELECT symbol,
         MAX(recid)            AS recid,
         lang,
         SUM(downloads)::int   AS lang_total,
         MIN(date)             AS first_seen,
         MAX(date)             AS last_seen,
         MAX(fetched_at)       AS fetched_at
  FROM sg_reports_survey.report_download_stats
  GROUP BY symbol, lang
)
SELECT
  symbol,
  MAX(recid)                                                                    AS recid,
  SUM(lang_total)::int                                                          AS total_downloads,
  jsonb_object_agg(lang, lang_total) FILTER (WHERE lang_total > 0)              AS downloads_by_lang,
  MIN(first_seen)                                                               AS first_seen,
  MAX(last_seen)                                                                AS last_seen,
  MAX(fetched_at)                                                               AS fetched_at
FROM per_lang
GROUP BY symbol;

COMMENT ON VIEW sg_reports_survey.report_download_summary IS
  'Per-symbol download totals + per-language breakdown derived from report_download_stats.';

--------------------------------------------------------------------------------
-- Grants for the public read-only role
--------------------------------------------------------------------------------
GRANT SELECT ON sg_reports_survey.report_download_stats   TO sg_reports_public_reader;
GRANT SELECT ON sg_reports_survey.report_download_summary TO sg_reports_public_reader;
