# tester script
import logging as log


def testfunc(e):
    assert len(e) > 2


try:
    [testfunc(s) for s in [1, 2, 3, 4, 5]]
except Exception as e:
    log.exception("oops")
