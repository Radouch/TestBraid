# Rychlý start

[English](../en/quick-start.md) · **Čeština**

TestBraid nainstalujete na běžný webhosting asi za deset minut. Stačí nahrát soubory a vytvořit jeden malý textový soubor. Nepotřebujete databázi, Node.js ani příkazový řádek.

**Potřebujete:** webhosting s Apache a PHP, HTTPS a možnost nahrávat na něj soubory (přes SFTP nebo správce souborů vašeho hostingu).

## Pojmy používané v tomto návodu

- **Adresa webu:** adresa, kterou lidé zadávají do prohlížeče, aby otevřeli váš web, například `https://example.org`. Všude níže ji nahraďte svou adresou.
- **Veřejná složka:** složka na vašem hostingu, jejíž soubory může kdokoli otevřít ve webovém prohlížeči na adrese vašeho webu. Její název určil poskytovatel hostingu. Často se jmenuje `www`, `public_html`, `htdocs` nebo `web`. Pokud si nejste jisti, která složka to je, zeptejte se poskytovatele hostingu.
- **Soukromá složka:** složka `testbraid-backend` ze ZIPu. Obsahuje vaše nastavení, účty, testy a nahrané soubory. **Nesmí** ležet uvnitř veřejné složky, aby ji nikdo nemohl otevřít v prohlížeči.
- **Instalační klíč:** tajný text, který si jednou vymyslíte a kterým při zakládání prvního účtu prokážete, že web patří vám.

## 1. Stažení

Stáhněte `testbraid-vX.Y.Z-install.zip` z [GitHub Releases](https://github.com/Radouch/TestBraid/releases) a rozbalte ho ve svém počítači. Pro nový web použijte **instalační** ZIP (`install`). **Aktualizační** ZIP (`upgrade`) slouží jen k aktualizaci webu, který už běží.

ZIP obsahuje dvě složky:

| Složka v ZIPu | Co to je | Kam patří na hostingu |
| --- | --- | --- |
| `www/` | Samotný web | Její **obsah** patří do vaší veřejné složky, ať se jmenuje jakkoli |
| `testbraid-backend/` | Soukromá složka | **Celá složka** patří vedle veřejné složky, ne dovnitř |

Název `www` je v ZIPu jen zástupný. Nevadí, když se vaše veřejná složka jmenuje jinak.

## 2. Nahrání

Pokud se vaše veřejná složka jmenuje například `public_html`, má hosting nakonec vypadat takto:

```text
váš-hostingový-účet/
├── public_html/          ← vaše veřejná složka: sem patří OBSAH složky www/ ze ZIPu
│   ├── index.php
│   ├── api/
│   ├── media/
│   └── …
└── testbraid-backend/    ← soukromá složka: sem nahrajte CELOU složku
```

- Nahrajte do veřejné složky všechno, co je **uvnitř** složky `www/` ze ZIPu. Nenahrávejte samotnou složku `www`. Nezapomeňte na skryté soubory `.htaccess`; některé správce souborů je zobrazují, až když to zapnete.
- **Celou** složku `testbraid-backend` nahrajte vedle veřejné složky, jak je vidět výše.

Pokud soukromou složku nemůžete umístit vedle veřejné složky, nebo chcete TestBraid provozovat na adrese typu `https://example.org/testy/`, přečtěte si [Instalaci](installation.md).

## 3. Vytvoření instalačního klíče

TestBraid nemá veřejnou registraci. Místo toho uložíte instalační klíč na server, kam soubory můžete nahrávat jen vy:

1. Ve svém počítači vytvořte prostý textový soubor s názvem `setup.key`.
2. Napište nebo vložte do něj **jeden řádek alespoň 32 náhodných znaků**. Tento řádek je váš instalační klíč. Dobře poslouží generátor hesel. Ukázka formátu: `p8Q2vX7mLr4tZ9wKc3Nf6yHb1Jd5Sg0aE`. Tuto ukázku nepoužívejte.
3. Nahrajte soubor do složky `config` uvnitř soukromé složky, takže skončí v `testbraid-backend/config/setup.key`.

Instalační klíč mějte po ruce, budete ho potřebovat v dalším kroku.

## 4. Založení autorského účtu

**Autorský účet** je účet, pod kterým se přihlašujete, abyste mohli vytvářet a upravovat testy. Návštěvníci, kteří testy vyplňují, žádný účet nepotřebují.

1. Otevřete `https://example.org/admin` (adresu svého webu s `/admin` na konci).
2. Vyplňte formulář:
   - **Uživatelské jméno:** libovolné jméno podle vaší volby. Použijte písmena bez diakritiky, číslice, tečky, pomlčky nebo podtržítka, bez mezer.
   - **Heslo:** libovolné heslo podle vaší volby, alespoň 12 znaků dlouhé.
   - **Jednorázový instalační klíč:** vložte instalační klíč z kroku 3.
3. Klikněte na **Vytvořit prvního autora**. Tím jste přihlášeni. Příště se přihlásíte na stejné adrese zvoleným uživatelským jménem a heslem.

Instalační klíč funguje jen jednou. Po založení účtu TestBraid soubor `setup.key` ze soukromé složky smaže. Pokud tam soubor zůstal, smažte ho sami. Uživatelské jméno a heslo si zapamatujte: odkaz „zapomenuté heslo“ neexistuje.

## 5. Prohlídka

Nová instalace obsahuje dvě **ukázkové lekce**, jednu českou a jednu anglickou, obě se stejnými dvěma krátkými testy s obrázky a videi. Web zobrazí lekci v jazyce zvoleném v nabídce nahoře na stránce. Testy jsou už publikované, takže je vidí každý:

- Otevřete adresu svého webu a vyplňte ukázkové testy tak, jak by to udělal návštěvník.
- Přihlaste se na `https://example.org/admin` a otevřete ukázkové testy, abyste viděli, jak jsou otázky sestavené.

Až budete vědět, jak to funguje, [odstraňte ukázkový obsah](author-guide.md#odstranění-ukázkového-obsahu) a vytvořte vlastní testy. Vše podrobně vysvětluje [Příručka autora](author-guide.md).

## 6. Pojmenování webu (nepovinné)

Otevřete `testbraid-backend/config/app.json` v textovém editoru. V části `site` změňte texty `name` (název webu) a `description` (text na úvodní stránce). Pro každý jazyk, ve kterém web nabízí tlačítka a nabídky, je jeden text. Soubor nahrajte zpět a web znovu načtěte. Další nastavení popisuje [Konfigurace](configuration.md).

## Něco nefunguje?

- **Prázdná stránka nebo „nenalezeno“:** zkontrolujte, že se do veřejné složky nahrály skryté soubory `.htaccess`. Pak ověřte, že složka `testbraid-backend` leží vedle veřejné složky, ne uvnitř.
- **Nic nejde uložit ani smazat:** web potřebuje oprávnění měnit soubory ve složkách `testbraid-backend/config`, `testbraid-backend/storage` a ve složce `media` uvnitř veřejné složky. Zeptejte se poskytovatele hostingu, jak PHP zápis do nich povolit. Nenastavujte oprávnění `777`.
- Další pomoc najdete v [Řešení problémů](troubleshooting.md).

Než se na web začnete spoléhat, přečtěte si [Zabezpečení a zálohy](security-and-backups.md). Najdete tam, které složky zálohovat.
