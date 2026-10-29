# Konfigurace

Všechna nastavení jsou v jediném soukromém souboru: `testbraid-backend/config/app.json`. Upravte ho v textovém editoru, nahrajte zpět a stránku znovu načtěte. Nic není potřeba znovu sestavovat. Aktualizace tento soubor nikdy nepřepíší.

Dodaný soubor vypadá takto:

```json
{
  "site": {
    "name": { "cs": "TestBraid", "en": "TestBraid" },
    "description": { "cs": "Aplikace pro tvorbu a vyplňování …", "en": "An application for creating and taking …" }
  },
  "uploads": { "maxImageSizeMiB": 10, "maxVideoSizeMiB": 64 },
  "uiLanguages": ["en", "cs"],
  "basePath": "/"
}
```

Soubor musí zůstat platným JSONem: texty v uvozovkách, čárky mezi položkami a žádná čárka za poslední položkou. Pokud se web po úpravě přestane načítat, zkontrolujte nejdřív tento soubor.

## Název a popis webu

`site.name` se zobrazuje jako název webu a v záložce prohlížeče. `site.description` je úvodní text na úvodní stránce.

Pro každý jazyk rozhraní (jazyk tlačítek a nabídek webu) zadejte jeden text, jako ve výše uvedeném příkladu. Návštěvníci uvidí text v jazyce, který si zvolí. Můžete také použít jediný text pro všechny jazyky:

```json
"name": "Naše výukové testy"
```

## Jazyky rozhraní

`uiLanguages` určuje jazyky, ve kterých web nabízí tlačítka a nabídky (*jazyky rozhraní*). Dodává se angličtina (`en`) a čeština (`cs`). Chcete-li nabízet jen jeden jazyk, uveďte jen ten: `["cs"]`.

Přidání jazyka:

1. Zkopírujte `locales/en.json` z veřejné složky a přeložte texty. Klíče vlevo ponechte beze změny.
2. Nahrajte ho do stejné složky `locales` jako `<kód>.json`, například `locales/de.json`.
3. Přidejte kód do `uiLanguages` a stránku znovu načtěte.

Jazyk rozhraní **nepřekládá** testy. Každý test má svůj vlastní jazyk obsahu, který nastavuje autor.

## Limity nahrávání

`uploads.maxImageSizeMiB` a `uploads.maxVideoSizeMiB` určují největší povolený obrázek a video v MiB. Limity PHP na vašem hostingu (`upload_max_filesize` a `post_max_size`) mohou povolit méně. Jejich zvýšení je nastavení hostingu, ne TestBraidu. Limity platí pro každý soubor zvlášť, viz [Knihovna médií](media-library.md).

## Pokročilé: cesta k instalaci a umístění soukromé složky

Většina webů tato nastavení nikdy měnit nepotřebuje.

**`basePath`** je část adresy, na které TestBraid běží. Nejde o cestu ke složce na disku:

- `"/"` pro `https://example.org/` (výchozí).
- `"/kurzy/testy"` pro `https://example.org/kurzy/testy/`.

Musí odpovídat tomu, kam ve veřejné složce jste vložili obsah složky `www/` ze ZIPu.

**Umístění soukromé složky.** TestBraid hledá soukromou složku `testbraid-backend` vedle veřejné složky. Pokud váš hosting vyžaduje jiné místo, zkopírujte ve veřejné složce `bootstrap.local.example.php` na `bootstrap.local.php`. Nastavte v něm `backendPath` na umístění soukromé složky na disku, relativně ke složce s veřejnými soubory TestBraidu. Soubor `bootstrap.local.php` při aktualizacích zachovejte.

Při problémech s adresami nebo cestami pomůže [Řešení problémů](troubleshooting.md).
