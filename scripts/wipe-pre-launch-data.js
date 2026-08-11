import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const firebaserc = JSON.parse(fs.readFileSync(join(__dirname, '..', '.firebaserc'), 'utf8'));
const EXPECTED_PROJECT_ID = firebaserc.projects.default;

// Sourced from firebase.json so the wipe always targets the same named
// database the deployed Functions write to. Never hardcode a second copy.
const firebaseConfig = JSON.parse(fs.readFileSync(join(__dirname, '..', 'firebase.json'), 'utf8'));
const DATABASE_ID = firebaseConfig.firestore[0].database;
const args = process.argv.slice(2);
const isExecute = args.includes('--execute');

if (isExecute && !args.includes('--env=production')) {
  console.error('\nERROR: --execute requires --env=production. Re-run as: node wipe-pre-launch-data.js --execute --env=production\n');
  process.exit(1);
}

const app = initializeApp({
  credential: applicationDefault(),
});

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const connectedProjectId = credPath
  ? JSON.parse(fs.readFileSync(credPath, 'utf8')).project_id || 'unknown'
  : 'unknown';
if (connectedProjectId !== EXPECTED_PROJECT_ID) {
  console.error(`\nERROR: Expected Firebase project '${EXPECTED_PROJECT_ID}' but connected to '${connectedProjectId}'. Aborting — no data has been touched.\n`);
  process.exit(1);
}

const db = getFirestore(DATABASE_ID);

async function deleteQuerySnapshot(snapshot) {
  if (!isExecute) return snapshot.size;

  let deleted = 0;
  for (const doc of snapshot.docs) {
    await doc.ref.delete();
    deleted += 1;
  }
  return deleted;
}

async function deleteCollection(dbRef, collectionName) {
  const snapshot = await dbRef.collection(collectionName).get();
  return deleteQuerySnapshot(snapshot);
}

async function deleteBriefings(dbRef) {
  const snapshot = await dbRef.collection('briefings').get();

  let briefingMessages = 0;
  let briefings = 0;

  for (const briefingDoc of snapshot.docs) {
    const data = briefingDoc.data();
    if (data.isShowcase === true) continue;

    const messagesSnapshot = await briefingDoc.ref.collection('messages').get();
    briefingMessages += await deleteQuerySnapshot(messagesSnapshot);

    if (isExecute) {
      await briefingDoc.ref.delete();
    }
    briefings += 1;
  }

  return { briefings, briefingMessages };
}

async function main() {
  console.log(`Project ID: ${EXPECTED_PROJECT_ID} ✓`);
  console.log(isExecute ? 'Environment: production ✓' : 'Environment: dry run (no --execute) ✓');

  if (isExecute) {
    console.log('EXECUTE MODE — documents will be permanently deleted.');
  } else {
    console.log('DRY RUN — no documents will be deleted. Pass --execute to perform deletion.');
  }

  console.log(`Database: ${DATABASE_ID}`);
  console.log(`Started: ${Timestamp.now().toDate().toISOString()}`);

  const briefingSummary = await deleteBriefings(db);
  const summary = {
    ...briefingSummary,
    developments: await deleteCollection(db, 'developments'),
    quotas: await deleteCollection(db, 'quotas'),
  };

  const verb = isExecute ? 'Deleted' : 'Would delete';
  console.log(`${verb} ${summary.briefings} non-showcase briefings.`);
  console.log(`${verb} ${summary.briefingMessages} briefing messages.`);
  console.log(`${verb} ${summary.developments} developments.`);
  console.log(`${verb} ${summary.quotas} quotas.`);
}

main().catch((error) => {
  console.error('Pre-launch wipe failed:', error);
  process.exitCode = 1;
});
