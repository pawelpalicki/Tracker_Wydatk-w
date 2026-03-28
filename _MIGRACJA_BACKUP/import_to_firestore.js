const admin = require('./functions/node_modules/firebase-admin');
const fs = require('fs');

async function run() {
    try {
        console.log('--- ROZPOCZYNAM IMPORT DO FIRESTORE ---');
        
        // Inicjalizacja z użyciem klucza konta serwisowego
        const serviceAccountPath = './service-account.json';
        
        if (fs.existsSync(serviceAccountPath)) {
            admin.initializeApp({
                credential: admin.credential.cert(require(serviceAccountPath)),
                projectId: 'trackerwydatkowapp'
            });
        } else {
            console.log('Nie znaleziono service-account.json, próbuję inicjalizacji domyślnej...');
            admin.initializeApp({
                projectId: 'trackerwydatkowapp'
            });
        }
        
        const db = admin.firestore();
        const dataPath = 'wydatki_zmigrowane_final.json';
        
        if (!fs.existsSync(dataPath)) {
            console.error('BŁĄD: Nie znaleziono pliku ' + dataPath + '. Najpierw wygeneruj go skryptem migracyjnym.');
            return;
        }

        const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        console.log(`Wczytano ${data.length} dokumentów do aktualizacji.`);

        let batch = db.batch();
        let count = 0;
        let total = 0;

        for (const purchase of data) {
            if (!purchase.id) {
                console.warn('Pominięto wpis bez ID.');
                continue;
            }
            
            const docRef = db.collection('expenses').doc(purchase.id);
            
            // Ssurgical update: podmień tylko items i usuń tags z poziomu dokumentu
            batch.update(docRef, {
                items: purchase.items,
                tags: admin.firestore.FieldValue.delete()
            });

            count++;
            total++;

            // Batch w Firestore ma limit 500 operacji
            if (count === 400) {
                await batch.commit();
                console.log(`Postęp: ${total} / ${data.length}...`);
                batch = db.batch();
                count = 0;
            }
        }

        if (count > 0) {
            await batch.commit();
        }

        console.log('\n✅ SUKCES!');
        console.log(`Zaktualizowano pomyślnie ${total} dokumentów w kolekcji 'expenses'.`);
        console.log('Twoja baza w Firestore ma teraz nową strukturę kategorii i tagów.');
        process.exit(0);
    } catch (err) {
        console.error('\n❌ BŁĄD PODCZAS IMPORTU:');
        console.error(err.message);
        console.log('\nUpewnij się, że jesteś zalogowany w Firebase CLI: firebase login');
        process.exit(1);
    }
}

run();
