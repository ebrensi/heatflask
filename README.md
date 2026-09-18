
# Heatflask
[<img src="/frontend/src/images/logo.png" alt="logo" width=200/>](https://www.heatflask.com)

Heatflask animates your [Strava](https://www.strava.com) activities on a map, at [heatflask.com](https://www.heatflask.com).

## Running it locally

The development environment is a [Nix](https://nixos.org) flake, which provides Python, MongoDB and Node. On Linux, in the root of the repo:

  1. `nix develop`, then `heatflask-setup` to install both sets of dependencies and the git hooks.
  2. Copy [`backend/.env.example`](./backend/.env.example) to `backend/.env` and put your Strava app's client id and secret in it; see [`backend/README.md`](./backend/README.md).
  3. `heatflask-start-services` to start MongoDB, `heatflask-frontend-watch` to build the frontend and rebuild it as you edit, and `heatflask-run` in a second shell for the server.

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
