document.addEventListener("DOMContentLoaded", () => {
    // --- UI Elements ---
    const loginScreen = document.getElementById("login-screen");
    const dashboardScreen = document.getElementById("dashboard-screen");
    const loginForm = document.getElementById("login-form");
    const loginError = document.getElementById("login-error");
    const logoutBtn = document.getElementById("logout-btn");
    const logoutBtnDesktop = document.getElementById("logout-btn-desktop");
    const loadingOverlay = document.getElementById("loading-overlay");
    const searchInput = document.getElementById("global-search");

    // --- Firebase Auth State ---
    const auth = firebase.auth();
    const db = firebase.firestore();
    const functions = firebase.app().functions(); // Uses compat functions

    auth.onAuthStateChanged((user) => {
        if (user && user.email === "naturezacura@naturezacura.net") {
            loginScreen.classList.add("hidden");
            dashboardScreen.classList.remove("hidden");
            loadData(); // Load first tab
        } else {
            loginScreen.classList.remove("hidden");
            dashboardScreen.classList.add("hidden");
        }
    });

    // --- Login Actions ---
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("admin-email").value.trim();
        const password = document.getElementById("admin-password").value.trim();
        
        const btn = document.getElementById("login-btn");
        btn.textContent = "Carregando...";
        btn.disabled = true;
        loginError.classList.add("hidden");

        try {
            await auth.signInWithEmailAndPassword(email, password);
        } catch (error) {
            console.error(error);
            loginError.textContent = "Email ou senha incorretos, ou acesso negado.";
            loginError.classList.remove("hidden");
            auth.signOut();
        } finally {
            btn.textContent = "Entrar";
            btn.disabled = false;
        }
    });

    const logout = () => auth.signOut();
    logoutBtn.addEventListener("click", logout);
    logoutBtnDesktop.addEventListener("click", logout);

    // --- Tabs Logic ---
    let currentTab = "clients";
    const tabBtns = document.querySelectorAll(".tab-btn");
    const currentTabTitle = document.getElementById("current-tab-title");
    
    // Store requested data to enable fast local searching
    let cachedClients = [];
    let cachedPayments = [];
    let cachedCalendar = [];

    tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            // Update Active State
            tabBtns.forEach(b => {
                b.classList.remove("bg-brand-green/5", "text-brand-green");
                b.classList.add("text-gray-500");
            });
            btn.classList.add("bg-brand-green/5", "text-brand-green");
            btn.classList.remove("text-gray-500");

            // Hide all tab contents
            document.querySelectorAll(".tab-content").forEach(el => el.classList.add("hidden"));
            
            // Show selected tab content
            currentTab = btn.getAttribute("data-tab");
            document.getElementById(`tab-${currentTab}`).classList.remove("hidden");
            
            // Update Title
            currentTabTitle.textContent = currentTab === "clients" ? "Clientes" : currentTab === "payments" ? "Pagamentos" : "Agenda";
            
            // Clear Search
            searchInput.value = "";
            
            // Load specific data if needed, or re-render cache
            renderCurrentTab();
        });
    });

    // --- Data Loaders ---
    async function loadData() {
        loadingOverlay.classList.remove("hidden");
        try {
            // Load all necessary initial data parallelly for speed
            await Promise.all([
                fetchClientsData(),
                fetchPaymentsData(),
                fetchCalendarData()
            ]);
            renderCurrentTab();
        } catch (error) {
            console.error("Error loading dashboard data:", error);
            if(error.code === 'permission-denied') {
                alert("Sessão expirada ou sem permissão. Faça login novamente.");
                auth.signOut();
            }
        } finally {
            loadingOverlay.classList.add("hidden");
        }
    }

    async function fetchClientsData() {
        // Build map to merged emails
        const clientsMap = new Map();

        // 1. Get Newsletter Subs
        const newsSnap = await db.collection("newsletter").get();
        newsSnap.forEach(doc => {
            const data = doc.data();
            clientsMap.set(data.email, {
                name: "-",
                email: data.email,
                origin: "Newsletter",
                date: data.subscribedAt ? data.subscribedAt.toDate() : new Date()
            });
        });

        // 2. Get Orders (extract customer info)
        const orderSnap = await db.collection("orders").get();
        orderSnap.forEach(doc => {
            const data = doc.data();
            const em = data.customerEmail || data.clientEmail;
            if (em) {
                // Determine origin
                let origin = "Pagamento (" + (data.productName || data.type) + ")";
                
                // If exists, prefer order info over just newsletter, but keep oldest date
                if (clientsMap.has(em)) {
                    const existing = clientsMap.get(em);
                    origin = existing.origin === "Newsletter" ? origin + " + Newsletter" : existing.origin;
                }

                clientsMap.set(em, {
                    name: data.customerName || data.clientName || "-",
                    email: em,
                    origin: origin,
                    date: data.createdAt ? data.createdAt.toDate() : new Date()
                });
            }
        });

        cachedClients = Array.from(clientsMap.values()).sort((a, b) => b.date - a.date);
    }

    async function fetchPaymentsData() {
        const orderSnap = await db.collection("orders").orderBy("createdAt", "desc").get();
        cachedPayments = orderSnap.docs.map(doc => {
            const d = doc.data();
            return {
                id: doc.id,
                date: d.createdAt ? d.createdAt.toDate() : new Date(),
                client: d.customerName || d.clientName || d.customerEmail || d.clientEmail || "Desconhecido",
                service: d.productName || d.serviceKey || "Serviço",
                amount: d.amount ? `R$ ${(d.amount / 100).toFixed(2).replace('.', ',')}` : "-",
                status: d.status || d.paymentStatus || "Pendente"
            };
        });
    }

    async function fetchCalendarData() {
        try {
            const getAdminCalendarEvents = functions.httpsCallable('getAdminCalendarEvents');
            const result = await getAdminCalendarEvents();
            const events = result.data.events || [];
            
            cachedCalendar = events.map(ev => {
                const sDate = ev.start?.dateTime ? new Date(ev.start.dateTime) : (ev.start?.date ? new Date(ev.start.date) : new Date());
                const eDate = ev.end?.dateTime ? new Date(ev.end.dateTime) : (ev.end?.date ? new Date(ev.end.date) : new Date());
                
                return {
                    id: ev.id,
                    sortDate: sDate,
                    dateStr: sDate.toLocaleDateString("pt-BR") + " " + sDate.toLocaleTimeString("pt-BR", {hour:'2-digit', minute:'2-digit'}),
                    summary: ev.summary || "Evento sem título",
                    description: ev.description || "-",
                    meetLink: ev.hangoutLink || ""
                };
            }).sort((a, b) => a.sortDate - b.sortDate); // Nearest upcoming first
        } catch (error) {
            console.error("Calendar fetch error:", error);
            cachedCalendar = [];
        }
    }

    // --- Rendering ---
    function renderCurrentTab(filterQuery = "") {
        const q = filterQuery.toLowerCase();
        
        if (currentTab === "clients") {
            const tbody = document.getElementById("clients-tbody");
            tbody.innerHTML = "";
            let data = cachedClients;
            if (q) data = data.filter(c => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.origin.toLowerCase().includes(q));
            
            data.forEach(c => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td class="px-6 py-4">
                        <div class="font-medium text-brand-green">${c.name}</div>
                        <div class="text-xs text-gray-500">${c.email}</div>
                    </td>
                    <td class="px-6 py-4 text-gray-600">${c.origin}</td>
                    <td class="px-6 py-4 text-gray-400 text-xs">${c.date.toLocaleDateString("pt-BR")}</td>
                `;
                tbody.appendChild(tr);
            });
            if(data.length === 0) tbody.innerHTML = `<tr><td colspan="3" class="px-6 py-8 text-center text-gray-400">Nenhum cliente encontrado.</td></tr>`;
        } 
        else if (currentTab === "payments") {
            const tbody = document.getElementById("payments-tbody");
            tbody.innerHTML = "";
            let data = cachedPayments;
            if (q) data = data.filter(p => p.client.toLowerCase().includes(q) || p.service.toLowerCase().includes(q) || p.status.toLowerCase().includes(q));

            data.forEach(p => {
                const statusColor = p.status === "paid" || p.status === "Paid" ? "bg-green-100 text-green-700" : 
                                  p.status === "booked" ? "bg-blue-100 text-blue-700" : "bg-yellow-100 text-yellow-700";
                const tfStatus = p.status === "paid" || p.status === "Paid" ? "Pago" : 
                                 p.status === "booked" ? "Agendado" : 
                                 p.status === "expired" ? "Expirado" : "Pendente";

                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td class="px-6 py-4 text-gray-500 text-xs">${p.date.toLocaleDateString("pt-BR")}</td>
                    <td class="px-6 py-4 font-medium text-brand-green">${p.client}</td>
                    <td class="px-6 py-4 text-gray-600">${p.service}</td>
                    <td class="px-6 py-4 font-medium">${p.amount}</td>
                    <td class="px-6 py-4">
                        <span class="px-2 py-1 rounded text-xs font-medium ${statusColor}">${tfStatus}</span>
                    </td>
                `;
                tbody.appendChild(tr);
            });
            if(data.length === 0) tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-8 text-center text-gray-400">Nenhum pagamento encontrado.</td></tr>`;
        } 
        else if (currentTab === "calendar") {
            const tbody = document.getElementById("calendar-tbody");
            tbody.innerHTML = "";
            let data = cachedCalendar;
            if (q) data = data.filter(ev => ev.summary.toLowerCase().includes(q) || ev.description.toLowerCase().includes(q));

            data.forEach(ev => {
                const tr = document.createElement("tr");
                const meetBtn = ev.meetLink ? `<a href="${ev.meetLink}" target="_blank" class="mt-2 inline-block text-xs text-blue-600 hover:underline"><i class="fa-solid fa-video mr-1"></i> Entrar na Reunião</a>` : '';
                tr.innerHTML = `
                    <td class="px-6 py-4 align-top whitespace-nowrap">
                        <div class="font-medium text-brand-green">${ev.dateStr}</div>
                    </td>
                    <td class="px-6 py-4 align-top">
                        <div class="font-medium text-brand-green">${ev.summary}</div>
                        ${meetBtn}
                    </td>
                    <td class="px-6 py-4 align-top text-gray-600 text-xs whitespace-pre-wrap">${ev.description}</td>
                `;
                tbody.appendChild(tr);
            });
            if(data.length === 0) tbody.innerHTML = `<tr><td colspan="3" class="px-6 py-8 text-center text-gray-400">Nenhum evento futuro encontrado.</td></tr>`;
        }
    }

    // --- Search Logic ---
    searchInput.addEventListener("input", (e) => {
        renderCurrentTab(e.target.value);
    });
});
