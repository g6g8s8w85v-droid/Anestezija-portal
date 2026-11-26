/// <reference path="../pb_data/types.d.ts" />
/*
   JUTARNJE SLANJE DNEVNOG RASPOREDA PO SALAMA — prijava rutina
   Odjel za anesteziologiju, reanimatologiju, intenzivnu medicinu i liječenje boli, OB Pula

   Ovdje stoje samo dvije prijave. Sva logika je u raspored_alat.js, jer
   PocketBase svaku rutinu izvršava u zasebnom okruženju koje ne vidi ništa
   izvan same funkcije — zato se potrebno učitava unutar nje, s require.

   Postavljanje i objašnjenje: UPUTA-AUTOMATSKO-SLANJE.md
*/

console.log("[raspored] rutine prijavljene");

/* Svakih pet minuta: je li došao sat slanja i treba li što poslati. */
cronAdd("raspored-jutro", "*/5 * * * *", function(){
  require(__hooks + "/raspored_alat.js").jutro();
});

/* Ručno slanje iz portala — isti put i isti izgled kao jutarnje.
   Smiju ga pozvati samo voditelj i nositelj ovlasti za raspored. */
routerAdd("POST", "/api/raspored-posalji", function(e){
  const korisnik = e.auth;
  if (!korisnik || !(korisnik.getBool("voditelj") || korisnik.getBool("raspored"))) {
    return e.json(403, {poruka: "Nemate ovlast za slanje rasporeda."});
  }
  let datum = "";
  try { datum = String((e.requestInfo().body || {}).datum || ""); } catch (err) {}
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) {
    return e.json(400, {poruka: "Nedostaje ispravan datum."});
  }
  const odg = require(__hooks + "/raspored_alat.js").rucno(datum);
  return e.json(odg.ok ? 200 : 422,
    odg.ok ? {poruka: odg.ispravak ? "Ispravak je poslan." : "Raspored je poslan.",
              ispravak: odg.ispravak}
           : {poruka: "Slanje nije uspjelo — razlog je u zapisniku poslužitelja."});
}, $apis.requireAuth());

/* Jednom dnevno: brisanje starih PDF-ova. */
cronAdd("raspored-ciscenje", "20 3 * * *", function(){
  require(__hooks + "/raspored_alat.js").ciscenje();
});
