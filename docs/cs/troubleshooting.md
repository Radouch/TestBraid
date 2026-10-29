# Řešení problémů

Většina problémů vzniká tím, že se nenahrál některý soubor, chybí skrytý soubor `.htaccess`, nebo PHP nemá právo zapisovat do některé složky. Příčinu obvykle prozradí chybový log PHP na vašem hostingu.

## Časté problémy

| Co vidíte | Co zkontrolovat |
| --- | --- |
| Prázdná stránka nebo stránka bez vzhledu | Znovu nahrajte složku `assets` (do veřejné složky) a `testbraid-backend/templates/index.html`, obojí ze **stejného** ZIPu. |
| `/api/health` zobrazí webovou stránku nebo „nenalezeno“ | Skrytý soubor `.htaccess` a složka `api` jsou ve veřejné složce; hosting povoluje přepisování adres v `.htaccess`; `basePath` v `app.json` odpovídá adrese. |
| Odkaz na test funguje, ale po znovunačtení hlásí „nenalezeno“ | Totéž co výše. Zkontrolujte také pravidla přepisování jiné aplikace v nadřazené složce. |
| Chyba týkající se backendu nebo konfigurace | Soukromá složka `testbraid-backend` leží vedle veřejné složky (nebo na ni ukazuje `bootstrap.local.php`); existují `vendor/` a `config/app.json`; `app.json` je platný JSON. |
| Nejde založit prvního autora ani se přihlásit | Web běží přes HTTPS; `testbraid-backend/config/setup.key` obsahuje instalační klíč (32–256 znaků) a zadali jste stejný instalační klíč; PHP smí zapisovat do `testbraid-backend/config/`. |
| Nejde uložit lekci nebo test | PHP smí zapisovat do `testbraid-backend/storage/`. |
| Nejde nahrát obrázek nebo video | Podporovaný formát (JPEG, PNG, WebP, MP4, WebM); velikost v mezích limitů z [Konfigurace](configuration.md#limity-nahrávání); volné místo na disku. |
| Obrázky nebo videa publikovaného testu se nezobrazují | Test je publikovaný; PHP smí zapisovat do složky `media` ve veřejné složce; je v ní soubor `.htaccess`; prohlížeč podporuje formát videa. |

U webu nainstalovaného na adrese typu `/kurzy/` musí souhlasit složka uvnitř veřejné složky, `basePath` v `app.json` a směrování v Apache. Pokud soukromá složka leží jinde, zkontrolujte také cestu v souboru `bootstrap.local.php`.

## Po neúspěšné aktualizaci

Použijte **aktualizační ZIP**, ne instalační. Ověřte, že se zachovaly složky `config` a `storage` v soukromé složce, `media` ve veřejné složce a případný `bootstrap.local.php`. Složku `vendor/` vyměňte celou; nemíchejte staré závislosti s novými. Viz [Aktualizace](upgrading.md).

## Bezpečnost a podpora

Pokud lze soubor ze soukromé složky skutečně otevřít ve webovém prohlížeči, **přestaňte instalaci používat**, dokud přístup neopravíte. Obrazovka Zabezpečení instalace umí otestovat neškodný kontrolní soubor; skutečné tajné soubory ke zkoumání nepoužívejte.

Při hlášení problému uveďte postup, jak ho vyvolat, související chybová hlášení a stavové kódy a popis hostingu. Nikdy neuvádějte hesla, instalační klíče, tokeny sessions ani soukromá data. Viz [Zabezpečení a zálohy](security-and-backups.md).
