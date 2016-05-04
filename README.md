# Running data
This is a Flask app that generates and displays a heatmap from my running data. This happens in two stages.
  1. [import_files](import_files) is a script that will run periodically (daily).  It downloads activities from Garmin Connect and stores them as .tcx files in the [Activities](Activities/) directory.  Then, (fmap.py)[fmap.py] extracts GIS points from the .tcx files and creates a file called allpoints.csv.

  2. [heatmapp.py](heatmapp.py) is the main Flask app.  It waits for an HTTP request for the map.  When suc a request is received, it serves an html page created on the fly by [fmap.py](fmap.py).  `fmap` can take a while and the resulting html is a large file, so this creates some performance issues, but it works for now.  Improvments are on the way.


