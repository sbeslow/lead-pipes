from flask import Flask
from . import routes


def create_app():
    app = Flask(__name__, static_folder="../frontend/dist", static_url_path="")
    app.register_blueprint(routes.bp)
    return app
