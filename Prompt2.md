## Kontekst projektu
Masz przed sobą działającą aplikację webową do śledzenia wydatków osobistych, napisaną 
w vanilla JavaScript, deployowaną na Firebase Hosting. Aplikacja działa poprawnie — 
Twoim zadaniem NIE jest jej przepisanie ani naprawianie błędów, lecz wyłącznie 
przygotowanie planu reorganizacji kodu.

Aplikacja składa się z kilkunastu plików JS, jednego HTML i jednego CSS.
Właściciel pracuje nad nią samodzielnie w trybie "vibe-coding" (z pomocą AI).
Brak automatycznych testów — testowanie odbywa się ręcznie po wdrożeniu na Firebase.

## Widoki aplikacji
Aplikacja posiada następujące ekrany:
- Dashboard z podsumowaniem miesięcznym i listą ostatnich zakupów
- Pełna lista zakupów z filtrami
- Formularz dodawania zakupu (4 tryby: ręczny, zdjęcie paragonu z analizą AI, 
  nagranie głosowe z transkrypcją i analizą AI, plik z analizą AI)
- Analiza długoterminowa (wykres słupkowy porównawczy, zakładki)
- Budżety specjalne
- Ustawienia z podwidokami: zarządzanie kategoriami i tagami, budżet miesięczny, 
  budżety specjalne, wydatki cykliczne

## Twoje zadanie
Przygotuj plan refaktoryzacji. Samego kodu nie piszesz.

## Priorytety (w kolejności ważności)
1. Uporządkowanie i czytelność — każdy plik powinien mieć jasno określoną rolę
2. Łatwość dalszego rozwijania przez jedną osobę
3. Opcjonalnie: jeśli przy analizie zauważysz oczywiste problemy techniczne, 
   odnotuj je osobno na końcu — ale nie mogą dominować planu

## Docelowa filozofia struktury plików
- Osobny moduł dla każdego głównego widoku
- Osobne pliki dla elementów współdzielonych przez kilka widoków 
  (np. wspólne komponenty UI, funkcje pomocnicze, nawigazja itp)
- Osobny plik dla konfiguracji, stałych, danych autoryzacyjnych itp.
- Pliki mogą być dłuższe, pod warunkiem że są dobrze podzielone 
  na sekcje z czytelnymi komentarzami opisującymi każdą sekcję

## Kwestia ES Modules — oceń sam na podstawie kodu
Właściciel rozważa przejście z klasycznego vanilla JS na ES Modules (system import/export).
Na podstawie analizy kodu oceń czy to ma sens. Weź pod uwagę:
- Czy korzyści z organizacji kodu są warte ryzyka i złożoności tej zmiany?
- Kompatybilność z Firebase Hosting bez dodatkowych narzędzi do budowania
- Prostotę — właściciel ceni prosty, zrozumiały kod
Jeśli rekomendacja brzmi "nie" — zaproponuj konkretne alternatywne podejście.

## Poziom szczegółowości planu — WAŻNE
Plan ma być średnio szczegółowy: opisuj JAKIE GRUPY funkcjonalności przenieść i GDZIE, 
ale bez wskazywania konkretnych funkcji czy linii kodu. 
Zbyt szczegółowy plan będzie zawierał błędy, bo żaden agent nie jest w stanie 
jednorazowo dogłębnie przeanalizować całego kodu — i coś nieuchronnie pominie.
Wykonawca planu (kolejny agent AI) będzie miał dostęp do kodu i sam doprecyzuje detale.

## Testowanie podczas refaktoryzacji
- Aplikacja nie musi działać przez cały czas w trakcie prac
- Plan podziel na etapy, z których każdy kończy się punktem testów manualnych
- NIE dodawaj tymczasowego kodu "mostowego" (warstwy kompatybilności, pomocnicze 
  wrappery itp.) tylko po to, żeby aplikacja cały czas chodziła — takie pozostałości 
  zaciemniają kod i trudno je potem usunąć
- Każdy etap powinien być logicznie zamknięty i sensowny do przetestowania jako całość

## Oczekiwany format odpowiedzi
1. Krótkie podsumowanie obecnej struktury kodu (co i gdzie jest, skala chaosu)
2. Rekomendacja w sprawie ES Modules z uzasadnieniem
3. Proponowana docelowa lista plików z jednozdaniowym opisem roli każdego
4. Plan etapów prac z zaznaczonymi punktami testów manualnych
5. (Opcjonalnie) Osobna lista zauważonych problemów technicznych do rozważenia — 
   wyraźnie oddzielona od głównego planu