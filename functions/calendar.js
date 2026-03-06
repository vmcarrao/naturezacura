/**
 * Google Calendar API Integration
 * Uses a service account to read/write to the owner's Google Calendar.
 */
const { google } = require("googleapis");

// Service account credentials from environment
const CREDENTIALS = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "{}");
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || "primary";

// Scopes needed for read/write access
const SCOPES = ["https://www.googleapis.com/auth/calendar"];

/**
 * Get an authenticated Google Calendar client
 */
function getCalendarClient() {
    const auth = new google.auth.JWT(
        CREDENTIALS.client_email,
        null,
        CREDENTIALS.private_key,
        SCOPES
    );
    return google.calendar({ version: "v3", auth });
}

/**
 * Get available time slots for a given date range.
 * @param {string} startDate - ISO date string (e.g., "2026-03-10")
 * @param {string} endDate - ISO date string (e.g., "2026-03-17")
 * @param {number} slotDurationMinutes - Duration of each slot (default: 60)
 * @returns {Array} Available slots [{date, startTime, endTime}, ...]
 */
async function getAvailableSlots(startDate, endDate, slotDurationMinutes = 60) {
    const calendar = getCalendarClient();

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
        const dayOfWeek = current.getDay(); // 0=Sun, 6=Sat

        // Skip weekends
        if (dayOfWeek >= 1 && dayOfWeek <= 5) {
            for (let hour = WORK_START_HOUR; hour < WORK_END_HOUR; hour++) {
                const slotStart = new Date(current);
                slotStart.setHours(hour, 0, 0, 0);

                const slotEnd = new Date(slotStart);
                slotEnd.setMinutes(slotEnd.getMinutes() + slotDurationMinutes);

                // Skip if slot ends after working hours
                if (slotEnd.getHours() > WORK_END_HOUR) continue;

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
                        date: slotStart.toISOString().split("T")[0],
                        startTime: `${String(hour).padStart(2, "0")}:00`,
                        endTime: `${String(hour + Math.floor(slotDurationMinutes / 60)).padStart(2, "0")}:${String(slotDurationMinutes % 60).padStart(2, "0")}`,
                        isoStart: slotStart.toISOString(),
                        isoEnd: slotEnd.toISOString(),
                    });
                }
            }
        }

        // Move to next day
        current.setDate(current.getDate() + 1);
    }

    return availableSlots;
}

/**
 * Create a calendar event (book an appointment).
 * @param {Object} details - Appointment details
 * @returns {Object} Created event data
 */
async function createEvent(details) {
    const calendar = getCalendarClient();
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
        attendees: [{ email: clientEmail }],
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
        sendUpdates: "all", // Sends invite email to attendee
    });

    return response.data;
}

module.exports = { getAvailableSlots, createEvent };
