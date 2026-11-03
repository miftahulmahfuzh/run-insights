# Onboarding a new runner

## Sub-features

- A signed-in user with no `profiles` row is sent from `/` (and every protected screen) to
  `/onboarding`.
- The profile form: Age, Height (cm), Weight (kg), Resting heart rate, Measured max heart rate;
  **Save and start** or **Skip for now**. These feed max-HR percentages and HR zones.
- The same form, as **Save**, lives on `/me`.

## How to get to it (user POV)

First sign-in with Google -> the onboarding screen -> fill in -> **Save and start** -> the empty
runs list.

## Driving it with verify.sh

```sh
$V up --seed=new --offline        # a bare user, ri-verify-runner, no profile
$V ui RUN .claude/skills/verify-run-insights/features/steps/onboarding.mjs
# 2026-11-03: "/ landed on /onboarding", "after save: /", "No runs yet ... Upload a run"
$V sql RUN "select user_id, birth_year, height_cm, weight_kg, resting_hr, max_hr, onboarded_at is not null from profiles"
# ri-verify-runner | 1996 | 173 | 64.5 | 52 | 196 | t
```

Cost: 0. Offline is enough.

## Gotchas

- Age 30 is stored as `birth_year` 1996 (the current year minus the age); a year rollover moves it.
- Sign-in itself (Google OAuth) is never driven: the session is minted. A change to `auth.ts`,
  `auth.config.ts` or the sign-in screen needs its unit tests plus a human with a Google account.
