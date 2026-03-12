const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('./serviceAccountKey.json');
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function test() {
   const snap = await db.collection("orders").get();
   const orders = snap.docs.map(d => ({id: d.id, ...d.data()}));
   console.log("Total Orders:", orders.length);
   orders.forEach(o => {
       console.log(o.createdAt ? o.createdAt.toDate() : "No Date", "| status:", o.paymentStatus || o.status, "| amount:", o.amount);
   });
}
test();
