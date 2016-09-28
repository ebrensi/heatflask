from heatmapp import db
from flask_login import UserMixin
from sqlalchemy.dialects.postgresql import ARRAY, TIMESTAMP, JSON
from sqlalchemy import INTEGER


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
    id = db.Column(INTEGER, primary_key=True)
    beginTimestamp = db.Column(TIMESTAMP)
    other = db.Column(JSON)
    elapsed = db.Column(ARRAY(INTEGER))
    polyline = db.Column(db.String())
    source = db.Column(db.String())
    type = db.Column(db.String())

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
