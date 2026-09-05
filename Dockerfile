# PocketBase za Railway — poslužuje i bazu i sam portal
FROM alpine:3.20

ARG PB_VERSION=0.40.2

RUN apk add --no-cache ca-certificates unzip wget

RUN wget -O /tmp/pb.zip \
      https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip \
 && unzip /tmp/pb.zip -d /pb/ \
 && rm /tmp/pb.zip

# Broj inačice portala.
# Ako nova objava ne uhvati izmijenjeni index.html (Railway zna posegnuti za
# spremljenim slojem od prošle gradnje), povećaj ovaj broj za jedan i objavi
# opet. Time se sve ispod ovoga gradi iznova.
ARG PORTAL_VERZIJA=2
RUN echo "portal ${PORTAL_VERZIJA}" > /pb/verzija.txt

# portal (index.html) — Railway ga preuzima iz repozitorija
COPY pb_public /pb/pb_public

# ispis u zapisu gradnje: veličina mora biti oko 200 KB, ne 950 KB
RUN ls -la /pb/pb_public

EXPOSE 8080

# Railway sam dodjeljuje port kroz PORT
CMD /pb/pocketbase serve --http=0.0.0.0:${PORT:-8080}
