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
from js_bundles import bundles

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
assets.register(bundles)

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

    return app