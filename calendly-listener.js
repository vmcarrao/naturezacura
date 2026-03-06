/**
 * Booking & Course Payment Logic
 * Replaces Calendly flow with pay-first, then schedule.
 * Uses AppConfig for global settings.
 */

// --- Buy Course (from index.html course cards) ---
window.buyCourse = function (courseKey) {
    const price = window.AppConfig.prices[courseKey];
    const productName = window.AppConfig.products[courseKey];

    if (!price) {
        alert("Curso não encontrado.");
        return;
    }

    triggerStripeCheckout({
        type: "course",
        serviceKey: courseKey,
        productName: productName,
        amount: price,
    });
};

// --- Book Service (from service detail pages) ---
window.bookService = function (serviceKey) {
    const service = window.AppConfig.services[serviceKey];

    if (!service) {
        alert("Serviço não encontrado.");
        return;
    }

    triggerStripeCheckout({
        type: "appointment",
        serviceKey: serviceKey,
        productName: service.name,
        amount: service.price,
    });
};

// --- Shared Stripe Checkout Trigger ---
function triggerStripeCheckout(data) {
    if (typeof firebase === "undefined") {
        console.error("Firebase not initialized.");
        alert("Erro no sistema: Firebase não conectado.");
        return;
    }

    const functions = firebase.functions();
    const createStripeCheckout = functions.httpsCallable("createStripeCheckout");

    // Show loading feedback on clicked button
    const btn = document.activeElement;
    let originalText = "";
    if (btn && btn.tagName === "BUTTON") {
        originalText = btn.innerText;
        btn.innerText = "Carregando...";
        btn.disabled = true;
    }

    createStripeCheckout(data)
        .then((result) => {
            const url = result.data.url;
            window.location.href = url;
        })
        .catch((error) => {
            console.error("Checkout error:", error);
            alert("Ocorreu um erro ao iniciar o pagamento. Tente novamente mais tarde.");
            if (btn && btn.tagName === "BUTTON") {
                btn.innerText = originalText || "Tente Novamente";
                btn.disabled = false;
            }
        });
}
