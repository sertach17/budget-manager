-- Which of your bank's (Plaid's) categories go into each of your categories.
--
-- Each entry is a Plaid category name: a detailed one like
-- FOOD_AND_DRINK_GROCERIES, or a top-level one like MEDICAL. A transaction
-- you haven't sorted by hand goes to the category whose list has its
-- detailed name, else its top-level name.
alter table public.categories
  add column plaid_categories text[] not null default '{}'
    check (
      cardinality(plaid_categories) <= 60
      and array_to_string(plaid_categories, ',') ~ '^([A-Z_]{2,80}(,[A-Z_]{2,80})*)?$'
    );
