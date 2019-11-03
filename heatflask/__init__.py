from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_redis import FlaskRedis
from flask_pymongo import PyMongo
from flask_compress import Compress
from flask_login import LoginManager
from flask_analytics import Analytics
from flask_sslify import SSLify
from flask_sockets import Sockets
from flask_assets import Environment

import os

# Globally accessible libraries
db_sql = SQLAlchemy()
redis = FlaskRedis()
mongo = PyMongo()

compress = Compress()
login_manager = LoginManager()
sslify = SSLify()
# sslify = SSLify(app, skips=["webhook_callback"])
sockets = Sockets()
analytics = Analytics()
assets = Environment()


def create_app():

    """Initialize the core application"""
    app = Flask(__name__)

    app.config.from_object(os.environ['APP_SETTINGS'])

    # Initialize Plugins
    db_sql.init_app(app)
    redis.init_app(app)
    mongo.init_app(app, maxIdleTimeMS=30000)
    compress.init_app(app)
    login_manager.init_app(app)
    sslify.init_app(app)
    sockets.init_app(app)
    assets.init_app(app)

    # ensure the instance folder exists
    # try:
    #     os.makedirs(app.instance_path)
    # except OSError:
    #     pass

    with app.app_context():

        from js_bundles import bundles
        
        assets.register(bundles)
        #  maybe build bundles here

        import routes
        from models import (
            Users, Activities, EventLogger, Utility, Webhooks, Index, Payments
        )

        # initialize/update data-stores
        db_sql.create_all()

        mongodb = mongo.db
        collections = mongodb.collection_names()

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

        if Payments.name not in collections:
            Payments.init_db()


        return app

