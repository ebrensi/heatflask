
function href(url, text){
    return `<a href='${url}' target='_blank'>${text}</a>`
}

function ip_lookup_url(ip) {
    return ip ? `http://freegeoip.net/json/${ip}`: "#"
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
