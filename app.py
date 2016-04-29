#! usr/bin/env python

from flask import Flask, render_template


app = Flask(__name__)


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/heatmap')
def heatmap():
    print("hello")
    return render_template('heatmap.html')


if __name__ == '__main__':
    app.run(debug=True)
