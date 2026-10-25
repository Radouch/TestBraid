# Instalace TestBraidu do kořene i podadresáře (Apache / PHP hosting)

Jednou sestavený frontend funguje na `/`, `/tichotesty/` i `/courses/prasopes/`. Na cílovém hostingu se Vue znovu nebuildí. Tento návod platí pro větev PR #74; vydaný release ZIP zatím není k dispozici.

## 1. Dvě části instalace

Výstup `node scripts/prepare-deployment.mjs --initial-install` obsahuje:

- `deployment-package/www/`: **obsah** nahraj do požadované veřejné složky (např. `www/tichotesty/`).
- `deployment-package/testbraid-backend/`: **obsah** nahraj do soukromé složky podle svého výběru (např. `tichotesty-backend/` mimo veřejné `www/`).

Pro současné dvě nezávislé instalace na jedné doméně:

```text
/home/account/
├── www/                              # veřejný kořen domény
│   ├── index.html                    # původní instalace; ponechat
│   ├── .htaccess
│   └── tichotesty/
│       ├── .htaccess
│       ├── index.php
│       ├── backend-path.php          # sdílený aplikační resolver; nepřepisovat ručně
│       ├── bootstrap.local.php       # nastavení správce; mimo distribuční ZIP
│       ├── bootstrap.local.example.php
│       ├── api/index.php
│       ├── assets/
│       └── locales/
├── testbraid-backend/                # původní backend; ponechat
└── tichotesty-backend/               # backend nové instalace
    ├── config/app.json
    ├── src/
    ├── public/index.php
    ├── templates/index.html
    ├── vendor/
    ├── .htaccess
    └── security-probe.txt
```

Při běžné aktualizaci je nutné zachovat existující `bootstrap.local.php`, `config/`, `storage/`, `vendor/` a nahraná média. **Nesynchronizuj s mazáním** a nepřepisuj soukromý `authors.json`.

## 2. Jediné nastavení cesty k backendu

V veřejném adresáři TestBraidu vytvoř z `bootstrap.local.example.php` soubor `bootstrap.local.php` a nastav v něm `backendPath`:

```php
<?php
return [
    'backendPath' => '../../tichotesty-backend',
];
```

Cesta se vyhodnocuje **vzhledem k adresáři veřejné instalace** (zde `www/tichotesty/`), nikoli k `api/`. Lze uvést také absolutní cestu na serveru, pokud ji hosting zpřístupňuje PHP. Název backendového adresáře je libovolný. **Není nutné měnit `index.php`, `api/index.php` ani nastavovat systémovou proměnnou.** Oba soubory čtou stejnou konfiguraci přes `backend-path.php`.

Soubor `bootstrap.local.php` není součástí distribučního balíčku ani repozitáře; při aktualizaci se nepřepisuje. Jde o místní PHP konfiguraci: přístup přes HTTP zakazuje dodávaný `.htaccess` a samotné `return` bez výstupu údaje nezveřejňuje při správně fungujícím PHP. Do souboru nevkládej hesla.

Pro starší instalaci bez `bootstrap.local.php` zůstává kompatibilní původní výchozí cesta `../testbraid-backend` vzhledem k veřejné složce a volitelná proměnná `TESTBRAID_BACKEND_ENTRY`. Pokud existuje `bootstrap.local.php`, má přednost.

## 3. URL podadresář v soukromém app.json

V `tichotesty-backend/config/app.json` nastav:

```json
"basePath": "/tichotesty"
```

Pro doménový kořen použij `"/"`; cesta nesmí obsahovat hostname. Zachovej ostatní položky `site`, `uploads` a `uiLanguages`. Případná explicitní proměnná `TESTBRAID_BASE_PATH` musí mít stejnou hodnotu jako nastavení.

## 4. Apache a první instalace

- Ve veřejném adresáři musí být dodávaný `.htaccess`, `index.php`, `backend-path.php`, `api/index.php`, `assets/` a `locales/`. **Nekopíruj tam** statický `frontend/dist/index.html`: šablona patří soukromě do `templates/index.html`.
- V backendu spusť `composer install --no-dev --optimize-autoloader`, pokud `vendor/` není součástí připraveného balíčku; ověř, že funguje `vendor/autoload.php`.
- Je-li v kořeni domény **jiná Vue instalace** s pravidlem typu `RewriteRule ^ index.html [END]`, přidej k jejímu poslednímu SPA pravidlu výjimku pro `/tichotesty`, například `RewriteCond %{REQUEST_URI} !^/tichotesty(/|$)`. Nezastavuj zpracování pravidel v podadresáři pravidlem `[END]` v rodičovském `.htaccess`.
- Pro novou instalaci obsahuje `--initial-install` soukromé `config/app.json`. Při aktualizacích používej balíček **bez** tohoto přepínače.

## 5. Dobrovolná diagnostika zabezpečení

Ve správě testů je sekce **Zabezpečení instalace**, kde se tlačítkem spustí kontrola. Kontroluje fyzické umístění backendu a úložiště vůči odhadovanému veřejnému kořeni, přítomnost `.htaccess` a známého zákazového pravidla, a přítomnost neškodného `security-probe.txt`.

Případný HTTP test provádí **prohlížeč** pouze vůči jedné správcem zadané cestě na téže doméně, například:

`/tichotesty-backend/security-probe.txt`

Pokud server vrátí přesný obsah kontrolního souboru, backend je na této adrese veřejně dostupný. HTTP 403/404 znamená pouze to, že **tato konkrétní URL** obsah nezpřístupňuje; jiné URL nebo Apache alias mohou stále existovat. `DOCUMENT_ROOT`, `.htaccess` ani tento jednorázový test nejsou samy o sobě definitivním důkazem zabezpečení.

**Kontrola je dobrovolná, její výsledek neblokuje instalaci ani API.** Rozhodnutí a odpovědnost za provoz jsou na správci. Doporučená varianta je umístění backendu mimo celý veřejný webový kořen. Alternativně může být chráněn pravidlem `.htaccess`, jehož skutečnou účinnost je potřeba ověřit. Pravidla nikdy nesmí být považována za účinná pouze proto, že soubor existuje.

## 6. Ověření po nasazení

1. `/tichotesty/api/health` vrátí `{"status":"ok","service":"testbraid-api"}`.
2. Otevři `/tichotesty/`, `/tichotesty/admin` a obnov přímý odkaz klávesou F5.
3. Ověř přihlášení, odhlášení a současné přihlášení do instalace v kořeni domény.
4. Založ test, nahraj obrázek/video, publikuj a přehraj publikované MP4 včetně přeskakování.
5. V administraci případně spusť **Zabezpečení instalace**; nikde se nezobrazují interní cesty ani soukromé soubory.
6. Proveď zálohu soukromého `config/`, `storage/` a veřejných médií.

### Migrace z dočasné větve diagnostics/tichotesty-backend-path

Nynější dočasné `index.php` a `api/index.php` nahraď verzemi z `feature/runtime-subpath-installation`, společně s novým `backend-path.php` a ostatními soubory z distribučního balíčku. Před návštěvou webu vytvoř `www/tichotesty/bootstrap.local.php` s cestou `../../tichotesty-backend`. Oba vstupní soubory pak budou mít správnou cestu bez ručních úprav. Současně aktualizuj `tichotesty-backend/src/`, aby nová diagnostika fungovala. Původní data a konfiguraci zachovej.
