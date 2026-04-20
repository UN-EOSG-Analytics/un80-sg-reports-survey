-- Fix stale CHECK constraint on survey_responses.frequency
-- The value 'multiple' was replaced by 'multiple-per-year' in the app and DDL source,
-- but the live constraint was never migrated.

ALTER TABLE sg_reports_survey.survey_responses
  DROP CONSTRAINT survey_responses_frequency_check;

ALTER TABLE sg_reports_survey.survey_responses
  ADD CONSTRAINT survey_responses_frequency_check CHECK (
    frequency IS NULL OR frequency IN (
      'multiple-per-year', 'annual', 'biennial', 'triennial', 'quadrennial', 'one-time'
    )
  );
