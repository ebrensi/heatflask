# Activities Visualization App

#### A Flask app that generates and displays visualizations from Strava activity data.
#### http://heatflask.herokuapp.com

See a live demo with data at http://heatflask.herokuapp.com/demo.

Currently it supports [Strava](https://www.strava.com) imports.  Strava allows syncing from other activity hosting services.

The staging branch of this repo is for testing new features and is hosted at http://heatflask-staging.herokuapp.com.

### [leaflet.js](http://leafletjs.com) stuff
I started this app as a project to make a heatmap from my activity data, but it seems to have evolved into a leaflet front-end for Strava activity data.  There are lots of great plugins and I use a few here.  I'd love to see this app develop into a general leaflet interface with Strava.   Ideally we would not have to even store a local copy of user data in the app's PostgreSQL database, but accessing Strava data from a remote app is just too slow.

The currently running version of this app uses Leaflet 1.0 with the following plugins:
  * [sidebar-v2](https://github.com/turbo87/sidebar-v2)
  * [Leaflet.AntPath](https://github.com/rubenspgcavalcante/leaflet-ant-path) for Flow-map
    * The high-resolution flow map uses a different ant path for every set of consecutive GIS points on an activity track with the same delay between points.
  * [Leaflet.Heat](https://github.com/Leaflet/Leaflet.heat)
  * [leaflet-providers](https://github.com/leaflet-extras/leaflet-providers)
  * [Leaflet.Spin](https://github.com/makinacorpus/Leaflet.Spin)


##Contributing
See [CONTRIBUTING](CONTRIBUTING.md) instructions.
If you see something you'd like to improve, go ahead and create an issue and/or make a pull request. Contributions welcome!

## Documentation
App usage instructions can be found [here](docs/docs.md).


## License

This project is licensed under GNU General Public License v3.0 [(GNU GPLv3)](http://choosealicense.com/licenses/gpl-3.0).

Any user is free to suggest modifications, fork this repo, and/or make pull requests.  You are not free to use my code in a project that will make money.  If you feel you can improve on my ideas in your own project, do me a favor and reference my work and compensate me in some way that you think is fair.  Thanks!

Copyright (c) 2016 [Efrem Rensi](mailto:rensi.efrem@gmail.com)
