/*
 *  ViewBox represents the the rectangle in which everything
 *  we are doing happens
 *
 */
DotLayer.ViewBox = {

    initialize: function(map, canvases, itemsArray) {
        this._map = map;
        this._canvases = canvases;
        this.latLng2px = CRS.makePT(0); // operates in-place
        this._sets = {
            items: { current: new BitSet(), last: new BitSet() },
            colorGroups: { path: {}, dot:  {} }
        };
        this._pathColorGroups = { selected: null, unselected: null };
        this._dotColorGroups =  { selected: null, unselected: null };
        this._pxOffset = [NaN, NaN];

        if (itemsArray)
            this.setItemsArray(itemsArray);

        return this
    },

    reset: function(itemsArray) {
        this.initialize(this._map, this._canvases, itemsArray);
    },

    getMapSize: function () {
        return this._map.getSize()
    },


    pathColorGroups: function() {
        const pgroups = this._pathColorGroups,
              cgroups = this._sets.colorGroups.path;
        this._pathColorGroups.selected = cgroups[true];
        this._pathColorGroups.unselected = cgroups[false];
        return this._pathColorGroups
    },

    dotColorGroups: function() {
        const dgroups = this._dotColorGroups,
              cgroups = this._sets.colorGroups.dot;
        this._dotColorGroups.selected = cgroups[true];
        this._dotColorGroups.unselected = cgroups[false];
        return this._dotColorGroups
    },

    setItemsArray: function(itemsArray) {
        this._itemsArray = itemsArray;
    },

    tol: function(zoom) {
        return zoom? 1/(2**zoom) : 1/this._zf;
    },

    inView: function() {
        return this._sets.items.current;
    },

    updateView: function() {
        const sets = this._sets,
              allItems = this._itemsArray,
              inView = sets.items;

        const temp = inView.current;
        inView.current = inView.last.clear();
        inView.last = temp;

        const currentInView = inView.current;
        // update which items are in the current view
        for (let i=0, len=allItems.length; i<len; i++) {
            if ( this.overlaps(allItems[i].bounds) )
                currentInView.add(i);
        }

        // update items that have changed since last time
        const changed = inView.last.change(inView.current);
        changed.forEach(i => {
            const A = allItems[i],
                  emph = !!A.selected;
            let pgroup = sets.colorGroups.path,
                dgroup = sets.colorGroups.dot;

            if ( !( emph in pgroup) )
                pgroup[emph] = {};
            pgroup = pgroup[emph];

            if ( !( emph in dgroup) )
                dgroup[emph] = {};
            dgroup = dgroup[emph];

            // update pathColorGroup
            if (! (A.pathColor in pgroup) )
                pgroup[A.pathColor] = new BitSet().add(i);
            else
                pgroup[A.pathColor].flip(i);

            // update dotColorGroup
            if (! (A.dotColor in dgroup) )
                dgroup[A.dotColor] = new BitSet().add(i);
            else
                dgroup[A.dotColor].flip(i);
        });

        const groups = sets.colorGroups;
        for (const type in groups) {         // path or dot
            const typeGroup = groups[type];
            for (const emph in typeGroup) {
                const colorGroup = typeGroup[emph];
                let empty = true;
                for (const color in colorGroup) {
                    if (colorGroup[color].isEmpty())
                        delete colorGroup[color]
                    else if (empty)
                        empty = false;
                }
                if (empty)
                    delete typeGroup[emph];
            }
        }

        // return the current state of inclusion
        return currentInView;
    },

    // note this only removes A from colorGroups but it stays in
    // this.itemsViewBox:ViewBox:, so that we won't keep adding it every time
    // this.update() is called.
    remove: function(i) {
        const A = this._itemsArray[i],
              cg = this._sets.colorGroups,
              emph = !!A.selected;
        cg.path[emph][A.pathColor].remove(i);
        cg.dot[emph][A.dotColor].remove(i);
        this.inView().remove(i);
    },

    updateSelect: function(i) {
        const A = this._itemsArray[i],
              cg = this._sets.colorGroups,
              emph = !!A.selected;

        if ( this.inView().has(i) ) {
            if (!cg.path[emph])
                cg.path[emph] = {};

            if (!cg.dot[emph])
                cg.dot[emph] = {};

            if (!cg.path[emph][A.pathColor])
                cg.path[emph][A.pathColor] = new BitSet;

            if (!cg.dot[emph][A.dotColor])
                cg.dot[emph][A.dotColor] = new BitSet;

            cg.path[emph][A.pathColor].add(i);
            cg.path[!emph][A.pathColor].remove(i);

            cg.dot[emph][A.dotColor].add(i);
            cg.dot[!emph][A.dotColor].remove(i);
            return true
        }

    },

    calibrate: function() {
        // calibrate screen coordinates
        const m = this._map,
              topLeft = m.containerPointToLayerPoint( [ 0, 0 ] ),
              setPosition = L.DomUtil.setPosition,
              canvases = this._canvases;

        for (let i=0, len=canvases.length; i<len; i++)
            setPosition( canvases[i], topLeft );

        const pxOrigin = m.getPixelOrigin(),
              mapPanePos = m._getMapPanePos();
        this.pxOffset = mapPanePos.subtract(pxOrigin);
    },

    update: function(calibrate=true) {
        const m = this._map,
              zoom = m.getZoom(),
              latLngMapBounds = m.getBounds();

        const zoomChange = zoom != this.zoom;
        // stuff that (only) needs to be done on zoom change
        if (zoomChange)
            this.onZoomChange(zoom);

        if (calibrate)
            this.calibrate();

        this.pxBounds = this.latLng2pxBounds(latLngMapBounds);

        return this.updateView();
    },

    onZoomChange: function(zoom) {

        this.size = this.getMapSize();
        this.zoom = zoom;
        this._zf = 2 ** zoom;
    },

    // this function operates in-place!
    px2Container: function() {
        const offset = this.pxOffset,
              zf = this._zf;

        return p => {
            p[0] = zf*p[0] + offset.x;
            p[1] = zf*p[1] + offset.y;

            return p;
        }
    },

    latLng2pxBounds: function(llBounds, pxObj) {
        if (!pxObj)
            pxObj = new Float32Array(4);

        const sw = llBounds._southWest,
              ne = llBounds._northEast;

        pxObj[0] = sw.lat;  // xmin
        pxObj[1] = sw.lng;  // ymax
        pxObj[2] = ne.lat;  // xmax
        pxObj[3] = ne.lng;  // ymin
        this.latLng2px(pxObj.subarray(0,2));
        this.latLng2px(pxObj.subarray(2,4));
        return pxObj
    },

    overlaps: function(activityBounds) {
        const mb = this.pxBounds,
              ab = activityBounds,
              xOverlaps = (ab[2] > mb[0]) && (ab[0] < mb[2]),
              yOverlaps = (ab[3] < mb[1]) && (ab[1] > mb[3]);
        return xOverlaps && yOverlaps;
    },

    contains: function (point) {
        const mb = this.pxBounds,
              x = point[0],
              y = point[1],
              xmin = mb[0], xmax = mb[2],
              ymin = mb[3], ymax = mb[1];

        return (xmin <= x) && (x <= xmax) &&
               (ymin <= y) && (y <= ymax);
    },

    drawPxBounds: function(ctx, pxBounds) {
        const b = pxBounds || this.pxBounds,
              xmin = b[0], xmax = b[2],
              ymin = b[3], ymax = b[1],
              transform = this.px2Container(),

              ul = transform([xmin, ymin]),
              x = ul[0] + 5,
              y = ul[1] + 5,

              lr = transform([xmax, ymax]),
              w = (lr[0] - x) - 10,
              h = (lr[1] - y) - 10,
              rect = {x: x, y:y, w:w, h:h};

        ctx.strokeRect(x, y, w, h);
        return rect
    }
};



