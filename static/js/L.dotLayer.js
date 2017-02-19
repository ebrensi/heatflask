/* Canvas Layer */
  DELAY_CONST = 100;

  function drawDots(info, A, time) {
      if (!info.bounds.intersects(A.bounds)) {
          return;
      }

      const times = A.time,
            latlngs = A.latlng,
            max_time = times[times.length-1],
            zoom = info.zoom,
            delay = DELAY_CONST/Math.sqrt(zoom),
            num_pts = Math.floor(max_time / delay),
            ctx = info.canvas.getContext('2d');

      let s = time % max_time,
          key_time = s - delay * Math.floor(s/delay);

      let i=0, t, d, dt, p1, p2, p, size, interval_good;
      // ctx.fillStyle = "#FFFFFF";
      if (A.selected) {
          size = 4;
          ctx.fillStyle = "#FFFFFF";
      } else {
          size = 2;
          ctx.fillStyle = "#000000";
      }

      for (let j = 0; j < num_pts; j++) {
          t = (key_time + j*delay);
          if (t >= times[i]) {
            while (t >= times[i]) {
              i++;
            }

            p1 = latlngs[i-1];
            p2 = latlngs[i];
            interval_good = info.bounds.contains(p1) || info.bounds.contains(p2);

            if (interval_good) {
                dt = times[i] - times[i-1];
                M = [(p2[0]-p1[0])/dt,  (p2[1]-p1[1])/dt];
            }
          }

          if (interval_good) {

              dt = t - times[i-1];
              p = [p1[0] + M[0]*dt, p1[1] + M[1]*dt];

              if (info.bounds.contains(p)) {
                  dot = info.layer._map.latLngToContainerPoint(p);
                  // ctx.fillRect(dot.x-1, dot.y-1, size, size);
                  ctx.beginPath();
                  ctx.arc(dot.x, dot.y, size, 0, Math.PI * 2);
                  ctx.fill();
                  ctx.closePath();
              }
          }

      }

  }
