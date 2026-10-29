# Proč TestBraid

[English](../en/why-testbraid.md) · **Čeština**

TestBraid je **jednoduchý nástroj na tvorbu testů**. Testy sestavíte z textu, obrázků a videí, publikujete je na vlastním webu a kdokoli s odkazem je může vyplnit a hned uvidí, které odpovědi byly správné. Víc toho záměrně nedělá.

## Proč vznikl

Mnoho online nástrojů na formuláře a kvízy omezuje, odkud může obsah pocházet. Například Google Formuláře umí zobrazit jen videa z YouTube. Pokud je vaším materiálem vlastní video, nahrávka, kterou nesmíte zveřejnit na videoplatformě, nebo prostě obrázek ve vašem počítači, takové nástroje vám házejí klacky pod nohy.

TestBraid taková omezení nemá. Každý obrázek a video v testu je soubor, který **sami nahrajete** na svůj hosting (obrázky JPEG, PNG nebo WebP, videa MP4 nebo WebM). Nic není potřeba nejdřív zveřejnit na YouTube ani jinde. Vaše testy a soubory zůstávají na vašem hostingu, pod vaší kontrolou.

## K čemu se hodí

- **Kvízy k samostatnému ověření znalostí s obrázky a videi:** poznávání rostlin, ptáků, dopravních značek, hudebních nástrojů, znakového jazyka, sportovních pohybů a čehokoli dalšího, co je snazší ukázat než popsat.
- **Učitelé, lektoři, kroužky a rodiče**, kteří chtějí sdílet cvičné testy odkazem, aniž by lidé, kteří je vyplňují, museli cokoli nastavovat.
- **Studenti, kteří nemají být sledováni.** Studenti se neregistrují ani nepřihlašují. Jejich odpovědi se vyhodnocují v jejich vlastním prohlížeči a nikdy se neposílají na server ani vám.
- **Běžný webhosting.** TestBraid běží na obvyklém hostingu s Apache a PHP bez databáze. Vaše data tvoří sada souborů, které zálohujete jejich zkopírováním.

## K čemu není určen

- **Zkoušky a známkované testy.** Publikovaný test obsahuje správné odpovědi, takže je odhodlaný student dokáže najít. TestBraid používejte jen k procvičování a samostatnému ověřování znalostí.
- **Sběr výsledků.** Ničí odpovědi ani výsledky se neukládají. TestBraid nezaznamenává, kdo test vyplnil ani jak dopadl.
- **Studentské účty a sledování pokroku.** Neexistují účty studentů, třídy, úkoly, termíny ani přehledy pokroku.
- **Týmy správců.** Web má jen autorské účty a všechny mají stejná práva. První se zakládá v prohlížeči; další účty může přidat jen někdo s přístupem k serveru přes SSH. Neexistují role, oprávnění ani obrazovky pro správu účtů.
- **Jiné typy otázek.** Otázky jsou buď s výběrem odpovědí (jedna nebo více správných), nebo s přiřazováním dvojic. Neexistují psané odpovědi, časové limity ani částečné body. Text je prostý text bez formátování a odkazů.

## Není to LMS

Systém pro řízení výuky (LMS), například Moodle, spravuje kurzy, studenty, známky a pokrok. TestBraid nic z toho nedělá a nikdy to nemá v plánu. Pokud tyto funkce potřebujete, použijte LMS.

TestBraid je záměrně malý: jeden web, pár autorů, testy z textu, obrázků a videí a nic, co by museli spravovat lidé, kteří testy vyplňují. Pokud je to přesně to, co potřebujete, začněte [Rychlým startem](quick-start.md).
