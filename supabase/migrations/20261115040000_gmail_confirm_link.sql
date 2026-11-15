-- Newer Gmail forwarding confirmation emails can carry only a confirm link,
-- with no code to type. Keep that link (Google's own hosts only) so the
-- Banks page can show it for a day. Codes still go in gmail_confirmation.
alter table public.venmo_feeds
  add column gmail_confirmation_url text
    check (
      char_length(gmail_confirmation_url) <= 2000
      and gmail_confirmation_url ~ '^https://(mail-settings|mail)\.google\.com/[^[:space:]"<>]+$'
    );
