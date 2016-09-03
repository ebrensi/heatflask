"""
Entity classes for representing the various Strava datatypes.
"""
from __future__ import division, absolute_import, print_function, unicode_literals
import abc
import logging
from collections import Sequence

import six

from stravalib import exc
from stravalib import unithelper as uh

from stravalib.attributes import (META, SUMMARY, DETAILED, Attribute,
                                  TimestampAttribute, LocationAttribute,
                                  EntityCollection, EntityAttribute,
                                  TimeIntervalAttribute, TimezoneAttribute,
                                  DateAttribute, ChoicesAttribute)


class BaseEntity(object):
    """
    A base class for all entities in the system, including objects that may not
    be first-class entities in Strava.
    """
    __metaclass__ = abc.ABCMeta

    def __init__(self, **kwargs):
        self.log = logging.getLogger(
            '{0.__module__}.{0.__name__}'.format(self.__class__))
        self.from_dict(kwargs)

    def from_dict(self, d):
        """
        Populates this object from specified dict.

        Only defined attributes will be set; warnings will be logged for invalid attributes.
        """
        for (k, v) in d.items():
            # Handle special keys such as `hub.challenge` in
            # `SubscriptionCallback`
            if '.' in k:
                k = k.replace('.', '_')
            # Only set defined attributes.
            if hasattr(self.__class__, k):
                self.log.debug("Setting attribute `{0}` [{1}] on entity {2} with value {3!r}".format(
                    k, getattr(self.__class__, k).__class__.__name__, self, v))
                try:
                    setattr(self, k, v)
                except AttributeError as x:
                    raise AttributeError(
                        "Could not find attribute `{0}` on entity {1}, value: {2!r}.  (Original: {3!r})".format(k, self, v, x))
            else:
                self.log.warning(
                    "No such attribute {0} on entity {1}".format(k, self))

    @classmethod
    def deserialize(cls, v):
        """
        Creates a new object based on serialized (dict) struct.
        """
        o = cls()
        o.from_dict(v)
        return o

    def __repr__(self):
        attrs = []
        if hasattr(self.__class__, 'id'):
            attrs.append('id={0}'.format(self.id))
        if hasattr(self.__class__, 'name'):
            attrs.append('name={0!r}'.format(self.name))
        if hasattr(self.__class__, 'resource_state'):
            attrs.append('resource_state={0}'.format(self.resource_state))

        return '<{0} {1}>'.format(self.__class__.__name__, ' '.join(attrs))


class ResourceStateEntity(BaseEntity):
    """
    Mixin for entities that include the resource_state attribute.
    """
    resource_state = Attribute(
        int, (META, SUMMARY, DETAILED))  #: The detail-level for this entity.


class IdentifiableEntity(ResourceStateEntity):
    """
    Mixin for entities that include an ID attribute.
    """
    id = Attribute(int, (META, SUMMARY, DETAILED)
                   )  #: The numeric ID for this entity.


class BoundEntity(BaseEntity):
    """
    Base class for entities that support lazy loading additional data using a bound client.
    """

    #: The :class:`stravalib.client.Client` that can be used to load related resources.
    bind_client = None

    def __init__(self, bind_client=None, **kwargs):
        """
        Base entity initializer, which accepts a client parameter that creates a "bound" entity
        which can perform additional lazy loading of content.

        :param bind_client: The client instance to bind to this entity.
        :type bind_client: :class:`stravalib.simple.Client`
        """
        self.bind_client = bind_client
        super(BoundEntity, self).__init__(**kwargs)

    @classmethod
    def deserialize(cls, v, bind_client=None):
        """
        Creates a new object based on serialized (dict) struct.
        """
        if v is None:
            return None
        o = cls(bind_client=bind_client)
        o.from_dict(v)
        return o

    def assert_bind_client(self):
        if self.bind_client is None:
            raise exc.UnboundEntity(
                "Unable to fetch objects for unbound {0} entity.".format(self.__class__))


class LoadableEntity(BoundEntity, IdentifiableEntity):
    """
    Base class for entities that are bound and have an ID associated with them.

    In theory these entities can be "expaned" by additional Client queries.  In practice this is not
    implemented, since usefulness is limited due to resource-state limitations, etc.
    """

    def expand(self):
        """
        Expand this object with data from the bound client.

        (THIS IS NOT IMPLEMENTED CURRENTLY.)
        """
        raise NotImplementedError()  # This is a little harder now due to resource states, etc.


class Athlete(LoadableEntity):
    """
    Represents a Strava athlete.
    """
    firstname = Attribute(six.text_type, (SUMMARY, DETAILED)
                          )  #: Athlete's first name.
    #: Athlete's last name.
    lastname = Attribute(six.text_type, (SUMMARY, DETAILED))
    #: URL to a 62x62 pixel profile picture
    profile_medium = Attribute(six.text_type, (SUMMARY, DETAILED))
    #: URL to a 124x124 pixel profile picture
    profile = Attribute(six.text_type, (SUMMARY, DETAILED))
    city = Attribute(six.text_type, (SUMMARY, DETAILED))  #: Athlete's home city
    state = Attribute(six.text_type, (SUMMARY, DETAILED)
                      )  #: Athlete's home state
    country = Attribute(six.text_type, (SUMMARY, DETAILED)
                        )  #: Athlete's home country
    #: Athlete's sex ('M', 'F' or null)
    sex = Attribute(six.text_type, (SUMMARY, DETAILED))
    #: 'pending', 'accepted', 'blocked' or 'null' the authenticated athlete's following status of this athlete
    friend = Attribute(six.text_type, (SUMMARY, DETAILED))
    #: 'pending', 'accepted', 'blocked' or 'null' this athlete's following status of the authenticated athlete
    follower = Attribute(six.text_type, (SUMMARY, DETAILED))
    #: Whether athlete is a premium member (true/false)
    premium = Attribute(bool, (SUMMARY, DETAILED))

    #: :class:`datetime.datetime` when athlete record was created.
    created_at = TimestampAttribute((SUMMARY, DETAILED))
    #: :class:`datetime.datetime` when athlete record was last updated.
    updated_at = TimestampAttribute((SUMMARY, DETAILED))

    #: Whether athlete has elected to approve followers
    approve_followers = Attribute(bool, (SUMMARY, DETAILED))

    badge_type_id = Attribute(int, (SUMMARY, DETAILED))  #: (undocumented)

    #: (detailed-only) How many people are following this athlete
    follower_count = Attribute(int, (DETAILED,))
    #: (detailed-only) How many people is this athlete following
    friend_count = Attribute(int, (DETAILED,))
    #: (detailed-only) How many people are both following and being followed by this athlete
    mutual_friend_count = Attribute(int, (DETAILED,))
    athlete_type = ChoicesAttribute(six.text_type, (DETAILED,), choices={
                                    0: "cyclist", 1: "runner"})  #: athlete's default sport: 0 is cyclist, 1 is runner
    #: (detailed-only) Athlete's preferred date representation (e.g. "%m/%d/%Y")
    date_preference = Attribute(six.text_type, (DETAILED,))
    #: (detailed-only) How athlete prefers to see measurements (i.e. "feet" (or what "meters"?))
    measurement_preference = Attribute(six.text_type, (DETAILED,))
    #: (detailed-only)  Athlete's email address
    email = Attribute(six.text_type, (DETAILED,))

    #: (detailed-only) Which clubs athlete belongs to. (:class:`list` of :class:`stravalib.model.Club`)
    clubs = EntityCollection(Club, (DETAILED,))
    #: (detailed-only) Which bikes this athlete owns. (:class:`list` of :class:`stravalib.model.Bike`)
    bikes = EntityCollection(Bike, (DETAILED,))
    #: (detailed-only) Which shoes this athlete owns. (:class:`list` of :class:`stravalib.model.Shoe`)
    shoes = EntityCollection(Shoe, (DETAILED,))

    #: (undocumented) Whether athlete is a super user (not
    super_user = Attribute(bool, (SUMMARY, DETAILED))

    #: The user's preferred lang/locale (e.g. en-US)
    email_language = Attribute(six.text_type, (SUMMARY, DETAILED))

    # A bunch of undocumented detailed-resolution attribs
    #: (undocumented, detailed-only)  Athlete's configured weight.
    weight = Attribute(float, (DETAILED,), units=uh.kg)
    #: (undocumented, detailed-only) Athlete's configured max HR
    max_heartrate = Attribute(float, (DETAILED,))

    #: (undocumented, detailed-only) Athlete's username.
    username = Attribute(six.text_type, (DETAILED))
    #: (undocumented, detailed-only) Athlete's personal description
    description = Attribute(six.text_type, (DETAILED,))
    #: (undocumented, detailed-only) Associated instagram username
    instagram_username = Attribute(six.text_type, (DETAILED,))

    #: (undocumented, detailed-only)
    offer_in_app_payment = Attribute(bool, (DETAILED,))
    #: (undocumented, detailed-only) Whether athlete has global privacy enabled.
    global_privacy = Attribute(bool, (DETAILED,))
    #: (undocumented, detailed-only) Whether athlete has elected to receive newsletter
    receive_newsletter = Attribute(bool, (DETAILED,))
    #: (undocumented, detailed-only) Whether athlete has elected to receive emails when KOMs are lost.
    email_kom_lost = Attribute(bool, (DETAILED,))
    #: (undocumented, detailed-only) Athlete's date of birth
    dateofbirth = DateAttribute((DETAILED,))
    #: (undocumented, detailed-only) Whether Athlete has enabled sharing on Facebook
    facebook_sharing_enabled = Attribute(bool, (DETAILED,))
    #: (undocumented, detailed-only)
    ftp = Attribute(six.text_type, (DETAILED,))
    #: (undocumented, detailed-only)
    profile_original = Attribute(six.text_type, (DETAILED,))
    #: (undocumented, detailed-only) When does premium membership expire (:class:`int` unix epoch)
    premium_expiration_date = Attribute(int, (DETAILED,))
    email_send_follower_notices = Attribute(
        bool, (DETAILED,))  #: (undocumented, detailed-only)
    #: (undocumented, detailed-only)
    plan = Attribute(six.text_type, (DETAILED,))
    #: (undocumented, detailed-only) Whether athlete has agreed to terms
    agreed_to_terms = Attribute(six.text_type, (DETAILED,))
    #: (undocumented, detailed-only) How many people have requested to follow this athlete
    follower_request_count = Attribute(int, (DETAILED,))
    #: (undocumented, detailed-only) Whether athlete has elected to receve emails when a twitter or facebook friend joins Strava
    email_facebook_twitter_friend_joins = Attribute(bool, (DETAILED,))
    #: (undocumented, detailed-only) Whether athlete has elected to receive emails on kudos
    receive_kudos_emails = Attribute(bool, (DETAILED,))
    #: (undocumented, detailed-only) Whether athlete has elected to receive emails on new followers
    receive_follower_feed_emails = Attribute(bool, (DETAILED,))
    #: (undocumented, detailed-only) Whether athlete has elected to receive emails on activity comments
    receive_comment_emails = Attribute(bool, (DETAILED,))

    # (undocumented, detailed-only)
    sample_race_distance = Attribute(int, (DETAILED,))
    # (undocumented, detailed-only)
    sample_race_time = Attribute(int, (DETAILED,))

    _friends = None
    _followers = None
    _stats = None
    _is_authenticated = None

    def __str__(self):
        return '<Athlete id={id} firstname={fname} lastname={lname}>'.format(id=self.id,
                                                                             fname=self.firstname,
                                                                             lname=self.lastname)

    def __repr__(self):
        return '<Athlete id={id} firstname={fname!r} lastname={lname!r}>'.format(id=self.id,
                                                                                 fname=self.firstname,
                                                                                 lname=self.lastname)

    def is_authenticated_athlete(self):
        """
        :return: Boolean as to whether the athlete is the authenticated athlete.
        """
        if self._is_authenticated is None:
            if self.resource_state == DETAILED:
                # If the athlete is in detailed state it must be the
                # authenticated athlete
                self._is_authenticated = True
            else:
                # We need to check this athlete's id matches the authenticated
                # athlete's id
                self.assert_bind_client()
                authenticated_athlete = self.bind_client.get_athlete()
                self._is_authenticated = authenticated_athlete.id == self.id
        return self._is_authenticated

    @property
    def friends(self):
        """
        :return: Iterator of :class:`stravalib.model.Athlete` friend objects for this athlete.
        """
        if self._friends is None:
            self.assert_bind_client()
            if self.friend_count > 0:
                self._friends = self.bind_client.get_athlete_friends(self.id)
            else:
                # Shortcut if we know there aren't any
                self._friends = []
        return self._friends

    @property
    def followers(self):
        """
        :return: Iterator of :class:`stravalib.model.Athlete` followers objects for this athlete.
        """
        if self._followers is None:
            self.assert_bind_client()
            if self.follower_count > 0:
                self._followers = self.bind_client.get_athlete_followers(
                    self.id)
            else:
                # Shortcut if we know there aren't any
                self._followers = []
        return self._followers

    @property
    def stats(self):
        """
        :return: Associated :class:`stravalib.model.AthleteStats`
        """
        if not self.is_authenticated_athlete():
            raise exc.NotAuthenticatedAthlete(
                "Statistics are only available for the authenticated athlete")
        if self._stats is None:
            self.assert_bind_client()
            self._stats = self.bind_client.get_athlete_stats(self.id)
        return self._stats


class ActivityComment(LoadableEntity):
    """
    Comments attached to an activity.
    """
    activity_id = Attribute(int, (META, SUMMARY, DETAILED))  #: ID of activity
    text = Attribute(six.text_type, (META, SUMMARY, DETAILED)
                     )  #: Text of comment
    #: :class:`datetime.datetime` when was coment created
    created_at = TimestampAttribute((SUMMARY, DETAILED))
    #: Associated :class:`stravalib.model.Athlete` (summary-level representation)
    athlete = EntityAttribute(Athlete, (SUMMARY, DETAILED))


class ActivityPhotoPrimary(LoadableEntity):
    """
    A primary photo attached to an activity (different structure from full photo record)
    """
    id = Attribute(int, (META, SUMMARY, DETAILED))  #: ID of photo, if external.
    #: ID of photo, if internal.
    unique_id = Attribute(six.text_type, (META, SUMMARY, DETAILED))
    urls = Attribute(dict, (META, SUMMARY, DETAILED))
    source = Attribute(int, (META, SUMMARY, DETAILED)
                       )  #: 1=internal, 2=instagram
    use_primary_photo = Attribute(
        bool, (META, SUMMARY, DETAILED))  #: (undocumented)


class ActivityPhotoMeta(BaseEntity):
    """
    The photos structure returned with the activity, not to be confused with the full loaded photos for an activity.
    """
    count = Attribute(int, (META, SUMMARY, DETAILED))
    primary = EntityAttribute(ActivityPhotoPrimary, (META, SUMMARY, DETAILED))
    use_primary_photo = Attribute(bool, (META, SUMMARY, DETAILED))

    def __repr__(self):
        return '<{0} count={1}>'.format(self.__class__.__name__, self.count)


class ActivityPhoto(LoadableEntity):
    """
    A full photo record attached to an activity.
    """
    activity_id = Attribute(int, (META, SUMMARY, DETAILED))  #: ID of activity
    #: ref eg. "http://instagram.com/p/eAvA-tir85/"
    ref = Attribute(six.text_type, (META, SUMMARY, DETAILED))
    uid = Attribute(six.text_type, (META, SUMMARY, DETAILED))  #: unique id
    caption = Attribute(six.text_type, (META, SUMMARY,
                                        DETAILED))  #: caption on photo
    #: type of photo (currently only InstagramPhoto)
    type = Attribute(six.text_type, (META, SUMMARY, DETAILED))
    #: :class:`datetime.datetime` when was photo uploaded
    uploaded_at = TimestampAttribute((SUMMARY, DETAILED))
    #: :class:`datetime.datetime` when was photo created
    created_at = TimestampAttribute((SUMMARY, DETAILED))
    location = LocationAttribute()  #: Start lat/lon of photo
    urls = Attribute(dict, (META, SUMMARY, DETAILED))


class ActivityKudos(LoadableEntity):
    """
    Activity kudos are a subset of athlete properties.
    """
    firstname = Attribute(six.text_type, (SUMMARY, DETAILED)
                          )  #: Athlete's first name.
    #: Athlete's last name.
    lastname = Attribute(six.text_type, (SUMMARY, DETAILED))
    #: URL to a 62x62 pixel profile picture
    profile_medium = Attribute(six.text_type, (SUMMARY, DETAILED))
    #: URL to a 124x124 pixel profile picture
    profile = Attribute(six.text_type, (SUMMARY, DETAILED))
    city = Attribute(six.text_type, (SUMMARY, DETAILED))  #: Athlete's home city
    state = Attribute(six.text_type, (SUMMARY, DETAILED)
                      )  #: Athlete's home state
    country = Attribute(six.text_type, (SUMMARY, DETAILED)
                        )  #: Athlete's home country
    #: Athlete's sex ('M', 'F' or null)
    sex = Attribute(six.text_type, (SUMMARY, DETAILED))
    #: 'pending', 'accepted', 'blocked' or 'null' the authenticated athlete's following status of this athlete
    friend = Attribute(six.text_type, (SUMMARY, DETAILED))
    #: 'pending', 'accepted', 'blocked' or 'null' this athlete's following status of the authenticated athlete
    follower = Attribute(six.text_type, (SUMMARY, DETAILED))
    #: Whether athlete is a premium member (true/false)
    premium = Attribute(bool, (SUMMARY, DETAILED))

    #: :class:`datetime.datetime` when athlete record was created.
    created_at = TimestampAttribute((SUMMARY, DETAILED))
    #: :class:`datetime.datetime` when athlete record was last updated.
    updated_at = TimestampAttribute((SUMMARY, DETAILED))

    #: Whether athlete has elected to approve followers
    approve_followers = Attribute(bool, (SUMMARY, DETAILED))


class ActivityLap(LoadableEntity):

    name = Attribute(six.text_type, (SUMMARY, DETAILED))  #: Name of lap
    #: The associated :class:`stravalib.model.Activity`
    activity = EntityAttribute("Activity", (SUMMARY, DETAILED))
    #: The associated :class:`stravalib.model.Athlete`
    athlete = EntityAttribute(Athlete, (SUMMARY, DETAILED))

    #: :class:`datetime.timedelta` of elapsed time for lap
    elapsed_time = TimeIntervalAttribute((SUMMARY, DETAILED))
    #: :class:`datetime.timedelta` of moving time for lap
    moving_time = TimeIntervalAttribute((SUMMARY, DETAILED))
    #: :class:`datetime.datetime` when lap was started in GMT
    start_date = TimestampAttribute((SUMMARY, DETAILED))
    #: :class:`datetime.datetime` when lap was started local
    start_date_local = TimestampAttribute((SUMMARY, DETAILED), tzinfo=None)
    #: The distance for this lap.
    distance = Attribute(float, (SUMMARY, DETAILED), units=uh.meters)
    start_index = Attribute(int, (SUMMARY, DETAILED))  #:
    end_index = Attribute(int, (SUMMARY, DETAILED))  #:
    #: What is total elevation gain for lap
    total_elevation_gain = Attribute(
        float, (SUMMARY, DETAILED,), units=uh.meters)
    average_speed = Attribute(float, (SUMMARY, DETAILED,),
                              units=uh.meters_per_second)  #: Average speed for lap
    max_speed = Attribute(float, (SUMMARY, DETAILED,),
                          units=uh.meters_per_second)  #: Max speed for lap
    #: Average cadence for lap
    average_cadence = Attribute(float, (SUMMARY, DETAILED,))
    #: Average watts for lap
    average_watts = Attribute(float, (SUMMARY, DETAILED,))
    #: Average heartrate for lap
    average_heartrate = Attribute(float, (SUMMARY, DETAILED,))
    #: Max heartrate for lap
    max_heartrate = Attribute(float, (SUMMARY, DETAILED,))
    lap_index = Attribute(int, (SUMMARY, DETAILED))  #: Index of lap
    # true if the watts are from a power meter, false if estimated
    device_watts = Attribute(bool, (SUMMARY, DETAILED))


class Map(IdentifiableEntity):
    #: Alpha-numeric identifier
    id = Attribute(six.text_type, (SUMMARY, DETAILED))
    polyline = Attribute(str, (SUMMARY, DETAILED))  #: Google polyline encoding
    #: Google polyline encoding for summary shape
    summary_polyline = Attribute(str, (SUMMARY, DETAILED))


class Split(BaseEntity):
    """
    A split -- may be metric or standard units (which has no bearing
    on the units used in this object, just the binning of values).
    """
    distance = Attribute(float, units=uh.meters)  #: Distance for this split
    #: :class:`datetime.timedelta` of elapsed time for split
    elapsed_time = TimeIntervalAttribute()
    #: Elevation difference for split
    elevation_difference = Attribute(float, units=uh.meters)
    #: :class:`datetime.timedelta` of moving time for split
    moving_time = TimeIntervalAttribute()
    average_heartrate = Attribute(float)   #: Average HR for split
    split = Attribute(int)  #: Which split number


class SegmentExplorerResult(LoadableEntity):
    """
    Represents a segment result from the segment explorer feature.

    (These are not full segment objects, but the segment object can be fetched
    via the 'segment' property of this object.)
    """
    _segment = None
    id = Attribute(int)  #: ID of the segment.
    name = Attribute(six.text_type)  #: Name of the segment
    #: Climb category for the segment (0 is higher)
    climb_category = Attribute(int)
    climb_category_desc = Attribute(six.text_type)  #: Climb category text
    avg_grade = Attribute(float)  #: Average grade for segment.
    start_latlng = LocationAttribute()  #: Start lat/lon for segment
    end_latlng = LocationAttribute()  #: End lat/lon for segment
    #: Total elevation difference over segment.
    elev_difference = Attribute(float, units=uh.meters)
    distance = Attribute(float, units=uh.meters)  #: Distance of segment.
    points = Attribute(str)  #: Encoded Google polyline of points in segment

    @property
    def segment(self):
        """ Associated (full) :class:`stravalib.model.Segment` object. """
        if self._segment is None:
            self.assert_bind_client()
            if self.id is not None:
                self._segment = self.bind_client.get_segment(self.id)
        return self._segment


class AthleteSegmentStats(BaseEntity):
    """
    An undocumented structure being returned for segment stats for current athlete.
    """
    effort_count = Attribute(
        int)  #: (UNDOCUMENTED) Presumably how many efforts current athlete has on segment.
    # : (UNDOCUMENTED) Presumably PR elapsed time for segment.
    pr_elapsed_time = TimeIntervalAttribute()
    pr_date = DateAttribute()  #: (UNDOCUMENTED) Presumably date of PR :)


class Segment(LoadableEntity):
    """
    Represents a single Strava segment.
    """
    _leaderboard = None

    #: Name of the segment.
    name = Attribute(six.text_type, (SUMMARY, DETAILED))
    #: Activity type of segment ('Ride' or 'Run')
    activity_type = Attribute(six.text_type, (SUMMARY, DETAILED))
    distance = Attribute(float, (SUMMARY, DETAILED),
                         units=uh.meters)  #: Distance of segment
    #: Average grade (%) for segment
    average_grade = Attribute(float, (SUMMARY, DETAILED))
    #: Maximum grade (%) for segment
    maximum_grade = Attribute(float, (SUMMARY, DETAILED))
    #: The highest point of the segment.
    elevation_high = Attribute(float, (SUMMARY, DETAILED), units=uh.meters)
    #: The lowest point of the segment.
    elevation_low = Attribute(float, (SUMMARY, DETAILED), units=uh.meters)
    #: The start lat/lon (:class:`tuple`)
    start_latlng = LocationAttribute((SUMMARY, DETAILED))
    #: The end lat/lon (:class:`tuple`)
    end_latlng = LocationAttribute((SUMMARY, DETAILED))
    #: The start latitude (:class:`float`)
    start_latitude = Attribute(float, (SUMMARY, DETAILED))
    #: The end latitude (:class:`float`)
    end_latitude = Attribute(float, (SUMMARY, DETAILED))
    #: The start longitude (:class:`float`)
    start_longitude = Attribute(float, (SUMMARY, DETAILED))

    #: The end longitude (:class:`float`)
    end_longitude = Attribute(float, (SUMMARY, DETAILED))
    climb_category = Attribute(int, (SUMMARY, DETAILED))  # 0-5, lower is harder
    #: The city this segment is in.
    city = Attribute(six.text_type, (SUMMARY, DETAILED))
    #: The state this segment is in.
    state = Attribute(six.text_type, (SUMMARY, DETAILED))
    #: The country this segment is in.
    country = Attribute(six.text_type, (SUMMARY, DETAILED))
    #: Whether this is a private segment.
    private = Attribute(bool, (SUMMARY, DETAILED))
    #: Whether this segment is starred by authenticated athlete
    starred = Attribute(bool, (SUMMARY, DETAILED))

    # : Undocumented attrib holding stats for current athlete.
    athlete_segment_stats = EntityAttribute(AthleteSegmentStats, (DETAILED,))

    # detailed attribs
    #: :class:`datetime.datetime` when was segment created.
    created_at = TimestampAttribute((DETAILED,))
    #: :class:`datetime.datetime` when was segment last updated.
    updated_at = TimestampAttribute((DETAILED,))
    #: What is total elevation gain for segment.
    total_elevation_gain = Attribute(float, (DETAILED,), units=uh.meters)
    #: :class:`stravalib.model.Map` object for segment.
    map = EntityAttribute(Map, (DETAILED,))
    #: How many times has this segment been ridden.
    effort_count = Attribute(int, (DETAILED,))
    #: How many athletes have ridden this segment
    athlete_count = Attribute(int, (DETAILED,))
    #: Whether this segment has been flagged as hazardous
    hazardous = Attribute(bool, (DETAILED,))
    #: number of stars on this segment.
    star_count = Attribute(int, (DETAILED,))

    @property
    def leaderboard(self):
        """
        The :class:`stravalib.model.SegmentLeaderboard` object for this segment.
        """
        if self._leaderboard is None:
            self.assert_bind_client()
            if self.id is not None:
                self._leaderboard = self.bind_client.get_segment_leaderboard(
                    self.id)
        return self._leaderboard


class SegmentEfforAchievement(BaseEntity):
    """
    An undocumented structure being returned for segment efforts.
    """
    rank = Attribute(
        int)  #: Rank in segment (either overall leaderboard, or pr rank)
    #: The type of achievement -- e.g. 'year_pr' or 'overall'
    type = Attribute(six.text_type)
    #: Numeric ID for type of achievement?  (6 = year_pr, 2 = overall ??? other?)
    type_id = Attribute(int)


class BaseEffort(LoadableEntity):
    """
    Base class for a best effort or segment effort.
    """
    name = Attribute(six.text_type, (SUMMARY, DETAILED)
                     )  #: The name of the segment
    #: The associated :class:`stravalib.model.Segment` for this effort
    segment = EntityAttribute(Segment, (SUMMARY, DETAILED))
    #: The associated :class:`stravalib.model.Activity`
    activity = EntityAttribute("Activity", (SUMMARY, DETAILED))
    #: The associated :class:`stravalib.model.Athlete`
    athlete = EntityAttribute(Athlete, (SUMMARY, DETAILED))
    #: 1-10 segment KOM ranking for athlete at time of upload
    kom_rank = Attribute(int, (SUMMARY, DETAILED))
    #: 1-3 personal record ranking for athlete at time of upload
    pr_rank = Attribute(int, (SUMMARY, DETAILED))
    moving_time = TimeIntervalAttribute(
        (SUMMARY, DETAILED))  #: :class:`datetime.timedelta`
    elapsed_time = TimeIntervalAttribute(
        (SUMMARY, DETAILED))  #: :class:`datetime.timedelta`
    #: :class:`datetime.datetime` when effort was started in GMT
    start_date = TimestampAttribute((SUMMARY, DETAILED))
    #: :class:`datetime.datetime` when effort was started in activity timezone for this effort
    start_date_local = TimestampAttribute((SUMMARY, DETAILED), tzinfo=None)
    #: The distance for this effort.
    distance = Attribute(int, (SUMMARY, DETAILED), units=uh.meters)
    #: Average power during effort
    average_watts = Attribute(float, (SUMMARY, DETAILED))
    #: True if the watts are from a power meter, false if estimated
    device_watts = Attribute(bool, (SUMMARY, DETAILED))
    #: Average HR during effort
    average_heartrate = Attribute(float, (SUMMARY, DETAILED))
    max_heartrate = Attribute(float, (SUMMARY, DETAILED)
                              )   #: Max HR during effort
    #: Average cadence during effort
    average_cadence = Attribute(float, (SUMMARY, DETAILED))
    #: The activity stream index of the start of this effort
    start_index = Attribute(int, (SUMMARY, DETAILED))
    #: The activity stream index of the end of this effort
    end_index = Attribute(int, (SUMMARY, DETAILED))

    #: Undocumented attribute includes list of achievements for this effort.
    achievements = EntityCollection(
        SegmentEfforAchievement, (SUMMARY, DETAILED))


class BestEffort(BaseEffort):
    """
    Class representing a best effort (e.g. best time for 5k)
    """


class SegmentEffort(BaseEffort):
    """
    Class representing a best effort on a particular segment.
    """
    hidden = Attribute(bool, (SUMMARY, DETAILED,)
                       )  # indicates a hidden/non-important effort when returned as part of an activity, value may change over time.
    #: True if the watts are from a power meter, false if estimated
    device_watts = Attribute(bool, (SUMMARY, DETAILED))


class Activity(LoadableEntity):
    """
    Represents an activity (ride, run, etc.).
    """
    # "Constants" for types of activities
    RIDE = "Ride"
    RUN = "Run"
    SWIM = "Swim"
    HIKE = "Hike"
    WALK = "Walk"

    ALPINESKI = "AlpineSki"
    BACKCOUNTRYSKI = "BackcountrySki"
    CANOEING = "Canoeing"
    CROSSCOUNTRYSKIING = "CrossCountrySkiing"
    CROSSFIT = "Crossfit"
    EBIKERIDE = "EBikeRide"
    ELLIPTICAL = "Elliptical"
    ICESKATE = "IceSkate"
    INLINESKATE = "InlineSkate"
    KAYAKING = "Kayaking"
    KITESURF = "Kitesurf"
    NORDICSKI = "NordicSki"
    ROCKCLIMBING = "RockClimbing"
    ROLLERSKI = "RollerSki"
    ROWING = "Rowing"
    SNOWBOARD = "Snowboard"
    SNOWSHOE = "Snowshoe"
    STAIRSTEPPER = "StairStepper"
    STANDUPPADDLING = "StandUpPaddling"
    SURFING = "Surfing"
    VIRTUALRIDE = "VirtualRide"
    WEIGHTTRAINING = "WeightTraining"
    WINDSURF = "Windsurf"
    WORKOUT = "Workout"
    YOGA = "Yoga"

    _comments = None
    _zones = None
    _kudos = None
    _photos = None
    # _gear = None
    _laps = None
    _related = None

    TYPES = (RIDE, RUN, SWIM, WALK, ALPINESKI, BACKCOUNTRYSKI, CANOEING,
             CROSSCOUNTRYSKIING, CROSSFIT, ELLIPTICAL, HIKE, ICESKATE,
             INLINESKATE, KAYAKING, KITESURF, NORDICSKI, ROCKCLIMBING,
             ROLLERSKI, ROWING, SNOWBOARD, SNOWSHOE, STAIRSTEPPER,
             STANDUPPADDLING, SURFING, WEIGHTTRAINING, WINDSURF, WORKOUT, YOGA)

    guid = Attribute(six.text_type, (SUMMARY, DETAILED))  #: (undocumented)

    #: An external ID for the activity (relevant when specified during upload).
    external_id = Attribute(six.text_type, (SUMMARY, DETAILED))
    #: The upload ID for an activit.
    upload_id = Attribute(six.text_type, (SUMMARY, DETAILED))
    #: The associated :class:`stravalib.model.Athlete` that performed this activity.
    athlete = EntityAttribute(Athlete, (SUMMARY, DETAILED))
    #: The name of the activity.
    name = Attribute(six.text_type, (SUMMARY, DETAILED))
    #: The distance for the activity.
    distance = Attribute(float, (SUMMARY, DETAILED), units=uh.meters)
    #: The moving time duration for this activity.
    moving_time = TimeIntervalAttribute((SUMMARY, DETAILED))
    #: The total elapsed time (including stopped time) for this activity.
    elapsed_time = TimeIntervalAttribute((SUMMARY, DETAILED))
    #: Total elevation gain for activity.
    total_elevation_gain = Attribute(
        float, (SUMMARY, DETAILED), units=uh.meters)
    elev_high = Attribute(float, (SUMMARY, DETAILED))
    elev_low = Attribute(float, (SUMMARY, DETAILED))
    type = Attribute(six.text_type, (SUMMARY, DETAILED))  #: The activity type.
    #: :class:`datetime.datetime` when activity was started in GMT
    start_date = TimestampAttribute((SUMMARY, DETAILED))
    #: :class:`datetime.datetime` when activity was started in activity timezone
    start_date_local = TimestampAttribute((SUMMARY, DETAILED), tzinfo=None)
    #: The timezone for activity.
    timezone = TimezoneAttribute((SUMMARY, DETAILED))
    #: The start location (lat/lon :class:`tuple`)
    start_latlng = LocationAttribute((SUMMARY, DETAILED))
    #: The end location (lat/lon :class:`tuple`)
    end_latlng = LocationAttribute((SUMMARY, DETAILED))

    #: The activity location city
    location_city = Attribute(six.text_type, (SUMMARY, DETAILED))
    #: The activity location state
    location_state = Attribute(six.text_type, (SUMMARY, DETAILED))
    #: The activity location state
    location_country = Attribute(six.text_type, (SUMMARY, DETAILED))
    start_latitude = Attribute(
        float, (SUMMARY, DETAILED))  #: The start latitude
    start_longitude = Attribute(
        float, (SUMMARY, DETAILED))  #: The start longitude

    #: How many achievements earned for the activity
    achievement_count = Attribute(int, (SUMMARY, DETAILED))
    #: How many kudos received for activity
    kudos_count = Attribute(int, (SUMMARY, DETAILED))
    #: How many comments  for activity.
    comment_count = Attribute(int, (SUMMARY, DETAILED))
    #: How many other athlete's participated in activity
    athlete_count = Attribute(int, (SUMMARY, DETAILED))
    #: Number of Instagram photos
    photo_count = Attribute(int, (SUMMARY, DETAILED))
    #: Total number of photos (Instagram and Strava)
    total_photo_count = Attribute(int, (SUMMARY, DETAILED))
    #: :class:`stravavlib.model.Map` of activity.
    map = EntityAttribute(Map, (SUMMARY, DETAILED))

    #: Whether activity was performed on a stationary trainer.
    trainer = Attribute(bool, (SUMMARY, DETAILED))
    #: Whether activity is a commute.
    commute = Attribute(bool, (SUMMARY, DETAILED))
    #: Whether activity was manually entered.
    manual = Attribute(bool, (SUMMARY, DETAILED))
    #: Whether activity is private
    private = Attribute(bool, (SUMMARY, DETAILED))
    #: Whether activity was flagged.
    flagged = Attribute(bool, (SUMMARY, DETAILED))

    #: Which bike/shoes were used on activity.
    gear_id = Attribute(six.text_type, (SUMMARY, DETAILED))
    gear = EntityAttribute(Gear, (DETAILED,))

    #: Average speed for activity.
    average_speed = Attribute(float, (SUMMARY, DETAILED),
                              units=uh.meters_per_second)
    max_speed = Attribute(float, (SUMMARY, DETAILED),
                          units=uh.meters_per_second)  #: Max speed for activity

    #: True if the watts are from a power meter, false if estimated
    device_watts = Attribute(bool, (SUMMARY, DETAILED))

    #: If authenticated user has kudoed this activity
    has_kudoed = Attribute(bool, (SUMMARY, DETAILED))

    #: :class:`list` of metric :class:`stravalib.model.BestEffort` summaries
    best_efforts = EntityCollection(BestEffort, (DETAILED,))
    #: :class:`list` of :class:`stravalib.model.SegmentEffort` efforts for activity.
    segment_efforts = EntityCollection(SegmentEffort, (DETAILED,))
    #: :class:`list` of metric :class:`stravalib.model.Split` summaries (running activities only)
    splits_metric = EntityCollection(Split, (DETAILED,))
    #: :class:`list` of standard/imperial :class:`stravalib.model.Split` summaries (running activities only)
    splits_standard = EntityCollection(Split, (DETAILED,))

    #: (undocumented) Average power during activity
    average_watts = Attribute(float, (SUMMARY, DETAILED))
    # rides with power meter data only similar to xPower or Normalized Power
    weighted_average_watts = Attribute(int, (SUMMARY, DETAILED))
    #: rides with power meter data only
    max_watts = Attribute(int, (SUMMARY, DETAILED))

    #: a measure of heartrate intensity, available on premium users' activities only
    suffer_score = Attribute(int, (SUMMARY, DETAILED))
    #: true if recorded with heartrate
    has_heartrate = Attribute(bool, (SUMMARY, DETAILED))
    #: only if recorded with heartrate average over moving portion
    average_heartrate = Attribute(float, (SUMMARY, DETAILED))
    #: (undocumented) Max HR during activity
    max_heartrate = Attribute(int, (SUMMARY, DETAILED))
    #: (undocumented) Average cadence during activity
    average_cadence = Attribute(float, (SUMMARY, DETAILED))
    #: (undocumented) Kilojoules of energy used during activity
    kilojoules = Attribute(float, (SUMMARY, DETAILED))
    #: (undocumented) Average temperature (when available from device) during activity.
    average_temp = Attribute(int, (SUMMARY, DETAILED))

    #: the token used to embed a Strava activity in the form www.strava.com/activities/[activity_id]/embed/[embed_token]. Only included if requesting athlete is activity owner.
    embed_token = Attribute(six.text_type, (DETAILED,))
    #: Calculation of how many calories burned on activity
    calories = Attribute(float, (DETAILED,))
    #: Description of activity.
    description = Attribute(six.text_type, (DETAILED,))
    workout_type = Attribute(six.text_type, (DETAILED,))  #: (undocumented)

    #: A new photo metadata structure.
    photos = EntityAttribute(ActivityPhotoMeta, (DETAILED,))
    #: (undocumented) Appears to be the ref to first associated instagram photo
    instagram_primary_photo = Attribute(six.text_type, (DETAILED,))

    partner_logo_url = Attribute(six.text_type, (DETAILED,))  #: (undocumented)

    @property
    def comments(self):
        """
        Iterator of :class:`stravalib.model.ActivityComment` objects for this activity.
        """
        if self._comments is None:
            self.assert_bind_client()
            if self.comment_count > 0:
                self._comments = self.bind_client.get_activity_comments(self.id)
            else:
                # Shortcut if we know there aren't any
                self._comments = []
        return self._comments

    @property
    def laps(self):
        """
        Iterator of :class:`stravalib.model.ActivityLap` objects for this activity.
        """
        if self._laps is None:
            self.assert_bind_client()
            self._laps = self.bind_client.get_activity_laps(self.id)
        return self._laps

    @property
    def zones(self):
        """
        :class:`list` of :class:`stravalib.model.ActivityZone` objects for this activity.
        """
        if self._zones is None:
            self.assert_bind_client()
            self._zones = self.bind_client.get_activity_zones(self.id)
        return self._zones

    @property
    def kudos(self):
        """
        :class:`list` of :class:`stravalib.model.ActivityKudos` objects for this activity.
        """
        if self._kudos is None:
            self.assert_bind_client()
            self._kudos = self.bind_client.get_activity_kudos(self.id)
        return self._kudos

    @property
    def full_photos(self):
        """
        :class:`list` of :class:`stravalib.model.ActivityPhoto` objects for this activity.
        """
        if self._photos is None:
            if self.total_photo_count > 0:
                self.assert_bind_client()
                self._photos = self.bind_client.get_activity_photos(self.id)
            else:
                self._photos = []
        return self._photos

    @property
    def related(self):
        """
        Iterator of :class:`stravalib.model.Activty` objects for activities matched as
        with this activity.
        """
        if self._related is None:
            if self.athlete_count - 1 > 0:
                self.assert_bind_client()
                self._related = self.bind_client.get_related_activities(self.id)
            else:
                self._related = []
        return self._related


class SegmentLeaderboardEntry(BoundEntity):
    """
    Represents a single entry on a segment leaderboard.

    The :class:`stravalib.model.SegmentLeaderboard` object is essentially a collection
    of instances of this class.
    """
    _athlete = None
    _activity = None
    _effort = None

    effort_id = Attribute(int)  #: The numeric ID for the segment effort.
    athlete_id = Attribute(int)  #: The numeric ID for the athlete.
    athlete_name = Attribute(six.text_type)  #: The athlete's name.
    athlete_gender = Attribute(six.text_type)  #: The athlete's sex (M/F)
    athlete_profile = Attribute(six.text_type)  #: Link to athlete profile photo
    average_hr = Attribute(float)  #: The athlete's average HR for this effort
    #: The athlete's average power for this effort
    average_watts = Attribute(float)
    #: The distance for this effort.
    distance = Attribute(float, units=uh.meters)
    elapsed_time = TimeIntervalAttribute()  #: The elapsed time for this effort
    moving_time = TimeIntervalAttribute()  #: The moving time for this effort
    #: :class:`datetime.datetime` when this effot was started in GMT
    start_date = TimestampAttribute((SUMMARY, DETAILED))
    #: :class:`datetime.datetime` when this effort was started in activity timezone
    start_date_local = TimestampAttribute((SUMMARY, DETAILED), tzinfo=None)
    #: The numeric ID of the associated activity for this effort.
    activity_id = Attribute(int)
    rank = Attribute(int)  #: The rank on the leaderboard.

    def __repr__(self):
        return '<SegmentLeaderboardEntry rank={0} athlete_name={1!r}>'.format(self.rank, self.athlete_name)

    @property
    def athlete(self):
        """ The related :class:`stravalib.model.Athlete` (performs additional server fetch). """
        if self._athlete is None:
            self.assert_bind_client()
            if self.athlete_id is not None:
                self._athlete = self.bind_client.get_athlete(self.athlete_id)
        return self._athlete

    @property
    def activity(self):
        """ The related :class:`stravalib.model.Activity` (performs additional server fetch). """
        if self._activity is None:
            self.assert_bind_client()
            if self.activity_id is not None:
                self._activity = self.bind_client.get_activity(self.activity_id)
        return self._activity

    @property
    def effort(self):
        """ The related :class:`stravalib.model.SegmentEffort` (performs additional server fetch). """
        if self._effort is None:
            self.assert_bind_client()
            if self.effort_id is not None:
                self._effort = self.bind_client.get_segment_effort(
                    self.effort_id)
        return self._effort


class SegmentLeaderboard(Sequence, BoundEntity):
    """
    The ranked leaderboard for a segment.

    This class is effectively a collection of :class:`stravalib.model.SegmentLeaderboardEntry` objects.
    """
    effort_count = Attribute(int)
    entry_count = Attribute(int)
    entries = EntityCollection(SegmentLeaderboardEntry)

    def __iter__(self):
        return iter(self.entries)

    def __len__(self):
        return len(self.entries)

    def __contains__(self, k):
        return k in self.entries

    def __getitem__(self, k):
        return self.entries[k]


class DistributionBucket(BaseEntity):
    """
    A single distribution bucket object, used for activity zones.
    """
    max = Attribute(int)  #: Max datatpoint
    min = Attribute(int)  #: Min datapoint
    #: Time in seconds (*not* a :class:`datetime.timedelta`)
    time = Attribute(int, units=uh.seconds)


class BaseActivityZone(LoadableEntity):
    """
    Base class for activity zones.

    A collection of :class:`stravalib.model.DistributionBucket` objects.
    """
    distribution_buckets = EntityCollection(DistributionBucket, (
        SUMMARY, DETAILED))  #: The collection of :class:`stravalib.model.DistributionBucket` objects
    #: Type of activity zone (heartrate, power, pace).
    type = Attribute(six.text_type, (SUMMARY, DETAILED))
    #: Whether zone data is sensor-based (as opposed to calculated)
    sensor_based = Attribute(bool, (SUMMARY, DETAILED))

    @classmethod
    def deserialize(cls, v, bind_client=None):
        """
        Creates a new object based on serialized (dict) struct.
        """
        if v is None:
            return None
        az_classes = {'heartrate': HeartrateActivityZone,
                      'power': PowerActivityZone,
                      'pace': PaceActivityZone}
        try:
            clazz = az_classes[v['type']]
        except KeyError:
            raise ValueError(
                "Unsupported activity zone type: {0}".format(v['type']))
        else:
            o = clazz(bind_client=bind_client)
            o.from_dict(v)
            return o


class HeartrateActivityZone(BaseActivityZone):
    """
    Activity zone for heart rate.
    """
    score = Attribute(int, (SUMMARY, DETAILED)
                      )  #: The score (suffer score) for this HR zone.
    #: The points for this HR zone.
    points = Attribute(int, (SUMMARY, DETAILED))
    #: Whether athlete has setup custom zones.
    custom_zones = Attribute(bool, (SUMMARY, DETAILED))
    max = Attribute(int, (SUMMARY, DETAILED))  #: The max heartrate


class PaceActivityZone(BaseActivityZone):
    """
    Activity zone for pace.
    """
    score = Attribute(int, (SUMMARY, DETAILED))  #: The score for this zone.
    sample_race_distance = Attribute(
        int, (SUMMARY, DETAILED), units=uh.meters)  #: (Not sure?)
    sample_race_time = TimeIntervalAttribute(
        (SUMMARY, DETAILED))  #: (Not sure?)


class PowerActivityZone(BaseActivityZone):
    """
    Activity zone for power.
    """
    # these 2 below were removed according to June 3, 2014 update @
    #    http://strava.github.io/api/v3/changelog/
    #: Weight of bike being used (factored into power calculations)
    bike_weight = Attribute(float, (SUMMARY, DETAILED), units=uh.kgs)
    #: Weight of athlete (factored into power calculations)
    athlete_weight = Attribute(float, (SUMMARY, DETAILED), units=uh.kgs)


class Stream(LoadableEntity):
    """
    Stream of readings from the activity, effort or segment.
    """
    type = Attribute(six.text_type)
    data = Attribute(list)  #: array of values
    #: type of stream: time, latlng, distance, altitude, velocity_smooth, heartrate, cadence, watts, temp, moving, grade_smooth
    series_type = Attribute(six.text_type)
    #: the size of the complete stream (when not reduced with resolution)
    original_size = Attribute(int)
    #: (optional, default is 'all') the desired number of data points. 'low' (100), 'medium' (1000), 'high' (10000) or 'all'
    resolution = Attribute(six.text_type)

    def __repr__(self):
        return '<Stream type={} resolution={} original_size={}>'.format(self.type,
                                                                        self.resolution,
                                                                        self.original_size,)


class Route(LoadableEntity):
    """
    Represents a Route.
    """
    name = Attribute(six.text_type, (SUMMARY, DETAILED))  #: Name of the route.
    #: Description of the route.
    description = Attribute(six.text_type, (SUMMARY, DETAILED,))
    #: The associated :class:`stravalib.model.Athlete` that performed this activity.
    athlete = EntityAttribute(Athlete, (SUMMARY, DETAILED))
    #: The distance for the route.
    distance = Attribute(float, (SUMMARY, DETAILED), units=uh.meters)
    #: Total elevation gain for the route.
    elevation_gain = Attribute(float, (SUMMARY, DETAILED), units=uh.meters)
    # : :class:`stravalib.model.Map` object for route.
    map = EntityAttribute(Map, (SUMMARY, DETAILED))
    #: Activity type of route (1 for ride, 2 for run).
    type = Attribute(six.text_type, (SUMMARY, DETAILED))
    #: Activity sub-type of route (1 for road (ride and run), 2 for mtb, 3 for cx, 4 for trail, 5 for mixed).
    sub_type = Attribute(six.text_type, (SUMMARY, DETAILED))
    #: Whether the route is private.
    private = Attribute(bool, (SUMMARY, DETAILED))
    #: Whether the route is starred.
    starred = Attribute(bool, (SUMMARY, DETAILED))
    # timestamp = NOT IMPLEMENTED
    # segments = NOT IMPLEMENTED


class Subscription(LoadableEntity):
    """
    Represents a Webhook Event Subscription.

    http://strava.github.io/api/partner/v3/events/
    """
    OBJECT_TYPE_ACTIVITY = 'activity'
    ASPECT_TYPE_CREATE = 'create'

    VERIFY_TOKEN_DEFAULT = 'STRAVA'

    application_id = Attribute(int)
    object_type = Attribute(six.text_type)
    aspect_type = Attribute(six.text_type)
    callback_url = Attribute(six.text_type)
    created_at = TimestampAttribute()
    updated_at = TimestampAttribute()


class SubscriptionCallback(LoadableEntity):
    """
    Represents a Webhook Event Subscription Callback.
    """
    hub_mode = Attribute(six.text_type)
    hub_verify_token = Attribute(six.text_type)
    hub_challenge = Attribute(six.text_type)

    def validate(self, verify_token=Subscription.VERIFY_TOKEN_DEFAULT):
        assert self.hub_verify_token == verify_token


class SubscriptionUpdate(LoadableEntity):
    """
    Represents a Webhook Event Subscription Update.
    """
    subscription_id = Attribute(six.text_type)
    owner_id = Attribute(six.text_type)
    object_id = Attribute(six.text_type)
    object_type = Attribute(six.text_type)
    aspect_type = Attribute(six.text_type)
    event_time = TimestampAttribute()
