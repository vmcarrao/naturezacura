/**
 * Global Configuration for Natureza Cura
 */
const AppConfig = {
    // Pricing configurations (in cents)
    prices: {
        cristais: 19700, // R$ 197,00
        chakras: 25900   // R$ 259,00
    },
    // Product Names
    products: {
        cristais: "Curso de Cristais",
        chakras: "Jornada dos Chakras"
    },
    // Firebase Config - TODO: Replace with actual values
    firebase: {
        apiKey: "YOUR_API_KEY",
        authDomain: "naturezacura.firebaseapp.com",
        projectId: "naturezacura",
        storageBucket: "naturezacura.appspot.com",
        messagingSenderId: "YOUR_SENDER_ID",
        appId: "YOUR_APP_ID"
    },
    // Stripe Publishable Key (if needed for frontend-only Checkout, though we use backend creation)
    stripe: {
        publishableKey: "pk_test_YOUR_KEY"
    }
};

// Make it available globally
window.AppConfig = AppConfig;
