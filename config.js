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
        "mapa-astral": { name: "Leitura de Mapa Astral", price: 51200, duration: 80, buffer: 20, blockDuration: 100 },
        "mapa-astral-transitos": { name: "Leitura de Mapa Astral com Trânsitos", price: 40400, duration: 60, buffer: 15, blockDuration: 75 },
        "terapia-natural": { name: "Sessão de Terapia Natural", price: 23300, duration: 50, buffer: 15, blockDuration: 65 },
        "revolucao-solar": { name: "Leitura do Mapa da Revolução Solar + Sinastria", price: 56600, duration: 80, buffer: 20, blockDuration: 100 },
        "tarot": { name: "Tarot Terapêutico", price: 33200, duration: 50, buffer: 15, blockDuration: 65 },
        "mapa-astral-infantil": { name: "Leitura de Mapa Astral Infantil", price: 51200, duration: 80, buffer: 20, blockDuration: 100 },
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
