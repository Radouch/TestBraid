# Knihovna médií

Knihovna médií uchovává obrázky a videa, která můžete použít v libovolném testu. Přihlaste se a otevřete **Knihovna médií** (`/admin/media`).

## Nahrávání souborů

Knihovna přijímá **obrázky JPEG, PNG a WebP** a **videa MP4 a WebM**. Limity velikosti souborů nastavuje správce webu a dál je může omezit poskytovatel hostingu.

Nahrání více souborů:

1. Pokud chcete soubory zařadit k určité lekci, zvolte **Lekce média**.
2. Vyberte nebo přetáhněte **více obrázků a videí**.
3. Jedním kliknutím na **Nahrát vybrané soubory** spusťte nahrávání.
4. Zkontrolujte výsledek. Úspěšně nahrané soubory zůstanou k dispozici, i když jiné selžou; neúspěšné soubory můžete nahrát znovu.

Každý soubor se nahrává a kontroluje **samostatně**. Výběr více souborů je nespojí do jednoho velkého požadavku na server. Limity platí pro každý soubor zvlášť.

Nahrávání uvnitř **otázky testu** funguje jinak: připojuje a nahrává **vždy jen jeden soubor**. Pro hromadnou přípravu nahrajte soubory nejdřív do knihovny a při úpravě otázek je pak vyberte.

## Uspořádání a vyhledávání

Médium lze přiřadit k jedné **lekci média**, nebo ponechat nepřiřazené. Funguje to jako virtuální složka: změna lekce soubor **nepřesune** ani neomezí, kde ho lze použít. Test může používat i média přiřazená k jiné lekci.

Média můžete filtrovat podle lekce a typu souboru nebo vyhledat podle části původního názvu souboru. Knihovna také ukazuje, které testy jednotlivá média používají.

## Opakované použití a mazání

Stejné médium se může objevit v několika otázkách a testech, aniž byste originál nahrávali znovu.

Médium lze smazat, jen když ho **nepoužívá žádný rozpracovaný ani publikovaný test**. Odstraněním mediálního bloku z otázky se soubor automaticky nesmaže. Pokud se médium stále používá, nejdřív ho v příslušných testech nahraďte nebo odstraňte.

## Soukromá a publikovaná média

Nahrané originály jsou uložené v **soukromé složce** (`testbraid-backend`). Přihlášení autoři si je mohou prohlížet. Když se test publikuje, zpřístupní se studentům kopie médií, která používá. Veřejné kopie, které už žádný publikovaný test nepoužívá, se mohou uklidit, soukromé originály ale zůstávají.

Limity nahrávání popisuje [Konfigurace](configuration.md). Problémy s hostingem řeší [Řešení problémů](troubleshooting.md).
