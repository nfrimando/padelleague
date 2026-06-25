-- Structured (comparison-based) recalibration: instead of typing a rating, each
-- respondent answers an adaptive series of head-to-head comparisons against other
-- players ("is the calibratee significantly/slightly better/worse than X?"). The
-- server derives a rating from those answers and stores the full question/answer
-- trail here as an audit record. The derived value still lands in
-- recalibration_respondents.rating, so the admin resolution flow is unchanged.
--
-- Shape (see src/lib/recalibration/survey.ts):
--   {
--     "version": 1,
--     "status": "in_progress" | "complete",
--     "startedAt": "...Z", "completedAt": null | "...Z",
--     "questions": [{ order, anchorPlayerId, anchorPlayerName, anchorPlayerNickname,
--                     anchorRating, choice, impliedRating, askedAt, answeredAt }],
--     "derivedRating": number | null,
--     "confidence": number | null
--   }
-- anchorRating / impliedRating / derivedRating are admin-only audit fields and are
-- never serialized back to the responding player.

ALTER TABLE public.recalibration_respondents
  ADD COLUMN survey_answers JSONB;  -- nullable; null = legacy/manual respondent
