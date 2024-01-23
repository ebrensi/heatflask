import os
import psycopg2
from psycopg2 import sql
from datetime import datetime
from urllib.parse import urlparse

from flask import Flask
from werkzeug.debug import DebuggedApplication
from flask_sqlalchemy import SQLAlchemy
from flask_redis import FlaskRedis
from flask_pymongo import PyMongo
from flask_compress import Compress
from flask_login import LoginManager
from flask_sslify import SSLify
from flask_sockets import Sockets
from flask_assets import Environment

from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# Globally accessible libraries
db_sql = SQLAlchemy()
redis = FlaskRedis()
mongo = PyMongo()
login_manager = LoginManager()
sockets = Sockets()
assets = Environment()
limiter = Limiter(key_func=get_remote_address)

# Global variables
EPOCH = datetime.utcfromtimestamp(0)


def create_app():
    """Initialize the core application"""
    app = Flask(__name__)

    app.config.from_object(os.environ["APP_SETTINGS"])

    with app.app_context():
        # Analytics(app)
        Compress(app)
        SSLify(app, skips=["webhook_callback"])
        from .js_bundles import bundles

        assets.register(bundles)
        for bundle in bundles.values():
            bundle.build()

        db_sql.init_app(app)
        redis.init_app(app)
        mongo.init_app(app, **app.config["MONGO_OPTIONS"])
        login_manager.init_app(app)
        sockets.init_app(app)
        assets.init_app(app)
        limiter.init_app(app)

        from .models import Activities, EventLogger, Index

        import heatflask.routes

        # initialize/update data-stores
        db_sql.create_all()

        mongodb = mongo.db
        collections = mongodb.list_collection_names()

        if EventLogger.name not in collections:
            EventLogger.init_db()

        if Activities.name not in collections:
            Activities.init_db()
        else:
            Activities.update_ttl()

        if Index.name not in collections:
            Index.init_db()
        else:
            Index.update_ttl()

        if app.debug:
            app.wsgi_app = DebuggedApplication(app.wsgi_app, evalex=True)

        return app
