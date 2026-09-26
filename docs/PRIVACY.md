# Privacy in Heatflask

Heatflask draws your Strava activities on a map. To do that it holds a copy of
some of your Strava data. This page says what it holds, who can see it, and how
to get rid of it.

## Shared Maps: the one switch

**Shared Maps** is in the **User** tab of the sidebar, on your map page. It is
**off** for every new account, and off for every account that existed before
the switch meant this.

**Off — only you can see your activities on Heatflask.** Someone else opening
your map page, whether or not they have a Heatflask account, sees nothing:
no activities, no name, no photo. The page shows only the athlete number that
is already in the link they followed.

**On — anyone with a link to your map can see the activities you made public on
Strava.** Nothing else. In particular:

- Activities you set to **Only You** on Strava are never shown to anyone but
  you, on any setting.
- Activities you set to **Followers** are treated the same way, because
  Heatflask does not know who follows you and cannot honour that setting.
- Activities Strava marks **private** are never shown to anyone but you.

The switch takes effect immediately. Turning it off does not delete anything;
it stops other people from seeing it.

**What Shared Maps does not do:** it does not list you anywhere. Heatflask has
no public directory of athletes. The only way to reach your map is a link to
it, from you.

## What your own map shows you

Logged in, on your own map, you see everything Heatflask has imported for you,
including your private and followers-only activities. That is the same data
Strava shows you, and nobody else can ask Heatflask for it.

## What Heatflask stores, and for how long

| What | Where it comes from | How long |
| --- | --- | --- |
| Your Strava athlete ID, name, city/region/country, profile photo URL | Your Strava profile at login | Until you delete your account |
| Your Strava access and refresh tokens | Strava, when you log in | Until you delete your account or revoke access on Strava |
| Activity summaries (id, name, type, time, distance, map outline, privacy flags) | Strava | 60 days after you last open your own map while logged in, then re-imported when you come back |
| Activity streams (the GPS track and the timing behind the animation) | Strava | 20 days after the last time they are drawn |
| A request log: time, path, method, and the athlete ID if you are logged in. No IP addresses. | Heatflask itself | 30 days |

Heatflask does not sell anything, does not run ads and does not share your data
with anyone else. There is no analytics or tracking script on the page.

## Your browser

If you are looking at your own map, Heatflask keeps a copy of your activity
streams in your own browser so the map loads quickly next time. It never does
this for anyone else's map. Clearing your browser's site data for
heatflask.com removes it.

## Deleting your data

**Delete Account**, in the same User tab, does two things: it removes your
Heatflask record, tokens and activity index, and it revokes Heatflask's access
to your Strava account. You can also revoke access from Strava's side, under
[Settings → My Apps](https://www.strava.com/settings/apps). Cached streams are
not deleted by hand; they are keyed by activity rather than by athlete, and
expire on their own within 10 days.

If you have not used Heatflask for a year, its access to your Strava account is
revoked automatically, and your record is dropped once Strava confirms it.

## Strava's rules

Heatflask uses the Strava API under the
[Strava API Agreement](https://www.strava.com/legal/api), which says an
application may show an athlete's data to that athlete. Shared Maps exists so
that showing your map to anyone else happens only when you have asked for it.

## Something wrong?

Heatflask is open source: <https://github.com/ebrensi/heatflask>. If something
here does not match what you see, please
[open an issue](https://github.com/ebrensi/heatflask/issues).
