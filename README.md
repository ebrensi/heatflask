# Activity Tracker Heatmap Demo

#### A Flask app that generates and displays a heatmap from Garmin Connect activity data.
#### http://heatflask.herokuapp.com
The responsive front-end UI is adapted from Tobias Bieniek's fantastic [sidebar-v2](https://github.com/Turbo87/sidebar-v2) project.

This happens in two stages.
  1. [gcexport-db.py]() downloads activity data, complete with GIS tracks, and populates the PostgreSQL database located at the url specified by the `DATABASE_URL` environment variable. An initial import of activites is done via
  ```
  python gcexport-db.py --clean --username USERNAME --password PASSWORD
  ```
  where USERNAME and PASSWORD are for the user's Garmin Connect account.

  Subsequent data updates can be run periodically manually or via cron job with
  ```
  python gcexport-db.py -c [num] --username USERNAME --password PASSWORD
  ```
  where [num] indicates to only attempt downloading the most recent [num] activities.

  2. [heatmapp.py]() is the main Flask app.  It waits for an HTTP request for the map.  When such a request is received, it grabs the relevant data from the database and renders an html page.


## How to get your own version of this app running on Heroku
You'll need to have Python 2.7 and Git installed on your computer, and you'll need to have a GitHub account and a Heroku account.  If you want to be able to run the app locally for development, you'll need to have [PostgreSQL](https://www.postgresql.org/download) database installed.


### Fork this repository:
  0. Create a GitHub account if you don't have one, and install Git on your computer if you don't have it.
  1. Click the Fork button on the upper right corner of this page.
  3. Use Git installed on your computer to clone your fork to your computer.

Now you should have a fork of this repo on GitHub and a clone of that on your own computer.

#### Deploy the app locally (optional)
  1. You'll need to have PostgreSQL installed on your computer with a database already created, but the app creates a table in the database if one isn't there.
  For example, if you created a database called `heatmapp` via Postgres user `user` with password `passweird`, the database URI is
  ```
  postgresql://user:passweird@localhost/heatmapp
  ```
  the environment you run the Flask app in should have an environment variable called `DATABASE_URL` set to that URI so that
  ```
  SQLALCHEMY_DATABASE_URI = os.environ["DATABASE_URL"]
  ```
  in [heatmapp.py](heatmapp.py) works.

  We set it up this way so that you can run the app locally or remotely, and the app will use whatever database is referred to by `DATABASE_URL` environment variable wherever it runs.

  2. You need a Python 2.7 development environment (using virtualenv or conda create) that has all of the dependencies for this app, specified in `requirements.txt`.  Install them via
  ```
  pip install requirements.txt
  ```

  3. Before running the app you'll need to populate the database with activity track data.
  ```
  python gcexport-db.py --clean
  ```

Now start up the app with
    ```python heatmapp.py```
it should work at http://127.0.0.1:5000 ( http://localhost:5000 ) in your web browser.




### Create an app on heroku:
  0. If you don't have a Heroku account, go to www.heroku.com and set one up (it's free).
  1. Go to your [Heroku dashboard](https://dashboard.heroku.com) and [create a new app](https://dashboard.heroku.com/new).

Let's say our app is called `my_app`. Then you should be at `https://dashboard.heroku.com/apps/my_app/deploy/heroku-git` now.

#### Set your app to deploy from your GitHub repository
  3. In the **Deployment Method** settings for your app, chose **GitHub**, and you should get the option to connect your fork of this GitHub repo.


You have the option of manually deploying the app, or having it be automatically deployed every time you push a commit up to GitHub.
Before you make your first deploy however, you need to set up the database with all of the GPS points. We use Heroku's (free) PostgreSQL.

### Set up Heroku PostgreSQL:
  0. Go over to the resources tab in your app's settings (`https://dashboard.heroku.com/apps/my_app/resources`).
  1. Add the **Heroku Postgres** add-on.  The free version is fine as along as you have fewer than 10000 activities.  The Hobby-Dev (free) version of Heroku Postgres is limited to 10000 rows (and 20 simultaneous connections), and our app uses one row for each activity.  The GIS points are stored as arrays.

  If this is your first instance of Heroku Postgres, its URI will be in your app's `DATABASE_URL` environment variable.  Otherwise, you'll need to change the line
    ```
    SQLALCHEMY_DATABASE_URI = os.environ["DATABASE_URL"]
    ```
  in [heatmapp.py](heatmapp.py).

  2. Now populate the database with activity data. You'll need to run `gcexport-db.py --clean` in your Heroku environment.  If you have the Heroku command-line interface (CLI) installed you can do this with
    ```
    heroku run gcexport-db.py --clean
    ```
  in a local terminal.


### Deploy your app!
Now head back over to the **Deploy** tab in your app's settings and deploy it.  It should be up and running at `https://my_app.herokuapp.com`.

If it went smoothly,  :smiley: **Congratulations!** :punch:

Note:
One thing that's different between deploying on the web versus locally is that when you run Flask locally for development, you use `flask run` or `python heatmapp.py` to use Flask's built in web-server.  When you deploy for real on the web, Flask's development server doesn't cut it, so we use gunicorn.  This happens behind the scenes, as Heroku automaticall installs everything in `requirements.txt` and `Procfile` specifies to use gunicorn.


Note: Heroku has a free scheduler add-on in the add-ons section of your app's settings, that you can use to regularly run `gcexport-db.py` to automatically download the latest activities.
