const C = {

    SECONDS_A_MINUTE: 60,
    SECONDS_A_HOUR: SECONDS_A_MINUTE * 60,
    SECONDS_A_DAY: SECONDS_A_HOUR * 24,
    SECONDS_A_WEEK: SECONDS_A_DAY * 7,

    MILLISECONDS_A_SECOND: 1e3,
    MILLISECONDS_A_MINUTE: SECONDS_A_MINUTE * MILLISECONDS_A_SECOND,
    MILLISECONDS_A_HOUR: SECONDS_A_HOUR * MILLISECONDS_A_SECOND,
    MILLISECONDS_A_DAY: SECONDS_A_DAY * MILLISECONDS_A_SECOND,
    MILLISECONDS_A_WEEK: SECONDS_A_WEEK * MILLISECONDS_A_SECOND,

    // English locales
    MS: 'millisecond',
    S: 'second',
    MIN: 'minute',
    H: 'hour',
    D: 'day',
    W: 'week',
    M: 'month',
    Q: 'quarter',
    Y: 'year',
    DATE: 'date',

    FORMAT_DEFAULT: 'YYYY-MM-DDTHH:mm:ssZ',

    INVALID_DATE_STRING: 'Invalid Date',

    // regex
    REGEX_PARSE: /^(\d{4})-?(\d{1,2})-?(\d{0,2})[^0-9]*(\d{1,2})?:?(\d{1,2})?:?(\d{1,2})?.?(\d{1,3})?$/,
    
    REGEX_FORMAT: /\[([^\]]+)]|Y{2,4}|M{1,4}|D{1,2}|d{1,4}|H{1,2}|h{1,2}|a|A|m{1,2}|s{1,2}|Z{1,2}|SSS/g
}