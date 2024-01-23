# Heatflask
[<img src="/heatflask/static/logo.png" alt="logo" width=200/>](https://www.heatflask.com)

2024-01-22:  Once again I am attempting a rewrite because I was contacted by Strava about some things I need to change, or heatflask will get disabled.  In particular the way we handle private activities.  Doing a total rewite of everything ended up being too much so what I'm going to do this time around is 
modify/update the `master` branch with some incrimental changes.  Maybe I can integrate more of the newer code later.   That means, we sill still use the archaic `Flask`/`gevent` combo for now, as well as continue bundling on the backend rather than using a frontend bundling system like `Parcel`.  Also, to make sure eveything still works I will change as little of the frontend code as possible.

## Developing
If for some reason you want to work on this, you will need a Linux environment.  From the root of this repo, run `make`, and then copy `env.sample` to `.env` and update the environment variables in that file.
  * You will need to have `redis`,`mongodb`, and `postgresql` installed.
    * After installing postgres, create a User/Role and database:
      ```sudo -u postgres psql
         postgres=# create database heatflask;
         postgres=# create user heatflask with password 'heatflask';
         postgres=# grant all privileges on database heatflask to heatflask;
        ``` 
    * Redis and MongoDB will initialize themselves on first run.
  
  * To run the server execute `make serve`.   


## License

This project is licensed under GNU General Public License v3.0 [(GNU GPLv3)](http://choosealicense.com/licenses/gpl-3.0).

Any user is free to suggest modifications, fork this repo, and/or make pull requests.  You are not free to use my code in a project that will make money.  If you feel you can improve on my ideas in your own project, do me a favor and reference my work and compensate me in some way that you think is fair.  Thanks!

Copyright (c) 2016-2024 [Efrem Rensi](mailto:info@heatflask.com)



![alt text](docs/gif1.gif)
