#! usr/bin/env python

from flask import Flask, render_template, request
import fmap

app = Flask(__name__)


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/', methods=['POST'])
def heatmap():
    start = request.form['start']
    end = request.form['end']
    print("Constructing map on dates ranging from...{} to {}"
          .format(start, end))
    Map = fmap.makemap(start, end)

    print("Rendering map into html...")
    html = Map.get_root().render()

    print("Sending Map to browser...")
    return html


if __name__ == '__main__':
    app.run(debug=True)
