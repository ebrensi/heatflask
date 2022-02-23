"""
def create_app():
    app = Flask(__name__)

    app.config.from_object(os.environ["APP_SETTINGS"])

    app.template_folder = urljoin(
        app.instance_path, app.config["WHITENOISE_TEMPLATE_FOLDER"]
    )

    app.wsgi_app = WhiteNoise(
        app.wsgi_app,
        autorefresh=app.config["DEVELOPMENT"],
        mimetypes={".map": "application/json"},
    )

    for folder in app.config["WHITENOISE_STATIC_FOLDERS"]:
        app.wsgi_app.add_files(folder)
"""
