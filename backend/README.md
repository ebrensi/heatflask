# Heatflask backend
This is the server-side code for [Heatflask](https://www.heatflask.com ).  It is written in Python using the [Flask](https://flask.palletsprojects.com/en/1.1.x) framework.  I called the app Heatflask because it originally made heatmaps from [Strava](https://www.strava.com) data using Flask as the backend.  Flask is getting a little dated and I am open to moving to a different platform, or even a different language.  For now the Flask backend is pretty stable and runs itself without much intervention.

## Contributing
If you want to try your hand at Heatflask development, fork this repo and clone it to your machine.  These instuctions assume you are using Linux.  I have not tried development on another OS. New to Linux? I recommend [Pop_OS!](https://system76.com/pop). The backend currently runs on Python 3.8. You will need installed on your machine:
  * A Python 3.8.2 environment
  * [Redis](https://redis.io) Fast in-memory datastore (backend cache)
  * [MongoDB](https://www.mongodb.com) NoSQL database (Activities database)
  * [Postgres](https://www.postgresql.org) SQL database (User database).  There should be a `heatflask` database with user `heatflask` with password "heatflask".
  
I'm assuming you know how to get that set up. To install the backend dependencies on your machine, navigate to the `backend` directory.  Make sure your Python 3.8 environment is activated.  Then install all the backend dependencies with
```
pip install -r requirements-dev.txt
pip install -r requirements.txt
```
Then, you should be able to run the backend server on your machine by running [`dev-run`](https://github.com/ebrensi/heatflask/blob/ebrensi-patch-1/dev-run)

It will serve at [`http://127.0.0.1:5000`](http://127.0.0.1:5000), but there will only be frontend code to serve if you have set up the [frontend](https://github.com/ebrensi/heatflask/tree/bundle/frontend) set up properly.


