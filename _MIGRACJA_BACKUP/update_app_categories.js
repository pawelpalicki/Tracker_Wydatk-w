const admin = require('./functions/node_modules/firebase-admin');
const fs = require('fs');

async function run() {
    try {
        console.log('--- RESET I AKTUALIZACJA STRUKTURY KATEGORII ---');
        
        const serviceAccountPath = './service-account.json';
        if (!fs.existsSync(serviceAccountPath)) {
            console.error('BŁĄD: Brak pliku service-account.json. Pobierz go z Firebase Console.');
            return;
        }

        if (admin.apps.length === 0) {
            admin.initializeApp({
                credential: admin.credential.cert(require(serviceAccountPath)),
                projectId: 'trackerwydatkowapp'
            });
        }

        const db = admin.firestore();
        const userId = 'GPE8821EdiDKNIYbpJ6S';

        // Definicja nowej, czystej struktury
        const categories = [
            // 1. Spożywcze
            { id: 'cat1', name: 'Spożywcze', icon: 'fa-shopping-basket', color: '#10b981', parentId: null },
            { id: 'cat1_1', name: 'Jedzenie/Napoje', parentId: 'cat1', icon: 'fa-apple-alt' },
            { id: 'cat1_2', name: 'Słodycze/Przekąski', parentId: 'cat1', icon: 'fa-cookie-bite' },
            { id: 'cat1_3', name: 'Dania gotowe/Z dostawy', parentId: 'cat1', icon: 'fa-moped' },

            // 2. Mieszkanie
            { id: 'cat2', name: 'Mieszkanie', icon: 'fa-home', color: '#3b82f6', parentId: null },
            { id: 'cat2_1', name: 'Czynsz', parentId: 'cat2', icon: 'fa-building' },
            { id: 'cat2_2', name: 'Media(prąd/gaz/woda)', parentId: 'cat2', icon: 'fa-bolt' },
            { id: 'cat2_3', name: 'Wyposażenie', parentId: 'cat2', icon: 'fa-couch' },
            { id: 'cat2_4', name: 'Chemia', parentId: 'cat2', icon: 'fa-jug-detergent' },
            { id: 'cat2_5', name: 'Remonty/Naprawy', parentId: 'cat2', icon: 'fa-tools' },
            { id: 'cat2_6', name: 'Artykuły gospodarcze', parentId: 'cat2', icon: 'fa-recycle' },

            // 3. Zdrowie & Uroda
            { id: 'cat3', name: 'Zdrowie & Uroda', icon: 'fa-heartbeat', color: '#ef4444', parentId: null },
            { id: 'cat3_1', name: 'lekarz', parentId: 'cat3', icon: 'fa-stethoscope' },
            { id: 'cat3_2', name: 'apteka', parentId: 'cat3', icon: 'fa-pills' },
            { id: 'cat3_3', name: 'Usługi kosmetyczne', parentId: 'cat3', icon: 'fa-cut' },
            { id: 'cat3_4', name: 'Kosmetyki', parentId: 'cat3', icon: 'fa-spa' },
            { id: 'cat3_5', name: 'Higieniczne', parentId: 'cat3', icon: 'fa-toilet-paper' },
            { id: 'cat3_6', name: 'Suplementy', parentId: 'cat3', icon: 'fa-capsules' },

            // 4. Transport
            { id: 'cat4', name: 'Transport', icon: 'fa-car', color: '#f59e0b', parentId: null },
            { id: 'cat4_1', name: 'Samochód', parentId: 'cat4', icon: 'fa-gas-pump' },
            { id: 'cat4_2', name: 'Taxi', parentId: 'cat4', icon: 'fa-taxi' },
            { id: 'cat4_3', name: 'Komunikacja miejska', parentId: 'cat4', icon: 'fa-bus' },
            { id: 'cat4_4', name: 'Podróże', parentId: 'cat4', icon: 'fa-suitcase-rolling' },

            // 5. Rozrywka
            { id: 'cat5', name: 'Rozrywka', icon: 'fa-film', color: '#8b5cf6', parentId: null },
            { id: 'cat5_1', name: 'Gastronomia', parentId: 'cat5', icon: 'fa-hamburger' },
            { id: 'cat5_2', name: 'Kultura', parentId: 'cat5', icon: 'fa-theater-masks' },
            { id: 'cat5_3', name: 'Subskrypcje (VOD)', parentId: 'cat5', icon: 'fa-play-circle' },
            { id: 'cat5_4', name: 'Hobby', parentId: 'cat5', icon: 'fa-gamepad' },
            { id: 'cat5_5', name: 'Sport', parentId: 'cat5', icon: 'fa-football-ball' },

            // 6. Finanse
            { id: 'cat6', name: 'Finanse', icon: 'fa-file-invoice-dollar', color: '#06b6d4', parentId: null },
            { id: 'cat6_1', name: 'Spłata kredytów', parentId: 'cat6', icon: 'fa-hand-holding-usd' },
            { id: 'cat6_2', name: 'Oszczędności / Inwestycje', parentId: 'cat6', icon: 'fa-piggy-bank' },

            // 7. Odzież
            { id: 'cat7', name: 'Odzież', icon: 'fa-tshirt', color: '#ec4899', parentId: null },
            { id: 'cat7_1', name: 'Ubrania', parentId: 'cat7', icon: 'fa-tshirt' },
            { id: 'cat7_2', name: 'Buty', parentId: 'cat7', icon: 'fa-shoe-prints' },
            { id: 'cat7_3', name: 'Dodatki', parentId: 'cat7', icon: 'fa-gem' },

            // 8. Edukacja
            { id: 'cat8', name: 'Edukacja', icon: 'fa-graduation-cap', color: '#eab308', parentId: null },
            { id: 'cat8_1', name: 'Kursy/Szkolenia', parentId: 'cat8', icon: 'fa-chalkboard-teacher' },
            { id: 'cat8_2', name: 'Książki', parentId: 'cat8', icon: 'fa-book-open' },

            // 9. Inne
            { id: 'cat9', name: 'Inne', icon: 'fa-ellipsis-h', color: '#64748b', parentId: null },
            { id: 'cat9_1', name: 'Alkohol/Papierosy', parentId: 'cat9', icon: 'fa-smoking' },
            { id: 'cat9_2', name: 'Kaucje', parentId: 'cat9', icon: 'fa-archive' },
            { id: 'cat9_3', name: 'Internet/TV', parentId: 'cat9', icon: 'fa-tv' },
            { id: 'cat9_4', name: 'Telefon', parentId: 'cat9', icon: 'fa-mobile-alt' },
            { id: 'cat9_5', name: 'Elektronika', parentId: 'cat9', icon: 'fa-microchip' },
            { id: 'cat9_6', name: 'Prezenty', parentId: 'cat9', icon: 'fa-gift' },
            { id: 'cat9_7', name: 'Zwierzęta', parentId: 'cat9', icon: 'fa-dog' },
            { id: 'cat9_8', name: 'Pozostałe', parentId: 'cat9', icon: 'fa-ellipsis-h' }
        ];

        console.log(`Aktualizuję profil użytkownika ${userId}...`);
        
        await db.collection('users').doc(userId).update({
            structuredCategories: categories,
            customCategories: ['inne'] // Wyczyść starą listę płaską
        });

        console.log('✅ SUKCES! Kategorie w aplikacji zostały zaktualizowane.');
        console.log('Możesz teraz odświeżyć aplikację.');
        process.exit(0);
    } catch (err) {
        console.error('❌ BŁĄD:', err.message);
        process.exit(1);
    }
}

run();
