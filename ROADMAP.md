# Tavri — audyt i roadmapa rozwoju

Data audytu: **29 października 2026**. Wersja w `package.json`: **0.3.0**. Punkt odniesienia: commit **`6b4da09`** oraz zastany lokalny stan roboczy.

**Wniosek:** projekt ma użyteczny fundament aplikacji do rejestrowania aktywności, ale przed większym redesignem potrzebuje napraw poprawności danych. Najpilniejsze są: zapis właściwego tygodnia, identyfikacja pojedynczego wpisu, ochrona przed nadpisaniem danych i poprawne odczytywanie metadanych. Redesign powinien przede wszystkim skrócić dodawanie wpisu, poprawić czytelność historii i zapewnić działanie w mniejszym oknie.

Dokument jest planem do realizacji. Status wykonanych zmian opisuje aktualizacja poniżej; pozostałe zadania czekają na realizację. Numery wersji przy etapach są propozycją; ukończenie etapu wyznaczają kryteria odbioru.

## Migracja danych i języki — 31.10.2026

Osobiste pliki użytkownika z `~/Documents/worktrace` zostały skopiowane do `~/Documents/tavri` w kanonicznym formacie nazw `YYYY-MM-DD.log`. Dwanaście plików źródłowych zawierało 65 wierszy; 12 stanowiło dokładną kopię tygodnia `2026-W13`, dlatego wynik to 53 unikalne aktywności w 11 tygodniach. Oryginały pozostały nienaruszone. Manifest migracji zawiera sumy SHA-256 plików źródłowych. Tavri wskazuje teraz nowy katalog i odczytuje wszystkie 53 aktywności; po ponownym uruchomieniu aplikacja użyje go domyślnie. Wpisom bez godziny nie dopisano fikcyjnego czasu.

Interfejs ma wybór języka w Ustawieniach i pod flagą w prawym górnym rogu: angielski, polski, niemiecki, hiszpański, francuski i portugalski. Wybrany język jest zapamiętywany, obejmuje główne widoki, instrukcję, szablony i widget; daty używają odpowiedniej lokalizacji. Treści aktywności pozostają w języku, w którym zostały zapisane. Małe logo CGI jest widoczne w prawym dolnym rogu. Test natywny sprawdza przełączenie flagą i w Ustawieniach oraz logo; test migracji sprawdza duplikaty, błędnie umieszczony wpis i nienaruszone źródła.

## Plan dnia, zadania i widget — 31.10.2026

W Today można zaplanować do trzech otwartych rezultatów na dzień, rozpocząć powiązaną sesję, edytować rezultat, zapisać następny krok, oznaczyć wykonanie lub przenieść zadanie na jutro. Zadania są w osobnym lokalnym pliku `.tavri-focus.json` i mają trwałe UUID. Nowe wpisy mają znacznik `[task: UUID]`, więc kilka sesji pozostaje połączonych także po zmianie opisu zadania lub wpisu. Stare logi nie są przepisywane; w Insights pozostaje grupowanie ich po opisie, projekcie i referencji, a użytkownik może powiązać dawny wpis z zadaniem przez edycję.

Przycisk Widget ukrywa główne okno i pokazuje osobne, małe okno zawsze na wierzchu. Wyświetla bieżący opis, projekt i timer; pozwala pauzować, wznowić pomiar, przenieść wynik do formularza i wrócić do Tavri. Widget nie zapisuje wpisu automatycznie. Jego stan pochodzi z tego samego lokalnego timera co formularz.

Zakres From/To w filtrze Activity odczytuje wiele tygodni i jest używany w liście, Timeline, Insights, kopiowaniu i eksporcie Current view. Po otwarciu Reports daty wybranego zakresu są przenoszone do raportu; przycisk „Use Activity range” pozwala zastosować je ponownie po ręcznej zmianie. Siedmiodniowy przegląd pozostaje widoczny tylko przy wybranym tygodniu. Źródło, osoba i opcje wykresów w Reports są niezależne od filtrów Activity.

Osobista kopia zapasowa w wersji 2 obejmuje logi oraz plan zadań; starsza wersja 1 pozostaje czytelna. Przywrócenie zapisuje pliki tygodni i plan w dzienniku transakcji oraz przygotowuje kopię odzyskiwania. Osobne okno widgetu i katalog motywów wydzielono z głównego procesu/renderera, a wszystkie kanały IPC wymagają właściwego okna nadawcy. Pakiet macOS zawiera licencję i przechodzi kontrolę kluczowych plików w ASAR. Opcjonalne podpisanie i notaryzacja korzystają z certyfikatu Developer ID i profilu notarytool w Keychain; nie wykonano ich bez tych danych. Przed wydaniem publicznym nadal potrzebny jest test czystej instalacji i aktualizacji na docelowych systemach.

## Rozszerzenia lokalne — 30.10.2026

Wdrożono przegląd wybranego tygodnia z siedmioma dniami i podsumowaniem do schowka, wyszukiwanie całego archiwum oraz historię operacji wykonanych w aplikacji desktopowej. Historia zapisuje rzeczywisty czas operacji od tej wersji; dawne pliki `.log` i wpisy CLI nie zawierają czasu utworzenia. Wyniki wyszukiwania zachowują plik źródłowy i rewizję, a interfejs pokazuje do 200 najnowszych dopasowań.

Edycja daty przenosi wpis pomiędzy tygodniami. Oba pliki są zapisywane przez dziennik transakcji `.tavri-transaction.json`; niedokończona operacja jest dokańczana przy kolejnym odczycie. Poprzednie wersje obu tygodni trafiają do `.backups`. Testy obejmują przerwanie po zapisie jednego pliku oraz natywną edycję w Electronie.

Użytkownik może zapisać zweryfikowaną sumą kontrolną kopię wszystkich osobistych tygodni, obejrzeć zakres zmian przed przywróceniem i odzyskać wcześniejszy stan z `.tavri-recovery`. Import zespołu obsługuje pliki, folder i ZIP, pokazuje podgląd przed zatwierdzeniem, ogranicza rozpakowanie, pozwala usunąć pojedynczy tydzień i cofnąć ostatnią zmianę. Kopia osobista nie obejmuje osobnego katalogu `.tavri-team`.

Raporty mają gotowe zakresy, zapisywane lokalnie presety, porównanie z poprzednim okresem tej samej długości, tabelę, podsumowanie do schowka i eksport CSV obok PDF. Dodano lokalne pakowanie samodzielnej aplikacji i DMG macOS oraz ręczne sprawdzenie opublikowanych wydań GitHub. Dystrybucja publiczna nadal wymaga podpisu i notaryzacji; automatyczna instalacja aktualizacji nie została wdrożona. Automatyczny audyt axe-core obejmuje główne widoki, lecz nie zastępuje testów z czytnikiem ekranu i klawiaturą.

## Timer aktywności — 31.10.2026

Formularz nowego wpisu ma timer z pauzą, wznowieniem, zakończeniem i świadomym odrzuceniem pomiaru. Czas zostaje zapisany w istniejącym polu `spent`; zapis trwającej sesji pobiera jej aktualny wynik. Pauzy nie są liczone, zapis zaokrągla pomiar w górę do pełnej minuty, a wcześniej ręcznie wpisany czas jest dodawany. Lokalny stan timera przetrwa zmianę zakładki i ponowne uruchomienie; aplikacja jasno informuje, że działający timer liczy także po zamknięciu okna. Test natywny sprawdza odtwarzanie stanu, pauzę, sumowanie i zapis, a podgląd UI pokazuje aktywną sesję.

## Przepływ pracy i czas zadań — 31.10.2026

Przewodnik proponuje cztery powtarzalne kroki: określenie jednego rezultatu, pomiar sesji z pauzami, zapis wyniku wraz z następnym krokiem oraz codzienny przegląd. Przyciski prowadzą bezpośrednio do formularza i tygodniowego przeglądu. Wskazówki startowe opisują dobre nawyki, nie przypisując oceny produktywności samym minutom.

W Insights panel „Time on tasks” grupuje wpisy według opisu, projektu i referencji. Paski zestawiają zapisane czasy z bieżącym, niezapisanym pomiarem; ich długość jest względna wobec najdłuższego zadania w wybranym tygodniu. Wpisy bez czasu pozostają widoczne z pustym paskiem. Obecny timer jest uwzględniany tylko wtedy, gdy jego data i aktywne filtry pasują do wybranego tygodnia. Raporty nadal obejmują wyłącznie czas zapisany w logach.


> Aktualizacja lokalna, 29.10.2026: zaakceptowano nazwę **Tavri** i wdrożono rebranding aplikacji, CLI, startera oraz skryptów. Audyt poniżej zachowuje ustalenia stanu sprzed zmian. Główny moduł danych to obecnie `desktop/tavri-core.cjs`, CLI to `tavri.sh`, a starter został przeniesiony z `WORKTRACE/` do `TAVRI/`. Historyczne numery linii odnoszą się do bazowego commita. Nowa paleta, etykiety formularza i przewijanie realizują część kierunku UX. Naprawiono też parser metadanych A05. Zastąpiono osobny HTML screenshotu produkcyjnym rendererem z testowym mostkiem API. Początkowy smoke test obejmował nazwę, ikonę, preload/IPC, zapis do katalogu tymczasowego i rozmiar okna; późniejsze sekcje opisują rozbudowane testy natywne i podglądy.

## Szablony wpisów — 30.10.2026

Formularz ma 12 przewodników w czterech grupach: tworzenie i dostarczanie, współpraca, produkt i odkrywanie oraz operacje i nauka. Każdy ma trzy własne pytania, przykłady odpowiedzi i podgląd gotowego opisu. Pierwsza odpowiedź jest wymagana do użycia szablonu; pozostałe są opcjonalne. Zastosowanie wypełnia wyłącznie opis, bez automatycznego zapisu i bez zmiany daty, czasu, projektu, referencji ani czasu pracy. Zastąpienie istniejącego opisu wymaga potwierdzenia. Niedokończone odpowiedzi są przechowywane jako lokalny szkic. Integracja Electron sprawdza podgląd, dwa różne szablony i ochronę istniejącego wpisu; podgląd UI pokazuje rozwinięty przewodnik.


## Powitanie i przewodnik — 30.10.2026

Na starcie aplikacja pokazuje trzy kroki rozpoczęcia pracy oraz wskazówkę zmienianą codziennie i przyciskiem „Next tip”. Opcja „Don't show this on startup” jest zapamiętywana lokalnie; przewodnik pozostaje dostępny z paska bocznego. Instrukcja opisuje wpisy, widoki historii, filtry, Insights, raporty, eksport dowolnego okresu, lokalny import zespołu, pliki i skróty. Krótkie porady pomagają pisać czytelne wpisy i budować spójne podsumowania. Test natywny obejmuje otwarcie, zmianę wskazówki, przewodnik, ukrycie po restarcie i ponowne otwarcie.

## Rozszerzenie galerii do 38 wyglądów — 30.10.2026

Dodano 20 wariantów w grupach Film, Books, Series i Music: Blade Runner 2049, TRON: Legacy, Matrix, Alien, Grand Budapest Hotel, Foundation, Discworld, Witcher, Hunger Games, Narnia, Severance, Stranger Things, X-Files, Doctor Who, Last of Us, Daft Punk, Pink Floyd, Bowie, Kraftwerk i Radiohead. Każdy ma paletę, detale układu i autorski symbol liniowy w miniaturze oraz nagłówku. Kategorię można filtrować i przeszukiwać. Rozszerzenie zachowuje poprzednie 18 motywów; test natywny sprawdza kontrast, skalowanie 125%, trwałość wyboru i symbole wszystkich nowych wariantów. Inspiracje i granice ich wykorzystania opisano w [referencjach](./docs/DESIGN-REFERENCES.md).

## Dodatkowe motywy — 30.10.2026

Rozszerzono galerię do **18 wyglądów w pięciu grupach**. Dodano Rebel i Mandalorian, Shire i Mordor, Hogwarts i Slytherin, Arrakis, Winterfell, Pip-Boy oraz Night City. Każdy wariant ma własną paletę, miniaturę i detale paneli; układ i funkcje pozostają wspólne. Wzorce z otwartych repozytoriów opisano w [referencjach projektu](./docs/DESIGN-REFERENCES.md). Nowe style są oryginalnym CSS bez zapożyczonych grafik. Sprawdzenia kontrastu i układu obejmują całą galerię.

Kolejne dopracowanie UI: po przeglądzie TheLCARS, louh/lcars, portfolio Mungo Horeya, Arwes i wytycznych Microsoft rozwinięto geometrię LCARS oraz panele Holoterminal. Ujednolicono ikony SVG, dodano trzy grupy miniatur motywów, uproszczono obramowania wysokiego kontrastu i ukryto wybór tygodnia w Settings do czasu rozwinięcia edytora. Usunięto chwilowy spadek kontrastu podczas zmiany palety. Źródła i decyzje: [docs/DESIGN-REFERENCES.md](./docs/DESIGN-REFERENCES.md).

Pierwsza wersja Settings → Appearance obejmowała osiem opcji: System, Light, Dark, wysoki kontrast ciemny/jasny/bursztynowy oraz Star Trek · LCARS i Star Wars · Holoterminal. Motywy zmieniają paletę i detale paneli, bez animacji ani zewnętrznych zasobów. Wysoki kontrast ma wzmocniony fokus, obramowania oraz wzory w kalendarzu. Wybór jest zapamiętywany. Warstwa stylów: `desktop/themes.css`.

Weryfikacja: 17 scenariuszy natywnego Electron, w tym pomiar reprezentatywnych par tekst/tło (minimum 7:1 dla palet wysokiego kontrastu, 4,5:1 dla obu motywów filmowych), układ List/Timeline/Contributions przy 125% i przywracanie motywu po restarcie. Zapisano 12 podglądów UI. To ukierunkowane testy, nie pełny audyt dostępności.

## Automatyczne odświeżanie zmian lokalnych — 30.10.2026

Widoczne okno sprawdza pliki co 15 sekund oraz po powrocie do aplikacji. Zmiany wpisów, listy tygodni i rocznego kalendarza pojawiają się bez ręcznego odświeżania. Aktywny formularz i szkic surowego pliku pozostają zachowane; przy nieaktualnej rewizji aplikacja ostrzega przed zapisem. Sprawdzenia uruchamiane w tle nie blokują formularza i pomijają otwarte okno potwierdzenia. Test integracyjny dopisuje wpisy do aktualnego tygodnia i archiwum, a następnie weryfikuje widok i zachowanie szkiców.

## Dowolny zakres eksportu i schowka — 30.10.2026

Menu Export pozwala wybrać Current view albo Custom date range z datami From/To i liczbą pasujących aktywności. Zakres może obejmować wiele archiwalnych tygodni oraz granicę roku; wyszukiwanie i projekt stosują się do wyniku. TXT, CSV, PDF i kopiowanie korzystają z tych samych wpisów. Odczyt zakresu obejmuje istniejące pliki tygodniowe i ich rewizje, więc wynik z nieaktualnego podglądu nie jest kopiowany ani eksportowany. Dodano testy granic, pustego zakresu, nowego pliku oraz natywnego przepływu eksportu. Wybrany zakres jest obecnie funkcją eksportu i kopiowania; lista, podsumowanie i Insights nadal pokazują bieżący widok, więc M3.2 pozostaje otwarte.

## Wybór koloru akcentu — 30.10.2026

Domyślny pomarańczowy akcent podstawowych motywów System, Light i Dark zastąpiono czerwonym. W Settings → Accent color można wybrać Red, Dark yellow albo White; wybór jest zapamiętywany. W jasnym i ciemnym motywie zastosowano odrębne odcienie żółci dla zachowania kontrastu. Białe przyciski w Light mają ciemny obrys i tekst; tekstowe akcenty pozostają grafitowe. Kolor zmienia przyciski, aktywną nawigację, fokus, miniatury i znak w nagłówku. Wektorowe oraz natywne ikony marki otrzymały nową czerwień. Motywy wysokiego kontrastu i filmowe zachowują własne palety.

## Dodatkowe widoki aktywności — 30.10.2026

Dodano zakładki List / Timeline / Contributions z zapamiętywaniem wyboru. Timeline pokazuje jeden piksel na wpis na godzinowej osi dnia, dokładną godzinę w podpowiedzi i osobną sekcję bez godziny. Contributions odczytuje cały wybrany rok, pokazuje siatkę aktywności i historię wybranego dnia w stylu commitów. Filtry obejmują rok, a szczegóły/kopiowanie/eksport wybrany dzień. Operacje na wpisach używają pliku źródłowego i jego rewizji. Daty na wizualizacjach oznaczają zapisany czas aktywności, nie niezależny znacznik utworzenia. Dane pozostają lokalne.

> Korekta UX: na prośbę użytkownika zastąpiono godzinowe piksele jedną osią dat od pierwszego do ostatniego widocznego wpisu. Każdy log ma osobne kółko i krótką chmurkę opisu; wiele wpisów tego samego dnia układa się naprzemiennie nad i pod linią. Wpis bez godziny pozostaje na swojej dacie.

Oś można otworzyć na pełnym ekranie przyciskiem w jej nagłówku i opuścić przyciskiem albo klawiszem Esc. Wybrany wpis pozostaje zaznaczony. Skrót nowej aktywności zamyka pełny ekran, wraca do listy i ustawia fokus w formularzu.

Nowe moduły i API: `activity-views.cjs`, `readYear` / `getYear`, agregacja kalendarza i osi w `entry-domain.cjs`. Odczyt roku jest wykonywany na żądanie, z ograniczeniem równoległego I/O. Nowe testy obejmują rok przestępny, granice roku, duplikaty, brak godziny, filtrowanie, akcje archiwalne, eksport pustego dnia, klawiaturę i małe okno. Podglądy: `src/Screenshot-timeline.png`, `src/Screenshot-contributions.png` i `src/Screenshot-contributions-compact.png`. Weryfikacja po tej zmianie: `npm test` — 23 grupy, w tym 19 testów core i 8 domeny; 15 scenariuszy natywnego Electron oraz 6 wariantów screenshotów — bez błędów na macOS.

## Aktualny stan po wdrożeniu UI — 30.10.2026

Poniższy audyt pozostaje historycznym punktem odniesienia. Lokalnie wdrożono:

- nowy układ Today / Activity / Insights / Settings, chronologię grupowaną po dniach, metadane jako etykiety, formularz z rozwijanymi szczegółami, motywy Light/Dark/System i gęstość listy;
- wyszukiwanie, filtry projektu i dat, nawigację tygodniową, podpowiedzi projektów z wczytanych danych, podsumowania czasu z informacją o pokryciu;
- Save/Cancel, potwierdzenie usunięcia, Undo oraz zachowywanie szkiców nowego wpisu i pliku tygodnia;
- naprawy A01/A02/A06/A07: jawny tydzień i rewizja w IPC, pojedyncze wystąpienie wpisu, wspólny zakres filtrów listy/eksportu i poprawny kontekst Today;
- ochronę A03: wspólna blokada desktop/CLI, atomowa podmiana, kontrola rewizji, jedna poprzednia wersja tygodnia w `.backups`; test przeplotu CLI/desktop i symulowanego błędu zapisu;
- zabezpieczenie A04: zmiana daty między tygodniami jest jawnie blokowana; pełne przenoszenie transakcyjne pozostaje do wdrożenia;
- moduły `entry-domain.cjs` i `storage.cjs`, typy API, CSP, sandbox renderera i blokadę nawigacji;
- testy rzeczywistego main/preload/renderer w `tests/test_desktop_integration.cjs` oraz konfigurację CI na pull request.

Weryfikacja lokalna: `npm test` — **23 grupy bez błędów**, w tym **18 testów core**, **6 testów domeny**, **4 zgodności**; produkcyjny Electron — **11 scenariuszy bez błędów**, obejmujących eksport TXT/CSV/PDF, konflikty, odzyskanie szkiców, duplikaty, Undo, Today i skalowanie 125%; screenshots jasny/ciemny przy 1440×1000, 900×620 i 1080×760. CI zdalne nie było uruchamiane.

Pozostają m.in.: przenoszenie między tygodniami, dowolne zakresy wieloletnie (wyszukiwanie roczne jest dostępne w Contributions), automatyczne odświeżanie zmian z CLI, pełny podział main/renderera na moduły, kreator odzyskiwania kopii, samodzielne instalatory oraz testy GUI Windows/Linux. Blokada po awarii wymaga ręcznego usunięcia po zatrzymaniu wszystkich procesów zapisujących. Zewnętrzne edytory nie respektują protokołu blokady; rewizja wykrywa zmiany sprzed rozpoczęcia zapisu, ale nie gwarantuje ochrony przed niekoordynowanym zapisem w trakcie operacji. Kopia w `.backups` nie zastępuje niezależnego backupu.

## 1. Zakres i wiarygodność audytu

Sprawdzono:

- kod głównej aplikacji w `desktop/`, CLI w `worktrace.sh`, testy, konfigurację projektu, instalatory i workflow CI/release;
- historię ostatnich zmian oraz różnice lokalne;
- istniejący screenshot i sposób jego generowania;
- rzeczywisty interfejs Electron na macOS, w jasnym i ciemnym motywie, na danych przykładowych;
- błędy magazynu danych w izolowanych katalogach tymczasowych i zachowania renderera z atrapą DOM;
- przejście przez rzeczywisty preload/IPC przy eksporcie i zapisie archiwalnego tygodnia.

Zastane zmiany lokalne dotyczą `README.md`, `src/Screenshot.png` i `tests/test_desktop_screenshot.mjs`. Są częścią obserwowanego stanu; nie są wynikiem tego audytu. Główną aplikacją jest projekt w katalogu repozytorium. `WORKTRACE/` to osobny, śledzony w Git starter wygenerowany z projektu, a nie drugi frontend głównej aplikacji.

Ograniczenia: nie wykonano badań z użytkownikami, pełnego audytu dostępności ani testów GUI na Windows/Linux. Nie sprawdzano aktualnego stanu zdalnych workflow, opublikowanych instalatorów ani podatności zależności. Wnioski UX łączą obserwacje rzeczywistego okna z analizą kodu; rekomendacje produktowe wymagają późniejszej walidacji.

### Wyniki uruchomionych sprawdzeń

| Sprawdzenie | Wynik |
| --- | --- |
| `npm test` | **FAIL** — 21 grup zaliczonych, 1 niezaliczona |
| Testy core, uruchamiane przez `npm test` | 9 zaliczonych, 0 błędów |
| Testy renderera, uruchamiane przez `npm test` | 23 zaliczone, 2 błędy |
| Niezaliczone testy | `renderer parses structured entry metadata`, `renderer builds diagram summaries` |
| Próby magazynu na danych tymczasowych | Potwierdzone: operacje na wszystkich duplikatach, błędna zmiana tygodnia wpisu, przyjęcie nieprawidłowych danych, utrata równoległego dopisania |
| Próby renderera z atrapą DOM | Potwierdzone: błędny tydzień akcji w Today, utrata szkicu przy odświeżeniu, komunikat sukcesu po błędzie odczytu |
| Rzeczywisty Electron | Zarejestrowane trzy ekrany; na dysku potwierdzony eksport bieżącego tygodnia i nadpisanie bieżącego pliku treścią archiwum |

Nie należy sumować wyników grup `npm test` z wynikami testów core/renderera: te zestawy są zagnieżdżone. Harness Electron zakończył się limitem 30 sekund podczas oczekiwania na końcową odpowiedź IPC; screenshots i wskazane zmiany w plikach tymczasowych zostały zapisane przed zakończeniem. Nie jest to zaliczony pełny test E2E. Przyczyna opóźnienia nie została ustalona.

## 2. Co już zostało zrobione

| Obszar | Obecny zakres | Ocena |
| --- | --- | --- |
| CLI | `add`, szybkie dodawanie, `list`, `today`, `week`, `path`, `init`, `config`, `version`, `help`, starsze aliasy | Działający fundament, testy regresji przechodzą |
| Daty i pliki | Tygodnie ISO, nazwa pliku odpowiadająca poniedziałkowi, lokalny katalog, `WORKTRACE_LOGDIR` | Dobre podstawy; walidacja nie jest spójna we wszystkich operacjach |
| Desktop | Electron main/preload/renderer, tray/menu bar, ukrywanie okna, otwieranie katalogu | Zaimplementowane; zachowania systemowe wymagają szerszego sprawdzenia |
| Wpisy | Data, godzina, opis, czas poświęcony, projekt, referencja; dodawanie, edycja, klonowanie i usuwanie | Funkcje istnieją, lecz mają błędy opisane niżej |
| Przeglądanie | Week, Today, wybór istniejącego tygodnia i filtr dat wewnątrz tygodnia | Działa podstawowy przegląd; brak wyszukiwania i filtrowania po projekcie |
| Podsumowania | Liczniki, Diagram według dnia i projektu, sumowanie czasu | Widok istnieje; parser metadanych psuje podsumowania |
| Eksport | TXT, CSV, PDF; kopiowanie widocznych wpisów tygodnia | Zaimplementowane; eksport nie respektuje wybranego tygodnia ani filtrów |
| Wygląd | Jasny/ciemny motyw, zapamiętanie motywu, szkło/przezroczystość, własny pasek okna | Rozbudowana stylistyka; problemy układu ograniczają użyteczność |
| Testy | Bash CLI, Node core, renderer z FakeDocument, smoke generatora i instalatora macOS | Przydatna baza, ale brak pokrycia kilku krytycznych przepływów |
| CI i wydania | Workflow testów i release, archiwa na trzy systemy, sumy SHA256 | Istnieją w repo; główny workflow nie uruchamia się na pull request |
| Instalacja | Instalatory CLI; na macOS wrapper `.app` i instalowanie zależności Electron | Desktop nadal zależy od Node/npm u użytkownika |
| Dokumentacja | README, changelog, contributing, security, MIT | Istnieje; opis i screenshot wymagają aktualizacji |
| Generator | Generator bazy projektu oraz przykładowy `WORKTRACE/` | Dodatkowa odpowiedzialność utrzymaniowa |

Najważniejsze punkty historii: `b69d784` — motywy (23.07.2026), `ae6d1dd` — wersja 0.3.0 (24.07.2026), `abaedf0` — refaktoring i aktualizacje (14.08.2026), `6b4da09` — szklany interfejs i automatyczna wysokość okna (14.08.2026). Changelog ma pustą sekcję Unreleased pomimo późniejszych zmian.

## 3. Ustalenia techniczne według priorytetu

**P0** — możliwość nadpisania lub utraty danych, blokuje kolejne wydanie. **P1** — błędny wynik operacji albo niedostępny podstawowy przepływ. **P2** — utrzymanie, wygoda i jakość wymagające poprawy przed wersją 1.0.

### A01 · P0 — zapis archiwum nadpisuje bieżący tydzień

Renderer wysyła wyłącznie tekst. Preload nie przyjmuje tygodnia, a handler wywołuje `store.saveWeek("", text)`. Wybranie archiwum i zapis jego treści kieruje zapis do bieżącego pliku.

Dowód: przy dacie testowej 2026-10-29 tekst tygodnia 2026-10-19 trafił do `2026-10-26.log`. Źródła: [main](desktop/main.cjs), linia 482; [preload](desktop/preload.cjs), linia 27; [renderer](desktop/renderer.cjs), `saveWeek`.

**Odbiór naprawy:** API przyjmuje jawny `weekRef` i rewizję odczytanego pliku; test przez IPC potwierdza zmianę wyłącznie wybranego archiwum i zachowanie bieżącego tygodnia.

### A02 · P0 — edycja/usuwanie obejmuje wszystkie identyczne wpisy

`deleteEntry` filtruje wszystkie wiersze o danej treści, a `editEntry` zmienia wszystkie pasujące wiersze. `cloneEntry` naturalnie tworzy takie duplikaty. Pole `id` wygenerowane w parserze nie jest wykorzystywane w operacjach.

Dowód: z dwóch identycznych wpisów po jednym usunięciu zostało **0**; jedna edycja zmieniła **2** wpisy. Źródło: [core](desktop/tavri-core.cjs), `deleteEntry`, `editEntry`, `parseEntryLine`.

**Odbiór naprawy:** użytkownik operuje na jednym wystąpieniu wiersza; duplikaty pozostają osobnymi wpisami; zmiana pliku od czasu odczytu daje konflikt, a nie ciche usunięcie innego wpisu.

### A03 · P0 — zapis całego pliku może zgubić równoległą zmianę

Edycja i usuwanie wykonują odczyt, zmianę w pamięci oraz `writeFile`. Nie ma blokady między procesami ani sprawdzania rewizji. CLI dopisuje do tego samego pliku. Brakuje też zapisu przez plik tymczasowy i mechanizmu odzyskiwania.

Dowód: w kontrolowanej próbie dopisano nową linię między odczytem a zapisem operacji delete. Po zapisie nowa linia zniknęła. Jest to deterministyczna symulacja przeplotu operacji, a nie pomiar częstości błędu. Źródła: [core](desktop/tavri-core.cjs), linie 287–361; [CLI](tavri.sh), `append_worktrace_entry`.

**Odbiór naprawy:** wspólny protokół blokowania dla desktopu i CLI, kontrola rewizji, atomowa podmiana pliku, kopia odzyskiwania i testy błędu zapisu. Samo `rename` nie rozwiązuje konfliktów między autorami zmian. Zewnętrzne edytory nie respektują blokad aplikacji — ich zmiany należy wykrywać i obsługiwać jako konflikt w granicach możliwości formatu plikowego.

### A04 · P1 — zmiana daty nie przenosi wpisu do właściwego tygodnia

`editEntry` zmienia datę wewnątrz źródłowego pliku. Wpis przeniesiony z 2026-10-29 na 2026-11-02 pozostał w `2026-10-26.log`; tydzień 2026-11-02 był pusty.

**Odbiór naprawy:** wpis trafia do docelowego tygodnia dokładnie raz. Przeniesienie między dwoma plikami ma mechanizm odzyskania po przerwaniu operacji. Do czasu wdrożenia bezpiecznego przenoszenia należy jawnie blokować zmianę tygodnia. Źródło: [core](desktop/tavri-core.cjs), `editEntry`.

### A05 · P1 — metadane nie są prawidłowo odczytywane

Wyrażenie regularne w `parseEntryMessage` nie rozpoznaje poprawnego przykładu `Fixed [spent: 30m] [project: Desktop] [ref: ABC-1]`. Całość pozostaje opisem; pola projektu, czasu i referencji są puste. Psuje to ponowną edycję i podsumowania. Potwierdzają to dwa istniejące, niezaliczone testy.

**Odbiór naprawy:** round-trip opisu i metadanych, sumowanie czasu/projektów, określona obsługa nawiasów `]` w wartościach i wpisów bez metadanych. Źródło: [renderer](desktop/renderer.cjs), linia 143.

### A06 · P1 — eksport innego zakresu niż oglądany

`exportWeek` w main wywołuje `store.readWeek()` bez wskazania tygodnia. Interfejs przekazuje tylko format. Kopiowanie uwzględnia filtr, eksport go pomija. CSV i PDF pomijają osobną godzinę; projekt/czas/referencja pozostają częścią opisu.

Dowód: po odczycie archiwum przez API eksport TXT zawierał wpisy bieżącego tygodnia. Źródła: [main](desktop/main.cjs), linia 382 i `buildWeekPdfHtml`; [core](desktop/tavri-core.cjs), `formatEntriesAsCsv`.

**Odbiór naprawy:** jawny zakres eksportu, tydzień i filtry; kontrola zawartości pliku, a nie tylko istnienia wyniku. Pełny tydzień i widoczny zakres to dwa czytelnie nazwane warianty.

### A07 · P1 — akcje Today mogą użyć tygodnia wybranego w archiwum

Stan zawiera osobno archiwalny `week` i aktualny `today`, ale przyciski obu list korzystają z globalnego `currentWeekRef`. Próba renderera potwierdziła wywołanie delete dla wpisu z 2026-04-30 z parametrem tygodnia **2026-04-20**. Może to dać pozorny sukces bez usunięcia lub sklonować wpis do niewłaściwego pliku.

**Odbiór naprawy:** każdy wpis przenosi kontekst źródła; test Today po wybraniu archiwum obejmuje edycję, klonowanie i usuwanie. Źródło: [renderer](desktop/renderer.cjs), `renderEntries`, `renderState`.

### A08 · P1 — niespójna walidacja i obsługa szkiców

- Core przyjął edycję z datą `2026-02-30`, czasem `99:99` i wielowierszowym opisem. Parser oznaczył nieprawidłową datę/godzinę jako `valid: true`.
- `parseSpentToMinutes("-1h")` zwrócił 60; nierozpoznany czas zamienia się w 0. Częściowe dopasowanie może maskować błędne dane.
- `renderState` zawsze nadpisuje `weekEditor.value`; odświeżenie usunęło niezapisany szkic w próbie renderera.
- `refreshState` pokazał `Refreshed.` po błędzie `disk unavailable`, ponieważ `loadState` przechwytuje błąd, a caller następnie ustawia sukces.
- Tryb edycji nie ma widocznego Cancel. Blokowanie operacji nie obejmuje wszystkich przycisków, w tym akcji wierszy.

**Odbiór naprawy:** walidacja w warstwie domenowej i IPC, zachowanie szkicu przy błędzie, jawne Save/Cancel, ostrzeżenie przed utratą szkicu oraz rozróżnienie stanów loading/success/error. Źródła: [core](desktop/tavri-core.cjs), `parseEntryLine`, `addEntry`, `editEntry`; [renderer](desktop/renderer.cjs), `parseSpentToMinutes`, `setBusy`, `renderState`, `refreshState`.

### A09 · P1 — układ ogranicza podstawową obsługę

Przy szerokości 900 px okno miało 1084 px wysokości, dokument 1776 px, a lista zaczynała się około 1406 px od góry. `body` ma `overflow: hidden`, a panel boczny przechodzi nad formularz. Przy 1080 px sześć pól tworzy wysoką kolumnę. Przy 1440 px stałe szerokości innych pól pozostawiają bardzo mało miejsca na opis.

**Odbiór naprawy:** dodanie i przeglądanie wpisu dostępne od minimalnego rozmiaru okna; poprawne przewijanie; brak automatycznego rozpychania okna przy zmianie widoku. Źródła: [CSS](desktop/styles.css), `.entry-form`, media queries; [main](desktop/main.cjs), `fitWindowToContent`.

### A10 · P1 — screenshot nie weryfikuje produkcyjnego UI

Skrypt buduje własny HTML/CSS zamiast używać `desktop/index.html`, `styles.css` i renderera. Fixture zapisuje jako `2026-07-21.log`, ale core szuka poniedziałku `2026-07-20.log`. Obecny screenshot pokazuje więc zero wpisów mimo niepustej fixture. Sprawdzenie ogranicza się do niezerowego rozmiaru PNG.

**Odbiór naprawy:** capture rzeczywistej aplikacji, poprawna fixture, asercja widocznych danych i braku obcięcia kontrolek; oddzielenie aktualizacji screenshotu od testu regresji. Źródło: [skrypt screenshotu](tests/test_desktop_screenshot.mjs), `buildScreenshotHtml`, linie 435–456.

### A11 · P2 — odpowiedzialności i kontrakty wymagają uporządkowania

Renderer ma 889 linii i łączy stan, parser danych, obliczenia, DOM oraz operacje. Main ma 507 linii obejmujących okno, tray, IPC i eksport. Core ma 399 linii, CSS 1176, a generator startera 1439. Rozmiar sam w sobie nie jest błędem; problemem jest liczba odpowiedzialności zmienianych razem.

`checkJs` jest wyłączone, deklaracje API zwracają głównie `Promise<unknown>`. `WORKTRACE/` oraz kod w generatorze tworzą kolejne warianty do utrzymania. Nie ma testów integracyjnych main/preload/store ani testów core dla edit/delete/clone. Workflow testów obsługuje push na main i ręczne uruchomienie, bez `pull_request`.

### A12 · P2 — przygotowanie do dystrybucji jest niepełne

Desktop wymaga Node/npm, archiwa zawierają źródła, a `.app` na macOS jest wrapperem. Packager kopiuje pliki pojedynczo, więc refaktoring struktury wymaga jego aktualizacji. Nie kopiuje obecnie `LICENSE` do paczki. Sumy kontrolne są generowane, lecz przejrzane instalatory nie weryfikują pobieranego artefaktu względem nich.

Podstawy izolacji Electron już istnieją: `contextIsolation: true`, `nodeIntegration: false` i ograniczona powierzchnia preload. Do uzupełnienia pozostają jawna walidacja payloadów i nadawcy IPC, polityka CSP oraz polityka nawigacji/nowych okien. Są to braki kontroli widoczne w kodzie, nie potwierdzone podatności do zdalnego wykorzystania.

Źródła: [packager](scripts/prepare-release.sh), [instalator macOS](scripts/install-macos.sh), [main](desktop/main.cjs), [HTML](desktop/index.html).

## 4. Analiza UX i kierunek redesignu

### Główne zadania użytkownika

1. Szybko zapisać, co zostało zrobione.
2. Odnaleźć aktywność z danego dnia, projektu lub ticketu.
3. Poprawić pojedynczy wpis bez utraty kontekstu.
4. Przygotować wiarygodne podsumowanie tygodnia.

Robocze założenie produktowe: osobisty dziennik aktywności działający lokalnie, z opcjonalnym czasem poświęconym. README mówi obecnie, że produkt nie śledzi czasu, podczas gdy UI ma `Time spent` i sumowanie godzin. Należy ujednolicić obietnicę produktu. Automatyczny timer, rozliczenia, synchronizacja zespołowa i integracje Jira są oddzielnymi rozszerzeniami po ustabilizowaniu podstaw.

### Co zmienić w obsłudze

| Obecna trudność | Proponowane zachowanie |
| --- | --- |
| Sześć pól o zbliżonej wadze, opis dopiero po dacie/godzinie/czasie | Duże pole opisu jako pierwszy element; data domyślnie Today; projekt i pozostałe szczegóły w drugim rzędzie lub rozwijane |
| Week/Today/Diagram/Edit mieszają cel użytkownika z operacjami na plikach | Nawigacja Today, History, Summary; Advanced editor w menu zaawansowanym; Settings osobno |
| Tydzień schowany w accordionie; tytuł zawsze This week | Widoczny zakres dat, poprzedni/następny tydzień i powrót do obecnego; tytuł zgodny z wybranym okresem |
| Surowe `[spent:]`, `[project:]`, `[ref:]` w treści | Osobny opis, czytelny projekt, referencja i czas; dane tekstowe zachowane w warstwie zapisu |
| Brak wyszukiwania | Wyszukiwanie opisu/referencji oraz filtr projektu, z jednoznacznym zakresem |
| Usunięcie natychmiastowe, bez cofnięcia | Undo dla pojedynczego usunięcia; potwierdzenie operacji obejmującej cały plik |
| Edycja przejmuje formularz bez Cancel | Wyraźny tryb edycji, Save/Cancel i zachowanie szkicu |
| Trzy formaty eksportu dominują w pasku okna | Jeden przycisk Export z wyborem formatu, zakresu i podglądem liczby wpisów |
| Ścieżki techniczne stale zajmują główny widok | Katalog danych w Settings; w widoku historii zakres i liczba wpisów |
| Przycisk Refresh jest centralny | Odświeżanie po własnych zapisach; wykrywanie zmian z CLI, z ochroną niezapisanego szkicu |

### Proponowany układ głównego ekranu

```text
┌────────────────┬──────────────────────────────────────────────────┐
│ Worktrace      │ Today · Thu, 29 Oct                     Export ▾ │
│                │                                                  │
│ Today          │ What did you work on?                            │
│ History        │ [Opis aktywności..............................]  │
│ Summary        │ [Project ▾] [Today ▾] [+ Details]      Add entry │
│                │                                                  │
│                │ [Search activities................] [Filter ▾]  │
│                │                                                  │
│                │ Today · 2 entries                                │
│                │ 09:00  Reviewed release checklist          ⋯     │
│                │        Worktrace · WT-42 · 30m                   │
│                │ 08:30  Improved weekly export              ⋯     │
│ Settings       │        Worktrace · 1h                            │
└────────────────┴──────────────────────────────────────────────────┘
```

To propozycja struktury, nie gotowa specyfikacja graficzna. UI pozostaje po angielsku, zgodnie z obecną aplikacją. W małym oknie nawigacja powinna się zwijać, a lista zajmować dostępne miejsce i mieć własne przewijanie.

Kierunek wizualny: spokojne, nieprzezroczyste powierzchnie; ograniczenie gradientów i mocnych cieni; jeden kolor akcentu dla głównych akcji; wyraźny kolor działań destrukcyjnych. Spójna skala odstępów 4/8 px, czytelna typografia systemowa i monospace wyłącznie dla danych, które tego potrzebują. Motywy Light, Dark, System. Logo może pozostać, ale treść i codzienne operacje powinny dominować nad brandingiem.

Dostępność obejmuje widoczne etykiety, fokus klawiatury, semantykę aktywnej nawigacji, powrót fokusu po zamknięciu edycji/menu, komunikaty błędów przy polach i ograniczenie animacji. Zgodność należy mierzyć w prawdziwym rendererze; samo użycie `aria-label` nie stanowi pełnej weryfikacji.

### Zarejestrowany stan obecny

Poniższe obrazy pochodzą z rzeczywistej aplikacji i danych testowych. Nazwy oznaczają szerokość w pikselach CSS; PNG jest zapisany przy skali Retina. Wysokość zmieniła się przez istniejący mechanizm automatycznego dopasowania.

- [Ciemny motyw, szerokość 1080](docs/audit/2026-10-29/current-dark-1080.png) — wysoki formularz.
- [Ciemny motyw, szerokość 900](docs/audit/2026-10-29/current-dark-900.png) — nawigacja wypycha listę poza okno.
- [Jasny motyw, szerokość 1440](docs/audit/2026-10-29/current-light-1440.png) — ściśnięte pole opisu.

## 5. Docelowa architektura

Rekomendacja: rozwijać istniejący Electron etapami, wydzielając odpowiedzialności. Na obecnym etapie nie ma uzasadnienia do pełnego przepisania aplikacji ani automatycznego wprowadzania frameworka UI lub bazy danych.

```text
Renderer: widoki + stan + formularze
                ↓
Preload: wąski, opisany typami kontrakt
                ↓
Main / IPC: walidacja, uprawnienia, integracja z systemem
                ↓
Usługi aplikacji: wpisy, zapytania, eksport, odzyskiwanie
                ↓
Domena: daty, wpisy, metadane, czas, serializacja
                ↓
Repozytorium plikowe: rewizje, blokady, zapis, backup
                ↕
Pliki .log ← CLI respektujące ten sam protokół zapisu
```

Proponowany podział, realizowany stopniowo:

| Moduł | Odpowiedzialność |
| --- | --- |
| `desktop/domain/` | Czyste funkcje dat, walidacji, parsera wpisów/metadanych i czasu |
| `desktop/storage/` | Odczyt/zapis plików, blokady, rewizje, kopie i odzyskiwanie |
| `desktop/services/` | Operacje na wpisach, zakresy wyszukiwania, eksport |
| `desktop/main/` | Okna, tray, rejestracja IPC, dialogi i integracja systemowa |
| `desktop/renderer/` | Stan, selektory, komponenty i widoki; brak reguł formatu pliku |
| `desktop/styles/` | Tokeny kolorów/odstępów, layout i komponenty |
| `desktop/contracts/` | Typy żądań, odpowiedzi i błędów API |

Najważniejsze decyzje projektowe:

1. **Jawny kontekst operacji:** żądania zawierają tydzień, wskazanie wpisu i rewizję. Eksport zawiera zakres i filtry. Nie wolno odtwarzać ich z globalnego bieżącego widoku.
2. **Tożsamość wpisu:** w obecnym formacie użyć konkretnego wystąpienia wiersza i rewizji pliku, sprawdzając również oczekiwaną treść. Indeks sam w sobie nie jest trwałym ID. Ewentualne stałe UUID wymagają osobnego projektu wersjonowanego formatu i migracji.
3. **Zgodność `.log`:** czytać wpisy date-only i z godziną, zachować nieznane linie oraz metadane. Błędne wpisy pokazywać jako wymagające uwagi. Nie usuwać ich podczas odczytu lub normalizacji.
4. **Jedna implementacja reguł desktopowych:** parser, walidacja i serializacja w domenie; renderer korzysta z gotowych danych. CLI Bash ma wspólne fixture zgodności i ten sam protokół blokad; zachowuje możliwość działania bez Node.
5. **Bezpieczny zapis:** blokady dla współpracujących procesów, rewizja dla wykrywania nieaktualnego stanu, plik tymczasowy i podmiana, backup. Przenoszenie między tygodniami potrzebuje dziennika operacji lub innego jawnego mechanizmu odzyskiwania.
6. **Stan UI:** osobno wybrany okres, filtry, szkic, edytowany wpis, stan żądania i błąd. Odświeżenie danych nie resetuje szkicu. Starsza odpowiedź asynchroniczna nie zastępuje nowszego widoku.
7. **Typowanie etapami:** zacząć od kontraktu IPC i domeny, korzystając z typów/JSDoc i kontroli statycznej; pełną migrację do TypeScript ocenić po tym etapie.
8. **Jedno źródło aplikacji:** określić rolę startera `WORKTRACE/`; odseparować szablony generatora od jego logiki. Zmiany struktury uwzględnić w packagerze i instalatorach.

## 6. Roadmapa realizacji

Zadania są otwarte, z wyjątkiem pozycji jawnie oznaczonych jako ukończone. Rozmiar S oznacza wąską zmianę, M — kilka powiązanych modułów, L — zmianę przekrojową z testami integracyjnymi. Nie są to estymaty kalendarzowe.

### M0 · Stabilizacja danych i podstawowej obsługi · proponowane 0.3.1

Warunek wejścia: ustalenia tego audytu. Cel: usunąć P0 i błędy podważające wiarygodność wyników.

- [x] **M0.1 / M:** naprawić kontekst tygodnia w save/export i akcjach Today — A01, A06, A07.
- [x] **M0.2 / M:** operować na pojedynczym wystąpieniu wpisu; obsłużyć nieaktualną rewizję — A02.
- [x] **M0.3 / L:** wprowadzić wspólną ochronę zapisu desktop/CLI, atomową podmianę i kopię odzyskiwania — A03.
- [x] **M0.4 / S:** naprawić parser metadanych i przywrócić zielone testy — A05. Parser współdzielony przez UI i eksport; aktualne wyniki w sekcji aktualizacji 30.10.2026.
- [x] **M0.5 / M:** ujednolicić walidację dat, godzin, czasu i tekstu; bezpiecznie obsłużyć zmianę tygodnia — A04, A08. Zastosowano blokadę zmiany tygodnia; docelowe przenoszenie pozostaje otwarte.
- [x] **M0.6 / M:** zabezpieczyć szkic, dodać Cancel i poprawić propagację błędów — A08.
- [x] **M0.7 / M:** naprawić przewijanie i szerokość pola opisu przed pełnym redesignem — A09.
- [x] **M0.8 / M:** dodać testy regresji powyższych błędów przez właściwe warstwy; uruchamiać CI na pull request.

**Odbiór:** `npm test` przechodzi; testy integracyjne potwierdzają prawidłowy tydzień, pojedyncze duplikaty i konflikt zapisu; scenariusz desktop + CLI nie gubi wpisu; błąd zapisu nie usuwa oryginału; użytkownik może dodać i zobaczyć wpis przy 900×620.

### M1 · Podział architektury i wiarygodne testy · proponowane 0.4.0

Zależność: M0. Refaktoring wykonywać małymi zmianami zachowania pokrytego testami.

- [ ] **M1.1 / M:** wydzielić domenę wpisów, dat i metadanych z core/renderera. Częściowo: metadane, czas i filtry są w `entry-domain.cjs`; kalendarz tygodni nadal w core.
- [ ] **M1.2 / M:** wydzielić repozytorium plikowe i usługi operacji/eksportu. Częściowo: blokowanie i zapis w `storage.cjs`; eksport nadal w main.
- [ ] **M1.3 / M:** rozdzielić stan UI od renderowania; opisać typami kontrakt IPC. Typy kontraktu wdrożone; dalszy podział renderera pozostaje otwarty.
- [ ] **M1.4 / M:** rozdzielić main na okno/tray, IPC i eksport; uzupełnić walidację IPC, CSP i politykę nawigacji. Częściowo: CSP, sandbox, blokada nawigacji i wymaganie rewizji wdrożone.
- [x] **M1.5 / M:** zastąpić osobny HTML screenshotu przechwytywaniem prawdziwego UI; poprawić fixture — A10.
- [ ] **M1.6 / M:** ustalić rolę `WORKTRACE/`, wyodrębnić szablony generatora, zaktualizować pakowanie i testować zawartość paczki.

**Odbiór:** reguły danych można testować bez Electron i DOM; podstawowe przepływy mają test przez main/preload/store; screenshot pokazuje znane wpisy z fixture; wszystkie moduły trafiają do paczki; scenariusze CLI pozostają zgodne.

### M2 · Uproszczenie UX i redesign · proponowane 0.5.0

Zależność wdrożenia: M1. Makietę głównego przepływu można dopracować już po audycie.

- [ ] **M2.1 / S:** doprecyzować rolę opcjonalnego czasu i główną grupę użytkowników; przejść scenariusze dodawania, poprawiania i podsumowania.
- [x] **M2.2 / M:** przygotować docelowy ekran Today/History oraz stany empty/loading/error/edit.
- [x] **M2.3 / M:** wprowadzić tokeny stylów, motywy Light/Dark/System, uporządkować CSS i breakpointy.
- [x] **M2.4 / M:** wdrożyć formularz z priorytetem opisu, opcjonalnymi szczegółami i zachowaniem szkicu.
- [x] **M2.5 / M:** wdrożyć listę grupowaną po dniach, osobne metadane i czytelne menu akcji.
- [x] **M2.6 / M:** dodać Undo usunięcia, spójną edycję Save/Cancel i obsługę fokusu/klawiatury.
- [x] **M2.7 / M:** sprawdzić obydwa motywy, skalowanie tekstu, małe okno i stabilność geometrii okna.

**Odbiór:** podstawowy wpis wymaga tylko opisu i zatwierdzenia; formularz i lista działają przy 900×620, 1080×760 i 1440×900; opis nie jest ściskany przez opcjonalne pola; użytkownik przechodzi dodawanie/edycję klawiaturą; błędy zachowują dane formularza. To kryteria projektowe do sprawdzenia, nie osiągnięte już wyniki.

### M3 · Wygodna codzienna praca · proponowane 0.6.0

Zależność: M1 i podstawowe widoki M2.

- [x] **M3.1 / M:** wyszukiwanie opisu i referencji, filtrowanie projektu oraz nawigacja tygodniowa.
- [x] **M3.2 / M:** zdefiniować zakresy wielotygodniowe; filtrować te same dane w liście, podsumowaniu, kopiowaniu i eksporcie. Wybór From/To obejmuje tygodnie w Activity i Insights oraz trafia do kopiowania i eksportu Current view. Reports przyjmuje daty zakresu; źródło i inne opcje raportu pozostają niezależne.
- [ ] **M3.3 / M:** podpowiadanie projektów na podstawie historii, czytelne linki do referencji z dozwolonymi protokołami.
- [ ] **M3.4 / M:** eksport z zakresem, podglądem i kolumnami date/time/message/project/reference/spent; dopracowany PDF. Zakres, filtry i kolumny wdrożone; osobny podgląd eksportu otwarty.
- [ ] **M3.5 / M:** podsumowania czasu/projektów z odróżnieniem braku czasu od zera i błędu wartości.
- [x] **M3.6 / M:** odświeżanie zmian pochodzących z CLI, bez resetowania aktywnego formularza. Widoczne okno sprawdza zmiany co 15 sekund i po odzyskaniu fokusu; kalendarz odświeża także archiwum.
- [ ] **M3.7 / M:** ustawienia katalogu, motywu, zachowania zamknięcia/minimalizacji; pamiętanie geometrii okna.

**Odbiór:** liczba i zakres wpisów zgadzają się między listą, kopiowaniem i eksportem; wpis dodany przez CLI pojawia się bez utraty szkicu; podsumowania odpowiadają fixture; pomiar na uzgodnionym zbiorze, np. 10 000 wpisów w wielu tygodniach, wyznacza ewentualną potrzebę indeksowania.

### M4 · Instalacja, odzyskiwanie i wydanie · kandydat 1.0

Zależność: M0–M3 i wybór platform pierwszego wydania.

- [ ] **M4.1 / L:** przygotować samodzielny pakiet desktopowy zawierający runtime, zaczynając od macOS; ustalić kolejność Windows/Linux.
- [ ] **M4.2 / M:** sprawdzić instalację, aktualizację i odinstalowanie na czystym środowisku z zachowaniem danych.
- [ ] **M4.3 / M:** przygotować podpisywanie/notaryzację dla wybranych platform, zależnie od dostępnych certyfikatów i kont.
- [ ] **M4.4 / M:** objąć paczkę licencją i kompletem potrzebnych plików; zweryfikować mechanizm integralności pobierania.
- [ ] **M4.5 / M:** udostępnić użytkownikowi przywracanie kopii i przećwiczyć odzyskanie po przerwanym zapisie/przenoszeniu.
- [ ] **M4.6 / M:** macierz testów systemowych, duże dane, testy dostępności i rzeczywistego UI; usunąć blokujące regresje.
- [x] **M4.7 / S:** zaktualizować README, screenshoty, changelog, instrukcję backupu i zgłaszania błędów.

**Odbiór:** deklarowane platformy przechodzą smoke testy desktopu; instalacja nie wymaga narzędzi deweloperskich; aktualizacja zachowuje logi i ustawienia; odzyskanie jest sprawdzone; brak otwartych P0/P1. Automatyczne aktualizacje mogą zostać zaplanowane osobno po ustabilizowaniu pakowania i podpisów.

### Później — rozszerzenia wymagające potwierdzenia potrzeby

- Integracja z Jira i przygotowywanie podsumowań do zewnętrznych systemów.
- Automatyczny timer, przypomnienia i szablony aktywności.
- Synchronizacja, współdzielone przestrzenie i role.
- Import z innych narzędzi, API, format z trwałymi ID lub baza danych.

## Kierunek zespołowy i raportowy — 30.10.2026

**Cel produktu:** Tavri ma pozostać szybkim dziennikiem osobistym, a dla Admina/PO stać się czytelnym miejscem do łączenia świadomie przekazanych logów i przygotowania raportu zespołu. Liczba aktywności nie jest miarą jakości ani efektywności osoby. Raport powinien pokazywać zakres danych, datę/sposób importu i pokrycie czasu, by nie sugerować, że brak czasu oznacza zero pracy.

### Zrobione lokalnie — pierwszy pionowy przekrój

- [x] Przełącznik Personal / Admin / PO w Settings oraz widok Team. To tryb interfejsu, bez kont i kontroli uprawnień.
- [x] Import tygodniowych plików Tavri `.log` wybranych ręcznie, przypisanie do osoby i osobne migawki w `.tavri-team/team.json`. Ponowny import zastępuje ten sam tydzień; usunięcie osoby nie zmienia jej plików źródłowych ani własnego dziennika.
- [x] Walidacja nazwy tygodnia, wpisów i dat; limity rozmiaru, blokada zapisu, atomowa podmiana i jedna poprzednia wersja manifestu.
- [x] Reports: dowolny zakres dat, źródło osobiste/zespołowe, osoba, metryka aktywności/czasu, przełączane wykresy okresów/projektów/osób, wskaźnik pokrycia czasu i eksport wizualnego PDF. Przed eksportem sprawdzana jest rewizja danych.
- [x] Test domenowy i natywny przepływ Electron oraz dwa podglądy UI.

### T1 · Wiarygodne dane zespołu — następny etap

- [ ] **P1:** dodawać paczkę wielu tygodni przez przeciągnięcie folderu lub archiwum ZIP, z podglądem plików, liczby wpisów i dat przed zatwierdzeniem.
- [ ] **P1:** wykrywać duplikaty osób, różne nazwy tej samej osoby, kolizje tygodni i rozbieżności przy ponownym imporcie; pokazać datę importu, pochodzenie oraz historię zmian.
- [ ] **P1:** dodać możliwość usunięcia jednego tygodnia, cofnięcia ostatniego importu i odzyskania manifestu z kopii w UI.
- [ ] **P2:** obsłużyć niepełne okresy pracy, dni wolne i brak raportu od osoby. Rozdzielić „brak danych” od „brak aktywności”.

**Odbiór:** import 10 osób i roku logów daje powtarzalne liczby, a zmiana lub usunięcie migawki jest odwracalne; własne pliki pozostają bez zmian.

### T2 · Raporty do pracy PO — po T1

- [ ] **P1:** zapisywać szablony raportów i szybkie okresy (tydzień, sprint, miesiąc, kwartał), z wybranym projektem i referencją/ticketem.
- [ ] **P1:** dodać tabelę danych pod wykresami i eksport CSV/XLSX oraz możliwość kopiowania podsumowania; PDF powinien zawierać jawny zakres, osoby, filtry i datę stanu importu.
- [ ] **P1:** dodać porównanie okresów i trendu projektów z kontekstem, bez rankingów produktywności osób.
- [ ] **P2:** udostępnić anonimizację lub ukrywanie nazw osób przy dzieleniu raportu, z podglądem przed eksportem.

**Odbiór:** zapisany szablon odtwarza ten sam zakres/filtry/wykresy; PDF i tabela mają te same sumy; raport nie liczy brakującego czasu jako przepracowane 0 minut.

### T3 · Prawdziwa współpraca i role — osobna decyzja architektoniczna

- [ ] Zdecydować, czy wystarczy szyfrowana wymiana plików, czy potrzebna jest usługa zespołowa. Obecny „Admin / PO” jest wyłącznie lokalnym trybem pracy.
- [ ] Jeśli powstanie usługa: uwierzytelnianie, zgoda na udostępnianie, role i zakres widoczności, audyt dostępu, usuwanie danych, synchronizacja z konfliktami i polityka retencji.
- [ ] Przed wdrożeniem zdalnym zweryfikować zasady prywatności i wymagania organizacji. Brak automatycznego wysyłania logów bez świadomego działania użytkownika.

**Priorytet kolejnych prac:** T1.1 podgląd importu → T1.2 historia i konflikty → T2.1 szablony i filtry → T2.2 eksport tabelaryczny → decyzja T3. Pozostałe zadania M0–M4 pozostają niezależnymi warunkami jakości przed wydaniem 1.0.

Każde rozszerzenie powinno mieć konkretny scenariusz użytkownika oraz ocenę wpływu na lokalne dane, instalację i utrzymanie. Nie jest warunkiem osiągnięcia dobrej jakości podstawowej aplikacji.

## 7. Najbliższe małe zmiany do realizacji

1. **Naprawa tygodnia:** jawny kontekst save/export oraz test, który odtwarza nadpisanie bieżącego pliku przez archiwum.
2. **Naprawa metadanych:** poprawny parser, zielone istniejące testy i sprawdzenie ponownej edycji wpisu.
3. **Bezpieczne operacje na wpisie:** pojedyncze wystąpienie, rewizja, właściwy tydzień Today i ochrona zapisu.
4. **Minimalna poprawa layoutu:** dostępna lista przy 900 px, szerokie pole opisu i stabilne przewijanie.
5. **Nowy ekran główny:** makieta i wdrożenie jednego pełnego przepływu dodanie → lista → edycja → Undo, po zabezpieczeniu danych.

## 8. Zasady dalszego prowadzenia projektu

- Każda naprawa danych otrzymuje test odtwarzający błąd przed zmianą.
- Każdy etap kończy się przejściem swoich kryteriów odbioru; sama zmiana wyglądu lub zielony test jednostkowy nie zamyka przepływu integracyjnego.
- Testy modyfikujące logi pracują na katalogach tymczasowych i przypiętej dacie.
- Refaktoring formatu danych wymaga strategii zgodności, kopii, migracji oraz cofnięcia migracji.
- Screenshoty dokumentacji pochodzą z rzeczywistego UI i fixture; nie zastępują testów zachowania.
- Przy zamykaniu zadania dopisać datę, commit/PR i wynik weryfikacji. Audyt pozostaje zapisem stanu z 29.10.2026, a checkboxy roadmapy opisują postęp wdrożenia.
