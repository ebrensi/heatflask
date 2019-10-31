from flask import Flask
import os


def create_app():
    # create and configure the app
    app = Flask(__name__)

    app.config.from_object(os.environ['APP_SETTINGS'])

    # ensure the instance folder exists
    # try:
    #     os.makedirs(app.instance_path)
    # except OSError:
    #     pass

    return app