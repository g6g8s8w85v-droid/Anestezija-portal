# PocketBase za Railway — poslužuje i bazu i sam portal
FROM alpine:3.20

ARG PB_VERSION=0.40.2

RUN apk add --no-cache ca-certificates unzip wget

RUN wget -O /tmp/pb.zip \
      https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip \
 && unzip /tmp/pb.zip -d /pb/ \
 && rm /tmp/pb.zip

# --- osiguranje da svaka objava stvarno prekopira novi portal ---
# Railway sam dodaje oznaku zadnjeg commita. Kako se ona mijenja pri svakoj
# izmjeni na GitHubu, sve ispod ove linije gradi se iznova i spremnik gradnje
# ne može podvaliti staru datoteku.
ARG RAILWAY_GIT_COMMIT_SHA=nepoznato
# Rezervni ručni prekidač: ako ikad zatreba, povećaj broj za jedan.
ARG PORTAL_VERZIJA=3
RUN echo "${RAILWAY_GIT_COMMIT_SHA} / ${PORTAL_VERZIJA}" > /pb/verzija.txt

# portal (index.html) — Railway ga preuzima iz repozitorija
COPY pb_public /pb/pb_public

# ispis u zapisu gradnje: veličina mora biti oko 200 KB, ne 950 KB
RUN ls -la /pb/pb_public

EXPOSE 8080

# Railway sam dodjeljuje port kroz PORT
CMD /pb/pocketbase serve --http=0.0.0.0:${PORT:-8080}
