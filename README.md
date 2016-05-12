# Running data
This is a Flask app that generates and displays a heatmap from my running data. This happens in two stages.
  1. [gcexport-db.py]() is a script that will run periodically (daily).  It downloads activities from Garmin Connect and updates the database with the new GIS points and workout data.

  2. [heatmapp.py]() is the main Flask app.  It waits for an HTTP request for the map.  When such a request is received, it grabs the relevant data from the database and renders an html page.  A heatmap with a lot of points can take a long time and the resulting html is a large file that must be downloaded into the browswr, so there are some performance issues to be dealt with for large datasets.

