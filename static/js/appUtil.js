
function href(url, text){
    return `<a href='${url}' target='_blank'>${text}</a>`
}

function ip_lookup_url(ip) {
    return ip ? `http://freegeoip.net/json/${ip}`: "#"
}

function formatID (data, type, row) {
    if (data) {
        if (type == "display") {
            return href("/" + data, data);
        } else {
            return data;
        }
    } else {
        return "";
    }
}

function formatDate(data, type, row, meta) {
    date = new Date(data);
    return (type === "display" || type === "filter") ?
        date.toLocaleString('en-US', { hour12: false }) : date;
}

function formatIP(data, type, row, meta) {
    if (data) {
        let ip = data;
        return (type === "display") ? href(ip_lookup_url(ip), ip): ip;
    } else {
        return "";
    }
}
