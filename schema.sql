/* Schema for running_data app database */

CREATE TABLE IF NOT EXISTS activities (
    id       INTEGER     PRIMARY KEY    not null,
    summary  TEXT
);


CREATE TABLE IF NOT EXISTS points (
    timestamp    TEXT       not null,
    latitude     REAL       not null,
    longitude    REAL       not null,
    id           INTEGER    not null
);
