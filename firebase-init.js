const firebaseConfig = window.AppConfig.firebase;

// Initialize Firebase
if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
    console.log("Firebase initialized");
} else {
    console.error("Firebase SDK not found");
}
