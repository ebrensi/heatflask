# Heatflask -- Making dataviz great again
[<img src="/heatflask/static/logo.png" alt="logo" width=200/>](https://www.heatflask.com)
## ☠ The `master` branch has been DEPRECATED! ☠

### Heatflask is currently undergoing a major re-write, which is taking place on the [`bundle`](https://github.com/ebrensi/heatflask/tree/bundle) branch.

This is the the server-side and client-side code repository for the Heatflask web-application currently serving at at https://www.heatflask.com.  
 

## Contributing
### 🙏🏽 Backend help wanted
### Please do not make any pull requests for client-side code ###
I am hard at work on heatflask v0.5.0 which I hope to release soon.

The backend is stable for now as I am focused on client-side re-factoring and re-writing on the [`bundle`](https://github.com/ebrensi/heatflask/tree/bundle) branch.  This offers opportunity for someone to contribute to backend development.  It provides a HTTPS and WebSocket API for clients to authenticate and access data.  It currently has the capability to retrieve multi-user queries but the current stable front-end is not taking advantage of that.  Currently the way it works is that the backend serves Jinja2 templated html to the client.  Instead I would like to have the html file be static, so that the authentication happens not on html retrieval but after the WebSocket connection is established. We will get rid of the `flask-login` dependency and authenticate like this:
  * client requests `/{userid}?{params}`
  * backend returns a static html file (the same one regardless of `userid` and `params`)
  * client establishes a WebSocket connection with the backend and sends a query specified by `userid` and `params`. The query contains a `clientId` field that may be blank.
    * If the `clientId` is blank or not in our database then the client's user is not logged in.  We return activity data if the owner allows access, but not user profile data that goes in the profile tab.  Any query for user profile data will be rejected.  The user can log in manually.
    * If `clientId` is in the database then the client is logged in.  If that client has a WebSocket connection open, We send it whatever data it requests.
  * For login, the client asychronously requests our `/authorize` endpoint, which forwards it to a Strava authentication dialog.  The user authenticates with Strava, and Strava sends us (the backend) notification identified with `clientId` by hitting our `/authorized` endpoint.  We create a `clientId` key in the login database.
  
I would like for the heatflask client and server be decoupled in this way so that people can independently develop their own clients, which can access the backend without having been served by the backend.

Feel free to communicate with me via [issues](https://github.com/ebrensi/heatflask/issues), by [email](mailto:info@heatflask.com) with questions or suggestions.
Also on [![alt text][1.1]][1].

## Documentation
There is none.  But when there is, it will be [here](docs/docs.md).

## License

This project is licensed under GNU General Public License v3.0 [(GNU GPLv3)](http://choosealicense.com/licenses/gpl-3.0).

Any user is free to suggest modifications, fork this repo, and/or make pull requests.  You are not free to use my code in a project that will make money.  If you feel you can improve on my ideas in your own project, do me a favor and reference my work and compensate me in some way that you think is fair.  Thanks!

Copyright (c) 2016-2020 [Efrem Rensi](mailto:info@heatflask.com)



![alt text](docs/gif1.gif)

[1]: http://www.twitter.com/heatflask

