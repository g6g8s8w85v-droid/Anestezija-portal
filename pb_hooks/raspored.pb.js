
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

/* Jednom dnevno: brisanje starih PDF-ova. */
cronAdd("raspored-ciscenje", "20 3 * * *", function(){
  require(__hooks + "/raspored_alat.js").ciscenje();
});
