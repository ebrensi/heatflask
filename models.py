from heatmapp import db
from flask_login import UserMixin
from sqlalchemy.dialects.postgresql import ARRAY, TIMESTAMP, JSON, REAL


class User(UserMixin, db.Model):
    __tablename__ = 'users'
    name = db.Column(db.String(), primary_key=True)
    strava_user_data = db.Column(JSON)

    # This is set up so that if a user gets deleted, all of the associated
    #  activities are also deleted.
    activities = db.relationship("Activity",
                                 backref="user",
                                 cascade="all, delete, delete-orphan",
                                 lazy="dynamic")

    def __repr__(self):
        return "<User %r>" % (self.name)

    def get_id(self):
        return self.name

    @classmethod
    def get(cls, name):
        user = cls.query.get(name)
        return user if user else None


class Activity(db.Model):
    id = db.Column(db.Integer(), primary_key=True, autoincrement=False)
    name = db.Column(db.String())
    type = db.Column(db.String())
    summary_polyline = db.Column(db.String())
    beginTimestamp = db.Column(TIMESTAMP)
    distance = db.Column(db.Float())
    elapsed_time = db.column(db.Integer)

    # streams
    time = db.Column(ARRAY(db.Integer))
    polyline = db.Column(db.String())
    distance = db.Column(ARRAY(db.Float()))
    altitude = db.Column(ARRAY(db.Float()))
    velocity_smooth = db.Column(ARRAY(REAL))
    cadence = db.Column(ARRAY(db.Integer))
    watts = db.Column(ARRAY(REAL))
    grade_smooth = db.Column(ARRAY(REAL))

    user_name = db.Column(db.String(), db.ForeignKey("users.name"))

    def __repr__(self):
        return "<Activity %s_%r>" % (self.user_name, self.id)


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
