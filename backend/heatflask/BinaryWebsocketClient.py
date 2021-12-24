import time
import gevent
import msgpack
import json
from geventwebsocket import WebSocketError
from datetime import timedelta

from flask import current_app as app

log = app.logger


class BinaryWebsocketClient(object):
    # WebsocketClient is a wrapper for a websocket
    #  It attempts to gracefully handle broken connections
    def __init__(self, websocket, ttl=60 * 60 * 24):
        self.ws = websocket
        self.birthday = time.time()
        self.gen = None

        # this is a the client_id for the web-page
        # accessing this websocket
        self.client_id = None

        # loc = "{REMOTE_ADDR}:{REMOTE_PORT}".format(**websocket.environ)
        ip = websocket.environ["REMOTE_ADDR"]
        self.name = "WS:{}".format(ip)
        self.key = "{}:{}".format(self.name, int(self.birthday))
        log.debug("%s OPEN", self.key)
        self.send_key()

        self.gpool = gevent.pool.Pool(2)
        self.gpool.spawn(self._pinger)

    def __repr__(self):
        return self.key

    @property
    def closed(self):
        return self.ws.closed

    # We send and receive json objects (dictionaries) encoded as strings
    def sendobj(self, obj):
        if not self.ws:
            return

        try:
            b = msgpack.packb(obj)
            self.ws.send(b, binary=True)
        except WebSocketError:
            pass
        except Exception:
            log.exception("error in sendobj")
            self.close()
            return

        return True

    def receiveobj(self):
        try:
            s = self.ws.receive()
            obj = json.loads(s)
        except (TypeError, ValueError):
            if s:
                log.info("%s recieved non-json-object: %s", self, s)
        except Exception:
            log.exception("error in receiveobj")
            return
        else:
            return obj

    def close(self):
        opensecs = int(time.time() - self.birthday)
        elapsed = timedelta(seconds=opensecs)
        log.debug("%s CLOSED. elapsed=%s", self.key, elapsed)

        try:
            self.ws.close()
        except Exception:
            pass
        self.gpool.kill()

    def send_key(self):
        self.sendobj(dict(wskey=self.key))

    def send_from(self, gen):
        # send everything from gen, a generator of dict objects.
        watchdog = self.gpool.spawn(self._watchdog, gen)

        for obj in gen:
            if self.closed:
                break
            self.sendobj(obj)

        watchdog.kill()

    def _pinger(self, delay=25):
        # This method runs in a separate thread, sending a ping message
        #  periodically, to keep connection from timing out.
        while not self.closed:
            gevent.sleep(25)
            try:
                self.ws.send_frame("ping", self.ws.OPCODE_PING)
            except WebSocketError:
                log.debug("can't ping. closing...")
                self.close()
                return
            except Exception:
                log.exception("%s error sending ping", self)
            # log.debug("%s sent ping", self)

    def _watchdog(self, gen):
        # This method runs in a separate thread, monitoring socket
        #  input while we send stuff from interable gen to the
        #  client device.  This allows us to receive an abort signal
        #  among other things.
        # log.debug("%s watchdog: yo!")
        while not self.closed:
            msg = self.receiveobj()
            if not msg:
                continue
            if "close" in msg:
                abort_signal = True
                log.info("%s watchdog: abort signal", self)
                try:
                    gen.send(abort_signal)
                except Exception:
                    pass
                break
        # log.debug("%s watchdog: bye bye", self)
        self.close()
