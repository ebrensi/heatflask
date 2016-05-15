# Running data
This is a Flask app that generates and displays a heatmap from my running data. This happens in two stages.
  1. [gcexport-db.py]() downloads activity data, complete with GIS tracks, and populates the ppostgresQL database located at the url specified by the `DATABASE_URL` environment variable. An initial import of activites is done via
      python gcexport-db.py --clean --username USERNAME --password PASSWORD
  where USERNAME and PASSWORD are for the user's Garmin Connect account.

  Subsequent data updates can be run periodically manually or via cron job with
        python gcexport-db.py -c 10 --username USERNAME --password PASSWORD
  where 10 indicates to only attempt downloading the most recent 10 activities, and can be lower.

  2. [heatmapp.py]() is the main Flask app.  It waits for an HTTP request for the map.  When such a request is received, it grabs the relevant data from the database and renders an html page.  A heatmap with a lot of points can take a long time and the resulting html is a large file that must be downloaded into the browswr, so there are some performance issues to be dealt with for large datasets.

