const admin = require('./functions/node_modules/firebase-admin');
const fs = require('fs');

async function run() {
    try {
        console.log('--- ROZPOCZYNAM CZYSZCZENIE UŻYTKOWNIKÓW TESTOWYCH ---');

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
        const auth = admin.auth();

        const emails = [
            'wf1.917947ad.102751.a@outlook.com',
            'grader917947d8497721782550000@gmail.com',
            'caas.review.20260627.0949@gmail.com',
            'grader176@ex.com',
            'grader917947ad2f094297@xample.com'
        ];

        for (const email of emails) {
            try {
                console.log(`\nPrzetwarzam: ${email}...`);

                // 1. Znajdź użytkownika w Auth
                let userRecord;
                try {
                    userRecord = await auth.getUserByEmail(email);
                } catch (e) {
                    if (e.code === 'auth/user-not-found') {
                        console.log(`  - Użytkownik nie istnieje w Firebase Auth. Pomijam.`);
                        continue;
                    }
                    throw e;
                }

                const uid = userRecord.uid;
                console.log(`  - Znaleziono UID: ${uid}`);

                // 2. Usuń dokumenty z kolekcji Firestore
                const collections = [
                    'expenses',
                    'budgets',
                    'recurringExpenses',
                    'specialBudgets',
                    'users' // Na końcu usuwamy profil/metadane
                ];

                for (const colName of collections) {
                    const snapshot = await db.collection(colName).where('userId', '==', uid).get();
                    if (!snapshot.empty) {
                        const batch = db.batch();
                        snapshot.docs.forEach(doc => batch.delete(doc.ref));
                        await batch.commit();
                        console.log(`  - Usunięto ${snapshot.size} dokumentów z '${colName}'.`);
                    } else {
                        // Kolekcja users ma UID jako ID dokumentu, sprawdzamy to też
                        if (colName === 'users') {
                            const userDoc = await db.collection('users').doc(uid).get();
                            if (userDoc.exists) {
                                await userDoc.ref.delete();
                                console.log(`  - Usunięto dokument profilu z 'users'.`);
                            }
                        }
                    }
                }

                // 3. Usuń konto z Firebase Auth
                await auth.deleteUser(uid);
                console.log(`  - Konto Auth usunięte trwale.`);

            } catch (err) {
                console.error(`  - Błąd podczas usuwania ${email}:`, err.message);
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
