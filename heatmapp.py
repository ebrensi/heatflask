#! usr/bin/env python

from flask import Flask, render_template
import fmap

app = Flask(__name__)


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/heatmap')
def heatmap():
    print("Constructing map...")
    Map = fmap.makemap()

    print("Rendering map into html...")
    html = Map.get_root().render()

    print("Sending Map to browser...")
    return html


if __name__ == '__main__':
    app.run(debug=True)
