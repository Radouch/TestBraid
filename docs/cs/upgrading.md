# Aktualizace

Použijte **aktualizační ZIP** (`upgrade`) z [GitHub Releases](https://github.com/Radouch/TestBraid/releases). Instalační ZIP nikdy nenahrávejte přes běžící web: přepsal by váš `config/app.json` a vrátil by ukázkovou lekci. Nejdřív si přečtěte poznámky k vydání, zda nová verze nevyžaduje zvláštní kroky.

## 1. Zálohujte instalaci

Stáhněte si kopii složek uvedených v [Zabezpečení a zálohy](security-and-backups.md#zálohování-a-obnova), hlavně `config` a `storage` v soukromé složce a `media` ve veřejné složce. Během zálohování a aktualizace neupravujte testy.

## 2. Vyměňte soubory aplikace

Rozbalte aktualizační archiv. Obsah jeho složky `www/` nahrajte do své veřejné složky (na stejné místo jako při instalaci) a obsah jeho složky `testbraid-backend/` do své soukromé složky.

**Důležité:**

- **Zachovejte** stávající složky `config/` a `storage/` v soukromé složce, nahranou složku `media/` ve veřejné složce a případný `bootstrap.local.php`. Aktualizační archiv tyto soubory konkrétní instalace záměrně neobsahuje.
- **Složku `vendor/` v soukromé složce vyměňte celou**, nespojujte nové soubory závislostí se starými.
- Aktualizujte zároveň `assets/` ve veřejné složce a `templates/index.html` v soukromé složce. Patří ke stejnému sestavení.
- Ponechte dodaná pravidla v souborech `.htaccess`. **Nepoužívejte** synchronizační nástroj s volbou „smazat chybějící soubory“ pro celý web.

Pokud starší instalace ještě má ve veřejné složce soubor `index.html`, smažte tento **zastaralý soubor aplikace**, jakmile je na místě nový `index.php`.

ZIP s vydáním už obsahuje závislosti PHP. Na hostingu není potřeba Composer ani sestavování.

## 3. Zkontrolujte výsledek

Znovu načtěte aplikaci, přihlaste se a ověřte, že existující lekce, rozpracovaný a publikovaný test stále fungují. Ověřte, že jsou dostupné obrázky a videa, a zkuste znovu načíst přímý odkaz na test. Zkontrolujte, že se nezměnil název webu, jazyky rozhraní a adresa.

Pokud web nefunguje, porovnejte nahrané soubory s archivem a podívejte se do [Řešení problémů](troubleshooting.md). V případě potřeby obnovte ověřenou, slučitelnou verzi aplikace a zálohu; trvalé soubory kvůli opravě neúspěšné aktualizace nemažte.
