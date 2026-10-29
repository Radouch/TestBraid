# Instalace

[English](../en/installation.md) · **Čeština**

Toto je úplný popis instalace. Pro běžný případ stačí kratší [Rychlý start](quick-start.md).

## Požadavky

- Webhosting s **Apache**, který respektuje soubory `.htaccess` a přepisování adres (`mod_rewrite`). Jiné webové servery potřebují obdobná pravidla napsaná ručně.
- **PHP** se zapnutým nahráváním souborů, sessions a rozšířením `fileinfo`. Podporované verze PHP odpovídají závislostem dané verze. Viz poznámky k vydání a [`backend/composer.json`](../../backend/composer.json).
- **HTTPS.** Přihlašovací cookies se posílají jen přes zabezpečené spojení.
- **SFTP** nebo správce souborů a možnost vytvářet složky mimo veřejnou složku.
- Dost místa na disku pro obrázky a videa. Publikovaná média se ukládají dvakrát: soukromý originál a veřejná kopie.

Na serveru **nepotřebujete** databázi, Node.js ani Composer. ZIP s vydáním je už sestavený.

## Instalační balíček

Stáhněte `testbraid-vX.Y.Z-install.zip` z [GitHub Releases](https://github.com/Radouch/TestBraid/releases). Obsahuje:

```text
www/                       Soubory webu; jejich obsah patří do veřejné složky
testbraid-backend/         Soukromá složka, prohlížeče ji nikdy neotevírají
├── config/app.json        Nastavení, která můžete upravit
├── storage/               Lekce, testy a nahrané originály (na začátku ukázková lekce)
├── vendor/                Knihovny PHP
├── templates/index.html   Šablona stránky, která patří k souborům v assets/
└── …                      Kód aplikace
```

Instalační balíček obsahuje také publikovanou ukázkovou lekci. Její soubory jsou v `testbraid-backend/storage/` a ve složce `media` ve veřejné složce. Jak ji odstranit, popisuje [Příručka autora](author-guide.md#odstranění-ukázkového-obsahu).

## Kam soubory umístit

**Veřejná složka** je složka na hostingu, jejíž soubory může kdokoli otevřít ve webovém prohlížeči na adrese vašeho webu. Její název určil poskytovatel hostingu, často `www`, `public_html`, `htdocs` nebo `web`. Název `www` v ZIPu je jen zástupný.

Nahrajte **obsah** složky `www/` ze ZIPu do veřejné složky. Celou složku `testbraid-backend` (**soukromou složku**) nahrajte **mimo** ni. TestBraid ji standardně hledá hned vedle veřejné složky, například:

```text
hostingový-účet/
├── public_html/           # vaše veřejná složka s obsahem složky www/ ze ZIPu
└── testbraid-backend/     # soukromá složka vedle ní
```

Ponechte všechny skryté soubory `.htaccess`.

PHP musí mít právo zapisovat do složek `config` a `storage` v soukromé složce a do složky `media` ve veřejné složce. Na většině sdílených hostingů jsou soubory nahrané pod vaším účtem pro PHP zapisovatelné už samy. Jinak se zeptejte poskytovatele. Nikdy nepoužívejte plošná oprávnění jako `777`.

### Soukromá složka na jiném místě

Pokud soukromá složka nemůže ležet vedle veřejné složky, zkopírujte ve veřejné složce `bootstrap.local.example.php` na `bootstrap.local.php`. V něm nastavte `backendPath` na umístění soukromé složky na disku, zapsané relativně ke složce s veřejnými soubory TestBraidu. Viz [Konfigurace](configuration.md#pokročilé-cesta-k-instalaci-a-umístění-soukromé-složky).

### Instalace do podsložky

Chcete-li TestBraid provozovat na adrese typu `https://example.org/kurzy/`:

1. Obsah složky `www/` ze ZIPu vložte do složky `kurzy` uvnitř veřejné složky.
2. Soukromou složku ponechte **mimo** veřejnou složku, například jako obvykle vedle ní.
3. TestBraid hledá soukromou složku vedle složky se svými veřejnými soubory, tedy nyní vedle `kurzy`. Takové místo je ale uvnitř veřejné složky, proto mu musíte říct, kde soukromá složka skutečně je. Zkopírujte `kurzy/bootstrap.local.example.php` na `kurzy/bootstrap.local.php` a nastavte `backendPath` na `'../../testbraid-backend'` (o úroveň výš z `kurzy`, o úroveň výš z veřejné složky a pak do soukromé složky).
4. V `testbraid-backend/config/app.json` nastavte `basePath` na `"/kurzy"`. Výchozí `"/"` znamená, že TestBraid běží přímo na adrese webu.

```text
hostingový-účet/
├── public_html/              # vaše veřejná složka
│   └── kurzy/                # obsah složky www/ ze ZIPu a bootstrap.local.php
└── testbraid-backend/        # soukromá složka
```

## Založení prvního autora

TestBraid nemá veřejnou registraci. První autorský účet se zakládá pomocí jednorázového **instalačního klíče**:

1. Vytvořte textový soubor `testbraid-backend/config/setup.key` s instalačním klíčem: jedním řádkem o **32–256 náhodných znacích**.
2. Otevřete na svém webu `/admin`.
3. Zvolte libovolné uživatelské jméno (písmena bez diakritiky, číslice, `.`, `_` nebo `-`; bez mezer) a libovolné heslo o alespoň **12 znacích** a zadejte instalační klíč.
4. Klikněte na **Vytvořit prvního autora**. Tím jste přihlášeni a soubor `setup.key` se automaticky smaže. Pokud tam zůstal, smažte ho sami.

Jakmile první autor existuje, zakládání účtu v prohlížeči je vypnuté. Účet je uložen v soukromém souboru `config/authors.json` s hashovaným heslem. Tento soubor nemažte, abyste „obnovili“ přístup. Další účty může vytvořit správce s přístupem přes SSH, viz [Zabezpečení a zálohy](security-and-backups.md#ochrana-autorských-účtů).

## Kontrola instalace

1. Otevřete úvodní stránku. Měla by na ní být ukázková lekce.
2. Otevřete na svém webu `/api/health`. Měla by se vrátit krátká zpráva ve formátu JSON, ne webová stránka.
3. Přihlaste se na `/admin`, otevřete ukázkový test a vyzkoušejte **Náhled**.
4. Vyplňte ukázkový test z veřejné úvodní stránky a ověřte, že se zobrazují obrázky a přehrávají videa.
5. Ujistěte se, že soukromé soubory **nejsou** dostupné z webu. Pomůže s tím kontrola **Zabezpečení instalace** v autorské části. Úspěšná kontrola dokazuje jen to, že je chráněná testovaná adresa, ne každá možná adresa.

Dále: [Konfigurace](configuration.md) · [Příručka autora](author-guide.md) · [Zabezpečení a zálohy](security-and-backups.md).
