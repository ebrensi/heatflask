# Running data
This is a Flask app that generates and displays a heatmap from my running data. This happens in two stages.
  1. [import_files](import_files) is a script that will run periodically (daily).  It downloads activities from Garmin Connect and stores them as .tcx files in the [Activities](Activities/) directory.

downloaded from Garmin Connect and stored locally.  For now I have all the points stored in a file called allpoints.csv.

