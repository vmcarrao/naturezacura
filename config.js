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
    // Firebase Config
    firebase: {
        apiKey: "AIzaSyAWPrVNAJ-6pwlxdQMweu-ru8pxIfsx7V4",
        authDomain: "naturezacura-d0f70.firebaseapp.com",
        projectId: "naturezacura-d0f70",
        storageBucket: "naturezacura-d0f70.firebasestorage.app",
        messagingSenderId: "421753901082",
        appId: "1:421753901082:web:08990ab830bcd7160141a3",
        measurementId: "G-995927BJNK"
    },
    // Stripe Publishable Key (if needed for frontend-only Checkout, though we use backend creation)
    stripe: {
        publishableKey: "pk_test_YOUR_KEY"
    }
};

// Make it available globally
window.AppConfig = AppConfig;
