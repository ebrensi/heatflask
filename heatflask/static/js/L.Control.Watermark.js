// Define a watermark control
L.Control.Watermark = L.Control.extend({

    onAdd: function(map) {
        let img = L.DomUtil.create('img');

        img.src = this.options.image;
        img.style.width = this.options.width;
        img.style.opacity = this.options.opacity;
        return img;
    }
});

L.control.watermark = function(opts) {
    return new L.Control.Watermark(opts);
};

