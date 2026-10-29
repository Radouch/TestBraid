# Zabezpečení a zálohy

[English](../en/security-and-backups.md) · **Čeština**

TestBraid má veřejné testy pro studenty a chráněnou pracovní plochu pro autory. Testy a nahrané originály ukládá jako soukromé soubory, proto záleží na tom, jak jsou na hostingu rozmístěné složky.

## Soukromé soubory musí zůstat soukromé

Soukromou složku `testbraid-backend` umístěte všude, kde je to možné, **mimo veřejnou složku** (složku, kterou otevírají webové prohlížeče). Obsahuje autorské účty, nastavení, testy, média rozpracovaných testů a kód aplikace v PHP. Z prohlížeče mají být dostupné jen soubory, které jste nahráli do veřejné složky.

Ponechte dodaná pravidla Apache v souborech `.htaccess`, včetně toho ve složce `media` ve veřejné složce. Dejte PHP potřebná práva zápisu do složek, ale nepoužívejte neomezená oprávnění jako `777`. Používejte HTTPS.

Obrazovka **Zabezpečení instalace**, dostupná jen autorům, pomáhá zkontrolovat umístění složek a nabízí i nepovinný test neškodného souboru přes HTTP. Odpověď 403/404 z testované adresy dokazuje jen to, že **tato adresa** soubor nevydala; není to bezpečnostní certifikát. Omezení přístupu nikdy nezkoušejte tak, že byste žádali o skutečné soubory s přihlašovacími údaji.

## Ochrana autorských účtů

První účet se zakládá pomocí jednorázového instalačního klíče v `testbraid-backend/config/setup.key`. TestBraid tento soubor po založení účtu smaže; pokud zůstane, smažte ho sami. Účty jsou uložené v `testbraid-backend/config/authors.json` s hashovanými hesly.

Autorské operace vyžadují přihlášení a ochranu CSRF. Na produkčním serveru se používají zabezpečené cookies. Neexistuje veřejná registrace ani obecná správa účtů v prohlížeči.

Správce s přístupem přes SSH může další účty vytvořit soukromým nástrojem `bin/create-author.php`. Hesla nezadávejte jako argumenty příkazové řádky a neuvádějte je ve veřejných hlášeních chyb.

## Co znamená publikování

Anonymním návštěvníkům jsou dostupné jen publikované testy. Originály nahrané do knihovny médií zůstávají soukromé; média použitá v publikovaných testech se zpřístupňují jako veřejné kopie.

Publikované testy záměrně obsahují správné odpovědi, aby je mohl vyhodnotit prohlížeč. **TestBraid nepoužívejte k tajnému zkoušení ani k publikování materiálů, které musí zůstat důvěrné.**

## Zálohování a obnova

Tato místa zálohujte **společně**:

| Umístění | Obsah |
| --- | --- |
| `config` v soukromé složce | Nastavení webu a autorské účty |
| `storage` v soukromé složce | Testy, lekce, údaje o médiích a nahrané originály |
| `media` ve veřejné složce | Publikované kopie a jejich pravidla přístupu |
| `bootstrap.local.php` ve veřejné složce, pokud ho používáte | Vlastní umístění soukromé složky |

Během zálohování pozastavte úpravy testů, aby byla záloha konzistentní. Zálohy ukládejte mimo veřejnou složku, ideálně mimo hostingový účet, a občas vyzkoušejte obnovu.

Při obnově použijte verzi aplikace slučitelnou se zálohou dat, zachovejte oprávnění a zkontrolujte přihlášení autora a publikovaná média. Vestavěná úplná záloha ani obnova jedním kliknutím neexistuje.

Běžnou výměnu souborů popisuje [Aktualizace](upgrading.md).
