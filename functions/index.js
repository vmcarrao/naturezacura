const functions = require("firebase-functions");
const admin = require("firebase-admin");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { getAvailableSlots, createEvent } = require("./calendar");
const { sendConfirmationEmail, sendOwnerNotification } = require("./notifications");

admin.initializeApp();
const db = admin.firestore();

// ============================================================
// 1. CREATE STRIPE CHECKOUT SESSION
// ============================================================
exports.createStripeCheckout = functions.https.onCall(async (data, context) => {
    const { type, serviceKey, productName, amount, inviteeEmail, inviteeName } = data;

    try {
        let priceAmount = amount || 15000;
        let productTitle = productName || "Sessão Terapêutica - Natureza Cura";
        let description = type === "course"
            ? `Curso: ${productName}`
            : `Agendamento: ${productName}`;

        const metadata = {
            type: type || "appointment",
            serviceKey: serviceKey || "unknown",
        };

        const sessionConfig = {
            payment_method_types: ["card"],
            line_items: [
                {
                    price_data: {
                        currency: "brl",
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
            success_url: `${process.env.APP_URL}/agendar.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.APP_URL}?status=cancel`,
            metadata: metadata,
        };

        if (inviteeEmail) {
            sessionConfig.customer_email = inviteeEmail;
        }

        const session = await stripe.checkout.sessions.create(sessionConfig);

        // Save order to Firestore
        await db.collection("orders").add({
            stripeSessionId: session.id,
            type: type || "appointment",
            serviceKey: serviceKey || "unknown",
            productName: productTitle,
            amount: priceAmount,
            status: "pending_payment",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return { url: session.url };
    } catch (error) {
        console.error("Error creating stripe checkout:", error);
        throw new functions.https.HttpsError("internal", "Unable to create checkout session: " + error.message);
    }
});

// ============================================================
// 2. VERIFY PAYMENT (called from agendar.html)
// ============================================================
exports.verifyPayment = functions.https.onCall(async (data, context) => {
    const { sessionId } = data;

    if (!sessionId) {
        throw new functions.https.HttpsError("invalid-argument", "Session ID is required.");
    }

    try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status !== "paid") {
            return { valid: false, reason: "Pagamento não confirmado." };
        }

        // Check if already booked
        const orderSnapshot = await db.collection("orders")
            .where("stripeSessionId", "==", sessionId)
            .get();

        if (!orderSnapshot.empty) {
            const order = orderSnapshot.docs[0].data();
            if (order.status === "booked") {
                return { valid: false, reason: "Este pagamento já foi utilizado para agendar." };
            }
        }

        return {
            valid: true,
            customerEmail: session.customer_details?.email || null,
            customerName: session.customer_details?.name || null,
            serviceName: session.metadata?.serviceKey || "appointment",
            type: session.metadata?.type || "appointment",
        };
    } catch (error) {
        console.error("Error verifying payment:", error);
        throw new functions.https.HttpsError("internal", "Unable to verify payment: " + error.message);
    }
});

// ============================================================
// 3. GET AVAILABLE SLOTS (Google Calendar free/busy)
// ============================================================
exports.getAvailableSlots = functions.https.onCall(async (data, context) => {
    const { startDate, endDate, durationMinutes } = data;

    if (!startDate || !endDate) {
        throw new functions.https.HttpsError("invalid-argument", "startDate and endDate are required.");
    }

    try {
        const slots = await getAvailableSlots(startDate, endDate, durationMinutes || 60);
        return { slots };
    } catch (error) {
        console.error("Error fetching available slots:", error);
        throw new functions.https.HttpsError("internal", "Unable to fetch available slots: " + error.message);
    }
});

// ============================================================
// 4. BOOK APPOINTMENT (Google Calendar + Email + Firestore)
// ============================================================
exports.bookAppointment = functions.https.onCall(async (data, context) => {
    const { sessionId, slotStart, slotEnd, clientName, clientEmail, clientPhone, serviceName } = data;

    // Validate inputs
    if (!sessionId || !slotStart || !slotEnd || !clientName || !clientEmail) {
        throw new functions.https.HttpsError("invalid-argument", "Missing required booking fields.");
    }

    try {
        // 1. Re-verify payment is valid and not already used
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status !== "paid") {
            throw new functions.https.HttpsError("failed-precondition", "Pagamento não confirmado.");
        }

        const orderSnapshot = await db.collection("orders")
            .where("stripeSessionId", "==", sessionId)
            .get();

        if (!orderSnapshot.empty) {
            const order = orderSnapshot.docs[0].data();
            if (order.status === "booked") {
                throw new functions.https.HttpsError("already-exists", "Este pagamento já foi utilizado.");
            }
        }

        // 2. Create Google Calendar event
        const calendarEvent = await createEvent({
            startTime: slotStart,
            endTime: slotEnd,
            clientName,
            clientEmail,
            serviceName: serviceName || "Sessão Terapêutica",
        });

        // 3. Format date/time for emails
        const startDate = new Date(slotStart);
        const dateStr = startDate.toLocaleDateString("pt-BR", {
            weekday: "long", year: "numeric", month: "long", day: "numeric",
            timeZone: "America/Sao_Paulo",
        });
        const timeStr = startDate.toLocaleTimeString("pt-BR", {
            hour: "2-digit", minute: "2-digit",
            timeZone: "America/Sao_Paulo",
        });

        // 4. Send confirmation emails
        const emailDetails = {
            clientEmail,
            clientName,
            serviceName: serviceName || "Sessão Terapêutica",
            date: dateStr,
            time: timeStr,
        };

        await Promise.all([
            sendConfirmationEmail(emailDetails),
            sendOwnerNotification(emailDetails),
        ]);

        // 5. Update Firestore order status
        if (!orderSnapshot.empty) {
            const docId = orderSnapshot.docs[0].id;
            await db.collection("orders").doc(docId).update({
                status: "booked",
                clientName,
                clientEmail,
                clientPhone: clientPhone || null,
                calendarEventId: calendarEvent.id || null,
                appointmentStart: slotStart,
                appointmentEnd: slotEnd,
                bookedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }

        // 6. Save to appointments collection too
        await db.collection("appointments").add({
            stripeSessionId: sessionId,
            calendarEventId: calendarEvent.id || null,
            clientName,
            clientEmail,
            clientPhone: clientPhone || null,
            serviceName: serviceName || "Sessão Terapêutica",
            appointmentStart: slotStart,
            appointmentEnd: slotEnd,
            status: "Confirmed",
            paymentStatus: "Paid",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return {
            success: true,
            date: dateStr,
            time: timeStr,
            calendarEventId: calendarEvent.id,
        };
    } catch (error) {
        console.error("Error booking appointment:", error);
        if (error instanceof functions.https.HttpsError) throw error;
        throw new functions.https.HttpsError("internal", "Erro ao agendar: " + error.message);
    }
});

// ============================================================
// 5. STRIPE WEBHOOK
// ============================================================
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
        if (endpointSecret) {
            event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
        } else {
            event = req.body;
        }
    } catch (err) {
        console.error(`Webhook Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        console.log(`Payment successful for session: ${session.id}`);

        // Update order status to paid
        const snapshot = await db.collection("orders")
            .where("stripeSessionId", "==", session.id)
            .get();

        if (!snapshot.empty) {
            const docId = snapshot.docs[0].id;
            await db.collection("orders").doc(docId).update({
                status: "paid",
                paymentStatus: "Paid",
                customerEmail: session.customer_details?.email || null,
                customerName: session.customer_details?.name || null,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log(`Order ${docId} marked as paid.`);
        }
    }

    res.json({ received: true });
});

// ============================================================
// 6. CLEANUP — Cancel stale unpaid orders (every 30 min)
// ============================================================
exports.cleanupStaleOrders = functions.pubsub.schedule("every 30 minutes").onRun(async (context) => {
    const now = admin.firestore.Timestamp.now();
    const thirtyMinutesAgo = new admin.firestore.Timestamp(now.seconds - 1800, now.nanoseconds);

    const snapshot = await db.collection("orders")
        .where("status", "==", "pending_payment")
        .where("createdAt", "<", thirtyMinutesAgo)
        .get();

    if (snapshot.empty) {
        console.log("No stale orders found.");
        return null;
    }

    const batch = db.batch();

    for (const doc of snapshot.docs) {
        console.log(`Marking stale order as expired: ${doc.id}`);
        batch.update(doc.ref, {
            status: "expired",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }

    await batch.commit();
    console.log(`Cleanup complete. ${snapshot.size} orders expired.`);
    return null;
});
