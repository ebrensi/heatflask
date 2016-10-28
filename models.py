from flask_login import UserMixin
from sqlalchemy.dialects import postgresql as pg
from flask_sqlalchemy import SQLAlchemy
from heatmapp import app

db = SQLAlchemy(app)


class User(UserMixin, db.Model):
    __tablename__ = 'users'
    strava_id = db.Column(db.Integer, primary_key=True, autoincrement=False)

    # These fields get refreshed every time the user logs in.
    #  They are only stored in the database to enable persistent login
    username = db.Column(db.String())
    firstname = db.Column(db.String())
    lastname = db.Column(db.String())
    profile = db.Column(db.String())
    strava_access_token = db.Column(db.String())

    dt_last_active = db.Column(pg.TIMESTAMP)
    app_activity_count = db.Column(db.Integer, default=0)

    # This is set up so that if a user gets deleted, all of the associated
    #  activities are also deleted.
    activities = db.relationship("Activity",
                                 backref="user",
                                 cascade="all, delete, delete-orphan",
                                 lazy="dynamic")

    def __repr__(self):
        return "<User %r>" % (self.strava_id)

    def get_id(self):
        return unicode(self.strava_id)

    @classmethod
    def get(cls, user_identifier):
        # Get user by id or username
        try:
            # try casting identifier to int
            user_id = int(user_identifier)
        except ValueError:
            # if that doesn't work then assume it's a string username
            user = cls.query.filter_by(username=user_identifier).first()
        else:
            user = cls.query.get(user_id)

        return user if user else None


class Activity(db.Model):
    id = db.Column(db.Integer, primary_key=True, autoincrement=False)
    athlete_id = db.Column(db.Integer)
    name = db.Column(db.String())
    type = db.Column(db.String())
    summary_polyline = db.Column(db.String())
    beginTimestamp = db.Column(pg.TIMESTAMP)
    total_distance = db.Column(db.Float())
    elapsed_time = db.Column(db.Integer)

    # streams
    time = db.Column(pg.ARRAY(db.Integer))
    polyline = db.Column(db.String())
    distance = db.Column(pg.ARRAY(db.Float()))
    altitude = db.Column(pg.ARRAY(db.Float()))
    velocity_smooth = db.Column(pg.ARRAY(pg.REAL))
    cadence = db.Column(pg.ARRAY(db.Integer))
    watts = db.Column(pg.ARRAY(pg.REAL))
    grade_smooth = db.Column(pg.ARRAY(pg.REAL))

    dt_cached = db.Column(pg.TIMESTAMP)
    dt_last_accessed = db.Column(pg.TIMESTAMP)
    access_count = db.Column(db.Integer, default=0)

    user_id = db.Column(db.Integer, db.ForeignKey("users.strava_id"))

    def __repr__(self):
        return "<Activity %r>" % (self.id)

    @classmethod
    def get(cls, activity_id):
        try:
            id = int(activity_id)
        except ValueError:
            return None
        else:
            return cls.query.get(id)

# Create tables if they don't exist
#  These commands aren't necessary if we use flask-migrate

# db.create_all()
# db.session.commit()

# If flask-migrate is being used, we build the tables from scratch using
# flask db init

# Then run
# flask db migrate
#    note: Flask-Migrate apparently has an issue with PostgreSQL ARRAY type.
#     https://github.com/miguelgrinberg/Flask-Migrate/issues/72
#       so after migrate we must go into the created migration file in
#       migrations/versions and explicitly change
#       postgresql.ARRAY(some_type) to postgresql.ARRAY(postgresql.some_type)
#       or postgresql.ARRAY(sa.some_type)
#
# Then, run
# flask db upgrade
#
#  to actually perform th upgrade.  This last step must be done both locally
#  and on the server.
