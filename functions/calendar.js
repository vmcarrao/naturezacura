/**
 * Google Calendar API Integration
 * Uses Application Default Credentials (ADC) — the built-in Firebase service account.
 * No JSON key file needed.
 */
const { google } = require("googleapis");

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || "primary";

/**
 * Get an authenticated Google Calendar client using ADC.
 * In Firebase Functions, this automatically uses the default service account.
 */
async function getCalendarClient() {
    const auth = new google.auth.GoogleAuth({
        scopes: ["https://www.googleapis.com/auth/calendar"],
    });
    const authClient = await auth.getClient();
    return google.calendar({ version: "v3", auth: authClient });
}

/**
 * Get available time slots for a given date range.
 * @param {string} startDate - ISO date string (e.g., "2026-03-10")
 * @param {string} endDate - ISO date string (e.g., "2026-03-17")
 * @param {number} slotDurationMinutes - Duration of each slot (default: 60)
 * @returns {Array} Available slots [{date, startTime, endTime}, ...]
 */
async function getAvailableSlots(startDate, endDate, slotDurationMinutes = 60) {
    const calendar = await getCalendarClient();

    // Define working hours (9:00 - 18:00, Mon-Fri, Brasilia time)
    const WORK_START_HOUR = 9;
    const WORK_END_HOUR = 18;
    const TIMEZONE = "America/Sao_Paulo";

    // Get busy times from Google Calendar
    const freeBusyResponse = await calendar.freebusy.query({
        requestBody: {
            timeMin: new Date(startDate + "T00:00:00-03:00").toISOString(),
            timeMax: new Date(endDate + "T23:59:59-03:00").toISOString(),
            timeZone: TIMEZONE,
            items: [{ id: CALENDAR_ID }],
        },
    });

    const busySlots = freeBusyResponse.data.calendars[CALENDAR_ID].busy || [];

    // Generate all possible slots within working hours
    const availableSlots = [];
    const current = new Date(startDate + "T00:00:00-03:00");
    const end = new Date(endDate + "T23:59:59-03:00");

    while (current <= end) {
        // Since current is e.g. 03:00Z (midnight BRT), .toISOString() correctly reflects the BRT date
        const dateString = current.toISOString().slice(0, 10);

        // Safely determine day of week using noon BRT
        const safeNoon = new Date(`${dateString}T12:00:00-03:00`);
        const dayOfWeek = safeNoon.getDay(); // 0=Sun, 6=Sat

        // Skip weekends
        if (dayOfWeek >= 1 && dayOfWeek <= 5) {
            for (let hour = WORK_START_HOUR; hour < WORK_END_HOUR; hour++) {
                const h = String(hour).padStart(2, "0");

                // Create explicitly in UTC-3
                const slotStart = new Date(`${dateString}T${h}:00:00-03:00`);
                const slotEnd = new Date(slotStart.getTime() + slotDurationMinutes * 60000);

                // Skip past times
                if (slotStart <= new Date()) continue;

                // Check if slot overlaps with any busy period
                const isConflict = busySlots.some((busy) => {
                    const busyStart = new Date(busy.start);
                    const busyEnd = new Date(busy.end);
                    return slotStart < busyEnd && slotEnd > busyStart;
                });

                if (!isConflict) {
                    availableSlots.push({
                        date: dateString,
                        startTime: `${h}:00`,
                        endTime: `${String(hour + Math.floor(slotDurationMinutes / 60)).padStart(2, "0")}:${String(slotDurationMinutes % 60).padStart(2, "0")}`,
                        isoStart: slotStart.toISOString(),
                        isoEnd: slotEnd.toISOString(),
                    });
                }
            }
        }

        // Move to next day (add 24 hours safely in UTC arithmetic)
        current.setTime(current.getTime() + 24 * 60 * 60 * 1000);
    }

    return availableSlots;
}

/**
 * Create a calendar event (book an appointment).
 * @param {Object} details - Appointment details
 * @returns {Object} Created event data
 */
async function createEvent(details) {
    const calendar = await getCalendarClient();
    const { startTime, endTime, clientName, clientEmail, serviceName } = details;

    const event = {
        summary: `${serviceName} — ${clientName}`,
        description: `Sessão agendada pelo site Natureza Cura.\n\nCliente: ${clientName}\nEmail: ${clientEmail}\nServiço: ${serviceName}`,
        start: {
            dateTime: startTime,
            timeZone: "America/Sao_Paulo",
        },
        end: {
            dateTime: endTime,
            timeZone: "America/Sao_Paulo",
        },
        reminders: {
            useDefault: false,
            overrides: [
                { method: "popup", minutes: 60 },   // 1 hour before
                { method: "popup", minutes: 1440 },  // 1 day before
            ],
        },
    };

    const response = await calendar.events.insert({
        calendarId: CALENDAR_ID,
        resource: event,
    });

    return response.data;
}

module.exports = { getAvailableSlots, createEvent };
