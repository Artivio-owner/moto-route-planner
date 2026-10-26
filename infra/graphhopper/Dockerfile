# GraphHopper с мото-профилями «Версты» (S-01). Граф строится при первом запуске
# из /data/region.osm.pbf и сохраняется в /graph-cache.
FROM eclipse-temurin:21-jre
ARG GRAPHHOPPER_VERSION=11.0
WORKDIR /gh
ADD https://repo1.maven.org/maven2/com/graphhopper/graphhopper-web/${GRAPHHOPPER_VERSION}/graphhopper-web-${GRAPHHOPPER_VERSION}.jar graphhopper.jar
COPY config.yml ./
COPY custom_models ./custom_models
ENV JAVA_OPTS="-Xmx2g" OSM_FILE=/data/region.osm.pbf
EXPOSE 8989
CMD ["sh", "-c", "exec java $JAVA_OPTS -Ddw.graphhopper.datareader.file=$OSM_FILE -Ddw.graphhopper.graph.location=/graph-cache -jar graphhopper.jar server config.yml"]
