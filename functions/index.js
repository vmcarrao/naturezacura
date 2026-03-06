const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const stripe = require("stripe")(functions.config().stripe.secret_key);

admin.initializeApp();
const db = admin.firestore();

// 1. Capture and Create Stripe Checkout Session
// Handles: Appointments (Calendly) AND Courses (Direct Purchase)
exports.createStripeCheckout = functions.https.onCall(async (data, context) => {
    // Common fields
    const { type, inviteeEmail, inviteeName } = data;

    // Type-specific fields
    const { eventURI, inviteeURI } = data; // For appointments
    const { courseKey, productName, amount } = data; // For courses

    try {
        let priceAmount = 15000; // Default fallback
        let description = `Agendamento Natureza Cura`;
        let productTitle = "Sessão Terapêutica - Natureza Cura";
        let metadata = {};

        if (type === 'course') {
            priceAmount = amount;
            productTitle = productName;
            description = `Curso: ${productName}`;
            metadata = {
                type: 'course',
                courseKey: courseKey || 'unknown',
                inviteeName: inviteeName || 'Student' // In real app, store UserID
            };
        } else {
            // Appointment (Default)
            metadata = {
                type: 'appointment',
                calendlyEventURI: eventURI || '',
                calendlyInviteeURI: inviteeURI || '',
            };
        }

        const currency = "brl";

        // 1. Create a Stripe Checkout Session
        const sessionConfig = {
            payment_method_types: ["card"],
            line_items: [
                {
                    price_data: {
                        currency: currency,
                        product_data: {
                            name: productTitle,
                            description: description,
                        },
                        unit_amount: priceAmount,
                    },
                    quantity: 1,
                },
            ],
            mode: "payment",
            // TODO: Append session_id better
            success_url: `${functions.config().app.url}?status=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${functions.config().app.url}?status=cancel`,
            metadata: metadata,
        };

        // Optionally add customer email if we have it (otherwise Stripe will prompt for it)
        if (inviteeEmail) {
            sessionConfig.customer_email = inviteeEmail;
        }

        const session = await stripe.checkout.sessions.create(sessionConfig);

        // 2. Save logic (If appointment, save as Pending. If course, maybe save generic order)
        if (type !== 'course') {
            await db.collection("appointments").add({
                inviteeName: inviteeName || null,
                inviteeEmail: inviteeEmail || null,
                eventURI: eventURI || null,
                inviteeURI: inviteeURI || null,
                stripeSessionId: session.id,
                status: "Pending",
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }

        // 3. Return the Checkout URL to frontend
        return { url: session.url };
    } catch (error) {
        console.error("Error creating stripe checkout:", error);
        throw new functions.https.HttpsError("internal", "Unable to create checkout session: " + error.message);
    }
});

// 2. Stripe Webhook Verification
// Configure this URL in your Stripe Dashboard > Webhooks
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const endpointSecret = functions.config().stripe.webhook_secret; // Optional, strict verification

    let event;
    try {
        // If using endpoint secret for validation
        if (endpointSecret) {
            event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
        } else {
            event = req.body;
        }
    } catch (err) {
        console.error(`Webhook Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    if (event.type === "checkout.session.completed") {
        const session = event.data.object;

        // Retrieve metadata
        const { calendlyEventURI, calendlyInviteeURI } = session.metadata;

        console.log(`Payment successful for session: ${session.id}`);

        // Update Firestore status to "Confirmed"
        const snapshot = await db.collection("appointments")
            .where("stripeSessionId", "==", session.id)
            .get();

        if (!snapshot.empty) {
            const docId = snapshot.docs[0].id;
            await db.collection("appointments").doc(docId).update({
                status: "Confirmed",
                paymentStatus: "Paid",
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log(`Appointment ${docId} confirmed.`);
        } else {
            console.warn("No matching appointment found for this session ID.");
        }
    }

    res.json({ received: true });
});

// 3. Validation & Cleanup (Scheduled every 30 mins)
// Checks for "Pending" appointments older than 30 mins and cancels them in Calendly
exports.checkPendingPayments = functions.pubsub.schedule("every 30 minutes").onRun(async (context) => {
    const now = admin.firestore.Timestamp.now();
    const thirtyMinutesAgo = new admin.firestore.Timestamp(now.seconds - 1800, now.nanoseconds);

    const snapshot = await db.collection("appointments")
        .where("status", "==", "Pending")
        .where("createdAt", "<", thirtyMinutesAgo)
        .get();

    if (snapshot.empty) {
        console.log("No stale pending appointments found.");
        return null;
    }

    const batch = db.batch();
    const calendlyToken = functions.config().calendly.token;

    for (const doc of snapshot.docs) {
        const appointment = doc.data();
        console.log(`Cancelling stale appointment: ${doc.id}`);

        try {
            // Call Calendly API to cancel event
            // Note: UUID extraction might be needed depending on URI format
            const eventUuid = appointment.eventURI.split("/").pop();

            await axios.post(
                `https://api.calendly.com/scheduled_events/${eventUuid}/cancellation`,
                { reason: "Payment not received within time limit." },
                {
                    headers: {
                        "Authorization": `Bearer ${calendlyToken}`,
                        "Content-Type": "application/json",
                    },
                }
            );

            // Update Firestore
            const docRef = db.collection("appointments").doc(doc.id);
            batch.update(docRef, {
                status: "Cancelled",
                cancellationReason: "Timeout",
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

        } catch (error) {
            console.error(`Failed to cancel Calendly event for doc ${doc.id}:`, error.response?.data || error.message);
        }
    }

    await batch.commit();
    console.log("Cleanup complete.");
    return null;
});
