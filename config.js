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
    // Service configurations (appointments)
    services: {
        "terapia-natural": { name: "Terapia Natural", price: 18000, duration: 90 },   // R$ 180,00
        "astrologia": { name: "Astrologia", price: 22000, duration: 60 },        // R$ 220,00
        "tarot": { name: "Tarot Terapêutico", price: 15000, duration: 50 },  // R$ 150,00
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
    // Stripe Publishable Key
    stripe: {
        publishableKey: "pk_live_51T3jmWJ3BPB3ENkhzJ7cnBX0PmUlwQWAGDrKiOJYFH5QQzcZn85q2ZS9sdLnvQRjPJk6YQ9npu7aAzcZD7hyZn6m00ebsVETjt"
    }
};

// Make it available globally
window.AppConfig = AppConfig;
