# Mr Le Paon Invest

Sit envestisman Keyn Event: moun achte **aksyon** nan machandiz reyèl (egz: woulo twal spandex blan), epi chak fwa yon atik vann, kòb yo + benefis yo tonbe nan kont yo.
Pwojè sa a apa nèt ak keynevent.online: pwòp depo, pwòp pwojè Vercel, pwòp baz done.

## Sa sit la fè

- **Akèy (piblik):** aksyon ki disponib yo, kalkil, ak fòm "Mwen vle envesti". Envestisè a wè nimewo MonCash/NatCash la ak non moun nan, li peye, epi li mete **ID tranzaksyon an oswa nimewo ki fè peman an**.
- **Aktivasyon otomatik pa SMS:** telefòn ki resevwa SMS MonCash/NatCash yo voye yo sou `/api/app?action=sms-in&k=KLE` (adrès la nan *Admin → SMS otomatik*). Si SMS la koresponn ak ID tranzaksyon an, oswa ak nimewo ki peye a + montan egzak la, sit la kreye kont lan (ID + PIN) epi li bay aksyon yo poukont li. Envestisè a wè ID ak PIN li sou ekran an.
  - SMS ki soti nan yon nimewo telefòn òdinè make *sispèk* epi li pa aktive anyen.
  - Si SMS la rive anvan demann lan, demann lan aktive touswit lè l rive.
- **Kont envestisè (`#kont`):** konekte ak **telefòn OSWA ID (LP-001)** + PIN. Kont lan bloke 15 minit apre 5 move PIN. Li wè aksyon li yo ak 3 etap yo (twal la achte → nan magazen → vann), bous li, istorik, mesaj, epi li mande retrè sou WhatsApp.
- **Admin (`#admin`):** demann k ap tann (apwouve/refize), kole yon SMS ak men, mesaj pou envestisè yo, nouvo aksyon, dat chak etap pou chak aksyon, eta machandiz la (nòmal / an reta / pa disponib), envestisè yo (retrè, nouvo PIN), paramèt (maksimòm envestisè, jou pou tann, WhatsApp, mwayen peman), ak yon kopi done yo.

## Mete l sou Vercel

1. Mete fichye yo nan yon depo GitHub (egz: `mr-le-paon-invest`).
2. Sou vercel.com: **Add New → Project**, chwazi depo a, kite *Framework* sou **Other**.
3. **Storage → Create Database → Neon**, konekte l ak pwojè a (`DATABASE_URL` ap mete poukont li).
4. **Settings → Environment Variables:** ajoute `ADMIN_PASSWORD`.
5. **Deployments → Redeploy.**
6. Louvri `/#admin`, verifye mwayen peman yo, epi kopye adrès SMS la nan aplikasyon ki voye SMS yo sou telefòn nan.

## Pou devlopè

- `src/app.html` (+ `src/style.css.html`, `src/header.html`) → `python3 build.py` → `index.html`
- `lib/core.js`: kalkil ak lekti SMS · `lib/handlers.js`: API · `lib/store-pg.js`: Neon · `lib/store-memory.js` + `dev-server.js`: tès lokal
- Tès: `ADMIN_PASSWORD=test node test.js` · sèvè lokal: `ADMIN_PASSWORD=test node dev-server.js`
