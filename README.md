# Heatflask
[<img src="/frontend/src/images/logo.png" alt="logo" width=200/>](https://www.heatflask.com)

As of 2022-04-25 `new-backend` is the main development branch.  If you want to run it (server + client) on your linux machine then 
  * install MongoDB, Redis, Python3.10 latest versions

  * clone this repo, and in the root of the repo, run [`.dev-setup`](./.dev-setup), which should be executable.  It should install everything.
  
  * to start the backend server, navigate to [`/backend`](./backend/), activate the venv by running `source activate`, then start the server with [`./dev-run`](./backend/dev-run).

  * to build and bundle the frontend TypesScript into js and wasm, navigate to [`/frontend`](./frontend/) and run `npm run build`.  See [`./frontend/package.json`](./frontend/package.json).  `npm run watch` to start a process that rebuilds as you modify the frontend files.

  For more info, see [#Contributing](#contributing)


## Contributing
See [`/contributing.md`](/contributing.md).

## Documentation
There is none.  But when there is, it will be [here](docs/docs.md).

## License

This project is licensed under GNU General Public License v3.0 [(GNU GPLv3)](http://choosealicense.com/licenses/gpl-3.0).

Any user is free to suggest modifications, fork this repo, and/or make pull requests.  You are not free to use my code in a project that will make money.  If you feel you can improve on my ideas in your own project, do me a favor and reference my work and compensate me in some way that you think is fair.  Thanks!

Copyright (c) 2016-2022 [Efrem Rensi](mailto:info@heatflask.com)

Feel free to [contact me](mailto:info@heatflask.com) with questions or suggestions

![alt text](docs/gif1.gif)

