/**
 * Calendly & Course Payment Logic
 * Uses AppConfig for global settings.
 */

// 1. Calendly Event Listener
function isCalendlyEvent(e) {
    return e.data.event && e.data.event.indexOf('calendly') === 0;
}

window.addEventListener('message', function (e) {
    if (isCalendlyEvent(e)) {
        // console.log('Calendly Event:', e.data.event);

        if (e.data.event === 'calendly.event_scheduled') {
            const payload = e.data.payload;
            // console.log('Event Scheduled:', payload);

            const eventURI = payload.event.uri;
            const inviteeURI = payload.invitee.uri;

            // Trigger Backend Function
            triggerStripeCheckout({
                type: 'appointment',
                eventURI: eventURI,
                inviteeURI: inviteeURI
                // inviteeEmail and inviteeName omitted to prompt via Stripe Checkout
            });
        }
    }
});

// 2. Buy Course Function (Called from HTML)
window.buyCourse = function (courseKey) {
    const price = window.AppConfig.prices[courseKey];
    const productName = window.AppConfig.products[courseKey];

    if (!price) {
        alert("Curso não encontrado.");
        return;
    }

    triggerStripeCheckout({
        type: 'course',
        courseKey: courseKey,
        productName: productName,
        amount: price
        // inviteeEmail omitted to prompt via Stripe Checkout
    });
};

// 3. Shared Stripe Checkout Trigger
function triggerStripeCheckout(data) {
    if (typeof firebase === 'undefined') {
        console.error("Firebase not initialized.");
        alert("Erro no sistema: Firebase não conectado.");
        return;
    }

    const functions = firebase.functions();
    // Use emulator if local (detect via hostname)
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
        // functions.useEmulator("localhost", 5001); // Uncomment if using emulators
    }

    const createStripeCheckout = functions.httpsCallable('createStripeCheckout');

    // Show feedback (optional spinner)
    const btn = document.activeElement;
    if (btn) {
        const originalText = btn.innerText;
        btn.innerText = "Carregando...";
        btn.disabled = true;
    }

    createStripeCheckout(data)
        .then((result) => {
            const url = result.data.url;
            window.location.href = url;
        })
        .catch((error) => {
            console.error('Error:', error);
            alert("Ocorreu um erro ao iniciar o pagamento. Tente novamente mais tarde.");
            if (btn) {
                btn.innerText = "Tente Novamente";
                btn.disabled = false;
            }
        });
}
