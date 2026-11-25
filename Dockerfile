# PocketBase za Railway — poslužuje i bazu i sam portal
FROM alpine:3.20

ARG PB_VERSION=0.40.2

ARG PORTAL_VERZIJA=7
RUN apk add --no-cache ca-certificates unzip wget tzdata && echo "gradnja ${PORTAL_VERZIJA}"

# Poslužitelj inače radi po UTC-u, a jutarnje slanje mora ići po našem satu.
ENV TZ=Europe/Zagreb

RUN wget -O /tmp/pb.zip \
      https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip \
 && unzip /tmp/pb.zip -d /pb/ \
 && rm /tmp/pb.zip

# --- osiguranje da svaka objava stvarno prekopira novi portal ---
# Railwayevu oznaku commita ne prosljeđuje gradnji, pa se na nju nije moguće
# osloniti — provjereno 25.11.2026., kad je gradnja "uspjela" a donijela staru
# datoteku. Zato vrijedi samo broj PORTAL_VERZIJA gore: POVEĆAJ GA ZA JEDAN pri
# svakoj izmjeni u pb_public ili pb_hooks. Stoji namjerno uz prvu naredbu, da
# poništi baš sve slojeve ispod sebe.

# portal (index.html) — Railway ga preuzima iz repozitorija
COPY pb_public /pb/pb_public

# rutine koje se vrte na poslužitelju (jutarnje slanje rasporeda, čišćenje)
COPY pb_hooks /pb/pb_hooks

# Otisak gradnje na javnoj adresi: anestezijapu.up.railway.app/verzija.txt
# Odande se u svakom trenutku vidi koja je gradnja stvarno gore, bez Console.
RUN echo "gradnja ${PORTAL_VERZIJA}" > /pb/pb_public/verzija.txt \
 && ls -la /pb/pb_public /pb/pb_hooks >> /pb/pb_public/verzija.txt \
 && cat /pb/pb_public/verzija.txt

EXPOSE 8080

# Railway sam dodjeljuje port kroz PORT
CMD /pb/pocketbase serve --http=0.0.0.0:${PORT:-8080}
