
# Heatflask
[<img src="/frontend/src/images/logo.png" alt="logo" width=200/>](https://www.heatflask.com)

Heatflask animates your [Strava](https://www.strava.com) activities on a map, at [heatflask.com](https://www.heatflask.com).

## Running it locally

On Linux:

  * **With Nix:** run `nix develop` in the root of the repo, then `heatflask-setup`, `heatflask-start-services` (MongoDB) and `heatflask-run` (the server).

  * **Without Nix:** install [MongoDB](https://www.mongodb.com) and Python 3.13, then run [`.dev-setup`](./.dev-setup) in the root of the repo. It installs the git hooks and both sets of dependencies. Start the server with [`backend/dev-run`](./backend/dev-run).

  * **Either way:**
    * Put your Strava app's client id and secret in `backend/activate`; see [`backend/README.md`](./backend/README.md).
    * Build the frontend by running `npm run build` in [`/frontend`](./frontend/), or `npm run watch` to rebuild as you edit. See [`frontend/README.md`](./frontend/README.md).

The server runs at http://127.0.0.1:8000.

For more, see [#Contributing](#contributing).


## Contributing
See [`/contributing.md`](/contributing.md).

## Support
Heatflask is free, and built and run by one person. If it's worth something to you, you can [sponsor it on GitHub](https://github.com/sponsors/ebrensi).

## License

This project is licensed under GNU General Public License v3.0 [(GNU GPLv3)](http://choosealicense.com/licenses/gpl-3.0).

Any user is free to suggest modifications, fork this repo, and/or make pull requests.  You are not free to use my code in a project that will make money.  If you feel you can improve on my ideas in your own project, do me a favor and reference my work and compensate me in some way that you think is fair.  Thanks!

Copyright (c) 2016-2026 [Efrem Rensi](mailto:info@heatflask.com)

Feel free to [contact me](mailto:info@heatflask.com) with questions or suggestions

![alt text](docs/gif1.gif)
