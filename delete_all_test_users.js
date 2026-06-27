const admin = require('./functions/node_modules/firebase-admin');
const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

async function run() {
    try {
        console.log('--- WYSZUKIWANIE UŻYTKOWNIKÓW TESTOWYCH ---');
        
        const serviceAccountPath = './service-account.json';
        if (!fs.existsSync(serviceAccountPath)) {
            console.error('BŁĄD: Brak pliku service-account.json. Pobierz go z Firebase Console.');
            process.exit(1);
        }

        if (admin.apps.length === 0) {
            admin.initializeApp({
                credential: admin.credential.cert(require(serviceAccountPath)),
            });
        }

        const auth = admin.auth();
        const db = admin.firestore();
        
        let allUsers = [];
        let nextPageToken;
        
        // Pobieranie wszystkich użytkowników
        do {
            const listUsersResult = await auth.listUsers(1000, nextPageToken);
            allUsers = allUsers.concat(listUsersResult.users);
            nextPageToken = listUsersResult.pageToken;
        } while (nextPageToken);

        // Filtrujemy tylko testowych użytkowników
        // Przykładowy filtr: ma słowo 'test', 'example', 'agent' lub jest z 'test.com'
        const testUsers = allUsers.filter(user => {
            if (!user.email) return false;
            const email = user.email.toLowerCase();
            return email.includes('test') || 
                   email.includes('example') || 
                   email.includes('agent') || 
                   email.includes('dummy');
        });

        if (testUsers.length === 0) {
            console.log('Nie znaleziono żadnych kont testowych (zawierających "test", "example", "agent" w emailu).');
            process.exit(0);
        }

        console.log(`\nZnaleziono ${testUsers.length} testowych kont:`);
        testUsers.forEach(u => console.log(` - ${u.email} (UID: ${u.uid})`));

        const answer = await askQuestion('\nCzy chcesz usunąć te konta oraz wszystkie ich dane w bazie Firestore? (T/N): ');
        
        if (answer.trim().toLowerCase() !== 't') {
            console.log('Przerwano operację.');
            process.exit(0);
        }

        console.log('\n--- ROZPOCZYNAM USUWANIE ---');

        const collections = [
            'expenses',
            'budgets',
            'recurringExpenses',
            'specialBudgets',
            'users' 
        ];

        for (const user of testUsers) {
            try {
                console.log(`\nPrzetwarzam: ${user.email}...`);
                const uid = user.uid;

                // Usuwanie dokumentów powiązanych z użytkownikiem
                for (const colName of collections) {
                    const snapshot = await db.collection(colName).where('userId', '==', uid).get();
                    if (!snapshot.empty) {
                        const batch = db.batch();
                        snapshot.docs.forEach(doc => batch.delete(doc.ref));
                        await batch.commit();
                        console.log(`  - Usunięto ${snapshot.size} dokumentów z '${colName}'.`);
                    }
                    
                    if (colName === 'users') {
                        const userDoc = await db.collection('users').doc(uid).get();
                        if (userDoc.exists) {
                            await userDoc.ref.delete();
                            console.log(`  - Usunięto profil z 'users'.`);
                        }
                    }
                }

                // Usuwanie samego użytkownika z Auth
                await auth.deleteUser(uid);
                console.log(`  - Konto Auth usunięte trwale.`);

            } catch (err) {
                console.error(`  - Błąd podczas usuwania ${user.email}:`, err.message);
            }
        }

        console.log('\n✅ CZYSZCZENIE ZAKOŃCZONE.');
        process.exit(0);

    } catch (err) {
        console.error('\n❌ KRYTYCZNY BŁĄD:', err.message);
        process.exit(1);
    }
}

run();
