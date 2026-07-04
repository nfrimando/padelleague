-- Formalize whether an event is "rated" (playing it affects player ratings) or
-- "unrated". Previously this was only conveyable via the free-text description.
-- `is_rated` defaults to true so existing events remain rated.
-- `rating_details` is optional free text describing the rating implications.
ALTER TABLE public.events
  ADD COLUMN is_rated boolean NOT NULL DEFAULT true,
  ADD COLUMN rating_details text;
