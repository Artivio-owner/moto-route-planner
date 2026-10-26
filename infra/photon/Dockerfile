# Photon: поиск адресов по данным OSM (R-03). Индекс лежит в /photon/photon_data
# (как получить: docs/deploy.md). Не проверено в среде разработки: индекс недоступен.
FROM eclipse-temurin:21-jre
ARG PHOTON_VERSION=0.7.4
WORKDIR /photon
ADD https://github.com/komoot/photon/releases/download/${PHOTON_VERSION}/photon-${PHOTON_VERSION}.jar photon.jar
ENV JAVA_OPTS="-Xmx2g"
EXPOSE 2322
CMD ["sh", "-c", "exec java $JAVA_OPTS -jar photon.jar -listen-ip 0.0.0.0 -languages ru,en"]
