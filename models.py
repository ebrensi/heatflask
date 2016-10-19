from flask_login import UserMixin
from sqlalchemy.dialects.postgresql import ARRAY, TIMESTAMP, JSON, REAL
from heatmapp import db


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

    dt_last_active = db.Column(TIMESTAMP)
    app_activity_count = db.Column(db.Integer)

    # This is set up so that if a user gets deleted, all of the associated
    #  activities are also deleted.
    activities = db.relationship("Activity",
                                 backref="user",
                                 cascade="all, delete, delete-orphan",
                                 lazy="dynamic")

    def __repr__(self):
        return "<User %r (%s)>" % (self.strava_id, self.username)

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
    beginTimestamp = db.Column(TIMESTAMP)
    total_distance = db.Column(db.Float())
    elapsed_time = db.Column(db.Integer)

    # streams
    time = db.Column(ARRAY(db.Integer))
    polyline = db.Column(db.String())
    distance = db.Column(ARRAY(db.Float()))
    altitude = db.Column(ARRAY(db.Float()))
    velocity_smooth = db.Column(ARRAY(REAL))
    cadence = db.Column(ARRAY(db.Integer))
    watts = db.Column(ARRAY(REAL))
    grade_smooth = db.Column(ARRAY(REAL))

    dt_cached = db.Column(TIMESTAMP)
    dt_last_accessed = db.Column(TIMESTAMP)
    access_count = db.Column(db.Integer)

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
# flask db upgrade

# and re-run the latter two every time we update the schema
