import folium
from folium import plugins
import pandas as pd

df = pd.read_csv('allpoints.csv')
df = df[df.lat != "None"].astype(float)

map = folium.Map(location=[37.831390, -122.185242], zoom_start=9)

point_tuples = zip(df.lat, df.long)

points = [[la, lo] for la, lo in point_tuples]

cluster = plugins.HeatMap(points)
# cluster = plugins.MarkerCluster(points[0:10000])


# with open('allpoints.csv', 'rb') as f:
#     reader = csv.reader(f)
#     for row in reader:
#         data = ([row[1]], [row[2]])
#         hm = plugins.HeatMap(data)
#         heatmap_map.add_children(hm)
# f.close()


map.add_children(cluster)

map.save('gh-pages/index.html')
