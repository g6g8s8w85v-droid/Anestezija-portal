/// <reference path="../pb_data/types.d.ts" />
/*
   JUTARNJE SLANJE DNEVNOG RASPOREDA PO SALAMA
   Odjel za anesteziologiju, reanimatologiju, intenzivnu medicinu i liječenje boli, OB Pula

   Ovo se vrti na poslužitelju, neovisno o tome je li itko prijavljen.
   Dvije rutine:

     1. svakih pet minuta provjeri je li došao sat slanja; ako jest, a raspored
        za taj dan je potvrđen i još nije poslan — pošalje ga i upiše vrijeme
     2. jednom dnevno obriše PDF-ove starije od zadanog broja dana

   Sve postavke (sat, uključenost, probna adresa, preslika, tko ne prima,
   stalni primatelji, čuvanje PDF-ova) čitaju se iz zbirke "postavke", pa se
   mijenjaju u portalu bez diranja poslužitelja.

   Poruka nosi raspored u samom tekstu, bez priloga: čita se na mobitelu bez
   otvaranja ičega, a filtri za neželjenu poštu blaže gledaju poruke bez
   privitka. Tko treba PDF za ispis, izradi ga u portalu.

   POŠTA NE IDE SMTP-om. Railway blokira odlazne poštanske portove (587 i 465
   isteknu, 443 je otvoren), pa PocketBaseov ugrađeni mailer ovdje ne može
   raditi. Poruke se predaju Brevu običnim web pozivom na port 443.
   Ključ stoji u varijabli okoline BREVO_KLJUC, nikad u kodu.
   Adresa i ime pošiljatelja uzimaju se iz Mail settings, da sve ostane na
   jednom mjestu.

   Ručno pokretanje za probu: Dashboard → Settings → Crons.
*/

/* Koliko dugo nakon zadanog trenutka rutina još smije poslati. Provjera se
   vrti svakih pet minuta, ali prozor je širi: ako se poslužitelj baš tada
   ponovno pokretao ili je mreža zapela, jutro ne smije proći bez poruke.
   Nakon isteka prozora odustaje — bolje ništa nego raspored u podne. */

const PROZOR_MINUTA = 60;

/* Koliko vrijeme zadnje izmjene smije biti novije od vremena slanja a da se
   to još ne računa kao prava izmjena. Samo spremanje slanja dira zapis, pa
   mu "updated" bude koju milisekundu veći od "poslano"; bez ovog dopuštenja
   bi rutina svaki poslani dan odmah držala izmijenjenim. */
const DOPUST_IZMJENE_MS = 10000;

/* Je li dan mijenjan nakon što je poslan. */
function mijenjanNakonSlanja(dan){
  const poslano = String(dan.getString("poslano") || "");
  if (!poslano) return false;
  const kada = String(dan.getString("updated") || "");
  if (!kada) return false;
  const a = Date.parse(kada), b = Date.parse(poslano);
  if (!isFinite(a) || !isFinite(b)) return false;
  return a - b > DOPUST_IZMJENE_MS;
}

// ---------------------------------------------------------------- pomoćno

/* Bez padStart — PocketBaseov JavaScript ne poznaje svaku noviju funkciju,
   a ovo se poziva pri svakom formatiranju datuma. */
function dvo(n){ n = String(n); return n.length < 2 ? "0" + n : n; }

function danasLokalno(){
  const d = new Date();
  return d.getFullYear() + "-" + dvo(d.getMonth() + 1) + "-" + dvo(d.getDate());
}

/* JSON polje PocketBase ne vraća kao obični objekt. Ovisno o verziji dolazi
   kao poseban tip s metodom String(), kao tekst, ili kao niz bajtova. Zato se
   redom pokušava sve troje; prvi oblik koji da smislen rezultat se uzima. */
function citajJson(zapis, polje){
  const v = zapis.get(polje);
  if (v === null || v === undefined) return {};

  /* 1. već upotrebljiv objekt */
  if (typeof v === "object" && v !== null && v.postavke !== undefined) return v;

  /* 2. tip s vlastitim ispisom (JSONRaw) */
  try {
    if (typeof v.String === "function") {
      const s = v.String();
      if (s && s.charAt(0) === "{") return JSON.parse(s);
    }
  } catch (e) {}

  /* 3. obični tekst */
  try {
    const s = String(v);
    if (s && s.charAt(0) === "{") return JSON.parse(s);
  } catch (e) {}

  /* 4. niz bajtova */
  try {
    const niz = JSON.parse(JSON.stringify(v));
    if (Array.isArray(niz) && niz.length) {
      let s = "";
      for (let i = 0; i < niz.length; i++) s += String.fromCharCode(niz[i]);
      if (s.charAt(0) === "{") return JSON.parse(decodeURIComponent(escape(s)));
    }
  } catch (e) {}

  console.log("[raspored] polje " + polje + " se ne može pročitati (tip: " +
              (typeof v) + ")");
  return {};
}

function postavke(){
  let z = null;
  try { z = $app.findFirstRecordByFilter("postavke", "kljuc = 'glavne'"); }
  catch (e) { return null; }
  if (!z) return null;
  const p = citajJson(z, "podaci");
  return (p && p.postavke) ? p.postavke : {};
}

function danZaDatum(datum){
  try { return $app.findFirstRecordByFilter("rasporedDani", "datum = {:d}", {d: datum}); }
  catch (e) { return null; }
}

const DANI_PUNI = ["Nedjelja","Ponedjeljak","Utorak","Srijeda","Četvrtak","Petak","Subota"];

function nazivDana(datum){
  const [g, m, d] = datum.split("-").map(Number);
  const dt = new Date(g, m - 1, d);
  return DANI_PUNI[dt.getDay()] + ", " + d + "." + m + "." + g + ".";
}

/* Raspored tog dana: [{sala, lijecnikId}], redom kojim je upisivan. */
function stavkeDana(datum){
  try {
    return $app.findRecordsByFilter("raspored", "datum = {:d}", "created", 500, 0, {d: datum})
      .map(function(r){ return {sala: r.getString("sala"), lijecnik: r.getString("lijecnik")}; });
  } catch (e) { return []; }
}

function lijecnik(id){
  try { return $app.findRecordById("users", id); } catch (e) { return null; }
}

// ---------------------------------------------------------------- poruka

function tijeloPoruke(datum, stavke, napomena, salePopis){
  const poSali = {};
  stavke.forEach(function(s){
    (poSali[s.sala] = poSali[s.sala] || []).push(s.lijecnik);
  });
  /* redoslijed sala iz postavki, pa sve što je ostalo */
  const red = salePopis.slice();
  Object.keys(poSali).forEach(function(s){ if (red.indexOf(s) < 0) red.push(s); });

  let h = '<div style="font:15px -apple-system,Segoe UI,Roboto,sans-serif;color:#1a1f24">';
  h += '<p style="font-size:17px;font-weight:700;margin:0 0 14px">Raspored po salama — ' +
       nazivDana(datum) + '</p>';
  h += '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse">';
  red.forEach(function(sala){
    const ljudi = (poSali[sala] || []).map(function(id){
      const l = lijecnik(id);
      return l ? l.getString("name") : "(obrisan)";
    });
    h += '<tr>' +
         '<td style="padding:5px 18px 5px 0;vertical-align:top;font-weight:700;white-space:nowrap">' +
         sala + '</td>' +
         '<td style="padding:5px 0;vertical-align:top">' +
         (ljudi.length ? ljudi.join("<br>") : '<span style="color:#7a858e">—</span>') +
         '</td></tr>';
  });
  h += '</table>';
  if (napomena) {
    h += '<p style="margin:16px 0 0;padding:10px 14px;background:#f4f2fa;' +
         'border-left:3px solid #6b5b9e"><b>Napomena</b><br>' + napomena + '</p>';
  }
  h += '</div>';
  return h;
}

/* Komu ide poruka. Ista pravila kao u portalu. */
function primatelji(stavke, p){
  const proba = String(p.probnaPosta || "").trim();
  if (proba) return {prima: [proba], preslika: "", proba: true};

  const nePrimaju = Array.isArray(p.nePrimaju) ? p.nePrimaju : [];
  const vidjeni = {}, adrese = [];
  stavke.forEach(function(s){
    if (vidjeni[s.lijecnik]) return;
    vidjeni[s.lijecnik] = true;
    if (nePrimaju.indexOf(s.lijecnik) >= 0) return;
    const l = lijecnik(s.lijecnik);
    const a = l ? String(l.getString("posta") || "").trim() : "";
    if (a) adrese.push(a);
  });
  (Array.isArray(p.dodatnePoste) ? p.dodatnePoste : []).forEach(function(a){
    a = String(a || "").trim();
    if (a && adrese.indexOf(a) < 0) adrese.push(a);
  });
  return {prima: adrese, preslika: String(p.preslikaPosta || "").trim(), proba: false};
}

// ---------------------------------------------------------------- slanje

function posaljiZaDatum(datum, razlog, prisilno){
  const p = postavke();
  if (!p) { console.log("[raspored] postavke se ne mogu pročitati"); return false; }

  const dan = danZaDatum(datum);
  if (!dan) { console.log("[raspored] " + datum + ": nema zapisa o danu"); return false; }
  if (!dan.getBool("potvrdjen")) {
    console.log("[raspored] " + datum + ": nije potvrđen — ne šaljem");
    return false;
  }
  /* Već poslan dan preskačemo — osim ako je od tada mijenjan. Tada ide
     ispravak, jer bi inače promjena učinjena nakon slanja ostala samo u
     portalu, a kolege bi u rukama imale staru verziju. */
  if (!prisilno && String(dan.getString("poslano") || "")) {
    if (!mijenjanNakonSlanja(dan)) {
      console.log("[raspored] " + datum + ": već poslano " + dan.getString("poslano") +
                  ", od tada nije mijenjano");
      return false;
    }
    console.log("[raspored] " + datum + ": mijenjan nakon slanja " +
                dan.getString("poslano") + " — šaljem ispravak");
  }

  const stavke = stavkeDana(datum);
  if (!stavke.length) { console.log("[raspored] " + datum + ": nitko nije raspoređen"); return false; }

  const komu = primatelji(stavke, p);
  if (!komu.prima.length) {
    console.log("[raspored] " + datum + ": nitko od raspoređenih nema adresu");
    return false;
  }

  const kljuc = $os.getenv("BREVO_KLJUC");
  if (!kljuc) {
    console.log("[raspored] nema varijable BREVO_KLJUC — slanje nije postavljeno");
    return false;
  }

  const naslovljeno = komu.preslika ? [{email: komu.preslika}]
                                    : komu.prima.map(function(a){ return {email: a}; });
  const skriveno = komu.preslika ? komu.prima.map(function(a){ return {email: a}; }) : [];

  const tijelo = {
    sender: {
      email: $app.settings().meta.senderAddress,
      name:  $app.settings().meta.senderName || "Raspored anestezije"
    },
    to:          naslovljeno,
    subject:     "Raspored po salama — " + nazivDana(datum),
    htmlContent: tijeloPoruke(datum, stavke, dan.getString("napomena"),
                              Array.isArray(p.sale) ? p.sale : [])
  };
  if (skriveno.length) tijelo.bcc = skriveno;
  if (komu.preslika)   tijelo.replyTo = {email: komu.preslika};

  try {
    const odg = $http.send({
      url:     "https://api.brevo.com/v3/smtp/email",
      method:  "POST",
      headers: {"api-key": kljuc, "content-type": "application/json",
                "accept": "application/json"},
      body:    JSON.stringify(tijelo),
      timeout: 30
    });
    if (odg.statusCode < 200 || odg.statusCode >= 300) {
      console.log("[raspored] " + datum + ": Brevo je odbio (" + odg.statusCode + ") — " +
                  String(odg.raw || "").slice(0, 300));
      return false;
    }
  } catch (e) {
    console.log("[raspored] " + datum + ": slanje nije uspjelo — " + e);
    return false;
  }

  dan.set("poslano", new Date().toISOString());
  try { $app.save(dan); } catch (e) { console.log("[raspored] vrijeme slanja nije upisano — " + e); }

  console.log("[raspored] " + datum + ": poslano (" + razlog + "), primatelja: " +
              komu.prima.length + (komu.proba ? " — PROBA" : ""));
  return true;
}

// ---------------------------------------------------------------- izvoz

/* Jutarnji prolaz. Vraća true ako je poruka otišla. */
function jutro(){
  const p = postavke();
  if (!p) { console.log("[raspored] postavke se ne mogu pročitati"); return false; }
  if (!p.slanjeUkljuceno) {
    console.log("[raspored] automatsko slanje je isključeno u Postavkama");
    return false;
  }

  const sat = Number(p.satSlanja);
  const min = Number(p.minutaSlanja) || 0;
  if (!isFinite(sat)) { console.log("[raspored] sat slanja nije postavljen"); return false; }

  const sad = new Date();
  const doSada = sad.getHours() * 60 + sad.getMinutes();
  const trazeno = sat * 60 + min;
  if (doSada < trazeno || doSada >= trazeno + PROZOR_MINUTA) {
    console.log("[raspored] nije vrijeme — sada " + dvo(sad.getHours()) + ":" +
                dvo(sad.getMinutes()) + ", zadano " + dvo(sat) + ":" + dvo(min) +
                " (prozor " + PROZOR_MINUTA + " min)");
    return false;
  }

  /* Šalje se raspored za DANAŠNJI dan — onaj složen i potvrđen ranije.
     Ako je već poslan, posaljiZaDatum to sam prepozna i ne ponavlja. */
  return posaljiZaDatum(danasLokalno(), "po satnici");
}

/* Brisanje starih PDF-ova. Zapis o danu ostaje, odlazi samo prilog. */
function ciscenje(){
  const p = postavke();
  const dana = p ? Number(p.cuvajPdfDana) : 30;
  if (!isFinite(dana) || dana <= 0) return 0;   // 0 = čuvaj zauvijek

  const granica = new Date();
  granica.setDate(granica.getDate() - dana);
  const g = granica.getFullYear() + "-" + dvo(granica.getMonth() + 1) + "-" + dvo(granica.getDate());

  let stari = [];
  try {
    stari = $app.findRecordsByFilter("rasporedDani", "datum < {:g} && pdf != ''", "datum", 200, 0, {g: g});
  } catch (e) { return 0; }

  stari.forEach(function(z){
    z.set("pdf", null);
    try { $app.save(z); } catch (e) { console.log("[raspored] čišćenje: " + e); }
  });
  if (stari.length) console.log("[raspored] obrisano PDF-ova: " + stari.length);
  return stari.length;
}

/* Ručno slanje iz portala. Vraća opis onoga što se dogodilo, da portal ima
   što pokazati korisniku umjesto da nagađa. */
function rucno(datum){
  const ispravak = (function(){
    const d = danZaDatum(datum);
    return !!(d && String(d.getString("poslano") || ""));
  })();
  const uspjeh = posaljiZaDatum(datum, "ručno", true);
  return {ok: uspjeh, ispravak: ispravak};
}

module.exports = { jutro: jutro, ciscenje: ciscenje,
                   posaljiZaDatum: posaljiZaDatum, rucno: rucno };
