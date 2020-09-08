# tester script
from heatflask import create_app
from heatflask.models import Users, Activities, Index, Utility

app = create_app()

log = app.logger

u = Users.get("e_rensi")


