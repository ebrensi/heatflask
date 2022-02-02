from sanic import Sanic
from sanic.response import text, stream
from sanic.log import logger as log

app = Sanic("heatflask")


@app.get("/")
async def hello_world(request):
    return text("Hello, world.")


@app.route("/")
async def test(request):
    response = await request.respond(content_type="text/csv")
    await response.send("foo,")
    await response.send("bar")

    # Optionally, you can explicitly end the stream by calling:
    await response.eof()


if __name__ == "__main__":
    app.run(debug=True, access_log=True)
